"use server";

import { canAccessCampus, getOperationalCampusAccess } from "@/lib/auth/campuses";
import { isDebugWriteBlocked } from "@/lib/auth/debug-view";
import { createClient } from "@/lib/supabase/server";
import { getEnrollmentLedger } from "@/lib/queries/billing";
import {
  getAdvanceTuitionOptions,
  getAdvanceTuitionQuote,
  normalizePeriodMonth,
  formatPeriodMonthLabel,
} from "@/lib/pricing/plans";
import { parsePaymentFormData } from "@/lib/validations/payment";
import { writeAuditLog } from "@/lib/audit";
import { applyEarlyBirdDiscountIfEligible } from "@/server/actions/payments";
import { PRODUCT_GROUPS } from "@/lib/product-groups";
import {
  fetchPaymentFolio,
  linkCashPaymentsToOpenSession,
  revalidatePaymentSurfaces,
  syncPaidUniformOrders,
  writePostedPaymentAudit
} from "@/server/actions/payment-posting";
import { formatDateMonterrey, formatTimeMonterrey, parseMonterreyDateTimeInput } from "@/lib/time";

export type CajaPlayerResult = {
  playerId: string;
  playerName: string;
  birthYear: number | null;
  enrollmentId: string;
  campusName: string;
  balance: number;
  teamName: string | null;
  coachName: string | null;
};

export type CajaPendingCharge = {
  id: string;
  typeName: string;
  typeCode: string;
  description: string;
  amount: number;
  pendingAmount: number;
  periodMonth: string | null;
  dueDate: string | null;
};

export type CajaEnrollmentData = {
  enrollmentId: string;
  playerName: string;
  campusId: string;
  campusName: string;
  balance: number;
  currency: string;
  pendingCharges: CajaPendingCharge[];
  advanceTuitionOptions: Array<{ periodMonth: string; label: string; amount: number }>;
};

export type CajaPaymentResult =
  | { ok: true; paymentId: string; folio: string | null; amount: number; playerName: string; campusName: string; birthYear: number | null; method: string; splitPayment?: { amount: number; method: string }; remainingBalance: number; currency: string; sessionWarning: boolean; chargesPaid: Array<{ description: string; amount: number }>; paidAt: string; date: string; time: string }
  | { ok: false; error: string };

// ── Products for Caja POS grid ────────────────────────────────────────────────

export type CajaProduct = {
  id: string;
  name: string;
  categorySlug: string;
  categoryName: string;
  chargeTypeId: string;
  defaultAmount: number | null;
  hasSizes: boolean;
  sortOrder: number;
};

export type CajaProductCategory = {
  id: string;
  name: string;
  slug: string;
  sortOrder: number;
  products: CajaProduct[];
};

export type CajaChargeResult =
  | { ok: true; updatedData: CajaEnrollmentData; newChargeId?: string }
  | { ok: false; error: string };

export type CajaAdvanceTuitionResult =
  | { ok: true; updatedData: CajaEnrollmentData; newChargeId: string }
  | { ok: false; error: string };

export type CajaCartItemInput =
  | {
      kind: "product";
      productId: string;
      amount?: number;
      size?: string | null;
      goalkeeper?: boolean;
      uniformFulfillmentMode?: "deliver_now" | "pending_order" | null;
    }
  | {
      kind: "tuition";
      periodMonth: string;
    };

type EnrollmentPlanLookup = {
  id: string;
  status: string;
  pricing_plans: { currency: string; plan_code: string } | null;
};

function parseOptionalMoney(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  return Math.round(value * 100) / 100;
}

function parseCheckoutCartItems(raw: string): CajaCartItemInput[] | null {
  const trimmed = raw.trim();
  if (!trimmed) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }

  if (!Array.isArray(parsed)) return null;

  const items: CajaCartItemInput[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== "object") return null;
    const kind = (item as { kind?: unknown }).kind;

    if (kind === "tuition") {
      const periodMonth =
        typeof (item as { periodMonth?: unknown }).periodMonth === "string"
          ? (item as { periodMonth: string }).periodMonth.trim()
          : "";
      if (!periodMonth) return null;
      items.push({ kind: "tuition", periodMonth });
      continue;
    }

    if (kind === "product") {
      const productId =
        typeof (item as { productId?: unknown }).productId === "string"
          ? (item as { productId: string }).productId.trim()
          : "";
      if (!productId) return null;

      items.push({
        kind: "product",
        productId,
        amount: parseOptionalMoney((item as { amount?: unknown }).amount) ?? undefined,
        size:
          typeof (item as { size?: unknown }).size === "string"
            ? (item as { size: string }).size.trim() || null
            : null,
        goalkeeper: (item as { goalkeeper?: unknown }).goalkeeper === true,
        uniformFulfillmentMode:
          (item as { uniformFulfillmentMode?: unknown }).uniformFulfillmentMode === "deliver_now" ||
          (item as { uniformFulfillmentMode?: unknown }).uniformFulfillmentMode === "pending_order"
            ? ((item as { uniformFulfillmentMode: "deliver_now" | "pending_order" }).uniformFulfillmentMode)
            : null,
      });
      continue;
    }

    return null;
  }

  return items;
}

