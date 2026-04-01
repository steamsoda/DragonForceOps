"use server";

import { canAccessCampus, getOperationalCampusAccess } from "@/lib/auth/campuses";
import { PAYMENT_METHOD_LABELS } from "@/lib/payments";
import { getEnrollmentLedger } from "@/lib/queries/billing";
import { createClient } from "@/lib/supabase/server";
import { formatDateMonterrey, formatTimeMonterrey, parseMonterreyDateTimeInput } from "@/lib/time";
import { parsePaymentFormData } from "@/lib/validations/payment";
import {
  fetchPaymentFolio,
  linkCashPaymentsToOpenSession,
  revalidatePaymentSurfaces,
  writePostedPaymentAudit
} from "@/server/actions/payment-posting";

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
        sessionWarning?: boolean;
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

  const campusAccess = await getOperationalCampusAccess();
  if (!campusAccess) return { ok: false, error: "unauthenticated" };

  const operatorCampusId = parsed.operatorCampusId ?? campusAccess.defaultCampusId;
  if (!operatorCampusId || !canAccessCampus(campusAccess, operatorCampusId)) {
    return { ok: false, error: "invalid_form" };
  }
  const recordedAt = new Date().toISOString();
  const paidAt = parsed.paidAtRaw ? parseMonterreyDateTimeInput(parsed.paidAtRaw) : recordedAt;
  if (!paidAt) return { ok: false, error: "invalid_form" };

  const pendingCharges = ledger.charges
    .filter((c) => c.pendingAmount > 0 && c.status !== "void")
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  if (pendingCharges.length === 0) return { ok: false, error: "no_pending_charges" };

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

  if (paymentError || !paymentRow) return { ok: false, error: "payment_insert_failed" };

  const folio = await fetchPaymentFolio(supabase, paymentRow.id);

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

  const sessionWarning = await linkCashPaymentsToOpenSession(
    supabase,
    operatorCampusId,
    [{ id: paymentRow.id, amount: parsed.amount, method: parsed.method }],
    user.id
  );

  await writePostedPaymentAudit(supabase, {
    actorUserId: user.id,
    actorEmail: user.email ?? null,
    recordId: paymentRow.id,
    enrollmentId,
    amount: parsed.amount,
    method: parsed.method,
    source: "ledger",
    split: false,
    paidAt,
    recordedAt,
  });

  await revalidatePaymentSurfaces(ledger);
  const refreshedLedger = await getEnrollmentLedger(enrollmentId);

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
      method: PAYMENT_METHOD_LABELS[parsed.method] ?? parsed.method,
      amount: parsed.amount,
      currency: ledger.enrollment.currency,
      remainingBalance: refreshedLedger?.totals.balance ?? Math.max(ledger.totals.balance - parsed.amount, 0),
      chargesPaid,
      paymentId: paymentRow.id,
      folio,
      date: formatDateMonterrey(paidAt),
      time: formatTimeMonterrey(paidAt),
      sessionWarning,
    }
  };
}

export async function applyEarlyBirdDiscountIfEligible(..._args: unknown[]) {
  return;
}
