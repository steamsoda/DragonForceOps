"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getEnrollmentLedger } from "@/lib/queries/billing";
import { parsePaymentFormData } from "@/lib/validations/payment";
import { MONTH_NAMES_ES } from "@/lib/billing/generate-monthly-charges";
import { writeAuditLog } from "@/lib/audit";

type TuitionRuleRow = { amount: number; day_to: number | null };
type DiscountCheckRow = { id: string };

function redirectWithError(enrollmentId: string, code: string): never {
  redirect(`/enrollments/${enrollmentId}/charges?err=${code}`);
}

export async function postEnrollmentPaymentAction(enrollmentId: string, formData: FormData) {
  const parsed = parsePaymentFormData(formData);
  if (!parsed) {
    return redirectWithError(enrollmentId, "invalid_form");
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return redirectWithError(enrollmentId, "unauthenticated");
  }

  const ledger = await getEnrollmentLedger(enrollmentId);
  if (!ledger) {
    return redirectWithError(enrollmentId, "enrollment_not_found");
  }

  // Pending charges sorted oldest-first for auto-allocation
  const pendingCharges = ledger.charges
    .filter((c) => c.pendingAmount > 0 && c.status !== "void")
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  if (pendingCharges.length === 0) {
    return redirectWithError(enrollmentId, "no_pending_charges");
  }

  // Auto-allocate oldest-first. Any excess over total pending = credit balance.
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

  if (paymentError || !paymentRow) {
    return redirectWithError(enrollmentId, "payment_insert_failed");
  }

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
      return redirectWithError(enrollmentId, "allocation_insert_failed");
    }
  }

  // ── Early bird discount ───────────────────────────────────────────────────
  // If payment is on days 1–10 of the month and touches a monthly_tuition charge
  // for the current period, automatically create a discount credit line.
  await applyEarlyBirdDiscountIfEligible(supabase, enrollmentId, allocations, ledger, user.id);

  await writeAuditLog(supabase, {
    actorUserId: user.id,
    action: "payment.posted",
    tableName: "payments",
    recordId: paymentRow.id,
    afterData: { enrollment_id: enrollmentId, amount: parsed.amount, method: parsed.method }
  });

  revalidatePath(`/enrollments/${enrollmentId}/charges`);
  redirect(`/enrollments/${enrollmentId}/charges?ok=payment_posted`);
}

export async function applyEarlyBirdDiscountIfEligible(
  supabase: Awaited<ReturnType<typeof createClient>>,
  enrollmentId: string,
  allocations: Array<{ chargeId: string; amount: number }>,
  ledger: NonNullable<Awaited<ReturnType<typeof getEnrollmentLedger>>>,
  userId: string
) {
  const today = new Date();
  const dayOfMonth = today.getDate();
  if (dayOfMonth > 10) return; // Outside early-bird window

  const currentPeriodMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-01`;

  // Find any allocation that touched a monthly_tuition charge for the current period month
  const allocatedChargeIds = new Set(allocations.map((a) => a.chargeId));
  const eligibleCharge = ledger.charges.find(
    (c) =>
      allocatedChargeIds.has(c.id) &&
      c.typeCode === "monthly_tuition" &&
      c.periodMonth === currentPeriodMonth
  );
  if (!eligibleCharge) return;

  // Check: discount not already applied for this enrollment + period
  const { data: existingDiscount } = await supabase
    .from("charges")
    .select("id")
    .eq("enrollment_id", enrollmentId)
    .eq("period_month", currentPeriodMonth)
    .neq("status", "void")
    .in(
      "charge_type_id",
      (await supabase
        .from("charge_types")
        .select("id")
        .eq("code", "early_bird_discount")
        .eq("is_active", true)
        .maybeSingle()
        .then((r) => (r.data ? [r.data.id] : [])))
    )
    .maybeSingle()
    .returns<DiscountCheckRow | null>();

  if (existingDiscount) return; // Discount already applied

  // Get charge type IDs
  const [{ data: discountType }, { data: tuitionType }] = await Promise.all([
    supabase.from("charge_types").select("id").eq("code", "early_bird_discount").eq("is_active", true).maybeSingle(),
    supabase.from("charge_types").select("id").eq("code", "monthly_tuition").eq("is_active", true).maybeSingle()
  ]);
  if (!discountType || !tuitionType) return;

  // Get the enrollment's pricing plan to look up tuition tiers
  const { data: enrollment } = await supabase
    .from("enrollments")
    .select("pricing_plan_id")
    .eq("id", enrollmentId)
    .maybeSingle();
  if (!enrollment) return;

  const { data: rules } = await supabase
    .from("pricing_plan_tuition_rules")
    .select("amount, day_to")
    .eq("pricing_plan_id", enrollment.pricing_plan_id)
    .returns<TuitionRuleRow[]>();

  const allRules = rules ?? [];
  const earlyBirdRule = allRules.find((r) => r.day_to !== null); // rule with a day_to cap = early bird
  const regularRule = allRules.find((r) => r.day_to === null);   // open-ended = regular
  if (!earlyBirdRule || !regularRule) return;

  const discountAmount = -(regularRule.amount - earlyBirdRule.amount); // e.g., -150
  if (discountAmount >= 0) return; // Only apply if there's actually a discount

  const month = today.getMonth();
  const year = today.getFullYear();
  const description = `Descuento pago anticipado - ${MONTH_NAMES_ES[month]} ${year}`;

  await supabase.from("charges").insert({
    enrollment_id: enrollmentId,
    charge_type_id: discountType.id,
    period_month: currentPeriodMonth,
    description,
    amount: discountAmount,
    currency: ledger.enrollment.currency,
    status: "posted",
    created_by: userId
  });
  // Silently ignore errors — discount is a bonus; don't fail the whole payment over it
}
