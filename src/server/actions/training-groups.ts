"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { writeAuditLog } from "@/lib/audit";
import { assertDebugWritesAllowed } from "@/lib/auth/debug-view";
import { canWriteAttendanceCampus } from "@/lib/auth/campuses";
import { getPermissionContext } from "@/lib/auth/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  normalizeTrainingGroupGender,
  normalizeTrainingGroupProgram,
  normalizeTrainingGroupStatus,
} from "@/lib/training-groups/shared";
import { getMonterreyDateString } from "@/lib/time";

function clean(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

function parseNullableInt(value: string) {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function isTimeOnly(value: string) {
  return /^\d{2}:\d{2}$/.test(value);
}

function isDateOnly(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

async function requireTrainingGroupManager() {
  const context = await getPermissionContext();
  if (!context?.hasAttendanceWriteAccess || (!context.isDirector && !context.isSportsDirector)) {
    redirect("/attendance/groups?err=unauthorized");
  }
  return { context, admin: createAdminClient() };
}

async function syncGroupCoaches(params: {
  admin: ReturnType<typeof createAdminClient>;
  trainingGroupId: string;
  coachIds: string[];
  primaryCoachId: string | null;
}) {
  const uniqueCoachIds = [...new Set(params.coachIds.filter(Boolean))];
  await params.admin.from("training_group_coaches").delete().eq("training_group_id", params.trainingGroupId);
  if (uniqueCoachIds.length === 0) return;

  const primaryCoachId = uniqueCoachIds.includes(params.primaryCoachId ?? "")
    ? params.primaryCoachId
    : uniqueCoachIds[0];

  await params.admin.from("training_group_coaches").insert(
    uniqueCoachIds.map((coachId) => ({
      training_group_id: params.trainingGroupId,
      coach_id: coachId,
      is_primary: coachId === primaryCoachId,
    }))
  );
}

async function upsertTrainingGroupAssignment(params: {
  admin: ReturnType<typeof createAdminClient>;
  actorUserId: string;
  actorEmail: string | null;
  enrollmentId: string;
  trainingGroupId: string;
  assignmentStart: string;
}) {
  const { admin, actorUserId, actorEmail, enrollmentId, trainingGroupId, assignmentStart } = params;
  const [{ data: enrollment }, { data: targetGroup }, { data: existingAssignment }] = await Promise.all([
    admin
      .from("enrollments")
      .select("id, player_id, campus_id, status, start_date")
      .eq("id", enrollmentId)
      .maybeSingle<{ id: string; player_id: string; campus_id: string; status: string; start_date: string } | null>(),
    admin
      .from("training_groups")
      .select("id, campus_id, name")
      .eq("id", trainingGroupId)
      .maybeSingle<{ id: string; campus_id: string; name: string } | null>(),
    admin
      .from("training_group_assignments")
      .select("id, training_group_id, start_date")
      .eq("enrollment_id", enrollmentId)
      .is("end_date", null)
      .maybeSingle<{ id: string; training_group_id: string; start_date: string } | null>(),
  ]);

  if (!enrollment || enrollment.status !== "active" || !targetGroup || enrollment.campus_id !== targetGroup.campus_id) {
    return false;
  }

  if (existingAssignment?.training_group_id === trainingGroupId) {
    return true;
  }

  if (existingAssignment) {
    const endDate = assignmentStart > existingAssignment.start_date ? new Date(`${assignmentStart}T12:00:00.000Z`) : new Date(`${existingAssignment.start_date}T12:00:00.000Z`);
    if (assignmentStart > existingAssignment.start_date) endDate.setUTCDate(endDate.getUTCDate() - 1);
    const resolvedEndDate = endDate.toISOString().slice(0, 10);

    await admin
      .from("training_group_assignments")
      .update({ end_date: resolvedEndDate, updated_at: new Date().toISOString() })
      .eq("id", existingAssignment.id);
  }

  const { data: created, error } = await admin
    .from("training_group_assignments")
    .insert({
      training_group_id: trainingGroupId,
      enrollment_id: enrollmentId,
      player_id: enrollment.player_id,
      start_date: assignmentStart,
      assigned_by: actorUserId,
    })
    .select("id")
    .maybeSingle<{ id: string } | null>();

  if (error || !created) return false;

  await writeAuditLog(admin, {
    actorUserId,
    actorEmail,
    action: "training_group_assignment.upserted",
    tableName: "training_group_assignments",
    recordId: created.id,
    afterData: {
      enrollment_id: enrollmentId,
      training_group_id: trainingGroupId,
      assignment_start: assignmentStart,
    },
  });

  return true;
}

export async function createTrainingGroupAction(formData: FormData) {
  await assertDebugWritesAllowed("/attendance/groups");
  const { context, admin } = await requireTrainingGroupManager();
  const campusId = clean(formData.get("campus_id"));
  const name = clean(formData.get("name"));
  const program = normalizeTrainingGroupProgram(clean(formData.get("program")));
  const levelLabel = clean(formData.get("level_label")) || null;
  const groupCode = clean(formData.get("group_code")) || null;
  const gender = normalizeTrainingGroupGender(clean(formData.get("gender")));
  const birthYearMin = parseNullableInt(clean(formData.get("birth_year_min")));
  const birthYearMax = parseNullableInt(clean(formData.get("birth_year_max")));
  const startTime = clean(formData.get("start_time")) || null;
  const endTime = clean(formData.get("end_time")) || null;
  const status = normalizeTrainingGroupStatus(clean(formData.get("status")) || "active");
  const notes = clean(formData.get("notes")) || null;
  const coachIds = formData.getAll("coach_ids").map((value) => String(value));
  const primaryCoachId = clean(formData.get("primary_coach_id")) || null;

  if (!campusId || !name || !canWriteAttendanceCampus(context.attendanceCampusAccess, campusId)) {
    redirect("/attendance/groups?err=invalid_group");
  }
  if ((startTime && !isTimeOnly(startTime)) || (endTime && !isTimeOnly(endTime))) {
    redirect("/attendance/groups?err=invalid_time");
  }

  const { data: created, error } = await admin
    .from("training_groups")
    .insert({
      campus_id: campusId,
      name,
      program,
      level_label: levelLabel,
      group_code: groupCode,
      gender,
      birth_year_min: birthYearMin,
      birth_year_max: birthYearMax,
      start_time: startTime,
      end_time: endTime,
      status,
      notes,
    })
    .select("id")
    .maybeSingle<{ id: string } | null>();

  if (error || !created) redirect("/attendance/groups?err=create_failed");

  await syncGroupCoaches({ admin, trainingGroupId: created.id, coachIds, primaryCoachId });

  await writeAuditLog(admin, {
    actorUserId: context.user.id,
    actorEmail: context.user.email,
    action: "training_group.created",
    tableName: "training_groups",
    recordId: created.id,
    afterData: { campus_id: campusId, name, program, gender, birth_year_min: birthYearMin, birth_year_max: birthYearMax },
  });

  revalidatePath("/attendance");
  revalidatePath("/attendance/groups");
  revalidatePath("/attendance/schedules");
  revalidatePath("/new-enrollments");
  redirect("/attendance/groups?ok=group_created");
}

export async function updateTrainingGroupAction(groupId: string, formData: FormData) {
  await assertDebugWritesAllowed("/attendance/groups");
  const { context, admin } = await requireTrainingGroupManager();
  const name = clean(formData.get("name"));
  const program = normalizeTrainingGroupProgram(clean(formData.get("program")));
  const levelLabel = clean(formData.get("level_label")) || null;
  const groupCode = clean(formData.get("group_code")) || null;
  const gender = normalizeTrainingGroupGender(clean(formData.get("gender")));
  const birthYearMin = parseNullableInt(clean(formData.get("birth_year_min")));
  const birthYearMax = parseNullableInt(clean(formData.get("birth_year_max")));
  const startTime = clean(formData.get("start_time")) || null;
  const endTime = clean(formData.get("end_time")) || null;
  const status = normalizeTrainingGroupStatus(clean(formData.get("status")) || "active");
  const notes = clean(formData.get("notes")) || null;
  const coachIds = formData.getAll("coach_ids").map((value) => String(value));
  const primaryCoachId = clean(formData.get("primary_coach_id")) || null;

  if (!groupId || !name) redirect("/attendance/groups?err=invalid_group");
  if ((startTime && !isTimeOnly(startTime)) || (endTime && !isTimeOnly(endTime))) {
    redirect("/attendance/groups?err=invalid_time");
  }

  const { data: existing } = await admin
    .from("training_groups")
    .select("id, campus_id")
    .eq("id", groupId)
    .maybeSingle<{ id: string; campus_id: string } | null>();

  if (!existing || !canWriteAttendanceCampus(context.attendanceCampusAccess, existing.campus_id)) {
    redirect("/attendance/groups?err=unauthorized");
  }

  const { error } = await admin
    .from("training_groups")
    .update({
      name,
      program,
      level_label: levelLabel,
      group_code: groupCode,
      gender,
      birth_year_min: birthYearMin,
      birth_year_max: birthYearMax,
      start_time: startTime,
      end_time: endTime,
      status,
      notes,
      updated_at: new Date().toISOString(),
    })
    .eq("id", groupId);

  if (error) redirect("/attendance/groups?err=update_failed");

  await syncGroupCoaches({ admin, trainingGroupId: groupId, coachIds, primaryCoachId });

  await writeAuditLog(admin, {
    actorUserId: context.user.id,
    actorEmail: context.user.email,
    action: "training_group.updated",
    tableName: "training_groups",
    recordId: groupId,
    afterData: { name, program, gender, birth_year_min: birthYearMin, birth_year_max: birthYearMax, status },
  });

  revalidatePath("/attendance");
  revalidatePath("/attendance/groups");
  revalidatePath("/attendance/schedules");
  revalidatePath("/new-enrollments");
  redirect("/attendance/groups?ok=group_updated");
}

export async function assignTrainingGroupAction(formData: FormData) {
  await assertDebugWritesAllowed("/attendance/groups");
  const { context, admin } = await requireTrainingGroupManager();
  const enrollmentId = clean(formData.get("enrollment_id"));
  const trainingGroupId = clean(formData.get("training_group_id"));
  const assignmentStart = clean(formData.get("assignment_start")) || getMonterreyDateString();

  if (!enrollmentId || !trainingGroupId || !isDateOnly(assignmentStart)) {
    redirect("/attendance/groups?err=invalid_assignment");
  }

  const ok = await upsertTrainingGroupAssignment({
    admin,
    actorUserId: context.user.id,
    actorEmail: context.user.email,
    enrollmentId,
    trainingGroupId,
    assignmentStart,
  });

  if (!ok) redirect("/attendance/groups?err=assignment_failed");

  revalidatePath("/attendance");
  revalidatePath("/attendance/groups");
  revalidatePath("/attendance/schedules");
  revalidatePath("/attendance/reports");
  revalidatePath("/new-enrollments");
  redirect("/attendance/groups?ok=assignment_saved");
}

export async function applySuggestedTrainingGroupsAction(formData: FormData) {
  await assertDebugWritesAllowed("/attendance/groups");
  const { context, admin } = await requireTrainingGroupManager();
  const campusId = clean(formData.get("campus_id")) || null;
  const birthYear = clean(formData.get("birth_year")) || null;

  const campusIds = campusId && canWriteAttendanceCampus(context.attendanceCampusAccess, campusId)
    ? [campusId]
    : context.attendanceCampusAccess?.campusIds ?? [];

  if (campusIds.length === 0) redirect("/attendance/groups?err=unauthorized");

  const [{ data: groups }, { data: assignments }, { data: enrollments }, { data: competitionAssignments }] = await Promise.all([
    admin
      .from("training_groups")
      .select("id, campus_id, name, program, group_code, gender, birth_year_min, birth_year_max, status")
      .in("campus_id", campusIds)
      .in("status", ["active", "projected"])
      .returns<Array<{
        id: string;
        campus_id: string;
        name: string;
        program: string;
        group_code: string | null;
        gender: string;
        birth_year_min: number | null;
        birth_year_max: number | null;
        status: string;
      }>>(),
    admin
      .from("training_group_assignments")
      .select("enrollment_id")
      .is("end_date", null)
      .returns<Array<{ enrollment_id: string }>>(),
    admin
      .from("enrollments")
      .select("id, campus_id, start_date, status, players(id, birth_date, gender, level)")
      .in("campus_id", campusIds)
      .eq("status", "active")
      .returns<Array<{
        id: string;
        campus_id: string;
        start_date: string;
        status: string;
        players: { id: string; birth_date: string | null; gender: string | null; level: string | null } | null;
      }>>(),
    admin
      .from("team_assignments")
      .select("enrollment_id, teams(level)")
      .is("end_date", null)
      .returns<Array<{ enrollment_id: string; teams: { level: string | null } | null }>>(),
  ]);

  const assignedEnrollments = new Set((assignments ?? []).map((row) => row.enrollment_id));
  const competitionByEnrollment = new Map((competitionAssignments ?? []).map((row) => [row.enrollment_id, row.teams?.level ?? null]));

  let applied = 0;
  for (const enrollment of enrollments ?? []) {
    if (assignedEnrollments.has(enrollment.id)) continue;
    const year = enrollment.players?.birth_date ? Number.parseInt(enrollment.players.birth_date.slice(0, 4), 10) : null;
    if (birthYear && String(year ?? "") !== birthYear) continue;
    const resolvedLevel = competitionByEnrollment.get(enrollment.id) ?? enrollment.players?.level ?? null;
    const levelCodeMatch = /\b(B1|B2|B3)\b/i.exec(resolvedLevel ?? "");
    const levelCode = levelCodeMatch ? levelCodeMatch[1].toUpperCase() : null;
    const program = resolvedLevel === "Selectivo" ? "selectivo" : resolvedLevel === "Little Dragons" ? "little_dragons" : "futbol_para_todos";
    const candidates = (groups ?? []).filter((group) => {
      if (group.campus_id !== enrollment.campus_id) return false;
      if (group.program !== program) return false;
      if (year != null) {
        if (group.birth_year_min != null && year < group.birth_year_min) return false;
        if (group.birth_year_max != null && year > group.birth_year_max) return false;
      }
      if (group.gender !== "mixed" && enrollment.players?.gender && group.gender !== enrollment.players.gender) return false;
      if (group.gender !== "mixed" && !enrollment.players?.gender) return false;
      if (program === "futbol_para_todos" && levelCode && group.group_code && group.group_code !== levelCode) return false;
      return true;
    });

    if (candidates.length !== 1) continue;

    const ok = await upsertTrainingGroupAssignment({
      admin,
      actorUserId: context.user.id,
      actorEmail: context.user.email,
      enrollmentId: enrollment.id,
      trainingGroupId: candidates[0].id,
      assignmentStart: enrollment.start_date || getMonterreyDateString(),
    });
    if (ok) applied += 1;
  }

  revalidatePath("/attendance");
  revalidatePath("/attendance/groups");
  revalidatePath("/attendance/schedules");
  revalidatePath("/attendance/reports");
  revalidatePath("/new-enrollments");
  redirect(`/attendance/groups?ok=suggestions_applied&count=${applied}`);
}
