"use server";

import { createClient } from "@/lib/supabase/server";
import { allocateChargesWithPriority } from "@/lib/payments/allocation";
import { getEnrollmentLedger } from "@/lib/queries/billing";

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

type PaymentAllocationNormalizationResult = {
  insertedAllocationCount: number;
  insertedAllocationAmount: number;
};

export async function normalizeRemainingPostedCreditAllocations(
  supabase: Awaited<ReturnType<typeof createClient>>,
  enrollmentId: string,
): Promise<PaymentAllocationNormalizationResult> {
  const ledger = await getEnrollmentLedger(enrollmentId);
  if (!ledger) {
    return {
      insertedAllocationCount: 0,
      insertedAllocationAmount: 0,
    };
  }

  const pendingCharges = ledger.charges
    .filter((charge) => charge.status !== "void" && charge.pendingAmount > 0.01)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  if (pendingCharges.length === 0) {
    return {
      insertedAllocationCount: 0,
      insertedAllocationAmount: 0,
    };
  }

  const effectivePendingByCharge = new Map(
    pendingCharges.map((charge) => [charge.id, roundMoney(charge.pendingAmount)]),
  );

  const paymentIds = ledger.payments.map((payment) => payment.id);
  const explicitCreditByPayment = new Map<string, number>();
  if (paymentIds.length > 0) {
    const { data: paymentCredits, error: paymentCreditsError } = await supabase
      .from("enrollment_credits")
      .select("source_payment_id, original_amount")
      .eq("enrollment_id", enrollmentId)
      .neq("status", "void")
      .in("source_payment_id", paymentIds)
      .returns<Array<{ source_payment_id: string | null; original_amount: number }>>();

    if (paymentCreditsError) throw paymentCreditsError;

    for (const credit of paymentCredits ?? []) {
      if (!credit.source_payment_id) continue;
      explicitCreditByPayment.set(
        credit.source_payment_id,
        roundMoney((explicitCreditByPayment.get(credit.source_payment_id) ?? 0) + Number(credit.original_amount)),
      );
    }
  }

  const newAllocations: Array<{ payment_id: string; charge_id: string; amount: number }> = [];

  for (const payment of ledger.payments) {
    if (payment.status !== "posted" || payment.refundStatus === "refunded") continue;

    const explicitCreditAmount = explicitCreditByPayment.get(payment.id) ?? 0;
    const availableAmount = roundMoney(payment.amount - payment.allocatedAmount - explicitCreditAmount);
    if (availableAmount <= 0.01) continue;

    const chargePool = pendingCharges.map((charge) => ({
      id: charge.id,
      pendingAmount: effectivePendingByCharge.get(charge.id) ?? 0,
    }));
    const priorityChargeIds = payment.sourceCharges.map((charge) => charge.chargeId);
    const { allocations } = allocateChargesWithPriority(availableAmount, chargePool, priorityChargeIds);

    for (const allocation of allocations) {
      if (allocation.amount <= 0.01) continue;

      newAllocations.push({
        payment_id: payment.id,
        charge_id: allocation.chargeId,
        amount: allocation.amount,
      });

      effectivePendingByCharge.set(
        allocation.chargeId,
        roundMoney((effectivePendingByCharge.get(allocation.chargeId) ?? 0) - allocation.amount),
      );
    }
  }

  if (newAllocations.length === 0) {
    return {
      insertedAllocationCount: 0,
      insertedAllocationAmount: 0,
    };
  }

  const { error } = await supabase.from("payment_allocations").insert(newAllocations);
  if (error) {
    throw error;
  }

  return {
    insertedAllocationCount: newAllocations.length,
    insertedAllocationAmount: roundMoney(newAllocations.reduce((sum, row) => sum + row.amount, 0)),
  };
}
