"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getEnrollmentLedger } from "@/lib/queries/billing";
import { parsePaymentFormData } from "@/lib/validations/payment";

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

  const pendingByCharge = new Map(
    ledger.charges
      .filter((charge) => charge.pendingAmount > 0 && charge.status !== "void")
      .map((charge) => [charge.id, charge.pendingAmount] as const)
  );

  if (pendingByCharge.size === 0) {
    return redirectWithError(enrollmentId, "no_pending_charges");
  }

  const validAllocations = parsed.allocations.filter((entry) => pendingByCharge.has(entry.chargeId));
  if (validAllocations.length === 0) {
    return redirectWithError(enrollmentId, "no_allocations");
  }

  const allocationTotal = Math.round(validAllocations.reduce((sum, row) => sum + row.amount, 0) * 100) / 100;
  if (allocationTotal > parsed.amount + 0.0001) {
    return redirectWithError(enrollmentId, "allocation_exceeds_payment");
  }

  if (Math.abs(allocationTotal - parsed.amount) > 0.0001) {
    return redirectWithError(enrollmentId, "allocation_must_match_payment");
  }

  for (const allocation of validAllocations) {
    const pending = pendingByCharge.get(allocation.chargeId) ?? 0;
    if (allocation.amount > pending + 0.0001) {
      return redirectWithError(enrollmentId, "allocation_exceeds_pending");
    }
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

  const { error: allocationError } = await supabase.from("payment_allocations").insert(
    validAllocations.map((allocation) => ({
      payment_id: paymentRow.id,
      charge_id: allocation.chargeId,
      amount: allocation.amount
    }))
  );

  if (allocationError) {
    await supabase.from("payments").delete().eq("id", paymentRow.id);
    return redirectWithError(enrollmentId, "allocation_insert_failed");
  }

  revalidatePath(`/enrollments/${enrollmentId}/charges`);
  redirect(`/enrollments/${enrollmentId}/charges?ok=payment_posted`);
}
