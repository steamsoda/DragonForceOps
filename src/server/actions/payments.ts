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

  revalidatePath(`/enrollments/${enrollmentId}/charges`);
  redirect(`/enrollments/${enrollmentId}/charges?ok=payment_posted`);
}
