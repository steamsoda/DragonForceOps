"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { writeAuditLog } from "@/lib/audit";
import { buildExternalPaymentRef, strongestExternalProviderRef } from "@/lib/external-payments";
import { getEnrollmentLedger } from "@/lib/queries/billing";
import { createClient } from "@/lib/supabase/server";
import { getMonterreyMonthString, parseMonterreyDateTimeLocalInput } from "@/lib/time";
import {
  fetchPaymentFolio,
  revalidatePaymentSurfaces,
  writePostedPaymentAudit,
} from "@/server/actions/payment-posting";

type ExternalEventRow = {
  id: string;
  external_ref: string;
  gross_amount: number;
  currency: string;
  paid_at: string;
  reconciliation_status: "unmatched" | "matched" | "ignored" | "refunded";
  invoice_description: string | null;
  invoice_number: string | null;
  provider_invoice_id: string | null;
  stripe_charge_id: string | null;
  stripe_invoice_id: string | null;
  notes: string | null;
};

type TargetChargeRow = {
  id: string;
  enrollment_id: string;
  amount: number;
  currency: string;
  description: string;
  status: string;
  charge_types: {
    code: string | null;
  } | null;
};

function redirectToExternalPayments(month: string, params: Record<string, string>): never {
  const search = new URLSearchParams({ month, ...params });
  redirect(`/reports/external-payments?${search.toString()}`);
}

function parseOptionalMoney(value: FormDataEntryValue | null) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const normalized = raw.replace(",", ".");
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount < 0) return null;
  return Math.round(amount * 100) / 100;
}

function cleanText(value: FormDataEntryValue | null) {
  const raw = String(value ?? "").trim();
  return raw || null;
}

export async function createExternalPaymentEventAction(formData: FormData) {
  const returnMonth = cleanText(formData.get("return_month")) ?? getMonterreyMonthString();
  const grossAmount = parseOptionalMoney(formData.get("gross_amount"));
  const paidAt = parseMonterreyDateTimeLocalInput(cleanText(formData.get("paid_at_local")));

  if (!grossAmount || !paidAt) {
    redirectToExternalPayments(returnMonth, { err: "invalid_form" });
  }

  const providerInvoiceId = cleanText(formData.get("provider_invoice_id"));
  const stripeInvoiceId = cleanText(formData.get("stripe_invoice_id"));
  const stripeChargeId = cleanText(formData.get("stripe_charge_id"));
  const invoiceNumber = cleanText(formData.get("invoice_number"));
  const externalRef = buildExternalPaymentRef({
    providerInvoiceId,
    stripeInvoiceId,
    stripeChargeId,
    invoiceNumber,
  });

  if (!externalRef) {
    redirectToExternalPayments(returnMonth, { err: "external_ref_required" });
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirectToExternalPayments(returnMonth, { err: "unauthorized" });
  }
  const currentUser = user;

  const insertPayload = {
    source_kind: "invoice_export_manual",
    provider: "stripe_360player",
    external_ref: externalRef,
    gross_amount: grossAmount,
    currency: cleanText(formData.get("currency")) ?? "MXN",
    paid_at: paidAt,
    reconciliation_status: "unmatched" as const,
    payer_name: cleanText(formData.get("payer_name")),
    payer_email: cleanText(formData.get("payer_email")),
    assigned_player_name: cleanText(formData.get("assigned_player_name")),
    provider_group_label: cleanText(formData.get("provider_group_label")),
    invoice_description: cleanText(formData.get("invoice_description")),
    invoice_number: invoiceNumber,
    provider_invoice_id: providerInvoiceId,
    stripe_charge_id: stripeChargeId,
    stripe_payment_intent_id: cleanText(formData.get("stripe_payment_intent_id")),
    stripe_invoice_id: stripeInvoiceId,
    stripe_fee_amount: parseOptionalMoney(formData.get("stripe_fee_amount")),
    stripe_fee_tax_amount: parseOptionalMoney(formData.get("stripe_fee_tax_amount")),
    platform_fee_amount: parseOptionalMoney(formData.get("platform_fee_amount")),
    notes: cleanText(formData.get("notes")),
    created_by: currentUser.id,
  };

  const { data: insertedRow, error: insertError } = await supabase
    .from("external_payment_events")
    .insert(insertPayload)
    .select("id")
    .single<{ id: string }>();

  if (insertError) {
    if (insertError.code === "23505") {
      redirectToExternalPayments(returnMonth, { err: "duplicate_ref" });
    }
    redirectToExternalPayments(returnMonth, { err: "create_failed" });
  }
  const createdEvent = insertedRow;

  await writeAuditLog(supabase, {
    actorUserId: currentUser.id,
    actorEmail: currentUser.email ?? null,
    action: "external_payment.recorded",
    tableName: "external_payment_events",
    recordId: createdEvent.id,
    afterData: {
      external_ref: externalRef,
      gross_amount: grossAmount,
      paid_at: paidAt,
      invoice_number: invoiceNumber,
      provider_invoice_id: providerInvoiceId,
    },
  });

  revalidatePath("/reports/external-payments");
  redirectToExternalPayments(returnMonth, { ok: "created" });
}

