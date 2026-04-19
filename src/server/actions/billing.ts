"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { assertDebugWritesAllowed, isDebugWriteBlocked } from "@/lib/auth/debug-view";
import {
  canAccessEnrollmentRecord,
  getPermissionContext,
  requireDirectorContext,
  requireOperationalContext,
} from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { writeAuditLog } from "@/lib/audit";
import { parseMonterreyDateTimeInput } from "@/lib/time";
import { captureEnrollmentAnomalySnapshot, writeEnrollmentAnomalyAuditTrail } from "@/server/actions/finance-anomaly-monitoring";
import { normalizeRemainingPostedCreditAllocations } from "@/server/actions/payment-allocation-normalization";
import { syncCompetitionSignupsForEnrollment } from "@/server/actions/tournament-signup-sync";

type TeamAssignmentRow = {
  enrollment_id: string;
  enrollments: { status: string; pricing_plans: { currency: string | null } | null } | null;
};

type EnrollmentIncidentRow = {
  id: string;
  enrollment_id: string;
  incident_type: string;
  note: string | null;
  omit_period_month: string | null;
  starts_on: string | null;
  ends_on: string | null;
  cancelled_at: string | null;
  consumed_at: string | null;
};

type EnrollmentIncidentInsert = {
  enrollment_id: string;
  incident_type: string;
  note: string | null;
  omit_period_month: string | null;
  starts_on: string | null;
  ends_on: string | null;
  created_by: string;
};

const INCIDENT_TYPES = new Set(["absence", "injury", "other"]);
const PAYMENT_METHODS = new Set(["cash", "transfer", "card", "stripe_360player", "other"]);

type PaymentReassignmentResult =
  | { ok: true }
  | { ok: false; error: string };

type PaymentRefundResult =
  | { ok: true }
  | { ok: false; error: string; details?: string | null };

type PaymentWorkflowContext = {
  supabase: Awaited<ReturnType<typeof createClient>>;
  user: { id: string; email: string | null };
};

function normalizeMonthInput(raw: string): string | null {
  if (!/^\d{4}-\d{2}$/.test(raw)) return null;
  return `${raw}-01`;
}

function normalizeDateInput(raw: string): string | null {
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
}

function getCurrentPeriodMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

function isPastPeriodMonth(periodMonth: string) {
  return periodMonth < getCurrentPeriodMonth();
}

async function getMonthlyTuitionChargeTypeId(
  supabase: Awaited<ReturnType<typeof createClient>>
) {
  const { data } = await supabase
    .from("charge_types")
    .select("id")
    .eq("code", "monthly_tuition")
    .eq("is_active", true)
    .maybeSingle<{ id: string } | null>();
  return data?.id ?? null;
}

async function getEnrollmentIncidentContext(
  supabase: Awaited<ReturnType<typeof createClient>>,
  enrollmentId: string
) {
  const { data: enrollment } = await supabase
    .from("enrollments")
    .select("id, status")
    .eq("id", enrollmentId)
    .maybeSingle<{ id: string; status: string } | null>();

  return enrollment;
}

async function validateEnrollmentIncidentAccess(enrollmentId: string) {
  const context = await requireOperationalContext(`/enrollments/${enrollmentId}/charges?err=unauthorized`);
  if (!(await canAccessEnrollmentRecord(enrollmentId, context))) {
    redirect(`/enrollments/${enrollmentId}/charges?err=unauthorized`);
  }
  return context;
}

async function getPaymentWorkflowContext(enrollmentId: string): Promise<PaymentWorkflowContext | null> {
  const context = await getPermissionContext();
  if (!context?.hasOperationalAccess) return null;
  if (!(await canAccessEnrollmentRecord(enrollmentId, context))) return null;
  return { supabase: context.supabase, user: context.user };
}

function normalizeReturnTo(returnTo: string | null | undefined, fallback: string) {
  if (typeof returnTo !== "string") return fallback;
  const trimmed = returnTo.trim();
  if (!trimmed.startsWith("/")) return fallback;
  return trimmed;
}

