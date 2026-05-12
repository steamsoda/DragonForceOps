"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { canAccessCampus, getOperationalCampusAccess } from "@/lib/auth/campuses";
import { isDebugWriteBlocked } from "@/lib/auth/debug-view";
import { getPermissionContext } from "@/lib/auth/permissions";
import { writeAuditLog } from "@/lib/audit";
import { applyScholarshipToAmount, type ScholarshipStatus } from "@/lib/enrollments/scholarships";
import { fetchPricingPlanVersionsByCode, quoteTuitionForDayFromVersions } from "@/lib/pricing/plans";
import { createClient } from "@/lib/supabase/server";
import { getMonterreyDateString, parseMonterreyDateTimeInput } from "@/lib/time";
import { clearPendingFollowUpIfResolved, fetchPaymentFolio } from "@/server/actions/payment-posting";

type PostingMode = "early" | "late";

type ChargeContext = {
  id: string;
  enrollment_id: string;
  description: string;
  amount: number;
  currency: string;
  status: string;
  period_month: string | null;
  pricing_rule_id: string | null;
  enrollments: {
    id: string;
    status: string;
    campus_id: string;
    scholarship_status: ScholarshipStatus;
    pricing_plans: { plan_code: string | null; currency: string | null } | null;
    players: { id: string | null; first_name: string | null; last_name: string | null } | null;
  } | null;
  charge_types: { code: string | null } | null;
};

type AllocationContext = {
  charge_id: string;
  amount: number;
  payments: { method: string | null; status: string | null } | null;
};

function normalizeMonth(raw: string | null) {
  return raw && /^\d{4}-\d{2}$/.test(raw) ? raw : null;
}