async function createResolvedAdvanceTuitionCharge(
  supabase: Awaited<ReturnType<typeof createClient>>,
  {
    enrollmentId,
    periodMonth,
    userId,
  }: {
    enrollmentId: string;
    periodMonth: string;
    userId: string;
  }
) {
  const normalizedPeriodMonth = normalizePeriodMonth(periodMonth);
  const { data: enrollment } = await supabase
    .from("enrollments")
    .select("id, status, pricing_plans(currency, plan_code)")
    .eq("id", enrollmentId)
    .maybeSingle()
    .returns<EnrollmentPlanLookup | null>();

  if (!enrollment) return { ok: false as const, error: "enrollment_not_found" };
  if (enrollment.status === "ended" || enrollment.status === "cancelled") {
    return { ok: false as const, error: "enrollment_inactive" };
  }

  const planCode = enrollment.pricing_plans?.plan_code;
  if (!planCode) return { ok: false as const, error: "tuition_rate_not_found" };

  const ledgerCheck = await getEnrollmentLedger(enrollmentId);
  if (!ledgerCheck) return { ok: false as const, error: "ledger_failed" };

  const hasArrears = ledgerCheck.charges.some(
    (charge) =>
      charge.typeCode === "monthly_tuition" &&
      charge.status !== "void" &&
      charge.pendingAmount > 0 &&
      !!charge.periodMonth &&
      charge.periodMonth < normalizedPeriodMonth
  );
  if (hasArrears) return { ok: false as const, error: "prior_month_arrears" };

  const [chargeTypeResult, tuitionQuote] = await Promise.all([
    supabase
      .from("charge_types")
      .select("id")
      .eq("code", "monthly_tuition")
      .maybeSingle()
      .returns<{ id: string } | null>(),
    getAdvanceTuitionQuote(supabase, { planCode, periodMonth: normalizedPeriodMonth }),
  ]);

  if (!chargeTypeResult.data) return { ok: false as const, error: "charge_type_not_found" };
  if (!tuitionQuote) return { ok: false as const, error: "tuition_rate_not_found" };

  const { data: newCharge, error: chargeError } = await supabase
    .from("charges")
    .insert({
      enrollment_id: enrollmentId,
      charge_type_id: chargeTypeResult.data.id,
      period_month: normalizedPeriodMonth,
      description: `Mensualidad ${formatPeriodMonthLabel(normalizedPeriodMonth)}`,
      amount: tuitionQuote.amount,
      currency: tuitionQuote.plan.currency ?? enrollment.pricing_plans?.currency ?? "MXN",
      status: "pending",
      pricing_rule_id: tuitionQuote.pricingRuleId,
      created_by: userId,
    })
    .select("id")
    .single<{ id: string }>();

  if (chargeError || !newCharge) {
    if (chargeError?.code === "23505") return { ok: false as const, error: "duplicate_period" };
    return { ok: false as const, error: "charge_insert_failed" };
  }

  return {
    ok: true as const,
    newChargeId: newCharge.id,
    amount: tuitionQuote.amount,
    description: `Mensualidad ${formatPeriodMonthLabel(normalizedPeriodMonth)}`,
  };
}