export async function ignoreExternalPaymentEventAction(formData: FormData) {
  const returnMonth = cleanText(formData.get("return_month")) ?? getMonterreyMonthString();
  const eventId = cleanText(formData.get("event_id"));
  const reason = cleanText(formData.get("ignored_reason"));

  if (!eventId || !reason) {
    redirectToExternalPayments(returnMonth, { err: "ignore_reason_required" });
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirectToExternalPayments(returnMonth, { err: "unauthorized" });
  }
  const currentUser = user;

  const { data: eventRow } = await supabase
    .from("external_payment_events")
    .select("id, reconciliation_status")
    .eq("id", eventId)
    .maybeSingle<{ id: string; reconciliation_status: string }>();

  if (!eventRow || eventRow.reconciliation_status !== "unmatched") {
    redirectToExternalPayments(returnMonth, { err: "event_not_matchable" });
  }

  const { error: updateError } = await supabase
    .from("external_payment_events")
    .update({
      reconciliation_status: "ignored",
      ignored_reason: reason,
      updated_at: new Date().toISOString(),
    })
    .eq("id", eventId);

  if (updateError) {
    redirectToExternalPayments(returnMonth, { err: "ignore_failed" });
  }

  await writeAuditLog(supabase, {
    actorUserId: currentUser.id,
    actorEmail: currentUser.email ?? null,
    action: "external_payment.ignored",
    tableName: "external_payment_events",
    recordId: eventId,
    afterData: { ignored_reason: reason },
  });

  revalidatePath("/reports/external-payments");
  redirectToExternalPayments(returnMonth, { ok: "ignored" });
}

