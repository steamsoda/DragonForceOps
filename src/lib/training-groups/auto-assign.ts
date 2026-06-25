import type { SupabaseClient } from "@supabase/supabase-js";

export type DefaultTrainingGroupCandidate = {
  id: string;
  name: string;
  campusId: string;
  program: string;
  groupCode: string | null;
  gender: string;
  birthYearMin: number | null;
  birthYearMax: number | null;
  status: string;
};

function normalizeCode(value: string | null | undefined) {
  return value?.trim().toUpperCase() ?? "";
}

function birthYearMatches(group: DefaultTrainingGroupCandidate, birthYear: number) {
  if (group.birthYearMin != null && birthYear < group.birthYearMin) return false;
  if (group.birthYearMax != null && birthYear > group.birthYearMax) return false;
  return true;
}

function genderRank(groupGender: string, playerGender: string | null | undefined) {
  if (groupGender === "mixed") return playerGender ? 2 : 1;
  if (!playerGender) return null;
  return groupGender === playerGender ? 0 : null;
}

function defaultGroupRank(group: DefaultTrainingGroupCandidate, playerGender: string | null | undefined) {
  const gender = genderRank(group.gender, playerGender);
  if (gender == null) return null;

  const code = normalizeCode(group.groupCode);
  if (code === "B1") return { gender, code: 0 };

  if (playerGender === "female" && group.gender === "female") {
    return { gender, code: 1 };
  }

  return null;
}

export function resolveDefaultB1TrainingGroup(params: {
  groups: DefaultTrainingGroupCandidate[];
  campusId: string;
  birthYear: number | null;
  gender: string | null;
}) {
  if (params.birthYear == null) return null;

  const compatible = params.groups
    .filter((group) =>
      group.campusId === params.campusId &&
      group.status === "active" &&
      group.program === "futbol_para_todos" &&
      birthYearMatches(group, params.birthYear!)
    )
    .map((group) => ({ group, rank: defaultGroupRank(group, params.gender) }))
    .filter((row): row is { group: DefaultTrainingGroupCandidate; rank: { gender: number; code: number } } => row.rank != null);

  if (compatible.length === 0) return null;

  const bestGenderRank = Math.min(...compatible.map((row) => row.rank.gender));
  const genderMatches = compatible.filter((row) => row.rank.gender === bestGenderRank);
  const bestCodeRank = Math.min(...genderMatches.map((row) => row.rank.code));
  const bestMatches = genderMatches.filter((row) => row.rank.code === bestCodeRank).map((row) => row.group);

  return bestMatches.length === 1 ? bestMatches[0] : null;
}

export async function assignDefaultB1TrainingGroupForEnrollment(params: {
  admin: SupabaseClient;
  actorUserId: string;
  actorEmail: string | null;
  enrollmentId: string;
  playerId: string;
  campusId: string;
  birthYear: number | null;
  gender: string | null;
  assignmentStart: string;
  writeAuditLogFn?: (admin: SupabaseClient, entry: {
    actorUserId: string;
    actorEmail?: string | null;
    action: string;
    tableName: string;
    recordId?: string | null;
    afterData?: Record<string, unknown> | null;
  }) => Promise<void>;
}) {
  const { admin, actorUserId, actorEmail, enrollmentId, playerId, campusId, birthYear, gender, assignmentStart } = params;
  if (!birthYear) return { assigned: false as const, reason: "missing_birth_year" as const };

  const [{ data: existingAssignment }, { data: groups }] = await Promise.all([
    admin
      .from("training_group_assignments")
      .select("id")
      .eq("enrollment_id", enrollmentId)
      .is("end_date", null)
      .maybeSingle<{ id: string } | null>(),
    admin
      .from("training_groups")
      .select("id, campus_id, name, program, group_code, gender, birth_year_min, birth_year_max, status")
      .eq("campus_id", campusId)
      .eq("program", "futbol_para_todos")
      .eq("status", "active")
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
  ]);

  if (existingAssignment) return { assigned: false as const, reason: "already_assigned" as const };

  const match = resolveDefaultB1TrainingGroup({
    groups: (groups ?? []).map((group) => ({
      id: group.id,
      name: group.name,
      campusId: group.campus_id,
      program: group.program,
      groupCode: group.group_code,
      gender: group.gender,
      birthYearMin: group.birth_year_min,
      birthYearMax: group.birth_year_max,
      status: group.status,
    })),
    campusId,
    birthYear,
    gender,
  });

  if (!match) return { assigned: false as const, reason: "no_safe_match" as const };

  const { data: created, error } = await admin
    .from("training_group_assignments")
    .insert({
      training_group_id: match.id,
      enrollment_id: enrollmentId,
      player_id: playerId,
      start_date: assignmentStart,
      assigned_by: actorUserId,
    })
    .select("id")
    .maybeSingle<{ id: string } | null>();

  if (error || !created) return { assigned: false as const, reason: "insert_failed" as const };

  const writeAuditLog =
    params.writeAuditLogFn ??
    (await import("../audit")).writeAuditLog;
  await writeAuditLog(admin, {
    actorUserId,
    actorEmail,
    action: "training_group_assignment.auto_assigned",
    tableName: "training_group_assignments",
    recordId: created.id,
    afterData: {
      enrollment_id: enrollmentId,
      training_group_id: match.id,
      assignment_start: assignmentStart,
      source: "enrollment_default_b1",
    },
  });

  return {
    assigned: true as const,
    trainingGroupId: match.id,
    trainingGroupName: match.name,
  };
}