export async function getProductsForCajaAction(): Promise<CajaProductCategory[]> {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return [];

  type ProductRow = {
    id: string;
    name: string;
    charge_type_id: string;
    default_amount: number | null;
    has_sizes: boolean;
    sort_order: number;
    charge_types: { code: string } | null;
  };

  const { data } = await supabase
    .from("products")
    .select("id, name, charge_type_id, default_amount, has_sizes, sort_order, charge_types(code)")
    .eq("is_active", true)
    .order("sort_order")
    .returns<ProductRow[]>();

  if (!data) return [];

  const result: CajaProductCategory[] = [];
  for (const [i, group] of PRODUCT_GROUPS.entries()) {
    const products = data
      .filter((row) => row.charge_types && (group.codes as readonly string[]).includes(row.charge_types.code))
      .map((row) => ({
        id: row.id,
        name: row.name,
        categorySlug: group.key,
        categoryName: group.label,
        chargeTypeId: row.charge_type_id,
        defaultAmount: row.default_amount,
        hasSizes: row.has_sizes,
        sortOrder: row.sort_order,
      }));

    if (products.length > 0) {
      result.push({ id: group.key, name: group.label, slug: group.key, sortOrder: i, products });
    }
  }

  return result;
}

export async function postCajaChargeAction(
  enrollmentId: string,
  formData: FormData
): Promise<CajaChargeResult> {
  if (await isDebugWriteBlocked()) return { ok: false, error: "debug_read_only" };
  const productId = formData.get("productId")?.toString().trim() ?? "";
  const suppressAudit = formData.get("suppressAudit") === "1";
  const amountRaw = formData.get("amount")?.toString() ?? "";
  const amount = parseFloat(amountRaw);
  const size = formData.get("size")?.toString().trim() || null;
  const goalkeeper = formData.get("goalkeeper") === "1";
  const uniformFulfillmentModeRaw = formData.get("uniformFulfillmentMode")?.toString().trim() ?? "";
  const uniformFulfillmentMode =
    uniformFulfillmentModeRaw === "deliver_now" || uniformFulfillmentModeRaw === "pending_order"
      ? uniformFulfillmentModeRaw
      : null;
  const periodMonthRaw = formData.get("period_month")?.toString().trim() || null;

  if (!productId) {
    return { ok: false, error: "invalid_form" };
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();
  if (userError || !user) return { ok: false, error: "unauthenticated" };

  type ProductLookup = {
    id: string;
    name: string;
    charge_type_id: string;
    default_amount: number | null;
    has_sizes: boolean;
    charge_types: { code: string } | null;
  };
  const { data: product } = await supabase
    .from("products")
    .select("id, name, charge_type_id, default_amount, has_sizes, charge_types(code)")
    .eq("id", productId)
    .eq("is_active", true)
    .maybeSingle()
    .returns<ProductLookup | null>();

  if (!product) return { ok: false, error: "product_not_found" };

  const isTuition = product.charge_types?.code === "monthly_tuition";
  const isUniform = product.charge_types?.code === "uniform_training" || product.charge_types?.code === "uniform_game";
  let createdChargeId: string | undefined;
  if (isTuition) {
    if (!periodMonthRaw) return { ok: false, error: "invalid_form" };

    const tuitionResult = await createResolvedAdvanceTuitionCharge(supabase, {
      enrollmentId,
      periodMonth: periodMonthRaw,
      userId: user.id,
    });
    if (!tuitionResult.ok) return tuitionResult;

    if (!suppressAudit) {
      await writeAuditLog(supabase, {
        actorUserId: user.id,
        actorEmail: user.email ?? null,
        action: "charge.created",
        tableName: "charges",
        recordId: tuitionResult.newChargeId,
        afterData: {
          enrollment_id: enrollmentId,
          product_id: productId,
          description: tuitionResult.description,
          amount: tuitionResult.amount,
          source: "caja"
        }
      });
    }
    createdChargeId = tuitionResult.newChargeId;
  } else {
      const resolvedAmount = product.default_amount ?? amount;
      if (!resolvedAmount || isNaN(resolvedAmount) || resolvedAmount <= 0) {
        return { ok: false, error: "invalid_form" };
      }

    const { data: enrollment } = await supabase
      .from("enrollments")
      .select("id, status, pricing_plans(currency)")
      .eq("id", enrollmentId)
      .maybeSingle()
      .returns<{ id: string; status: string; pricing_plans: { currency: string } | null } | null>();

    if (!enrollment) return { ok: false, error: "enrollment_not_found" };
    if (enrollment.status === "ended" || enrollment.status === "cancelled") {
      return { ok: false, error: "enrollment_inactive" };
    }

    const currency = enrollment.pricing_plans?.currency ?? "MXN";
    const sizePart = size ? ` - Talla ${size}` : "";
    const goalkeeperPart = goalkeeper ? " (Portero)" : "";
    const description = `${product.name}${sizePart}${goalkeeperPart}`;

      const { data: newCharge, error: chargeError } = await supabase
        .from("charges")
        .insert({
          enrollment_id: enrollmentId,
          charge_type_id: product.charge_type_id,
          product_id: productId,
          size,
          is_goalkeeper: product.has_sizes ? goalkeeper : null,
          uniform_fulfillment_mode: isUniform ? (uniformFulfillmentMode ?? "pending_order") : null,
          description,
          amount: resolvedAmount,
          currency,
          status: "pending",
          created_by: user.id,
        })
        .select("id")
        .single<{ id: string }>();

      if (chargeError || !newCharge) return { ok: false, error: "charge_insert_failed" };

      if (!suppressAudit) {
        await writeAuditLog(supabase, {
          actorUserId: user.id,
          actorEmail: user.email ?? null,
          action: "charge.created",
          tableName: "charges",
          recordId: newCharge.id,
          afterData: {
            enrollment_id: enrollmentId,
            product_id: productId,
            description,
            amount: resolvedAmount,
            source: "caja",
          }
        });
      }

      const updatedData = await getEnrollmentForCajaAction(enrollmentId);
      if (!updatedData) return { ok: false, error: "reload_failed" };

    return { ok: true, updatedData, newChargeId: newCharge.id };
  }

  const updatedData = await getEnrollmentForCajaAction(enrollmentId);
  if (!updatedData) return { ok: false, error: "reload_failed" };

  return { ok: true, updatedData, newChargeId: createdChargeId };
}

// ── Caja drill-down ───────────────────────────────────────────────────────────

export type CajaDrilldownMeta = {
  campuses: { id: string; name: string }[];
  birthYearsByCampus: Record<string, number[]>;
};

export async function getCajaDrilldownMetaAction(): Promise<CajaDrilldownMeta> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { campuses: [], birthYearsByCampus: {} };
  const campusAccess = await getOperationalCampusAccess();
  if (!campusAccess) return { campuses: [], birthYearsByCampus: {} };

  const [{ data: yearRows }] = await Promise.all([
    supabase.rpc("list_active_birth_years_by_campus")
  ]);

  const campuses = campusAccess.campuses.map((campus) => ({ id: campus.id, name: campus.name }));
  const birthYearsByCampus: Record<string, number[]> = {};
  for (const row of (yearRows ?? []) as { campus_id: string; birth_year: number }[]) {
    if (!canAccessCampus(campusAccess, row.campus_id)) continue;
    if (!birthYearsByCampus[row.campus_id]) birthYearsByCampus[row.campus_id] = [];
    birthYearsByCampus[row.campus_id].push(row.birth_year);
  }
  return { campuses, birthYearsByCampus };
}

