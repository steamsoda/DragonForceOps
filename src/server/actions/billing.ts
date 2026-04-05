"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { assertDebugWritesAllowed } from "@/lib/auth/debug-view";
import {
  canAccessEnrollmentRecord,
  requireDirectorContext,
  requireOperationalContext,
} from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { writeAuditLog } from "@/lib/audit";

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
  await requireDirectorContext(`${BASE}?err=unauthorized`);

  // Verify payment belongs to this enrollment and is posted
  const { data: payment } = await supabase
    .from("payments")
    .select("id, status, amount, method")
    .eq("id", paymentId)
    .eq("enrollment_id", enrollmentId)
    .eq("status", "posted")
    .maybeSingle<{ id: string; status: string; amount: number; method: string }>();

  if (!payment) redirect(`${BASE}?err=payment_not_found`);

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

  await writeAuditLog(supabase, {
    actorUserId: user.id,
    actorEmail: user.email ?? null,
    action: "payment.voided",
    tableName: "payments",
    recordId: paymentId,
    afterData: { enrollment_id: enrollmentId, amount: payment.amount, method: payment.method, reason }
  });

  revalidatePath(BASE);
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
  await requireDirectorContext(`${BASE}?err=unauthorized`);

  // Verify charge belongs to this enrollment and is pending
  const { data: charge } = await supabase
    .from("charges")
    .select("id, status, amount, description")
    .eq("id", chargeId)
    .eq("enrollment_id", enrollmentId)
    .eq("status", "pending")
    .maybeSingle<{ id: string; status: string; amount: number; description: string }>();

  if (!charge) redirect(`${BASE}?err=charge_not_found`);

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
    afterData: { enrollment_id: enrollmentId, description: charge.description, amount: charge.amount, reason }
  });

  revalidatePath(BASE);
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