export async function reconcileExternalPaymentEventAction(formData: FormData) {
  const returnMonth = cleanText(formData.get("return_month")) ?? getMonterreyMonthString();
  const eventId = cleanText(formData.get("event_id"));
  const targetChargeId = cleanText(formData.get("target_charge_id"));

  if (!eventId || !targetChargeId) {
    redirectToExternalPayments(returnMonth, { err: "target_required" });
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirectToExternalPayments(returnMonth, { err: "unauthorized" });
  }
  const currentUser = user;

  const { data: eventRow, error: eventError } = await supabase
    .from("external_payment_events")
    .select(
      "id, external_ref, gross_amount, currency, paid_at, reconciliation_status, invoice_description, invoice_number, provider_invoice_id, stripe_charge_id, stripe_invoice_id, notes"
    )
    .eq("id", eventId)
    .maybeSingle<ExternalEventRow>();

  if (eventError || !eventRow || eventRow.reconciliation_status !== "unmatched") {
    redirectToExternalPayments(returnMonth, { err: "event_not_matchable" });
  }
  const reconciledEvent = eventRow;

  const { data: chargeRow, error: chargeError } = await supabase
    .from("charges")
    .select("id, enrollment_id, amount, currency, description, status, charge_types(code)")
    .eq("id", targetChargeId)
    .maybeSingle<TargetChargeRow>();

  if (
    chargeError ||
    !chargeRow ||
    chargeRow.status === "void" ||
    chargeRow.charge_types?.code !== "monthly_tuition"
  ) {
    redirectToExternalPayments(returnMonth, { err: "target_invalid" });
  }
  const targetCharge = chargeRow;

  const { data: allocationRows } = await supabase
    .from("payment_allocations")
    .select("amount")
    .eq("charge_id", targetChargeId)
    .returns<Array<{ amount: number }>>();

  const allocatedAmount = (allocationRows ?? []).reduce((sum, row) => sum + row.amount, 0);
  const pendingAmount = Math.round((targetCharge.amount - allocatedAmount) * 100) / 100;

  if (pendingAmount <= 0) {
    redirectToExternalPayments(returnMonth, { err: "target_already_paid" });
  }

  if (Math.abs(pendingAmount - reconciledEvent.gross_amount) > 0.01) {
    redirectToExternalPayments(returnMonth, { err: "amount_mismatch" });
  }

  const paymentNotes = [
    "Conciliacion manual 360Player/Stripe",
    reconciledEvent.invoice_number ? `Factura ${reconciledEvent.invoice_number}` : null,
    reconciledEvent.notes,
  ]
    .filter(Boolean)
    .join(" | ");

  const providerRef = strongestExternalProviderRef({
    stripeChargeId: reconciledEvent.stripe_charge_id,
    providerInvoiceId: reconciledEvent.provider_invoice_id,
    stripeInvoiceId: reconciledEvent.stripe_invoice_id,
    invoiceNumber: reconciledEvent.invoice_number,
  });

  const { data: paymentRow, error: paymentError } = await supabase
    .from("payments")
    .insert({
      enrollment_id: targetCharge.enrollment_id,
      paid_at: reconciledEvent.paid_at,
      method: "stripe_360player",
      amount: reconciledEvent.gross_amount,
      currency: reconciledEvent.currency || targetCharge.currency,
      status: "posted",
      provider_ref: providerRef,
      external_source: "external_reconciliation_manual",
      notes: paymentNotes || null,
      created_by: currentUser.id,
    })
    .select("id")
    .single<{ id: string }>();

  if (paymentError || !paymentRow) {
    redirectToExternalPayments(returnMonth, { err: "payment_insert_failed" });
  }
  const createdPayment = paymentRow;

  const { error: allocationError } = await supabase.from("payment_allocations").insert({
    payment_id: createdPayment.id,
    charge_id: targetChargeId,
    amount: reconciledEvent.gross_amount,
  });

  if (allocationError) {
    await supabase.from("payments").delete().eq("id", createdPayment.id);
    redirectToExternalPayments(returnMonth, { err: "allocation_insert_failed" });
  }

  const { error: updateError } = await supabase
    .from("external_payment_events")
    .update({
      reconciliation_status: "matched",
      matched_enrollment_id: targetCharge.enrollment_id,
      matched_charge_id: targetChargeId,
      matched_payment_id: createdPayment.id,
      ignored_reason: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", eventId);

  if (updateError) {
    await supabase.from("payment_allocations").delete().eq("payment_id", createdPayment.id);
    await supabase.from("payments").delete().eq("id", createdPayment.id);
    redirectToExternalPayments(returnMonth, { err: "match_update_failed" });
  }

  const folio = await fetchPaymentFolio(supabase, createdPayment.id);

  await writeAuditLog(supabase, {
    actorUserId: currentUser.id,
    actorEmail: currentUser.email ?? null,
    action: "external_payment.matched",
    tableName: "external_payment_events",
    recordId: eventId,
    afterData: {
      matched_charge_id: targetChargeId,
      matched_payment_id: createdPayment.id,
      gross_amount: reconciledEvent.gross_amount,
      payment_folio: folio,
    },
  });

  await writePostedPaymentAudit(supabase, {
    actorUserId: currentUser.id,
    actorEmail: currentUser.email ?? null,
    recordId: createdPayment.id,
    enrollmentId: targetCharge.enrollment_id,
    amount: reconciledEvent.gross_amount,
    method: "stripe_360player",
    source: "external_reconciliation",
    split: false,
  });

  const ledger = await getEnrollmentLedger(targetCharge.enrollment_id);
  if (ledger) {
    await revalidatePaymentSurfaces(ledger);
  }
  revalidatePath("/reports/external-payments");

  redirectToExternalPayments(returnMonth, { ok: "matched" });
}