export async function listCajaPlayersByCampusYearAction(
  campusId: string,
  birthYear: number
): Promise<CajaPlayerResult[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const campusAccess = await getOperationalCampusAccess();
  if (!canAccessCampus(campusAccess, campusId)) return [];

  const { data, error } = await supabase.rpc("list_caja_players_by_campus_year", {
    p_campus_id: campusId,
    p_birth_year: birthYear
  });

  if (error || !data) return [];

  return (data as CajaSearchRow[]).map((row) => ({
    playerId: row.player_id,
    playerName: row.player_name,
    birthYear: row.birth_year,
    enrollmentId: row.enrollment_id,
    campusName: row.campus_name,
    balance: row.balance,
    teamName: row.team_name ?? null,
    coachName: row.coach_name ?? null
  }));
}

// ── Player search — single RPC call ───────────────────────────────────────────

type CajaSearchRow = {
  player_id: string;
  player_name: string;
  birth_year: number | null;
  enrollment_id: string;
  campus_name: string;
  balance: number;
  team_name: string | null;
  coach_name: string | null;
};

export async function searchPlayersForCajaAction(q: string): Promise<CajaPlayerResult[]> {
  if (!q || q.trim().length < 2) return [];

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return [];
  const campusAccess = await getOperationalCampusAccess();
  if (!campusAccess || campusAccess.campusIds.length === 0) return [];
  const allowedCampusNames = new Set(campusAccess.campuses.map((campus) => campus.name));

  const { data, error } = await supabase
    .rpc("search_players_for_caja", { search_query: q.trim() });

  if (error || !data) return [];

  return (data as CajaSearchRow[])
    .filter((row) => allowedCampusNames.has(row.campus_name))
    .map((row) => ({
      playerId: row.player_id,
      playerName: row.player_name,
      birthYear: row.birth_year,
      enrollmentId: row.enrollment_id,
      campusName: row.campus_name,
      balance: row.balance,
      teamName: row.team_name ?? null,
      coachName: row.coach_name ?? null
    }));
}