function normalizeMode(raw: string | null): PostingMode | null {
  if (raw === "early" || raw === "late") return raw;
  return null;
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function returnUrl(params: {
  campusId: string | null;
  month: string | null;
  mode: PostingMode | null;
  ok?: string;
  err?: string;
  posted?: number;
  skipped?: number;
  repriced?: number;
}) {
  const search = new URLSearchParams();
  if (params.campusId) search.set("campus", params.campusId);
  if (params.month) search.set("month", params.month);
  if (params.mode) search.set("mode", params.mode);
  if (params.ok) search.set("ok", params.ok);
  if (params.err) search.set("err", params.err);
  if (params.posted !== undefined) search.set("posted", String(params.posted));
  if (params.skipped !== undefined) search.set("skipped", String(params.skipped));
  if (params.repriced !== undefined) search.set("repriced", String(params.repriced));
  const query = search.toString();
  return `/admin/360player-posting${query ? `?${query}` : ""}`;
}

function selectedPaidAt(raw: string | null) {
  const parsed = raw ? parseMonterreyDateTimeInput(raw) : null;
  return parsed ?? parseMonterreyDateTimeInput(`${getMonterreyDateString()}T12:00`) ?? new Date().toISOString();
}

async function calculateSelectedAmount(
  supabase: Awaited<ReturnType<typeof createClient>>,
  charge: ChargeContext,
  mode: PostingMode
) {
  const planCode = charge.enrollments?.pricing_plans?.plan_code ?? null;
  if (!planCode || !charge.period_month || !charge.enrollments) return null;
  const versions = await fetchPricingPlanVersionsByCode(supabase, planCode);
  const quote = quoteTuitionForDayFromVersions(versions, charge.period_month, mode === "early" ? 1 : 31);
  if (!quote) return null;
  return {
    amount: applyScholarshipToAmount(quote.amount, charge.enrollments.scholarship_status),
    pricingRuleId: quote.pricingRuleId,
  };
}

async function getChargeContext(
  supabase: Awaited<ReturnType<typeof createClient>>,
  chargeId: string
) {
  const { data } = await supabase
    .from("charges")
    .select("id, enrollment_id, description, amount, currency, status, period_month, pricing_rule_id, charge_types(code), enrollments(id, status, campus_id, scholarship_status, pricing_plans(plan_code, currency), players(id, first_name, last_name))")
    .eq("id", chargeId)
    .maybeSingle<ChargeContext | null>();
  return data;
}

async function getChargeAllocations(
  supabase: Awaited<ReturnType<typeof createClient>>,
  chargeId: string
) {
  const { data } = await supabase
    .from("payment_allocations")
    .select("charge_id, amount, payments(method, status)")
    .eq("charge_id", chargeId)
    .returns<AllocationContext[]>();
  return data ?? [];
}

async function countMonthlyChargesForEnrollment(
  supabase: Awaited<ReturnType<typeof createClient>>,
  enrollmentId: string,
  periodMonth: string
) {
  const { data } = await supabase
    .from("charges")
    .select("id, charge_types!inner(code)")
    .eq("enrollment_id", enrollmentId)
    .eq("period_month", periodMonth)
    .neq("status", "void")
    .eq("charge_types.code", "monthly_tuition")
    .returns<Array<{ id: string }>>();

  return data?.length ?? 0;
}

async function postOne360Payment({
  supabase,
  user,
  charge,
  amount,
  pricingRuleId,
  paidAt,
}: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  user: { id: string; email: string | null };
  charge: ChargeContext;
  amount: number;
  pricingRuleId: string | null;
  paidAt: string;
}) {
  const oldAmount = roundMoney(charge.amount);
  const needsReprice = Math.abs(oldAmount - amount) > 0.009;
  const updatedAt = new Date().toISOString();

  if (needsReprice) {
    const { error: updateError } = await supabase
      .from("charges")
      .update({
        amount,
        pricing_rule_id: pricingRuleId,
        updated_at: updatedAt,
      })
      .eq("id", charge.id)
      .eq("amount", charge.amount);
    if (updateError) return { ok: false as const, error: "charge_update_failed", repriced: false };
  }

  const providerRef = `360player-manual-${charge.id}-${Date.now()}`;
  const notes = `Batch 360Player mensualidad ${charge.period_month}. Cargo ${needsReprice ? `repreciado de ${oldAmount} a ${amount}` : "sin repricio"}.`;
  const { data: payment, error: paymentError } = await supabase
    .from("payments")
    .insert({
      enrollment_id: charge.enrollment_id,
      paid_at: paidAt,
      method: "stripe_360player",
      amount,
      currency: charge.currency,
      status: "posted",
      operator_campus_id: charge.enrollments?.campus_id,
      provider_ref: providerRef,
      external_source: "manual_360player_batch",
      notes,
      created_by: user.id,
    })
    .select("id")
    .single<{ id: string }>();

  if (paymentError || !payment?.id) {
    if (needsReprice) {
      await supabase.from("charges").update({ amount: oldAmount, pricing_rule_id: charge.pricing_rule_id, updated_at: new Date().toISOString() }).eq("id", charge.id);
    }
    return { ok: false as const, error: "payment_insert_failed", repriced: false };
  }

  const { error: allocationError } = await supabase
    .from("payment_allocations")
    .insert({
      payment_id: payment.id,
      charge_id: charge.id,
      amount,
    });

  if (allocationError) {
    await supabase.from("payments").delete().eq("id", payment.id);
    if (needsReprice) {
      await supabase.from("charges").update({ amount: oldAmount, pricing_rule_id: charge.pricing_rule_id, updated_at: new Date().toISOString() }).eq("id", charge.id);
    }
    return { ok: false as const, error: "allocation_insert_failed", repriced: false };
  }

  const folio = await fetchPaymentFolio(supabase, payment.id);
  await writeAuditLog(supabase, {
    actorUserId: user.id,
    actorEmail: user.email,
    action: "payment.posted.360player_batch",
    tableName: "payments",
    recordId: payment.id,
    afterData: {
      enrollment_id: charge.enrollment_id,
      charge_id: charge.id,
      amount,
      method: "stripe_360player",
      external_source: "manual_360player_batch",
      period_month: charge.period_month,
      paid_at: paidAt,
      folio,
      repriced: needsReprice,
      old_charge_amount: oldAmount,
      new_charge_amount: amount,
    },
  });

  if (needsReprice) {
    await writeAuditLog(supabase, {
      actorUserId: user.id,
      actorEmail: user.email,
      action: "charge.updated.360player_batch",
      tableName: "charges",
      recordId: charge.id,
      beforeData: { amount: oldAmount, pricing_rule_id: charge.pricing_rule_id },
      afterData: { amount, pricing_rule_id: pricingRuleId, payment_id: payment.id },
    });
  }

  await clearPendingFollowUpIfResolved(supabase, charge.enrollment_id);
  revalidatePath(`/enrollments/${charge.enrollment_id}/charges`);
  if (charge.enrollments?.players?.id) revalidatePath(`/players/${charge.enrollments.players.id}`);
  return { ok: true as const, paymentId: payment.id, repriced: needsReprice };
}

