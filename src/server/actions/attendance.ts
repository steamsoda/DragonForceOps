"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { assertDebugWritesAllowed } from "@/lib/auth/debug-view";
import { canWriteAttendanceCampus } from "@/lib/auth/campuses";
import { getPermissionContext, requireAttendanceWriteContext } from "@/lib/auth/permissions";
import { writeAuditLog } from "@/lib/audit";
import { getAttendanceSessionDetail } from "@/lib/queries/attendance";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMonterreyDateString } from "@/lib/time";

const VALID_STATUSES = new Set(["present", "absent", "injury", "justified"]);
const VALID_SESSION_TYPES = new Set(["match", "special"]);
const VALID_CANCEL_REASONS = new Set(["rain", "holiday", "other"]);

function clean(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

function isDateOnly(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isTimeOnly(value: string) {
  return /^\d{2}:\d{2}$/.test(value);
}

async function requireScheduleManager() {
  const context = await getPermissionContext();
  if (!context?.hasAttendanceWriteAccess || (!context.isDirector && !context.isSportsDirector)) redirect("/attendance/schedules?err=unauthorized");
  return { context, admin: createAdminClient() };
}

export async function createAttendanceScheduleAction(formData: FormData) {
  await assertDebugWritesAllowed("/attendance/schedules");
  const { context, admin } = await requireScheduleManager();
  const trainingGroupId = clean(formData.get("training_group_id"));
  const dayOfWeek = Number(clean(formData.get("day_of_week")));
  const startTime = clean(formData.get("start_time"));
  const endTime = clean(formData.get("end_time"));
  const effectiveStart = clean(formData.get("effective_start")) || getMonterreyDateString();

  if (!trainingGroupId || !Number.isInteger(dayOfWeek) || dayOfWeek < 1 || dayOfWeek > 7 || !isTimeOnly(startTime) || !isTimeOnly(endTime) || !isDateOnly(effectiveStart)) {
    redirect("/attendance/schedules?err=invalid_form");
  }

  const { data: trainingGroup } = await admin
    .from("training_groups")
    .select("id, campus_id, status")
    .eq("id", trainingGroupId)
    .maybeSingle<{ id: string; campus_id: string; status: string } | null>();

  if (!trainingGroup || trainingGroup.status !== "active" || !canWriteAttendanceCampus(context.attendanceCampusAccess, trainingGroup.campus_id)) {
    redirect("/attendance/schedules?err=invalid_group");
  }

  const { data: created, error } = await admin
    .from("attendance_schedule_templates")
    .insert({
      training_group_id: trainingGroup.id,
      campus_id: trainingGroup.campus_id,
      day_of_week: dayOfWeek,
      start_time: startTime,
      end_time: endTime,
      effective_start: effectiveStart,
      created_by: context.user.id,
    })
    .select("id")
    .maybeSingle<{ id: string } | null>();

  if (error || !created) redirect("/attendance/schedules?err=create_failed");

  await writeAuditLog(admin, {
    actorUserId: context.user.id,
    actorEmail: context.user.email,
    action: "attendance_schedule.created",
    tableName: "attendance_schedule_templates",
    recordId: created.id,
    afterData: { training_group_id: trainingGroup.id, campus_id: trainingGroup.campus_id, day_of_week: dayOfWeek, start_time: startTime, end_time: endTime },
  });

  revalidatePath("/attendance");
  revalidatePath("/attendance/schedules");
  redirect("/attendance/schedules?ok=created");
}

export async function updateAttendanceScheduleAction(templateId: string, formData: FormData) {
  await assertDebugWritesAllowed("/attendance/schedules");
  const { context, admin } = await requireScheduleManager();
  const dayOfWeek = Number(clean(formData.get("day_of_week")));
  const startTime = clean(formData.get("start_time"));
  const endTime = clean(formData.get("end_time"));
  const effectiveEnd = clean(formData.get("effective_end")) || null;
  const isActive = formData.get("is_active") === "1";

  if (!templateId || !Number.isInteger(dayOfWeek) || dayOfWeek < 1 || dayOfWeek > 7 || !isTimeOnly(startTime) || !isTimeOnly(endTime) || (effectiveEnd && !isDateOnly(effectiveEnd))) {
    redirect("/attendance/schedules?err=invalid_form");
  }

  const { data: existing } = await admin
    .from("attendance_schedule_templates")
    .select("id, campus_id")
    .eq("id", templateId)
    .maybeSingle<{ id: string; campus_id: string } | null>();

  if (!existing || !canWriteAttendanceCampus(context.attendanceCampusAccess, existing.campus_id)) {
    redirect("/attendance/schedules?err=unauthorized");
  }

  const { error } = await admin
    .from("attendance_schedule_templates")
    .update({
      day_of_week: dayOfWeek,
      start_time: startTime,
      end_time: endTime,
      effective_end: effectiveEnd,
      is_active: isActive,
      updated_at: new Date().toISOString(),
    })
    .eq("id", templateId);

  if (error) redirect("/attendance/schedules?err=update_failed");

  await writeAuditLog(admin, {
    actorUserId: context.user.id,
    actorEmail: context.user.email,
    action: "attendance_schedule.updated",
    tableName: "attendance_schedule_templates",
    recordId: templateId,
    afterData: { day_of_week: dayOfWeek, start_time: startTime, end_time: endTime, effective_end: effectiveEnd, is_active: isActive },
  });

  revalidatePath("/attendance");
  revalidatePath("/attendance/schedules");
  redirect("/attendance/schedules?ok=updated");
}

export async function createManualAttendanceSessionAction(formData: FormData) {
  await assertDebugWritesAllowed("/attendance");
  const { context, admin } = await requireScheduleManager();
  const teamId = clean(formData.get("team_id"));
  const sessionType = clean(formData.get("session_type"));
  const sessionDate = clean(formData.get("session_date"));
  const startTime = clean(formData.get("start_time"));
  const endTime = clean(formData.get("end_time"));
  const opponentName = clean(formData.get("opponent_name")) || null;
  const notes = clean(formData.get("notes")) || null;

  if (!teamId || !VALID_SESSION_TYPES.has(sessionType) || !isDateOnly(sessionDate) || !isTimeOnly(startTime) || !isTimeOnly(endTime)) {
    redirect("/attendance?err=invalid_form");
  }

  const { data: team } = await admin
    .from("teams")
    .select("id, campus_id, is_active")
    .eq("id", teamId)
    .maybeSingle<{ id: string; campus_id: string; is_active: boolean } | null>();

  if (!team || !team.is_active || !canWriteAttendanceCampus(context.attendanceCampusAccess, team.campus_id)) {
    redirect("/attendance?err=invalid_team");
  }

  const { data: created, error } = await admin
    .from("attendance_sessions")
    .insert({
      campus_id: team.campus_id,
      team_id: team.id,
      session_type: sessionType,
      status: "scheduled",
      session_date: sessionDate,
      start_time: startTime,
      end_time: endTime,
      opponent_name: opponentName,
      notes,
      created_by: context.user.id,
    })
    .select("id")
    .maybeSingle<{ id: string } | null>();

  if (error || !created) redirect(`/attendance?date=${sessionDate}&err=create_failed`);

  await writeAuditLog(admin, {
    actorUserId: context.user.id,
    actorEmail: context.user.email,
    action: "attendance_session.created",
    tableName: "attendance_sessions",
    recordId: created.id,
    afterData: { team_id: team.id, campus_id: team.campus_id, session_type: sessionType, session_date: sessionDate, start_time: startTime },
  });

  revalidatePath("/attendance");
  redirect(`/attendance/sessions/${created.id}`);
}

export async function cancelAttendanceSessionAction(sessionId: string, formData: FormData) {
  await assertDebugWritesAllowed(`/attendance/sessions/${sessionId}`);
  const context = await requireAttendanceWriteContext("/unauthorized");
  const admin = createAdminClient();
  const reasonCode = clean(formData.get("cancelled_reason_code"));
  const reason = clean(formData.get("cancelled_reason")) || null;

  if (!VALID_CANCEL_REASONS.has(reasonCode)) redirect(`/attendance/sessions/${sessionId}?err=invalid_form`);

  const { data: session } = await admin
    .from("attendance_sessions")
    .select("id, campus_id, status")
    .eq("id", sessionId)
    .maybeSingle<{ id: string; campus_id: string; status: string } | null>();

  if (!session || !canWriteAttendanceCampus(context.attendanceCampusAccess, session.campus_id)) redirect("/unauthorized");
  if (session.status === "completed" && !context.isDirector) redirect(`/attendance/sessions/${sessionId}?err=director_required`);

  const { error } = await admin
    .from("attendance_sessions")
    .update({
      status: "cancelled",
      cancelled_reason_code: reasonCode,
      cancelled_reason: reason,
      updated_at: new Date().toISOString(),
    })
    .eq("id", sessionId);

  if (error) redirect(`/attendance/sessions/${sessionId}?err=cancel_failed`);

  await writeAuditLog(admin, {
    actorUserId: context.user.id,
    actorEmail: context.user.email,
    action: "attendance_session.cancelled",
    tableName: "attendance_sessions",
    recordId: sessionId,
    afterData: { cancelled_reason_code: reasonCode, cancelled_reason: reason },
  });

  revalidatePath("/attendance");
  revalidatePath(`/attendance/sessions/${sessionId}`);
  redirect(`/attendance/sessions/${sessionId}?ok=cancelled`);
}

export async function saveAttendanceSessionAction(sessionId: string, formData: FormData) {
  await assertDebugWritesAllowed(`/attendance/sessions/${sessionId}`);
  const context = await requireAttendanceWriteContext("/unauthorized");
  const admin = createAdminClient();
  const detail = await getAttendanceSessionDetail(sessionId);

  if (!detail || !canWriteAttendanceCampus(context.attendanceCampusAccess, detail.campusId)) redirect("/unauthorized");
  if (detail.status === "cancelled") redirect(`/attendance/sessions/${sessionId}?err=cancelled`);
  if (detail.status === "completed" && !context.isDirector) redirect(`/attendance/sessions/${sessionId}?err=director_required`);

  const { data: existingRecords } = await admin
    .from("attendance_records")
    .select("id, enrollment_id, status, source, note")
    .eq("session_id", sessionId)
    .returns<Array<{ id: string; enrollment_id: string; status: string; source: string; note: string | null }>>();
  const existingByEnrollment = new Map((existingRecords ?? []).map((record) => [record.enrollment_id, record]));

  const rows = detail.roster.map((player) => {
    const rawStatus = clean(formData.get(`status:${player.enrollmentId}`));
    const status = VALID_STATUSES.has(rawStatus) ? rawStatus : "present";
    const note = clean(formData.get(`note:${player.enrollmentId}`)) || null;
    const source =
      detail.status === "completed"
        ? "correction"
        : player.incidentId && (status === "injury" || status === "justified")
          ? "incident"
          : status === "present" && !note
            ? "default"
            : "manual";
    return {
      session_id: sessionId,
      team_assignment_id: player.assignmentSource === "team" ? player.assignmentId : null,
      training_group_assignment_id: player.assignmentSource === "training_group" ? player.assignmentId : null,
      enrollment_id: player.enrollmentId,
      player_id: player.playerId,
      status,
      source,
      incident_id: source === "incident" ? player.incidentId : null,
      note,
      recorded_by: context.user.id,
      updated_by: context.user.id,
      updated_at: new Date().toISOString(),
    };
  });

  const auditRows = rows.flatMap((row) => {
    const before = existingByEnrollment.get(row.enrollment_id);
    if (!before) return [];
    if (before.status === row.status && (before.note ?? null) === row.note && before.source === row.source) return [];
    return [{
      attendance_record_id: before.id,
      session_id: sessionId,
      actor_user_id: context.user.id,
      before_status: before.status,
      after_status: row.status,
      before_source: before.source,
      after_source: row.source,
      before_note: before.note,
      after_note: row.note,
    }];
  });

  const { error } = await admin
    .from("attendance_records")
    .upsert(rows, { onConflict: "session_id,enrollment_id" });

  if (error) redirect(`/attendance/sessions/${sessionId}?err=save_failed`);

  if (auditRows.length > 0 && context.isDirector) {
    await admin.from("attendance_record_audit").insert(auditRows);
  }

  await admin
    .from("attendance_sessions")
    .update({
      status: "completed",
      completed_by: context.user.id,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", sessionId);

  await writeAuditLog(admin, {
    actorUserId: context.user.id,
    actorEmail: context.user.email,
    action: detail.status === "completed" ? "attendance_session.corrected" : "attendance_session.completed",
    tableName: "attendance_sessions",
    recordId: sessionId,
    afterData: { records: rows.length },
  });

  revalidatePath("/attendance");
  revalidatePath(`/attendance/sessions/${sessionId}`);
  revalidatePath("/attendance/reports");
  redirect(`/attendance/sessions/${sessionId}?ok=saved`);
}