// ── Advance tuition charge (inline from Caja panel) ───────────────────────────

export async function createAdvanceTuitionAction(
  enrollmentId: string,
  periodMonth: string // "YYYY-MM"
): Promise<CajaAdvanceTuitionResult> {
  if (await isDebugWriteBlocked()) return { ok: false, error: "debug_read_only" };
  if (!periodMonth) {
    return { ok: false, error: "invalid_form" };
  }

  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return { ok: false, error: "unauthenticated" };

  const tuitionResult = await createResolvedAdvanceTuitionCharge(supabase, {
    enrollmentId,
    periodMonth,
    userId: user.id,
  });
  if (!tuitionResult.ok) return tuitionResult;

  await writeAuditLog(supabase, {
    actorUserId: user.id,
    actorEmail: user.email ?? null,
    action: "charge.created",
    tableName: "charges",
    recordId: tuitionResult.newChargeId,
    afterData: {
      enrollment_id: enrollmentId,
      description: tuitionResult.description,
      amount: tuitionResult.amount,
      source: "caja-advance-tuition"
    }
  });

  const updatedData = await getEnrollmentForCajaAction(enrollmentId);
  if (!updatedData) return { ok: false, error: "reload_failed" };

  return { ok: true, updatedData, newChargeId: tuitionResult.newChargeId };
}

// ── Load enrollment data for Caja panel ───────────────────────────────────────

export async function getEnrollmentForCajaAction(enrollmentId: string): Promise<CajaEnrollmentData | null> {
  const supabase = await createClient();
  const ledger = await getEnrollmentLedger(enrollmentId);
  if (!ledger) return null;

  const pendingCharges = ledger.charges
    .filter((c) => c.pendingAmount > 0 && c.status !== "void")
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    .map((c) => ({
      id: c.id,
      typeName: c.typeName,
      typeCode: c.typeCode,
      description: c.description,
      amount: c.amount,
      pendingAmount: c.pendingAmount,
      periodMonth: c.periodMonth,
      dueDate: c.dueDate ?? null
    }));

  const { data: enrollmentPlan } = await supabase
    .from("enrollments")
    .select("pricing_plans(plan_code)")
    .eq("id", enrollmentId)
    .maybeSingle()
    .returns<{ pricing_plans: { plan_code: string } | null } | null>();

  const planCode = enrollmentPlan?.pricing_plans?.plan_code;
  const existingPeriods = ledger.charges
    .filter((charge) => charge.typeCode === "monthly_tuition" && charge.status !== "void" && charge.periodMonth)
    .map((charge) => charge.periodMonth!);
  const advanceTuitionOptions = planCode
    ? await getAdvanceTuitionOptions(supabase, { planCode, existingPeriodMonths: existingPeriods })
    : [];

  return {
    enrollmentId,
    playerName: ledger.enrollment.playerName,
    campusId: ledger.enrollment.campusId,
    campusName: ledger.enrollment.campusName,
    balance: ledger.totals.balance,
    currency: ledger.enrollment.currency,
    pendingCharges,
    advanceTuitionOptions: advanceTuitionOptions.map((option) => ({
      periodMonth: option.periodMonth,
      label: option.label,
      amount: option.amount,
    }))
  };
}

// ── Post payment from Caja (returns result, does not redirect) ────────────────