export async function post360PlayerMonthlyBatchAction(formData: FormData) {
  if (await isDebugWriteBlocked()) {
    redirect(returnUrl({ campusId: String(formData.get("campus") ?? "") || null, month: String(formData.get("month") ?? "") || null, mode: normalizeMode(String(formData.get("mode") ?? "")), err: "debug_read_only" }));
  }

  const month = normalizeMonth(String(formData.get("month") ?? ""));
  const mode = normalizeMode(String(formData.get("mode") ?? ""));
  const campusId = String(formData.get("campus") ?? "").trim() || null;
  const chargeIds = formData.getAll("chargeId").map((value) => String(value).trim()).filter(Boolean);
  const paidAt = selectedPaidAt(String(formData.get("paidAt") ?? "").trim() || null);

  if (!month || !mode || !campusId || chargeIds.length === 0 || chargeIds.length > 100) {
    redirect(returnUrl({ campusId, month, mode, err: "invalid_form" }));
  }

  const context = await getPermissionContext();
  const access = await getOperationalCampusAccess();
  if (!context?.hasOperationalAccess || !access || !canAccessCampus(access, campusId)) {
    redirect(returnUrl({ campusId, month, mode, err: "unauthorized" }));
  }

  const supabase = await createClient();
  const periodMonth = `${month}-01`;
  let posted = 0;
  let skipped = 0;
  let repriced = 0;

  for (const chargeId of Array.from(new Set(chargeIds))) {
    const charge = await getChargeContext(supabase, chargeId);
    if (!charge || charge.period_month !== periodMonth || charge.charge_types?.code !== "monthly_tuition") {
      skipped += 1;
      continue;
    }
    if (!charge.enrollments || charge.enrollments.campus_id !== campusId || charge.enrollments.status !== "active") {
      skipped += 1;
      continue;
    }
    if (charge.enrollments.scholarship_status === "full") {
      skipped += 1;
      continue;
    }
    const monthlyChargeCount = await countMonthlyChargesForEnrollment(supabase, charge.enrollment_id, periodMonth);
    if (monthlyChargeCount !== 1) {
      skipped += 1;
      continue;
    }

    const allocations = await getChargeAllocations(supabase, charge.id);
    const allocatedAmount = roundMoney(allocations.reduce((sum, allocation) => sum + allocation.amount, 0));
    const has360Player = allocations.some((allocation) => allocation.payments?.method === "stripe_360player" && allocation.payments.status === "posted");
    if (allocatedAmount > 0.009 || has360Player || charge.status === "void") {
      skipped += 1;
      continue;
    }

    const quote = await calculateSelectedAmount(supabase, charge, mode);
    if (!quote || quote.amount <= 0) {
      skipped += 1;
      continue;
    }

    const currentAmount = roundMoney(charge.amount);
    const earlyQuote = await calculateSelectedAmount(supabase, charge, "early");
    const lateQuote = await calculateSelectedAmount(supabase, charge, "late");
    const expectedAmounts = [earlyQuote?.amount, lateQuote?.amount].filter((value): value is number => typeof value === "number");
    if (!expectedAmounts.some((amount) => Math.abs(currentAmount - amount) <= 0.009)) {
      skipped += 1;
      continue;
    }

    const result = await postOne360Payment({
      supabase,
      user: context.user,
      charge,
      amount: quote.amount,
      pricingRuleId: quote.pricingRuleId,
      paidAt,
    });

    if (result.ok) {
      posted += 1;
      if (result.repriced) repriced += 1;
    } else {
      skipped += 1;
    }
  }

  revalidatePath("/admin/360player-posting");
  revalidatePath("/caja");
  revalidatePath("/pending");
  revalidatePath("/llamadas");
  revalidatePath("/reports/corte-diario");
  revalidatePath("/receipts");

  redirect(returnUrl({ campusId, month, mode, ok: "posted", posted, skipped, repriced }));
}