function parseChargeIdList(raw: string | null | undefined) {
  return (raw ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function parseRefundFormData(formData: FormData) {
  const refundMethod = String(formData.get("refundMethod") ?? "").trim();
  const refundedAtRaw = String(formData.get("refundedAt") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  if (!PAYMENT_METHODS.has(refundMethod)) return { ok: false as const, error: "invalid_refund_method" };
  if (!reason) return { ok: false as const, error: "refund_reason_required" };
  if (!refundedAtRaw) return { ok: false as const, error: "refunded_at_required" };

  const refundedAt = parseMonterreyDateTimeInput(refundedAtRaw);
  if (!refundedAt) return { ok: false as const, error: "invalid_refund_date" };

  return {
    ok: true as const,
    refundMethod,
    refundedAt,
    reason,
    notes: notes || null,
  };
}

function getPaymentWorkflowError(error: string) {
  const messages: Record<string, string> = {
    unauthenticated: "Tu sesi\u00f3n expir\u00f3. Inicia sesi\u00f3n de nuevo.",
    unauthorized: "No tienes permiso para modificar este pago.",
    payment_not_found: "No se encontr\u00f3 el pago seleccionado.",
    payment_not_posted: "Solo se pueden modificar pagos vigentes.",
    payment_already_refunded: "Este pago ya fue reembolsado.",
    payment_has_no_allocations: "Este pago ya no tiene cargos aplicados.",
    payment_not_fully_allocated: "Solo se pueden mover pagos aplicados al 100%.",
    source_charge_shared: "Este pago comparte cargo origen con otro pago y no se puede mover autom\u00e1ticamente.",
    source_charge_not_exclusive: "El cargo origen no est\u00e1 cubierto de forma exclusiva por este pago.",
    target_charge_required: "Selecciona al menos un cargo destino.",
    target_charge_conflict: "No puedes volver a aplicar el pago sobre el mismo cargo origen.",
    target_charge_invalid: "Alguno de los cargos destino ya no es v\u00e1lido.",
    target_capacity_too_small: "Los cargos destino no absorben el pago completo.",
    refund_reason_required: "Debes capturar el motivo del reembolso.",
    refunded_at_required: "Debes capturar la fecha y hora real del reembolso.",
    invalid_refund_method: "Selecciona el m\u00e9todo real del reembolso.",
    invalid_refund_date: "La fecha del reembolso no es v\u00e1lida.",
    refund_insert_failed: "No se pudo registrar el reembolso por un problema de datos del pago.",
    refund_function_missing: "La funci\u00f3n de reembolsos no est\u00e1 disponible todav\u00eda.",
    refund_failed: "No se pudo registrar el reembolso.",
  };
  return messages[error] ?? "No se pudo completar la operaci\u00f3n. Intenta de nuevo.";
}

function normalizeRefundWorkflowError(raw: string | null | undefined) {
  const value = raw?.trim() ?? "";
  if (!value) return "refund_failed";

  const knownCodes = new Set([
    "unauthenticated",
    "unauthorized",
    "payment_not_found",
    "payment_not_posted",
    "payment_already_refunded",
    "payment_has_no_allocations",
    "refund_reason_required",
    "refunded_at_required",
    "invalid_refund_method",
    "invalid_refund_date",
    "refund_insert_failed",
    "refund_failed",
  ]);
  if (knownCodes.has(value)) return value;

  const lowered = value.toLowerCase();
  if (lowered.includes("record_payment_refund")) return "refund_function_missing";
  if (lowered.includes("not found")) return "payment_not_found";
  if (lowered.includes("row-level security") || lowered.includes("permission denied")) return "unauthorized";
  if (
    lowered.includes("payment_refunds")
    || lowered.includes("operator_campus_id")
    || lowered.includes("created_by")
    || lowered.includes("refund_method")
    || lowered.includes("foreign key")
    || lowered.includes("not-null")
    || lowered.includes("violates")
  ) {
    return "refund_insert_failed";
  }

  return "refund_failed";
}

function parseIncidentFormData(formData: FormData) {
  const incidentType = String(formData.get("incident_type") ?? "").trim();
  const mode = String(formData.get("mode") ?? "record_only").trim();
  const note = String(formData.get("note") ?? "").trim();
  const omitPeriodMonthRaw = String(formData.get("omit_period_month") ?? "").trim();
  const startsOnRaw = String(formData.get("starts_on") ?? "").trim();
  const endsOnRaw = String(formData.get("ends_on") ?? "").trim();

  if (!INCIDENT_TYPES.has(incidentType)) return { ok: false as const, error: "incident_type_required" };
  if (mode !== "record_only" && mode !== "omit_month") return { ok: false as const, error: "invalid_incident" };

  const omitPeriodMonth = mode === "omit_month" ? normalizeMonthInput(omitPeriodMonthRaw) : null;
  const startsOn = startsOnRaw ? normalizeDateInput(startsOnRaw) : null;
  const endsOn = endsOnRaw ? normalizeDateInput(endsOnRaw) : null;
  if (mode === "omit_month" && !omitPeriodMonth) {
    return { ok: false as const, error: "incident_month_required" };
  }
  if (startsOnRaw && !startsOn) return { ok: false as const, error: "incident_date_invalid" };
  if (endsOnRaw && !endsOn) return { ok: false as const, error: "incident_date_invalid" };
  if (endsOn && !startsOn) return { ok: false as const, error: "incident_start_required" };
  if (startsOn && endsOn && endsOn < startsOn) return { ok: false as const, error: "incident_date_range_invalid" };

  return {
    ok: true as const,
    incidentType,
    note: note || null,
    omitPeriodMonth,
    startsOn,
    endsOn,
  };
}

async function validateIncidentInsert(
  supabase: Awaited<ReturnType<typeof createClient>>,
  enrollmentId: string,
  incidentIdToIgnore: string | null,
  omitPeriodMonth: string | null
) {
  if (!omitPeriodMonth) return null;
  if (isPastPeriodMonth(omitPeriodMonth)) return "incident_past_month";

  const chargeTypeId = await getMonthlyTuitionChargeTypeId(supabase);
  if (!chargeTypeId) return "invalid_incident";

  const { data: existingCharge } = await supabase
    .from("charges")
    .select("id")
    .eq("enrollment_id", enrollmentId)
    .eq("charge_type_id", chargeTypeId)
    .eq("period_month", omitPeriodMonth)
    .neq("status", "void")
    .maybeSingle<{ id: string } | null>();

  if (existingCharge?.id) return "incident_charge_exists";

  let conflictQuery = supabase
    .from("enrollment_incidents")
    .select("id")
    .eq("enrollment_id", enrollmentId)
    .eq("omit_period_month", omitPeriodMonth)
    .is("cancelled_at", null);

  if (incidentIdToIgnore) conflictQuery = conflictQuery.neq("id", incidentIdToIgnore);

  const { data: conflictingIncident } = await conflictQuery.maybeSingle<{ id: string } | null>();
  if (conflictingIncident?.id) return "incident_conflict";

  return null;
}

export async function generateMonthlyTuitionAction(formData: FormData) {
  const periodMonthRaw = String(formData.get("period_month") ?? "").trim();

  if (!/^\d{4}-\d{2}$/.test(periodMonthRaw)) {
    redirect("/admin/mensualidades?err=invalid_month");
  }

  const [yearStr, monthStr] = periodMonthRaw.split("-");
  const periodMonth = `${yearStr}-${monthStr}-01`;
  await assertDebugWritesAllowed("/admin/mensualidades");

  const supabase = await createClient();
  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();
  if (userError || !user) redirect("/admin/mensualidades?err=unauthenticated");
  const directorContext = await requireDirectorContext("/admin/mensualidades?err=unauthorized");

  const { data: result } = await directorContext.supabase.rpc("generate_monthly_charges", {
    p_period_month: periodMonth
  });

  const typedResult = (result ?? { created: 0, skipped: 0, error: "rpc_failed" }) as {
    created?: number;
    skipped?: number;
    skipped_existing_charge?: number;
    skipped_scholarship?: number;
    skipped_by_incident?: number;
    skipped_other?: number;
    error?: string;
  };

  if (typedResult.error) redirect(`/admin/mensualidades?err=${typedResult.error}`);
  redirect(
    `/admin/mensualidades?ok=1&created=${typedResult.created ?? 0}&skipped=${typedResult.skipped ?? 0}` +
      `&skipped_existing_charge=${typedResult.skipped_existing_charge ?? 0}` +
      `&skipped_scholarship=${typedResult.skipped_scholarship ?? 0}` +
      `&skipped_by_incident=${typedResult.skipped_by_incident ?? 0}` +
      `&skipped_other=${typedResult.skipped_other ?? 0}`
  );
}

export async function createEnrollmentIncidentAction(
  enrollmentId: string,
  formData: FormData
): Promise<void> {
  const BASE = `/enrollments/${enrollmentId}/charges`;
  await assertDebugWritesAllowed(BASE);
  const context = await validateEnrollmentIncidentAccess(enrollmentId);
  const parsed = parseIncidentFormData(formData);
  if (!parsed.ok) redirect(`${BASE}?err=${parsed.error}`);

  const supabase = await createClient();
  const enrollment = await getEnrollmentIncidentContext(supabase, enrollmentId);
  if (!enrollment) redirect(`${BASE}?err=enrollment_not_found`);
  if (enrollment.status !== "active") redirect(`${BASE}?err=incident_inactive_enrollment`);

  const validationError = await validateIncidentInsert(
    supabase,
    enrollmentId,
    null,
    parsed.omitPeriodMonth
  );
  if (validationError) redirect(`${BASE}?err=${validationError}`);

  const { data: insertedIncident, error } = await supabase
    .from("enrollment_incidents")
    .insert({
      enrollment_id: enrollmentId,
      incident_type: parsed.incidentType,
      note: parsed.note,
      omit_period_month: parsed.omitPeriodMonth,
      starts_on: parsed.startsOn,
      ends_on: parsed.endsOn,
      created_by: context.user.id,
    } satisfies EnrollmentIncidentInsert)
    .select("id")
    .single<{ id: string }>();

  if (error || !insertedIncident) redirect(`${BASE}?err=invalid_incident`);

  await writeAuditLog(supabase, {
    actorUserId: context.user.id,
    actorEmail: context.user.email ?? null,
    action: "enrollment_incident.created",
    tableName: "enrollment_incidents",
    recordId: insertedIncident.id,
    afterData: {
      enrollment_id: enrollmentId,
      incident_type: parsed.incidentType,
      note: parsed.note,
      omit_period_month: parsed.omitPeriodMonth,
      starts_on: parsed.startsOn,
      ends_on: parsed.endsOn,
    },
  });

  revalidatePath(BASE);
  redirect(`${BASE}?ok=incident_created`);
}

export async function cancelEnrollmentIncidentAction(
  enrollmentId: string,
  incidentId: string
): Promise<void> {
  const BASE = `/enrollments/${enrollmentId}/charges`;
  await assertDebugWritesAllowed(BASE);
  const context = await validateEnrollmentIncidentAccess(enrollmentId);
  const supabase = await createClient();

  const { data: incident } = await supabase
    .from("enrollment_incidents")
    .select("id, enrollment_id, incident_type, note, omit_period_month, starts_on, ends_on, cancelled_at, consumed_at")
    .eq("id", incidentId)
    .eq("enrollment_id", enrollmentId)
    .maybeSingle<EnrollmentIncidentRow | null>();

  if (!incident || incident.cancelled_at || incident.consumed_at) {
    redirect(`${BASE}?err=incident_not_found`);
  }

  const { error } = await supabase
    .from("enrollment_incidents")
    .update({
      cancelled_at: new Date().toISOString(),
      cancelled_by: context.user.id,
    })
    .eq("id", incidentId)
    .is("cancelled_at", null)
    .is("consumed_at", null);

  if (error) redirect(`${BASE}?err=incident_cancel_failed`);

  await writeAuditLog(supabase, {
    actorUserId: context.user.id,
    actorEmail: context.user.email ?? null,
    action: "enrollment_incident.cancelled",
    tableName: "enrollment_incidents",
    recordId: incidentId,
    afterData: {
      enrollment_id: enrollmentId,
      incident_type: incident.incident_type,
      note: incident.note,
      omit_period_month: incident.omit_period_month,
      starts_on: incident.starts_on,
      ends_on: incident.ends_on,
    },
  });

  revalidatePath(BASE);
  redirect(`${BASE}?ok=incident_cancelled`);
}

export async function replaceEnrollmentIncidentAction(
  enrollmentId: string,
  incidentId: string,
  formData: FormData
): Promise<void> {
  const BASE = `/enrollments/${enrollmentId}/charges`;
  await assertDebugWritesAllowed(BASE);
  const context = await validateEnrollmentIncidentAccess(enrollmentId);
  const parsed = parseIncidentFormData(formData);
  if (!parsed.ok) redirect(`${BASE}?err=${parsed.error}`);

  const supabase = await createClient();
  const enrollment = await getEnrollmentIncidentContext(supabase, enrollmentId);
  if (!enrollment) redirect(`${BASE}?err=enrollment_not_found`);
  if (enrollment.status !== "active") redirect(`${BASE}?err=incident_inactive_enrollment`);

  const { data: existingIncident } = await supabase
    .from("enrollment_incidents")
    .select("id, enrollment_id, incident_type, note, omit_period_month, starts_on, ends_on, cancelled_at, consumed_at")
    .eq("id", incidentId)
    .eq("enrollment_id", enrollmentId)
    .maybeSingle<EnrollmentIncidentRow | null>();

  if (!existingIncident || existingIncident.cancelled_at || existingIncident.consumed_at) {
    redirect(`${BASE}?err=incident_not_found`);
  }

  const validationError = await validateIncidentInsert(
    supabase,
    enrollmentId,
    incidentId,
    parsed.omitPeriodMonth
  );
  if (validationError) redirect(`${BASE}?err=${validationError}`);

  const { error: cancelError } = await supabase
    .from("enrollment_incidents")
    .update({
      cancelled_at: new Date().toISOString(),
      cancelled_by: context.user.id,
    })
    .eq("id", incidentId)
    .is("cancelled_at", null)
    .is("consumed_at", null);

  if (cancelError) redirect(`${BASE}?err=incident_replace_failed`);

  const { data: newIncident, error: insertError } = await supabase
    .from("enrollment_incidents")
    .insert({
      enrollment_id: enrollmentId,
      incident_type: parsed.incidentType,
      note: parsed.note,
      omit_period_month: parsed.omitPeriodMonth,
      starts_on: parsed.startsOn,
      ends_on: parsed.endsOn,
      created_by: context.user.id,
    } satisfies EnrollmentIncidentInsert)
    .select("id")
    .single<{ id: string }>();

  if (insertError || !newIncident) redirect(`${BASE}?err=incident_replace_failed`);

  await writeAuditLog(supabase, {
    actorUserId: context.user.id,
    actorEmail: context.user.email ?? null,
    action: "enrollment_incident.replaced",
    tableName: "enrollment_incidents",
    recordId: newIncident.id,
    afterData: {
      enrollment_id: enrollmentId,
      previous_incident_id: incidentId,
      previous_incident_type: existingIncident.incident_type,
      previous_omit_period_month: existingIncident.omit_period_month,
      previous_starts_on: existingIncident.starts_on,
      previous_ends_on: existingIncident.ends_on,
      incident_type: parsed.incidentType,
      note: parsed.note,
      omit_period_month: parsed.omitPeriodMonth,
      starts_on: parsed.startsOn,
      ends_on: parsed.endsOn,
    },
  });

  revalidatePath(BASE);
  redirect(`${BASE}?ok=incident_replaced`);
}

// ── Void payment ─────────────────────────────────────────────────────────────

export async function reassignPaymentAction(
  enrollmentId: string,
  paymentId: string,
  formData: FormData,
): Promise<PaymentReassignmentResult> {
  const basePath = `/enrollments/${enrollmentId}/payments/${paymentId}/reassign`;
  if (await isDebugWriteBlocked()) return { ok: false, error: "debug_read_only" };
  await assertDebugWritesAllowed(basePath);
  const workflowContext = await getPaymentWorkflowContext(enrollmentId);
  if (!workflowContext) return { ok: false, error: "unauthorized" };

  const supabase = workflowContext.supabase;
  const targetChargeIds = parseChargeIdList(String(formData.get("targetChargeIds") ?? ""));
  if (targetChargeIds.length === 0) return { ok: false, error: "target_charge_required" };
  const anomalyBefore = await captureEnrollmentAnomalySnapshot(enrollmentId);

  const paymentSnapshot = await supabase
    .from("payments")
    .select("id, amount, charges:payment_allocations(charge_id, amount, charges(description))")
    .eq("id", paymentId)
    .eq("enrollment_id", enrollmentId)
    .maybeSingle<{
      id: string;
      amount: number;
      charges: Array<{ charge_id: string; amount: number; charges: { description: string | null } | null }>;
    } | null>();

  const { data, error } = await supabase.rpc("reassign_payment_to_charges", {
    p_payment_id: paymentId,
    p_target_charge_ids: targetChargeIds,
  });

  const resultRow = Array.isArray(data) ? data[0] : data;
  if (error || !resultRow?.ok) {
    return { ok: false, error: error?.message ?? resultRow?.error_code ?? "reassign_failed" };
  }

  const { data: destinationChargeRows } = await supabase
    .from("charges")
    .select("id, description, amount")
    .in("id", targetChargeIds)
    .returns<Array<{ id: string; description: string; amount: number }>>();

  await writeAuditLog(supabase, {
    actorUserId: workflowContext.user.id,
    actorEmail: workflowContext.user.email ?? null,
    action: "payment.reassigned",
    tableName: "payments",
    recordId: paymentId,
    afterData: {
      enrollment_id: enrollmentId,
      amount: paymentSnapshot.data?.amount ?? null,
      old_charges: (paymentSnapshot.data?.charges ?? []).map((row) => ({
        charge_id: row.charge_id,
        description: row.charges?.description ?? "Cargo",
        amount: row.amount,
      })),
      new_charges: (destinationChargeRows ?? []).map((row) => ({
        charge_id: row.id,
        description: row.description,
        amount: row.amount,
      })),
    },
  });

  const affectedTournamentIds = await syncCompetitionSignupsForEnrollment(enrollmentId);
  revalidatePath("/director-deportivo");
  revalidatePath("/tournaments");
  for (const tournamentId of affectedTournamentIds) {
    revalidatePath(`/tournaments/${tournamentId}`);
  }
  revalidatePath(`/enrollments/${enrollmentId}/charges`);
  await writeEnrollmentAnomalyAuditTrail({
    enrollmentId,
    actorUserId: workflowContext.user.id,
    actorEmail: workflowContext.user.email,
    triggerAction: "payment.reassigned",
    before: anomalyBefore,
  });
  return { ok: true };
}

export async function refundPaymentAction(
  enrollmentId: string,
  paymentId: string,
  formData: FormData,
): Promise<PaymentRefundResult> {
  const basePath = `/enrollments/${enrollmentId}/payments/${paymentId}/refund`;
  if (await isDebugWriteBlocked()) return { ok: false, error: "debug_read_only" };
  await assertDebugWritesAllowed(basePath);
  const workflowContext = await getPaymentWorkflowContext(enrollmentId);
  if (!workflowContext) return { ok: false, error: "unauthorized" };

  const parsed = parseRefundFormData(formData);
  if (!parsed.ok) return { ok: false, error: parsed.error };

  const supabase = workflowContext.supabase;
  const anomalyBefore = await captureEnrollmentAnomalySnapshot(enrollmentId);
  const { data: paymentRow } = await supabase
    .from("payments")
    .select("id, amount, method")
    .eq("id", paymentId)
    .eq("enrollment_id", enrollmentId)
    .maybeSingle<{ id: string; amount: number; method: string } | null>();

  const { data, error } = await supabase.rpc("record_payment_refund", {
    p_payment_id: paymentId,
    p_refund_method: parsed.refundMethod,
    p_refunded_at: parsed.refundedAt,
    p_reason: parsed.reason,
    p_notes: parsed.notes,
  });

  const resultRow = Array.isArray(data) ? data[0] : data;
  if (error || !resultRow?.ok) {
    const rawError = error?.message ?? resultRow?.error_code ?? "refund_failed";
    console.error("[refundPaymentAction] refund failed", {
      enrollmentId,
      paymentId,
      parsedRefundMethod: parsed.refundMethod,
      parsedRefundedAt: parsed.refundedAt,
      rawError,
      rpcError: error,
      rpcResult: resultRow ?? null,
    });
    return {
      ok: false,
      error: normalizeRefundWorkflowError(rawError),
      details: rawError,
    };
  }

  await writeAuditLog(supabase, {
    actorUserId: workflowContext.user.id,
    actorEmail: workflowContext.user.email ?? null,
    action: "payment.refunded",
    tableName: "payments",
    recordId: paymentId,
    afterData: {
      enrollment_id: enrollmentId,
      amount: paymentRow?.amount ?? resultRow.amount ?? null,
      original_method: paymentRow?.method ?? null,
      refund_method: parsed.refundMethod,
      refunded_at: parsed.refundedAt,
      reason: parsed.reason,
      notes: parsed.notes,
    },
  });

  const affectedTournamentIds = await syncCompetitionSignupsForEnrollment(enrollmentId);
  revalidatePath("/director-deportivo");
  revalidatePath("/tournaments");
  for (const tournamentId of affectedTournamentIds) {
    revalidatePath(`/tournaments/${tournamentId}`);
  }
  revalidatePath(`/enrollments/${enrollmentId}/charges`);
  await writeEnrollmentAnomalyAuditTrail({
    enrollmentId,
    actorUserId: workflowContext.user.id,
    actorEmail: workflowContext.user.email,
    triggerAction: "payment.refunded",
    before: anomalyBefore,
  });
  return { ok: true };
}

export async function voidPaymentAction(
  enrollmentId: string,
  paymentId: string,
  formData: FormData
): Promise<void> {
  const BASE = `/enrollments/${enrollmentId}/charges`;
  await assertDebugWritesAllowed(BASE);

  const reason = formData.get("reason")?.toString().trim() ?? "";
  if (!reason) redirect(`${BASE}?err=void_reason_required`);

  const supabase = await createClient();
  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();
  if (userError || !user) redirect(`${BASE}?err=unauthenticated`);
  const permissionContext = await requireDirectorContext(`${BASE}?err=unauthorized`);

  // Verify payment belongs to this enrollment and is posted
  const { data: payment } = await supabase
    .from("payments")
    .select("id, status, amount, method")
    .eq("id", paymentId)
    .eq("enrollment_id", enrollmentId)
    .eq("status", "posted")
    .maybeSingle<{ id: string; status: string; amount: number; method: string }>();

  if (!payment) redirect(`${BASE}?err=payment_not_found`);
  const anomalyBefore = await captureEnrollmentAnomalySnapshot(enrollmentId, permissionContext);

  // Delete allocations first (frees the charges back to pending)
  const { error: allocError } = await supabase
    .from("payment_allocations")
    .delete()
    .eq("payment_id", paymentId);

  if (allocError) redirect(`${BASE}?err=void_failed`);

  // Mark payment void
  const { error: voidError } = await supabase
    .from("payments")
    .update({ status: "void" })
    .eq("id", paymentId);

  if (voidError) redirect(`${BASE}?err=void_failed`);

  const normalizationResult = await normalizeRemainingPostedCreditAllocations(supabase, enrollmentId);

  await writeAuditLog(supabase, {
    actorUserId: user.id,
    actorEmail: user.email ?? null,
    action: "payment.voided",
    tableName: "payments",
    recordId: paymentId,
    afterData: {
      enrollment_id: enrollmentId,
      amount: payment.amount,
      method: payment.method,
      reason,
      rebalanced_allocation_count: normalizationResult.insertedAllocationCount,
      rebalanced_allocation_amount: normalizationResult.insertedAllocationAmount,
    }
  });

  const affectedTournamentIds = await syncCompetitionSignupsForEnrollment(enrollmentId);
  revalidatePath("/director-deportivo");
  revalidatePath("/tournaments");
  for (const tournamentId of affectedTournamentIds) {
    revalidatePath(`/tournaments/${tournamentId}`);
  }
  revalidatePath(BASE);
  await writeEnrollmentAnomalyAuditTrail({
    enrollmentId,
    actorUserId: user.id,
    actorEmail: user.email ?? null,
    triggerAction: "payment.voided",
    before: anomalyBefore,
    permissionContext,
  });
  redirect(`${BASE}?ok=payment_voided`);
}

// ── Void charge ───────────────────────────────────────────────────────────────

export async function voidChargeAction(
  enrollmentId: string,
  chargeId: string,
  formData: FormData
): Promise<void> {
  const BASE = `/enrollments/${enrollmentId}/charges`;
  await assertDebugWritesAllowed(BASE);

  const reason = formData.get("reason")?.toString().trim() ?? "";
  if (!reason) redirect(`${BASE}?err=void_reason_required`);

  const supabase = await createClient();
  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();
  if (userError || !user) redirect(`${BASE}?err=unauthenticated`);
  const permissionContext = await requireDirectorContext(`${BASE}?err=unauthorized`);

  // Verify charge belongs to this enrollment and is pending
  const { data: charge } = await supabase
    .from("charges")
    .select("id, status, amount, description")
    .eq("id", chargeId)
    .eq("enrollment_id", enrollmentId)
    .eq("status", "pending")
    .maybeSingle<{ id: string; status: string; amount: number; description: string }>();

  if (!charge) redirect(`${BASE}?err=charge_not_found`);
  const anomalyBefore = await captureEnrollmentAnomalySnapshot(enrollmentId, permissionContext);

  const { data: releasedAllocations, error: releaseLookupError } = await supabase
    .from("payment_allocations")
    .select("payment_id, amount")
    .eq("charge_id", chargeId)
    .returns<Array<{ payment_id: string; amount: number }>>();

  if (releaseLookupError) redirect(`${BASE}?err=void_failed`);

  const { error: releaseAllocationsError } = await supabase
    .from("payment_allocations")
    .delete()
    .eq("charge_id", chargeId);

  if (releaseAllocationsError) redirect(`${BASE}?err=void_failed`);

  const { error } = await supabase
    .from("charges")
    .update({ status: "void" })
    .eq("id", chargeId);

  if (error) redirect(`${BASE}?err=void_failed`);

  await writeAuditLog(supabase, {
    actorUserId: user.id,
    actorEmail: user.email ?? null,
    action: "charge.voided",
    tableName: "charges",
    recordId: chargeId,
    afterData: {
      enrollment_id: enrollmentId,
      description: charge.description,
      amount: charge.amount,
      reason,
      released_allocation_count: releasedAllocations?.length ?? 0,
      released_allocation_amount: (releasedAllocations ?? []).reduce((sum, row) => sum + row.amount, 0),
    }
  });

  const affectedTournamentIds = await syncCompetitionSignupsForEnrollment(enrollmentId);
  revalidatePath("/director-deportivo");
  revalidatePath("/tournaments");
  for (const tournamentId of affectedTournamentIds) {
    revalidatePath(`/tournaments/${tournamentId}`);
  }
  revalidatePath(BASE);
  await writeEnrollmentAnomalyAuditTrail({
    enrollmentId,
    actorUserId: user.id,
    actorEmail: user.email ?? null,
    triggerAction: "charge.voided",
    before: anomalyBefore,
    permissionContext,
  });
  redirect(`${BASE}?ok=charge_voided`);
}

// ── Batch void charges for ended/cancelled enrollments ────────────────────────

export async function batchVoidBajaChargesAction(formData: FormData): Promise<void> {
  const BASE = "/pending/bajas";
  await assertDebugWritesAllowed(BASE);

  const reason = formData.get("reason")?.toString().trim() ?? "";
  if (!reason) redirect(`${BASE}?err=reason_required`);

  const enrollmentIds = formData.getAll("enrollment_ids").map((v) => v.toString().trim()).filter(Boolean);
  if (enrollmentIds.length === 0) redirect(`${BASE}?err=none_selected`);

  const supabase = await createClient();
  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();
  if (userError || !user) redirect(`${BASE}?err=unauthenticated`);
  await requireDirectorContext(`${BASE}?err=unauthorized`);

  // Only target ended/cancelled enrollments — safety check
  const { data: validEnrollments } = await supabase
    .from("enrollments")
    .select("id")
    .in("id", enrollmentIds)
    .in("status", ["ended", "cancelled"])
    .returns<{ id: string }[]>();

  const validIds = (validEnrollments ?? []).map((e) => e.id);
  if (validIds.length === 0) redirect(`${BASE}?err=no_valid_enrollments`);

  // Fetch all pending charges for these enrollments
  const { data: charges } = await supabase
    .from("charges")
    .select("id, enrollment_id, amount, description")
    .in("enrollment_id", validIds)
    .eq("status", "pending")
    .returns<{ id: string; enrollment_id: string; amount: number; description: string }[]>();

  const pendingCharges = charges ?? [];
  if (pendingCharges.length === 0) redirect(`${BASE}?err=no_pending_charges`);

  const chargeIds = pendingCharges.map((c) => c.id);

  const { error: releaseAllocationsError } = await supabase
    .from("payment_allocations")
    .delete()
    .in("charge_id", chargeIds);

  if (releaseAllocationsError) redirect(`${BASE}?err=void_failed`);

  const { error: voidError } = await supabase
    .from("charges")
    .update({ status: "void" })
    .in("id", chargeIds);

  if (voidError) redirect(`${BASE}?err=void_failed`);

  // Audit log per charge
  await Promise.all(
    pendingCharges.map((charge) =>
      writeAuditLog(supabase, {
        actorUserId: user.id,
        actorEmail: user.email ?? null,
        action: "charge.voided",
        tableName: "charges",
        recordId: charge.id,
        afterData: {
          enrollment_id: charge.enrollment_id,
          description: charge.description,
          amount: charge.amount,
          reason,
          batch: true
        }
      })
    )
  );

  revalidatePath(BASE);
  redirect(`${BASE}?ok=voided&count=${pendingCharges.length}`);
}

export async function bulkChargeTeamAction(formData: FormData) {
  const BASE = "/admin/cargos-equipo";
  await assertDebugWritesAllowed(BASE);

  const teamId = String(formData.get("team_id") ?? "").trim();
  const chargeTypeId = String(formData.get("charge_type_id") ?? "").trim();
  const amountRaw = String(formData.get("amount") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();

  if (!teamId || !chargeTypeId || !description) redirect(`${BASE}?err=invalid_form`);

  const amount = parseFloat(amountRaw);
  if (isNaN(amount) || amount === 0) redirect(`${BASE}?err=invalid_amount`);

  const supabase = await createClient();
  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();
  if (userError || !user) redirect(`${BASE}?err=unauthenticated`);
  await requireDirectorContext(`${BASE}?err=unauthorized`);

  // Get active enrollments on this team (open assignment + active enrollment)
  const { data: assignments } = await supabase
    .from("team_assignments")
    .select("enrollment_id, enrollments(status, pricing_plans(currency))")
    .eq("team_id", teamId)
    .is("end_date", null)
    .returns<TeamAssignmentRow[]>();

  const activeAssignments = (assignments ?? []).filter((a) => a.enrollments?.status === "active");

  if (activeAssignments.length === 0) {
    redirect(`${BASE}?err=no_active_enrollments`);
  }

  const charges = activeAssignments.map((a) => ({
    enrollment_id: a.enrollment_id,
    charge_type_id: chargeTypeId,
    description,
    amount,
    currency: a.enrollments?.pricing_plans?.currency ?? "MXN",
    status: "pending",
    created_by: user!.id
  }));

  const { error: insertError } = await supabase.from("charges").insert(charges);
  if (insertError) redirect(`${BASE}?err=insert_failed`);

  await writeAuditLog(supabase, {
    actorUserId: user!.id,
    actorEmail: user?.email ?? null,
    action: "charges.bulk_created",
    tableName: "charges",
    afterData: { team_id: teamId, charge_type_id: chargeTypeId, amount, description, count: charges.length }
  });

  redirect(`${BASE}?ok=1&created=${charges.length}`);
}
