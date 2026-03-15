"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getEnrollmentLedger } from "@/lib/queries/billing";
import { parsePaymentFormData } from "@/lib/validations/payment";
import { writeAuditLog } from "@/lib/audit";
import { applyEarlyBirdDiscountIfEligible } from "@/server/actions/payments";
import { PRODUCT_GROUPS } from "@/lib/product-groups";

export type CajaPlayerResult = {
  playerId: string;
  playerName: string;
  birthYear: number | null;
  enrollmentId: string;
  campusName: string;
  balance: number;
};

export type CajaPendingCharge = {
  id: string;
  typeName: string;
  typeCode: string;
  description: string;
  amount: number;
  pendingAmount: number;
  periodMonth: string | null;
};

export type CajaEnrollmentData = {
  enrollmentId: string;
  playerName: string;
  campusName: string;
  balance: number;
  currency: string;
  pendingCharges: CajaPendingCharge[];
};

export type CajaPaymentResult =
  | { ok: true; paymentId: string; amount: number; playerName: string; campusName: string; method: string; remainingBalance: number; currency: string }
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
  | { ok: true; updatedData: CajaEnrollmentData }
  | { ok: false; error: string };

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
  const productId = formData.get("productId")?.toString().trim() ?? "";
  const amountRaw = formData.get("amount")?.toString() ?? "";
  const amount = parseFloat(amountRaw);
  const size = formData.get("size")?.toString().trim() || null;
  const goalkeeper = formData.get("goalkeeper") === "1";

  if (!productId || isNaN(amount) || amount <= 0) {
    return { ok: false, error: "invalid_form" };
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();
  if (userError || !user) return { ok: false, error: "unauthenticated" };

  type ProductLookup = { id: string; name: string; charge_type_id: string; has_sizes: boolean };
  const { data: product } = await supabase
    .from("products")
    .select("id, name, charge_type_id, has_sizes")
    .eq("id", productId)
    .eq("is_active", true)
    .maybeSingle()
    .returns<ProductLookup | null>();

  if (!product) return { ok: false, error: "product_not_found" };

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
  const sizePart = size ? ` — Talla ${size}` : "";
  const goalkeeperPart = goalkeeper ? " (Portero)" : "";
  const description = `${product.name}${sizePart}${goalkeeperPart}`;

  const { error: chargeError } = await supabase.from("charges").insert({
    enrollment_id: enrollmentId,
    charge_type_id: product.charge_type_id,
    product_id: productId,
    size,
    is_goalkeeper: product.has_sizes ? goalkeeper : null,
    description,
    amount,
    currency,
    status: "pending",
    created_by: user.id
  });

  if (chargeError) return { ok: false, error: "charge_insert_failed" };

  await writeAuditLog(supabase, {
    actorUserId: user.id,
    actorEmail: user.email ?? null,
    action: "charge.created",
    tableName: "charges",
    afterData: { enrollment_id: enrollmentId, product_id: productId, description, amount, source: "caja" }
  });

  const updatedData = await getEnrollmentForCajaAction(enrollmentId);
  if (!updatedData) return { ok: false, error: "reload_failed" };

  return { ok: true, updatedData };
}

// ── Player search — single RPC call ───────────────────────────────────────────

type CajaSearchRow = {
  player_id: string;
  player_name: string;
  birth_year: number | null;
  enrollment_id: string;
  campus_name: string;
  balance: number;
};

export async function searchPlayersForCajaAction(q: string): Promise<CajaPlayerResult[]> {
  if (!q || q.trim().length < 2) return [];

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .rpc("search_players_for_caja", { search_query: q.trim() });

  if (error || !data) return [];

  return (data as CajaSearchRow[]).map((row) => ({
    playerId: row.player_id,
    playerName: row.player_name,
    birthYear: row.birth_year,
    enrollmentId: row.enrollment_id,
    campusName: row.campus_name,
    balance: row.balance
  }));
}

// ── Load enrollment data for Caja panel ───────────────────────────────────────

export async function getEnrollmentForCajaAction(enrollmentId: string): Promise<CajaEnrollmentData | null> {
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
      periodMonth: c.periodMonth
    }));

  return {
    enrollmentId,
    playerName: ledger.enrollment.playerName,
    campusName: ledger.enrollment.campusName,
    balance: ledger.totals.balance,
    currency: ledger.enrollment.currency,
    pendingCharges
  };
}

// ── Post payment from Caja (returns result, does not redirect) ────────────────

export async function postCajaPaymentAction(enrollmentId: string, formData: FormData): Promise<CajaPaymentResult> {
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

  const pendingCharges = ledger.charges
    .filter((c) => c.pendingAmount > 0 && c.status !== "void")
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  if (ledger.enrollment.status === "ended" || ledger.enrollment.status === "cancelled") {
    return { ok: false, error: "enrollment_inactive" };
  }

  const allocations: Array<{ chargeId: string; amount: number }> = [];
  let remaining = parsed.amount;

  for (const charge of pendingCharges) {
    if (remaining <= 0) break;
    const allocated = Math.min(remaining, charge.pendingAmount);
    allocations.push({ chargeId: charge.id, amount: Math.round(allocated * 100) / 100 });
    remaining = Math.round((remaining - allocated) * 100) / 100;
  }

  const providerRef = `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const { data: paymentRow, error: paymentError } = await supabase
    .from("payments")
    .insert({
      enrollment_id: enrollmentId,
      paid_at: new Date().toISOString(),
      method: parsed.method,
      amount: parsed.amount,
      currency: ledger.enrollment.currency,
      status: "posted",
      provider_ref: providerRef,
      external_source: "manual",
      notes: parsed.notes,
      created_by: user.id
    })
    .select("id")
    .single<{ id: string }>();

  if (paymentError || !paymentRow) return { ok: false, error: "payment_insert_failed" };

  if (allocations.length > 0) {
    const { error: allocationError } = await supabase.from("payment_allocations").insert(
      allocations.map((a) => ({
        payment_id: paymentRow.id,
        charge_id: a.chargeId,
        amount: a.amount
      }))
    );

    if (allocationError) {
      await supabase.from("payments").delete().eq("id", paymentRow.id);
      return { ok: false, error: "allocation_insert_failed" };
    }
  }

  await applyEarlyBirdDiscountIfEligible(supabase, enrollmentId, allocations, ledger, user.id);

  await writeAuditLog(supabase, {
    actorUserId: user.id,
    actorEmail: user.email ?? null,
    action: "payment.posted",
    tableName: "payments",
    recordId: paymentRow.id,
    afterData: { enrollment_id: enrollmentId, amount: parsed.amount, method: parsed.method, source: "caja" }
  });

  revalidatePath("/caja");

  const newBalance = ledger.totals.balance - parsed.amount;

  return {
    ok: true,
    paymentId: paymentRow.id,
    amount: parsed.amount,
    playerName: ledger.enrollment.playerName,
    campusName: ledger.enrollment.campusName,
    method: parsed.method,
    remainingBalance: newBalance,
    currency: ledger.enrollment.currency
  };
}
