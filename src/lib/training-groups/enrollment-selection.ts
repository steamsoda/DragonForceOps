import type { SupabaseClient } from "@supabase/supabase-js";
import { writeAuditLog } from "@/lib/audit";
import {
  trainingGroupMatchesBirthYear,
  trainingGroupMatchesGender,
  type EnrollmentTrainingGroupOption,
  type EnrollmentTrainingProgram,
} from "@/lib/training-groups/enrollment-selection-ranking";

export {
  rankEnrollmentTrainingGroups,
  trainingGroupMatchesBirthYear,
  trainingGroupMatchesGender,
} from "@/lib/training-groups/enrollment-selection-ranking";
export type {
  EnrollmentTrainingGroupOption,
  EnrollmentTrainingProgram,
} from "@/lib/training-groups/enrollment-selection-ranking";

type TrainingGroupSelectionError =
  | "training_group_not_found"
  | "training_group_inactive"
  | "training_group_campus_mismatch"
  | "training_group_program_mismatch"
  | "training_group_gender_mismatch"
  | "training_group_birth_year_confirmation_required"
  | "little_dragons_campus_mismatch";

type TrainingGroupRow = {
  id: string;
  campus_id: string;
  name: string;
  program: EnrollmentTrainingProgram;
  gender: string;
  birth_year_min: number | null;
  birth_year_max: number | null;
  status: string;
  campuses: { code: string | null } | null;
};

export async function validateEnrollmentTrainingGroupSelection(params: {
  admin: SupabaseClient;
  campusId: string;
  program: EnrollmentTrainingProgram;
  trainingGroupId: string;
  birthYear: number | null;
  gender: string | null;
  overrideConfirmed: boolean;
}) {
  const { data: group } = await params.admin
    .from("training_groups")
    .select("id, campus_id, name, program, gender, birth_year_min, birth_year_max, status, campuses(code)")
    .eq("id", params.trainingGroupId)
    .maybeSingle<TrainingGroupRow | null>();

  function fail(error: TrainingGroupSelectionError) {
    return { ok: false as const, error };
  }

  if (!group) return fail("training_group_not_found");
  if (group.status !== "active") return fail("training_group_inactive");
  if (group.campus_id !== params.campusId) return fail("training_group_campus_mismatch");
  if (group.program !== params.program) return fail("training_group_program_mismatch");
  if (params.program === "little_dragons" && group.campuses?.code !== "LINDA_VISTA") {
    return fail("little_dragons_campus_mismatch");
  }
  if (!trainingGroupMatchesGender(group.gender, params.gender)) return fail("training_group_gender_mismatch");

  const birthYearMatches = trainingGroupMatchesBirthYear(
    { birthYearMin: group.birth_year_min, birthYearMax: group.birth_year_max },
    params.birthYear,
  );
  if (!birthYearMatches && !params.overrideConfirmed) {
    return fail("training_group_birth_year_confirmation_required");
  }

  return {
    ok: true as const,
    group: {
      id: group.id,
      name: group.name,
      birthYearMatches,
    },
  };
}

export async function assignSelectedTrainingGroupForEnrollment(params: {
  admin: SupabaseClient;
  actorUserId: string;
  actorEmail: string | null;
  enrollmentId: string;
  playerId: string;
  trainingGroupId: string;
  assignmentStart: string;
  program: EnrollmentTrainingProgram;
  birthYearOverrideConfirmed: boolean;
}) {
  const { data: assignment, error } = await params.admin
    .from("training_group_assignments")
    .insert({
      training_group_id: params.trainingGroupId,
      enrollment_id: params.enrollmentId,
      player_id: params.playerId,
      start_date: params.assignmentStart,
      assigned_by: params.actorUserId,
    })
    .select("id")
    .maybeSingle<{ id: string } | null>();

  if (error || !assignment) {
    return { ok: false as const, error: error?.message ?? "training_group_assignment_failed" };
  }

  await writeAuditLog(params.admin, {
    actorUserId: params.actorUserId,
    actorEmail: params.actorEmail,
    action: "training_group_assignment.enrollment_confirmed",
    tableName: "training_group_assignments",
    recordId: assignment.id,
    afterData: {
      enrollment_id: params.enrollmentId,
      player_id: params.playerId,
      training_group_id: params.trainingGroupId,
      program: params.program,
      assignment_start: params.assignmentStart,
      birth_year_override_confirmed: params.birthYearOverrideConfirmed,
      source: "enrollment_confirmed_selection",
    },
  });

  return { ok: true as const, assignmentId: assignment.id };
}