export async function checkoutCajaCartAction(
  enrollmentId: string,
  formData: FormData
): Promise<CajaPaymentResult> {
  if (await isDebugWriteBlocked()) return { ok: false, error: "debug_read_only" };
  const amount = formData.get("amount")?.toString() ?? "";
  const method = formData.get("method")?.toString() ?? "";
  const notes = formData.get("notes")?.toString() ?? "";
  const amount2 = formData.get("amount2")?.toString() ?? "";
  const method2 = formData.get("method2")?.toString() ?? "";
  const targetChargeIdsRaw = formData.get("targetChargeIds")?.toString().trim() ?? "";
  const existingTargetChargeIds = targetChargeIdsRaw ? targetChargeIdsRaw.split(",").filter(Boolean) : [];
  const cartItems = parseCheckoutCartItems(formData.get("cartItems")?.toString() ?? "[]");

  if (cartItems === null) return { ok: false, error: "invalid_form" };

  const createdChargeIds: string[] = [];
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) return { ok: false, error: "unauthenticated" };

  for (const item of cartItems) {
    if (item.kind === "tuition") {
      const tuitionResult = await createResolvedAdvanceTuitionCharge(supabase, {
        enrollmentId,
        periodMonth: item.periodMonth,
        userId: user.id,
      });
      if (!tuitionResult.ok) {
        if (createdChargeIds.length > 0) {
          await supabase.from("charges").delete().in("id", createdChargeIds);
        }
        return tuitionResult;
      }
      createdChargeIds.push(tuitionResult.newChargeId);
      continue;
    }

    const chargeForm = new FormData();
    chargeForm.set("productId", item.productId);
    if (item.amount) chargeForm.set("amount", item.amount.toFixed(2));
    if (item.size) chargeForm.set("size", item.size);
    if (item.goalkeeper) chargeForm.set("goalkeeper", "1");
    if (item.uniformFulfillmentMode) chargeForm.set("uniformFulfillmentMode", item.uniformFulfillmentMode);
    chargeForm.set("suppressAudit", "1");

    const chargeResult = await postCajaChargeAction(enrollmentId, chargeForm);
    if (!chargeResult.ok) {
      if (createdChargeIds.length > 0) {
        await supabase.from("charges").delete().in("id", createdChargeIds);
      }
      return chargeResult;
    }

    if (chargeResult.newChargeId) {
      createdChargeIds.push(chargeResult.newChargeId);
    }
  }

  const paymentForm = new FormData();
  paymentForm.set("amount", amount);
  paymentForm.set("method", method);
  const operatorCampusId = formData.get("operatorCampusId")?.toString().trim() ?? "";
  if (operatorCampusId) paymentForm.set("operatorCampusId", operatorCampusId);
  if (notes) paymentForm.set("notes", notes);
  if (amount2) paymentForm.set("amount2", amount2);
  if (method2) paymentForm.set("method2", method2);
  const paidAt = formData.get("paidAt")?.toString().trim() ?? "";
  if (paidAt) paymentForm.set("paidAt", paidAt);
  paymentForm.set("targetChargeIds", [...existingTargetChargeIds, ...createdChargeIds].join(","));

  const paymentResult = await postCajaPaymentAction(enrollmentId, paymentForm);
  if (!paymentResult.ok && createdChargeIds.length > 0) {
    await supabase.from("charges").delete().in("id", createdChargeIds);
  }

  return paymentResult;
}

