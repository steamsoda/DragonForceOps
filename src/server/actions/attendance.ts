"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { assertDebugWritesAllowed, getDebugViewContext } from "@/lib/auth/debug-view";
import { canWriteAttendanceCampus } from "@/lib/auth/campuses";
import type { AttendanceCampusAccess } from "@/lib/auth/campuses";
import { getPermissionContext, requireAttendanceWriteContext } from "@/lib/auth/permissions";
import { APP_ROLES } from "@/lib/auth/roles";
import { writeAuditLog } from "@/lib/audit";
import { createPerfTimer } from "@/lib/perf/timing";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMonterreyDateString } from "@/lib/time";

const VALID_STATUSES = new Set(["present", "absent", "injury", "justified"]);
const VALID_SESSION_TYPES = new Set(["match", "special"]);
const VALID_CANCEL_REASONS = new Set(["rain", "holiday", "other"]);
const VALID_CLOSURE_REASONS = new Set(["rain", "holiday", "vacation", "event", "other"]);

type ActiveTrainingTemplateRow = {
  id: string;
  training_group_id: string | null;
  day_of_week: number;
  start_time: string;
  effective_start: string;
  effective_end: string | null;
  training_groups: { id: string; status: string } | null;
};

type ExistingTrainingSessionRow = {
  training_group_id: string | null;
  session_date: string;
  start_time: string;
  session_type: string;
};

type AttendanceSaveSessionSnapshot = {
  id: string;
  campus_id: string;
  team_id: string | null;
  training_group_id: string | null;
  session_date: string;
  status: string;
};

type AttendanceSaveRosterRow = {
  assignment_id: string;
  assignment_source: "team" | "training_group";
  enrollment_id: string;
  player_id: string;
};

type AttendanceSaveExistingRecord = {
  id: string;
  enrollment_id: string;
  status: string;
  source: string;
  note: string | null;
};

type AttendanceSaveIncident = {
  id: string;
  enrollment_id: string;
  incident_type: string;
};

export type AttendanceSaveResult =
  | { ok: true; savedAt: string; rosterCount: number; statusBefore: string }
  | { ok: false; error: string };

