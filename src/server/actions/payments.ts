"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getEnrollmentLedger } from "@/lib/queries/billing";
import { parsePaymentFormData } from "@/lib/validations/payment";
import { writeAuditLog } from "@/lib/audit";

type TuitionRuleRow = { amount: number; day_to: number | null };

const METHOD_LABELS: Record<string, string> = {
  cash: "Efectivo",
  transfer: "Transferencia",
  card: "Tarjeta",
  stripe_360player: "360Player/Stripe",
  other: "Otro"
};

export type EnrollmentPaymentResult =
  | {
      ok: true;
      receipt: {
        playerName: string;
        campusName: string;
        birthYear: number | null;
        method: string;
        amount: number;
        currency: string;
        remainingBalance: number;
        chargesPaid: { description: string; amount: number }[];
        paymentId: string;
        folio: string | null;
        date: string;
        time: string;
      };
    }
  | { ok: false; error: string };

export async function postEnrollmentPaymentAction(
  enrollmentId: string,
  formData: FormData
): Promise<EnrollmentPaymentResult> {
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

  // Pending charges sorted oldest-first for auto-allocation
  const pendingCharges = ledger.charges
    .filter((c) => c.pendingAmount > 0 && c.status !== "void")
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  if (pendingCharges.length === 0) return { ok: false, error: "no_pending_charges" };

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
  const now = new Date();
  const { data: paymentRow, error: paymentError } = await supabase
    .from("payments")
    .insert({
      enrollment_id: enrollmentId,
      paid_at: now.toISOString(),
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

  // Fetch folio separately — defensive in case migration hasn't applied yet
  const { data: folioRow } = await supabase
    .from("payments")
    .select("folio")
    .eq("id", paymentRow.id)
    .maybeSingle<{ folio: string | null }>();
  const folio = folioRow?.folio ?? null;

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

  // ── Early bird discount ───────────────────────────────────────────────────
  await applyEarlyBirdDiscountIfEligible(supabase, enrollmentId, allocations, ledger, user.id);

  await writeAuditLog(supabase, {
    actorUserId: user.id,
    actorEmail: user.email ?? null,
    action: "payment.posted",
    tableName: "payments",
    recordId: paymentRow.id,
    afterData: { enrollment_id: enrollmentId, amount: parsed.amount, method: parsed.method }
  });

  revalidatePath(`/enrollments/${enrollmentId}/charges`);

  const chargesPaid = allocations.map((a) => {
    const charge = ledger.charges.find((c) => c.id === a.chargeId);
    return { description: charge?.description ?? "Cargo", amount: a.amount };
  });

  return {
    ok: true,
    receipt: {
      playerName: ledger.enrollment.playerName,
      campusName: ledger.enrollment.campusName,
      birthYear: ledger.enrollment.birthYear,
      method: METHOD_LABELS[parsed.method] ?? parsed.method,
      amount: parsed.amount,
      currency: ledger.enrollment.currency,
      remainingBalance: ledger.totals.balance - parsed.amount,
      chargesPaid,
      paymentId: paymentRow.id,
      folio,
      date: now.toLocaleDateString("es-MX", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Monterrey" }),
      time: now.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", timeZone: "America/Monterrey" }),
    }
  };
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
  const currentPeriodMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-01`;

  // Find any allocation that touched a monthly_tuition charge eligible for early-bird:
  //   - future month (advance payment): always eligible
  //   - current month: eligible only on days 1–10
  const allocatedChargeIds = new Set(allocations.map((a) => a.chargeId));
  const eligibleCharge = ledger.charges.find(
    (c) =>
      allocatedChargeIds.has(c.id) &&
      c.typeCode === "monthly_tuition" &&
      !!c.periodMonth &&
      (
        c.periodMonth > currentPeriodMonth ||
        (c.periodMonth === currentPeriodMonth && dayOfMonth <= 10)
      )
  );
  if (!eligibleCharge) return;

  // Fetch enrollment pricing plan
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
  if (earlyBirdRule.amount >= regularRule.amount) return; // No actual discount

  // Skip: charge was already at (or below) the early bird rate — no adjustment needed.
  if (eligibleCharge.amount <= earlyBirdRule.amount) return;

  // Update the tuition charge amount directly to the early bird rate.
  const { error: adjustError } = await supabase
    .from("charges")
    .update({ amount: earlyBirdRule.amount })
    .eq("id", eligibleCharge.id);
  // Silently ignore errors — discount is a bonus; don't fail the whole payment over it
  if (adjustError) console.error("[applyEarlyBirdRate] charge adjust failed:", adjustError);
}