export async function postCajaPaymentAction(enrollmentId: string, formData: FormData): Promise<CajaPaymentResult> {
  if (await isDebugWriteBlocked()) return { ok: false, error: "debug_read_only" };
  const parsed = parsePaymentFormData(formData);
  if (!parsed) return { ok: false, error: "invalid_form" };

  const supabase = await createClient();
  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();
  if (userError || !user) return { ok: false, error: "unauthenticated" };

  const ledger = await getEnrollmentLedger(enrollmentId);
  if (!ledger) return { ok: false, error: "enrollment_not_found" };
  const campusAccess = await getOperationalCampusAccess();
  if (!campusAccess) return { ok: false, error: "unauthenticated" };

  const pendingCharges = ledger.charges
    .filter((c) => c.pendingAmount > 0 && c.status !== "void")
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  if (ledger.enrollment.status === "ended" || ledger.enrollment.status === "cancelled") {
    return { ok: false, error: "enrollment_inactive" };
  }

  const targetChargeIds = parsed.targetChargeIds;
  const targetSet = new Set(targetChargeIds);
  const operatorCampusId = parsed.operatorCampusId ?? campusAccess.defaultCampusId;
  if (!operatorCampusId || !canAccessCampus(campusAccess, operatorCampusId)) {
    return { ok: false, error: "invalid_form" };
  }
  const recordedAt = new Date().toISOString();
  const paidAt = parsed.paidAtRaw ? parseMonterreyDateTimeInput(parsed.paidAtRaw) : recordedAt;
  if (!paidAt) return { ok: false, error: "invalid_form" };

  // ── Sweep unallocated credit from prior payments (FIFO) ───────────────────
  // Any prior payment that was not fully allocated (e.g. from an overpayment)
  // gets applied to pending charges before the new payment, so that a charge
  // already covered by a credit does not re-surface as outstanding.
  const effectivePending = new Map<string, number>(
    pendingCharges.map((c) => [c.id, c.pendingAmount])
  );
  const priorAllocations: Array<{ paymentId: string; chargeId: string; amount: number }> = [];
  for (const prior of ledger.payments.filter((p) => p.status === "posted" && p.allocatedAmount < p.amount)) {
    let available = Math.round((prior.amount - prior.allocatedAmount) * 100) / 100;
    for (const charge of pendingCharges) {
      if (available <= 0) break;
      const ep = effectivePending.get(charge.id) ?? 0;
      if (ep <= 0) continue;
      const alloc = Math.round(Math.min(available, ep) * 100) / 100;
      priorAllocations.push({ paymentId: prior.id, chargeId: charge.id, amount: alloc });
      effectivePending.set(charge.id, Math.round((ep - alloc) * 100) / 100);
      available = Math.round((available - alloc) * 100) / 100;
    }
  }
  const effectiveCharges = pendingCharges
    .map((c) => ({ ...c, pendingAmount: effectivePending.get(c.id) ?? 0 }))
    .filter((c) => c.pendingAmount > 0);

  // ── Allocate new payment(s) ───────────────────────────────────────────────
  // Helper: runs a FIFO allocation pass, consuming from `available` map
  function allocatePass(
    budget: number,
    chargeList: typeof effectiveCharges,
    available: Map<string, number>,
    priorityIds: Set<string>
  ): Array<{ chargeId: string; amount: number }> {
    const result: Array<{ chargeId: string; amount: number }> = [];
    let rem = budget;
    const ordered = priorityIds.size > 0
      ? [...chargeList.filter(c => priorityIds.has(c.id)), ...chargeList.filter(c => !priorityIds.has(c.id))]
      : chargeList;
    for (const charge of ordered) {
      if (rem <= 0) break;
      const ep = available.get(charge.id) ?? 0;
      if (ep <= 0) continue;
      const alloc = Math.round(Math.min(rem, ep) * 100) / 100;
      result.push({ chargeId: charge.id, amount: alloc });
      available.set(charge.id, Math.round((ep - alloc) * 100) / 100);
      rem = Math.round((rem - alloc) * 100) / 100;
    }
    return result;
  }

  const available = new Map(effectiveCharges.map(c => [c.id, c.pendingAmount]));
  const allocations1 = allocatePass(parsed.amount, effectiveCharges, available, targetSet);
  const allocations2 = parsed.split
    ? allocatePass(parsed.split.amount, effectiveCharges, available, new Set())
    : [];

  const providerRef = `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const { data: paymentRow, error: paymentError } = await supabase
    .from("payments")
    .insert({
      enrollment_id: enrollmentId,
      paid_at: paidAt,
      method: parsed.method,
      amount: parsed.amount,
      currency: ledger.enrollment.currency,
      status: "posted",
      operator_campus_id: operatorCampusId,
      provider_ref: providerRef,
      external_source: "manual",
      notes: parsed.notes,
      created_by: user.id
    })
    .select("id")
    .single<{ id: string }>();

  if (paymentError || !paymentRow) {
    console.error("[postCajaPaymentAction] payment insert failed:", paymentError);
    return { ok: false, error: "payment_insert_failed" };
  }

  // Insert second payment row if split
  let paymentRow2Id: string | null = null;
  if (parsed.split) {
    const { data: p2, error: p2Error } = await supabase
      .from("payments")
      .insert({
        enrollment_id: enrollmentId,
        paid_at: paidAt,
        method: parsed.split.method,
        amount: parsed.split.amount,
        currency: ledger.enrollment.currency,
        status: "posted",
        operator_campus_id: operatorCampusId,
        provider_ref: `${providerRef}-b`,
        external_source: "manual",
        notes: parsed.notes,
        created_by: user.id
      })
      .select("id")
      .single<{ id: string }>();

    if (p2Error || !p2) {
      await supabase.from("payments").delete().eq("id", paymentRow.id);
      return { ok: false, error: "payment_insert_failed" };
    }
    paymentRow2Id = p2.id;
  }

  // Insert allocations for prior unallocated credit first
  if (priorAllocations.length > 0) {
    const { error: priorAllocError } = await supabase.from("payment_allocations").insert(
      priorAllocations.map((a) => ({
        payment_id: a.paymentId,
        charge_id: a.chargeId,
        amount: a.amount
      }))
    );
    if (priorAllocError) {
      await supabase.from("payments").delete().eq("id", paymentRow.id);
      if (paymentRow2Id) await supabase.from("payments").delete().eq("id", paymentRow2Id);
      return { ok: false, error: "allocation_insert_failed" };
    }
  }

  if (allocations1.length > 0) {
    const { error: allocationError } = await supabase.from("payment_allocations").insert(
      allocations1.map((a) => ({
        payment_id: paymentRow.id,
        charge_id: a.chargeId,
        amount: a.amount
      }))
    );
    if (allocationError) {
      await supabase.from("payments").delete().eq("id", paymentRow.id);
      if (paymentRow2Id) await supabase.from("payments").delete().eq("id", paymentRow2Id);
      return { ok: false, error: "allocation_insert_failed" };
    }
  }

  if (paymentRow2Id && allocations2.length > 0) {
    const { error: allocationError2 } = await supabase.from("payment_allocations").insert(
      allocations2.map((a) => ({
        payment_id: paymentRow2Id!,
        charge_id: a.chargeId,
        amount: a.amount
      }))
    );
    if (allocationError2) {
      await supabase.from("payments").delete().eq("id", paymentRow.id);
      await supabase.from("payments").delete().eq("id", paymentRow2Id);
      return { ok: false, error: "allocation_insert_failed" };
    }
  }

  const allAllocatedCharges = [
    ...priorAllocations.map((a) => ({ chargeId: a.chargeId, amount: a.amount })),
    ...allocations1,
    ...allocations2
  ];
  await applyEarlyBirdDiscountIfEligible(supabase, enrollmentId, allAllocatedCharges, ledger, user.id);

  // ── Link cash payments to open session ────────────────────────────────────
  const paymentsToLink: Array<{ id: string; amount: number; method: string }> = [
    { id: paymentRow.id, amount: parsed.amount, method: parsed.method },
    ...(paymentRow2Id && parsed.split ? [{ id: paymentRow2Id, amount: parsed.split.amount, method: parsed.split.method }] : [])
  ];
  const sessionWarning = await linkCashPaymentsToOpenSession(supabase, operatorCampusId, paymentsToLink, user.id);
  const folio = await fetchPaymentFolio(supabase, paymentRow.id);

  await writePostedPaymentAudit(supabase, {
    actorUserId: user.id,
    actorEmail: user.email ?? null,
    recordId: paymentRow.id,
    enrollmentId,
    amount: parsed.amount,
    method: parsed.method,
    source: "caja",
    split: !!parsed.split,
    paidAt,
    recordedAt,
    folio,
  });

  await syncPaidUniformOrders(supabase, {
    chargeIds: Array.from(new Set(allAllocatedCharges.map((allocation) => allocation.chargeId))),
    actorUserId: user.id,
    soldAt: paidAt,
  });

  await revalidatePaymentSurfaces(ledger);
  const refreshedLedger = await getEnrollmentLedger(enrollmentId);

  const totalPaid = parsed.split ? parsed.amount + parsed.split.amount : parsed.amount;
  const newBalance = refreshedLedger?.totals.balance ?? Math.max(ledger.totals.balance - totalPaid, 0);

  const chargeMap = new Map(pendingCharges.map((c) => [c.id, c.description]));
  const chargesPaid = [...allocations1, ...allocations2]
    .filter((a) => a.amount > 0)
    .map((a) => ({ description: chargeMap.get(a.chargeId) ?? "Cargo", amount: a.amount }));

  const splitPayment = parsed.split
    ? { amount: parsed.split.amount, method: parsed.split.method }
    : undefined;

  return {
    ok: true,
    paymentId: paymentRow.id,
    folio,
    amount: totalPaid,
    playerName: ledger.enrollment.playerName,
    campusName: ledger.enrollment.campusName,
    birthYear: ledger.enrollment.birthYear,
    method: parsed.method,
    splitPayment,
    remainingBalance: newBalance,
    currency: ledger.enrollment.currency,
    sessionWarning,
    chargesPaid,
    paidAt,
    date: formatDateMonterrey(paidAt),
    time: formatTimeMonterrey(paidAt)
  };
}