function clean(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

function isDateOnly(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isTimeOnly(value: string) {
  return /^\d{2}:\d{2}$/.test(value);
}

function formatDateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

function getWeekRangeForDate(dateOnly: string) {
  const [year, month, day] = dateOnly.split("-").map(Number);
  const anchor = new Date(Date.UTC(year, month - 1, day, 12));
  const dayOfWeek = anchor.getUTCDay();
  const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const start = new Date(anchor);
  start.setUTCDate(anchor.getUTCDate() - daysSinceMonday);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  return { startDate: formatDateOnly(start), endDate: formatDateOnly(end) };
}

function listDateRange(startDate: string, endDate: string) {
  const [startYear, startMonth, startDay] = startDate.split("-").map(Number);
  const [endYear, endMonth, endDay] = endDate.split("-").map(Number);
  const cursor = new Date(Date.UTC(startYear, startMonth - 1, startDay, 12));
  const end = new Date(Date.UTC(endYear, endMonth - 1, endDay, 12));
  const dates: string[] = [];
  while (cursor <= end) {
    dates.push(formatDateOnly(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

function attendanceDayOfWeek(dateOnly: string) {
  const [year, month, day] = dateOnly.split("-").map(Number);
  const jsDay = new Date(Date.UTC(year, month - 1, day, 12)).getUTCDay();
  return jsDay === 0 ? 7 : jsDay;
}

function mapClosureReasonToSessionCancelReason(reasonCode: string) {
  if (reasonCode === "rain") return "rain";
  if (reasonCode === "holiday" || reasonCode === "vacation") return "holiday";
  return "other";
}

async function getAttendanceSaveSnapshot(admin: ReturnType<typeof createAdminClient>, sessionId: string) {
  const { data: session } = await admin
    .from("attendance_sessions")
    .select("id, campus_id, team_id, training_group_id, session_date, status")
    .eq("id", sessionId)
    .maybeSingle<AttendanceSaveSessionSnapshot | null>();

  if (!session) return null;

  const rosterResult = session.training_group_id
    ? await admin
        .from("training_group_assignments")
        .select("id, enrollment_id, enrollments!inner(id, player_id, status)")
        .eq("training_group_id", session.training_group_id)
        .lte("start_date", session.session_date)
        .or(`end_date.is.null,end_date.gte.${session.session_date}`)
        .eq("enrollments.status", "active")
        .returns<Array<{
          id: string;
          enrollment_id: string;
          enrollments: { id: string; player_id: string; status: string } | null;
        }>>()
    : await admin
        .from("team_assignments")
        .select("id, enrollment_id, enrollments!inner(id, player_id, status)")
        .eq("team_id", session.team_id!)
        .eq("is_primary", true)
        .lte("start_date", session.session_date)
        .or(`end_date.is.null,end_date.gte.${session.session_date}`)
        .eq("enrollments.status", "active")
        .returns<Array<{
          id: string;
          enrollment_id: string;
          enrollments: { id: string; player_id: string; status: string } | null;
        }>>();

  const roster: AttendanceSaveRosterRow[] = (rosterResult.data ?? [])
    .filter((row) => row.enrollments?.player_id)
    .map((row) => ({
      assignment_id: row.id,
      assignment_source: session.training_group_id ? "training_group" : "team",
      enrollment_id: row.enrollment_id,
      player_id: row.enrollments!.player_id,
    }));

  const enrollmentIds = roster.map((row) => row.enrollment_id);
  const [{ data: records }, incidentsResult] = await Promise.all([
    admin
      .from("attendance_records")
      .select("id, enrollment_id, status, source, note")
      .eq("session_id", sessionId)
      .returns<AttendanceSaveExistingRecord[]>(),
    enrollmentIds.length === 0
      ? Promise.resolve({ data: [] as AttendanceSaveIncident[] })
      : admin
          .from("enrollment_incidents")
          .select("id, enrollment_id, incident_type")
          .in("enrollment_id", enrollmentIds)
          .in("incident_type", ["injury", "absence"])
          .is("cancelled_at", null)
          .or(`starts_on.is.null,starts_on.lte.${session.session_date}`)
          .or(`ends_on.is.null,ends_on.gte.${session.session_date}`)
          .returns<AttendanceSaveIncident[]>(),
  ]);

  const incidentByEnrollment = new Map<string, AttendanceSaveIncident>();
  for (const incident of incidentsResult.data ?? []) {
    const existing = incidentByEnrollment.get(incident.enrollment_id);
    if (!existing || incident.incident_type === "injury") {
      incidentByEnrollment.set(incident.enrollment_id, incident);
    }
  }

  return {
    session,
    roster,
    records: records ?? [],
    incidentByEnrollment,
  };
}

async function requireScheduleManager() {
  const context = await getPermissionContext();
  if (!context?.hasAttendanceWriteAccess || (!context.isDirector && !context.isSportsDirector)) redirect("/attendance/schedules?err=unauthorized");
  return { context, admin: createAdminClient() };
}

async function requireAttendanceGenerator() {
  const context = await getPermissionContext();
  if (!context?.hasAttendanceWriteAccess || (!context.isDirector && !context.isSportsDirector)) redirect("/attendance?err=generator_manager_required");
  return { context, admin: createAdminClient() };
}

async function requireClosureManager(campusId: string | null) {
  const context = await getPermissionContext();
  if (!context?.hasAttendanceWriteAccess || (!context.isDirector && !context.isSportsDirector)) {
    redirect("/attendance/calendar?err=closure_manager_required");
  }

  if (!campusId && !context.isDirector) {
    redirect("/attendance/calendar?err=closure_campus_required");
  }

  if (campusId && !canWriteAttendanceCampus(context.attendanceCampusAccess, campusId)) {
    redirect("/attendance/calendar?err=closure_unauthorized_campus");
  }

  return { context, admin: createAdminClient() };
}

async function getAttendanceGenerationSnapshot(
  admin: ReturnType<typeof createAdminClient>,
  startDate: string,
  endDate: string,
  campusId: string,
) {
  const [{ data: templates }, { data: existingSessions }] = await Promise.all([
    admin
      .from("attendance_schedule_templates")
      .select("id, training_group_id, day_of_week, start_time, effective_start, effective_end, training_groups!inner(id, status)")
      .eq("campus_id", campusId)
      .eq("is_active", true)
      .not("training_group_id", "is", null)
      .lte("effective_start", endDate)
      .or(`effective_end.is.null,effective_end.gte.${startDate}`)
      .eq("training_groups.status", "active")
      .returns<ActiveTrainingTemplateRow[]>(),
    admin
      .from("attendance_sessions")
      .select("training_group_id, session_date, start_time, session_type")
      .not("training_group_id", "is", null)
      .eq("session_type", "training")
      .eq("campus_id", campusId)
      .gte("session_date", startDate)
      .lte("session_date", endDate)
      .returns<ExistingTrainingSessionRow[]>(),
  ]);

  const expectedKeys = new Set<string>();
  for (const date of listDateRange(startDate, endDate)) {
    const dayOfWeek = attendanceDayOfWeek(date);
    for (const template of templates ?? []) {
      if (!template.training_group_id) continue;
      if (template.day_of_week !== dayOfWeek) continue;
      if (template.effective_start > date) continue;
      if (template.effective_end && template.effective_end < date) continue;
      expectedKeys.add(`${template.training_group_id}:${date}:${template.start_time.slice(0, 5)}`);
    }
  }

  const existingKeys = new Set(
    (existingSessions ?? [])
      .filter((session) => session.training_group_id)
      .map((session) => `${session.training_group_id}:${session.session_date}:${session.start_time.slice(0, 5)}`)
  );

  let existingExpected = 0;
  for (const key of expectedKeys) {
    if (existingKeys.has(key)) existingExpected += 1;
  }

  return { expected: expectedKeys.size, existing: existingExpected };
}

export async function generateAttendanceSessionsAction(formData: FormData) {
  await assertDebugWritesAllowed("/attendance");
  const { context, admin } = await requireAttendanceGenerator();
  const selectedDate = clean(formData.get("date")) || getMonterreyDateString();
  const selectedCampus = clean(formData.get("campus"));
  if (!isDateOnly(selectedDate)) redirect("/attendance?err=invalid_generation_date");
  if (!selectedCampus || !canWriteAttendanceCampus(context.attendanceCampusAccess, selectedCampus)) {
    redirect(`/attendance?date=${selectedDate}&err=generator_campus_required`);
  }

  const { startDate, endDate } = getWeekRangeForDate(selectedDate);
  const before = await getAttendanceGenerationSnapshot(admin, startDate, endDate, selectedCampus);

  const { data, error } = await admin.rpc("generate_attendance_sessions_for_campus", {
    p_start_date: startDate,
    p_end_date: endDate,
    p_campus_id: selectedCampus,
  });

  if (error) redirect(`/attendance?date=${selectedDate}&err=generate_failed`);

  const created = typeof data === "object" && data !== null && "created" in data
    ? Number((data as { created?: unknown }).created ?? 0)
    : 0;

  await writeAuditLog(admin, {
    actorUserId: context.user.id,
    actorEmail: context.user.email,
    action: "attendance_sessions.generated",
    tableName: "attendance_sessions",
    afterData: {
      selected_date: selectedDate,
      campus_id: selectedCampus,
      start_date: startDate,
      end_date: endDate,
      expected: before.expected,
      already_existing: before.existing,
      created,
    },
  });

  revalidatePath("/attendance");
  revalidatePath("/attendance/groups");
  revalidatePath("/attendance/reports");

  const params = new URLSearchParams({
    date: selectedDate,
    ok: "generated",
    start: startDate,
    end: endDate,
    expected: String(before.expected),
    existing: String(before.existing),
    created: String(created),
  });
  if (selectedCampus) params.set("campus", selectedCampus);
  redirect(`/attendance?${params.toString()}`);
}

export async function createAttendanceClosureAction(formData: FormData) {
  await assertDebugWritesAllowed("/attendance/calendar");

  const rawCampusId = clean(formData.get("campus_id"));
  const campusId = rawCampusId || null;
  const startsOn = clean(formData.get("starts_on"));
  const endsOn = clean(formData.get("ends_on")) || startsOn;
  const reasonCode = clean(formData.get("reason_code"));
  const title = clean(formData.get("title"));
  const notes = clean(formData.get("notes")) || null;

  const selectedMonth = isDateOnly(startsOn) ? startsOn.slice(0, 7) : getMonterreyDateString().slice(0, 7);
  const calendarParams = new URLSearchParams({ month: selectedMonth });
  if (campusId) calendarParams.set("campus", campusId);
  const failureTarget = `/attendance/calendar?${calendarParams.toString()}`;

  if (!isDateOnly(startsOn) || !isDateOnly(endsOn) || endsOn < startsOn || !VALID_CLOSURE_REASONS.has(reasonCode) || !title) {
    redirect(`${failureTarget}&err=invalid_closure_form`);
  }

  const { context, admin } = await requireClosureManager(campusId);

  const { data: created, error: createError } = await admin
    .from("attendance_closures")
    .insert({
      campus_id: campusId,
      starts_on: startsOn,
      ends_on: endsOn,
      reason_code: reasonCode,
      title,
      notes,
      created_by: context.user.id,
    })
    .select("id")
    .maybeSingle<{ id: string } | null>();

  if (createError || !created) redirect(`${failureTarget}&err=closure_create_failed`);

  let updateQuery = admin
    .from("attendance_sessions")
    .update({
      status: "cancelled",
      cancelled_reason_code: mapClosureReasonToSessionCancelReason(reasonCode),
      cancelled_reason: [title, notes].filter(Boolean).join(" - ") || null,
      updated_at: new Date().toISOString(),
    })
    .eq("status", "scheduled")
    .gte("session_date", startsOn)
    .lte("session_date", endsOn);

  if (campusId) {
    updateQuery = updateQuery.eq("campus_id", campusId);
  } else {
    const campusIds = context.attendanceCampusAccess?.campusIds ?? [];
    if (campusIds.length > 0) updateQuery = updateQuery.in("campus_id", campusIds);
  }

  const { data: cancelledRows, error: cancelError } = await updateQuery
    .select("id")
    .returns<Array<{ id: string }>>();

  if (cancelError) redirect(`${failureTarget}&err=closure_cancel_failed`);

  await writeAuditLog(admin, {
    actorUserId: context.user.id,
    actorEmail: context.user.email,
    action: "attendance_closure.created",
    tableName: "attendance_closures",
    recordId: created.id,
    afterData: {
      campus_id: campusId,
      starts_on: startsOn,
      ends_on: endsOn,
      reason_code: reasonCode,
      title,
      cancelled_scheduled_sessions: cancelledRows?.length ?? 0,
    },
  });

  revalidatePath("/attendance");
  revalidatePath("/attendance/calendar");
  revalidatePath("/attendance/groups");
  revalidatePath("/attendance/reports");

  calendarParams.set("ok", "closure_created");
  calendarParams.set("cancelled", String(cancelledRows?.length ?? 0));
  redirect(`/attendance/calendar?${calendarParams.toString()}`);
}

export async function createBulkAttendanceSchedulesAction(formData: FormData) {
  await assertDebugWritesAllowed("/attendance/schedules");
  const { context, admin } = await requireScheduleManager();
  const campusId = clean(formData.get("campus_id"));
  const effectiveStart = clean(formData.get("effective_start")) || getMonterreyDateString();
  const dayValues = formData.getAll("day_of_week").map((value) => Number(String(value))).filter((value) => Number.isInteger(value) && value >= 1 && value <= 7);
  const dayOfWeekValues = [...new Set(dayValues)];

  if (!campusId || !canWriteAttendanceCampus(context.attendanceCampusAccess, campusId) || !isDateOnly(effectiveStart) || dayOfWeekValues.length === 0) {
    redirect("/attendance/schedules?err=invalid_bulk_form");
  }

  const [{ data: groups }, { data: existingTemplates }] = await Promise.all([
    admin
      .from("training_groups")
      .select("id, campus_id, name, start_time, end_time")
      .eq("campus_id", campusId)
      .eq("status", "active")
      .not("start_time", "is", null)
      .not("end_time", "is", null)
      .returns<Array<{ id: string; campus_id: string; name: string; start_time: string | null; end_time: string | null }>>(),
    admin
      .from("attendance_schedule_templates")
      .select("training_group_id, day_of_week, effective_end, is_active")
      .eq("campus_id", campusId)
      .in("day_of_week", dayOfWeekValues)
      .not("training_group_id", "is", null)
      .returns<Array<{ training_group_id: string | null; day_of_week: number; effective_end: string | null; is_active: boolean }>>(),
  ]);

  const existingKeys = new Set(
    (existingTemplates ?? [])
      .filter((row) => row.training_group_id && row.is_active && (!row.effective_end || row.effective_end >= effectiveStart))
      .map((row) => `${row.training_group_id}:${row.day_of_week}`)
  );

  const rowsToInsert = (groups ?? []).flatMap((group) =>
    dayOfWeekValues.flatMap((dayOfWeek) => {
      if (!group.start_time || !group.end_time) return [];
      const key = `${group.id}:${dayOfWeek}`;
      if (existingKeys.has(key)) return [];
      existingKeys.add(key);
      return [{
        campus_id: group.campus_id,
        training_group_id: group.id,
        day_of_week: dayOfWeek,
        start_time: group.start_time.slice(0, 5),
        end_time: group.end_time.slice(0, 5),
        effective_start: effectiveStart,
        created_by: context.user.id,
      }];
    })
  );

  if (rowsToInsert.length > 0) {
    const { error } = await admin.from("attendance_schedule_templates").insert(rowsToInsert);
    if (error) redirect("/attendance/schedules?err=bulk_create_failed");

    await writeAuditLog(admin, {
      actorUserId: context.user.id,
      actorEmail: context.user.email,
      action: "attendance_schedule.bulk_created",
      tableName: "attendance_schedule_templates",
      afterData: {
        campus_id: campusId,
        effective_start: effectiveStart,
        day_of_week: dayOfWeekValues,
        created: rowsToInsert.length,
      },
    });
  }

  revalidatePath("/attendance");
  revalidatePath("/attendance/schedules");
  redirect(`/attendance/schedules?ok=bulk_created&count=${rowsToInsert.length}`);
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
  const confirmed = clean(formData.get("confirm_cancel")) === "1";

  if (!confirmed) redirect(`/attendance/sessions/${sessionId}?err=cancel_confirmation_required`);
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

export async function saveAttendanceSessionAction(sessionId: string, formData: FormData): Promise<AttendanceSaveResult> {
  const perf = createPerfTimer("attendance.save");
  const context = await requireAttendanceSaveContext(`/attendance/sessions/${sessionId}`);
  perf.mark("attendance_write_context");
  const admin = createAdminClient();
  const snapshot = await getAttendanceSaveSnapshot(admin, sessionId);
  perf.mark("save_snapshot");
  const sessionNotes = clean(formData.get("session_notes")) || null;

  if (!snapshot || !canWriteAttendanceCampus(context.attendanceCampusAccess, snapshot.session.campus_id)) redirect("/unauthorized");
  if (snapshot.session.status === "cancelled") return { ok: false, error: "cancelled" };
  if (snapshot.session.status === "completed" && !context.isDirector) return { ok: false, error: "director_required" };

  const existingByEnrollment = new Map(
    snapshot.records.map((record) => [record.enrollment_id, record])
  );
  perf.mark("prepare_existing_map");

  const rows = snapshot.roster.map((player) => {
    const rawStatus = clean(formData.get(`status:${player.enrollment_id}`));
    const status = VALID_STATUSES.has(rawStatus) ? rawStatus : "present";
    const note = clean(formData.get(`note:${player.enrollment_id}`)) || null;
    const incident = snapshot.incidentByEnrollment.get(player.enrollment_id) ?? null;
    const before = existingByEnrollment.get(player.enrollment_id);
    const completedCorrectionChanged =
      snapshot.session.status === "completed" &&
      before &&
      (before.status !== status || (before.note ?? null) !== note);
    const source =
      completedCorrectionChanged || (snapshot.session.status === "completed" && !before)
        ? "correction"
        : snapshot.session.status === "completed" && before
          ? before.source
        : incident && (status === "injury" || status === "justified")
          ? "incident"
          : status === "present" && !note
            ? "default"
            : "manual";
    return {
      session_id: sessionId,
      team_assignment_id: player.assignment_source === "team" ? player.assignment_id : null,
      training_group_assignment_id: player.assignment_source === "training_group" ? player.assignment_id : null,
      enrollment_id: player.enrollment_id,
      player_id: player.player_id,
      status,
      source,
      incident_id: source === "incident" ? incident?.id ?? null : null,
      note,
      recorded_by: context.user.id,
      updated_by: context.user.id,
      updated_at: new Date().toISOString(),
    };
  });
  perf.mark("prepare_rows");

  const rowsToUpsert = rows.filter((row) => {
    const before = existingByEnrollment.get(row.enrollment_id);
    if (!before) return true;
    return before.status !== row.status || (before.note ?? null) !== row.note || before.source !== row.source;
  });

  const auditRows = rowsToUpsert.flatMap((row) => {
    const before = existingByEnrollment.get(row.enrollment_id);
    if (!before) return [];
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
  perf.mark("prepare_audit_rows");

  const { error } = rowsToUpsert.length > 0
    ? await admin
        .from("attendance_records")
        .upsert(rowsToUpsert, { onConflict: "session_id,enrollment_id" })
    : { error: null };
  perf.mark("records_upsert");

  if (error) return { ok: false, error: "save_failed" };

  if (auditRows.length > 0 && context.isDirector) {
    await admin.from("attendance_record_audit").insert(auditRows);
  }
  perf.mark("correction_audit");

  await admin
    .from("attendance_sessions")
    .update({
      status: "completed",
      notes: sessionNotes,
      completed_by: context.user.id,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", sessionId);
  perf.mark("session_update");

  await writeAuditLog(admin, {
    actorUserId: context.user.id,
    actorEmail: context.user.email,
    action: snapshot.session.status === "completed" ? "attendance_session.corrected" : "attendance_session.completed",
    tableName: "attendance_sessions",
    recordId: sessionId,
    afterData: { records: rows.length, upserted_records: rowsToUpsert.length, has_session_notes: Boolean(sessionNotes) },
  });
  perf.mark("audit_log");

  revalidatePath("/attendance");
  revalidatePath(`/attendance/sessions/${sessionId}`);
  revalidatePath("/attendance/reports");
  perf.mark("revalidate");
  const savedAt = new Date().toISOString();
  perf.end({
    rosterCount: rows.length,
    upsertRows: rowsToUpsert.length,
    auditRows: auditRows.length,
    statusBefore: snapshot.session.status,
    hasSessionNotes: Boolean(sessionNotes),
  });
  return { ok: true, savedAt, rosterCount: rows.length, statusBefore: snapshot.session.status };
}

async function requireAttendanceSaveContext(readOnlyRedirectTo: string) {
  const debugContext = await getDebugViewContext();
  if (!debugContext) redirect("/unauthorized");
  if (debugContext.isReadOnly) redirect(`${readOnlyRedirectTo}?err=debug_read_only`);

  const roleRows = debugContext.effective.roleRows;
  const roleCodes = debugContext.effective.roleCodes;
  const isSuperAdmin = roleCodes.includes(APP_ROLES.SUPERADMIN);
  const isDirector = isSuperAdmin || roleCodes.includes(APP_ROLES.DIRECTOR_ADMIN);
  const sportsRows = roleRows.filter((row) => row.app_roles?.code === APP_ROLES.DIRECTOR_DEPORTIVO);
  const isSportsDirector = isDirector || sportsRows.length > 0;
  const isGlobalSportsDirector = sportsRows.some((row) => row.campus_id === null);
  const attendanceRows = roleRows.filter((row) => row.app_roles?.code === APP_ROLES.ATTENDANCE_ADMIN);
  const isAttendanceAdmin = attendanceRows.some((row) => row.campus_id !== null);

  if (!isDirector && !isSportsDirector && !isAttendanceAdmin) redirect("/unauthorized");

  const scopedCampusIds = new Set(
    [...sportsRows, ...attendanceRows]
      .map((row) => row.campus_id)
      .filter((campusId): campusId is string => Boolean(campusId))
  );
  const campusAccess: AttendanceCampusAccess = {
    userId: debugContext.effective.id,
    isDirector,
    isSportsDirector,
    isGlobalSportsDirector,
    isAttendanceAdmin,
    isFrontDesk: roleCodes.includes(APP_ROLES.FRONT_DESK),
    canWrite: true,
    campuses: [],
    campusIds: [...scopedCampusIds],
    defaultCampusId: scopedCampusIds.values().next().value ?? null,
  };

  return {
    user: { id: debugContext.effective.id, email: debugContext.effective.email ?? null },
    attendanceCampusAccess: campusAccess,
    isDirector,
  };
}
