"use server";

import { revalidatePath } from "next/cache";
import { canAccessCampus, getOperationalCampusAccess } from "@/lib/auth/campuses";
import { isDebugWriteBlocked } from "@/lib/auth/debug-view";
import { PAYMENT_METHOD_LABELS } from "@/lib/payments";
import { getEnrollmentLedger } from "@/lib/queries/billing";
import { createClient } from "@/lib/supabase/server";
import { formatDateMonterrey, formatTimeMonterrey, parseMonterreyDateTimeInput } from "@/lib/time";
import { parsePaymentFormData } from "@/lib/validations/payment";
import { redirect } from "next/navigation";
import {
  fetchPaymentFolio,
  linkCashPaymentsToOpenSession,
  revalidatePaymentSurfaces,
  clearPendingFollowUpIfResolved,
  syncPaidUniformOrders,
  writePostedPaymentAudit
} from "@/server/actions/payment-posting";

export type PostedPaymentReceipt = {
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

export type EnrollmentPaymentResult =
  | {
      ok: true;
      receipt: PostedPaymentReceipt;
    }
  | { ok: false; error: string };

export type HistoricalRegularizationPaymentResult =
  | {
      ok: true;
      paymentId: string;
      folio: string | null;
      amount: number;
      currency: string;
      paidAt: string;
      playerName: string;
      enrollmentId: string;
    }
  | { ok: false; error: string };

type SharedPostedPayment = {
  receipt: PostedPaymentReceipt;
  paymentId: string;
  folio: string | null;
  paidAt: string;
};

type PostEnrollmentPaymentMode = {
  auditSource: "ledger" | "historical_regularization_contry";
  externalSource: string;
  requirePaidAt: boolean;
  forceOperatorCampusId?: string;
  requireEnrollmentCampusId?: string;
  linkCashToSession: boolean;
  extraRevalidatePaths?: string[];
};

async function postEnrollmentPaymentInternal(
  enrollmentId: string,
  formData: FormData,
  mode: PostEnrollmentPaymentMode
): Promise<{ ok: true; posted: SharedPostedPayment } | { ok: false; error: string }> {
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

  if (mode.requireEnrollmentCampusId && ledger.enrollment.campusId !== mode.requireEnrollmentCampusId) {
    return { ok: false, error: "enrollment_not_found" };
  }

  const operatorCampusId = mode.forceOperatorCampusId ?? parsed.operatorCampusId ?? campusAccess.defaultCampusId;
  if (!operatorCampusId || !canAccessCampus(campusAccess, operatorCampusId)) {
    return { ok: false, error: "invalid_form" };
  }
  const recordedAt = new Date().toISOString();
  if (mode.requirePaidAt && !parsed.paidAtRaw) return { ok: false, error: "paid_at_required" };
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
      external_source: mode.externalSource,
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

  const sessionWarning = mode.linkCashToSession
    ? await linkCashPaymentsToOpenSession(
        supabase,
        operatorCampusId,
        [{ id: paymentRow.id, amount: parsed.amount, method: parsed.method }],
        user.id
      )
    : false;

  await writePostedPaymentAudit(supabase, {
    actorUserId: user.id,
    actorEmail: user.email ?? null,
    recordId: paymentRow.id,
    enrollmentId,
    amount: parsed.amount,
    method: parsed.method,
    source: mode.auditSource,
    externalSource: mode.externalSource,
    split: false,
    paidAt,
    recordedAt,
    folio,
  });

  const pendingAmountByCharge = new Map(pendingCharges.map((charge) => [charge.id, charge.pendingAmount]));
  const allocatedByCharge = new Map<string, number>();
  for (const allocation of allocations) {
    allocatedByCharge.set(
      allocation.chargeId,
      Math.round(((allocatedByCharge.get(allocation.chargeId) ?? 0) + allocation.amount) * 100) / 100
    );
  }
  const settledChargeIds = Array.from(allocatedByCharge.entries())
    .filter(([chargeId, allocated]) => allocated + 0.009 >= (pendingAmountByCharge.get(chargeId) ?? Number.POSITIVE_INFINITY))
    .map(([chargeId]) => chargeId);

  await syncPaidUniformOrders(supabase, {
    settledChargeIds,
    actorUserId: user.id,
    soldAt: paidAt,
  });

  await clearPendingFollowUpIfResolved(supabase, enrollmentId);

  await revalidatePaymentSurfaces(ledger);
  for (const path of mode.extraRevalidatePaths ?? []) revalidatePath(path);
  const refreshedLedger = await getEnrollmentLedger(enrollmentId);

  const chargesPaid = allocations.map((a) => {
    const charge = ledger.charges.find((c) => c.id === a.chargeId);
    return { description: charge?.description ?? "Cargo", amount: a.amount };
  });

  return {
    ok: true,
    posted: {
      paymentId: paymentRow.id,
      folio,
      paidAt,
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
    }
  };
}

export async function postEnrollmentPaymentAction(
  enrollmentId: string,
  formData: FormData
): Promise<EnrollmentPaymentResult> {
  const result = await postEnrollmentPaymentInternal(enrollmentId, formData, {
    auditSource: "ledger",
    externalSource: "manual",
    requirePaidAt: false,
    linkCashToSession: true,
  });

  if (!result.ok) return result;

  return {
    ok: true,
    receipt: result.posted.receipt,
  };
}

export async function postContryHistoricalPaymentAction(
  enrollmentId: string,
  contryCampusId: string,
  formData: FormData
): Promise<HistoricalRegularizationPaymentResult> {
  const result = await postEnrollmentPaymentInternal(enrollmentId, formData, {
    auditSource: "historical_regularization_contry",
    externalSource: "historical_catchup_contry",
    requirePaidAt: true,
    forceOperatorCampusId: contryCampusId,
    requireEnrollmentCampusId: contryCampusId,
    linkCashToSession: false,
    extraRevalidatePaths: ["/regularizacion/contry"],
  });

  if (!result.ok) return result;

  return {
    ok: true,
    paymentId: result.posted.paymentId,
    folio: result.posted.folio,
    amount: result.posted.receipt.amount,
    currency: result.posted.receipt.currency,
    paidAt: result.posted.paidAt,
    playerName: result.posted.receipt.playerName,
    enrollmentId,
  };
}

export async function postContryHistoricalPaymentRedirectAction(
  enrollmentId: string,
  contryCampusId: string,
  returnTo: string,
  formData: FormData
): Promise<void> {
  const result = await postContryHistoricalPaymentAction(enrollmentId, contryCampusId, formData);
  const joiner = returnTo.includes("?") ? "&" : "?";

  if (!result.ok) {
    redirect(`${returnTo}${joiner}err=${encodeURIComponent(result.error)}`);
  }

  redirect(
    `${returnTo}${joiner}ok=historical_payment_posted&payment=${encodeURIComponent(result.paymentId)}`
  );
}

export async function applyEarlyBirdDiscountIfEligible(..._args: unknown[]) {
  return;
}
