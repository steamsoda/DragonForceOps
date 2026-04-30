import { canAccessAttendanceCampus, canWriteAttendanceCampus } from "@/lib/auth/campuses";
import { getPermissionContext } from "@/lib/auth/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  resolveTrainingGroupSuggestion,
  type TrainingGroupCandidate,
  type TrainingGroupReviewState,
  type TrainingGroupSuggestionConfidence,
} from "@/lib/training-groups/matching";
import {
  TRAINING_GROUP_GENDER_LABELS,
  TRAINING_GROUP_PROGRAM_LABELS,
  TRAINING_GROUP_STATUS_LABELS,
  deriveTrainingGroupProgramFromLevel,
  formatTrainingGroupBirthYearRange,
  formatTrainingGroupCoachNames,
  normalizeTrainingGroupGender,
  normalizeTrainingGroupProgram,
  normalizeTrainingGroupStatus,
} from "@/lib/training-groups/shared";

export type { TrainingGroupReviewState } from "@/lib/training-groups/matching";

type GroupRow = {
  id: string;
  campus_id: string;
  name: string;
  program: string;
  level_label: string | null;
  group_code: string | null;
  gender: string;
  birth_year_min: number | null;
  birth_year_max: number | null;
  start_time: string | null;
  end_time: string | null;
  status: string;
  notes: string | null;
  campuses: { name: string | null } | null;
};

type GroupCoachRow = {
  training_group_id: string;
  coach_id: string;
  is_primary: boolean;
  coaches: { first_name: string | null; last_name: string | null } | null;
};

type ActiveAssignmentRow = {
  id: string;
  training_group_id: string;
  enrollment_id: string;
  player_id: string;
  start_date: string;
  training_groups: { id: string; name: string | null } | null;
};

type CoachOptionRow = {
  id: string;
  campus_id: string;
  first_name: string | null;
  last_name: string | null;
  campuses: { name: string | null } | null;
};

type EnrollmentQueueRow = {
  id: string;
  campus_id: string;
  start_date: string;
  status: string;
  campuses: { name: string | null } | null;
  players: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    birth_date: string | null;
    gender: string | null;
    level: string | null;
  } | null;
};

type CompetitionAssignmentRow = {
  enrollment_id: string;
  teams: {
    id: string;
    name: string | null;
    level: string | null;
    type: string;
  } | null;
};

export type TrainingGroupFilters = {
  campusId?: string;
  program?: string;
  status?: string;
  review?: string;
  birthYear?: string;
};

export type TrainingGroupCoachOption = {
  id: string;
  campusId: string;
  campusName: string;
  name: string;
};

export type TrainingGroupSummaryRow = {
  id: string;
  campusId: string;
  campusName: string;
  name: string;
  program: string;
  programLabel: string;
  levelLabel: string | null;
  groupCode: string | null;
  gender: string;
  genderLabel: string;
  birthYearMin: number | null;
  birthYearMax: number | null;
  birthYearLabel: string;
  startTime: string | null;
  endTime: string | null;
  status: string;
  statusLabel: string;
  notes: string | null;
  coachIds: string[];
  primaryCoachId: string | null;
  coachNames: string[];
  coachNamesLabel: string | null;
  activeAssignments: number;
};

export type TrainingGroupReviewRow = {
  enrollmentId: string;
  playerId: string;
  playerName: string;
  campusId: string;
  campusName: string;
  birthYear: number | null;
  gender: string | null;
  genderLabel: string;
  enrollmentStartDate: string;
  playerLevel: string | null;
  resolvedLevel: string | null;
  resolvedProgram: string;
  resolvedProgramLabel: string;
  currentTrainingGroupId: string | null;
  currentTrainingGroupName: string | null;
  competitionTeamNames: string[];
  reviewState: TrainingGroupReviewState;
  suggestionConfidence: TrainingGroupSuggestionConfidence;
  suggestionGroupId: string | null;
  suggestionGroupName: string | null;
  suggestionReason: string;
  suggestionCount: number;
  manualOptions: Array<{ id: string; label: string }>;
};

export type TrainingGroupsManagementData = {
  campuses: Array<{ id: string; name: string }>;
  selectedCampusId: string;
  selectedProgram: string;
  selectedStatus: string;
  selectedReview: string;
  selectedBirthYear: string;
  canManage: boolean;
  coachOptions: TrainingGroupCoachOption[];
  groups: TrainingGroupSummaryRow[];
  reviewRows: TrainingGroupReviewRow[];
  reviewCounts: Record<TrainingGroupReviewState, number>;
};

function getBirthYear(value: string | null | undefined) {
  if (!value) return null;
  const year = Number.parseInt(value.slice(0, 4), 10);
  return Number.isFinite(year) ? year : null;
}

function normalizeTime(value: string | null | undefined) {
  return value ? value.slice(0, 5) : null;
}

function getCoachName(coach: { first_name: string | null; last_name: string | null } | null | undefined) {
  const full = `${coach?.first_name ?? ""} ${coach?.last_name ?? ""}`.replace(/\s+/g, " ").trim();
  return full || null;
}

function getPlayerName(row: EnrollmentQueueRow["players"]) {
  return `${row?.first_name ?? ""} ${row?.last_name ?? ""}`.replace(/\s+/g, " ").trim() || "Jugador";
}

function getGenderLabel(value: string | null | undefined) {
  if (value === "male") return "Varonil";
  if (value === "female") return "Femenil";
  return "Mixto / sin genero";
}

function normalizeReviewState(value: string | null | undefined) {
  return value === "assigned" || value === "suggested" || value === "ambiguous" || value === "unmatched" ? value : "all";
}

function sortReviewRows(left: TrainingGroupReviewRow, right: TrainingGroupReviewRow) {
  const weight: Record<TrainingGroupReviewState, number> = {
    unmatched: 0,
    ambiguous: 1,
    suggested: 2,
    assigned: 3,
  };
  return (
    weight[left.reviewState] - weight[right.reviewState] ||
    left.campusName.localeCompare(right.campusName, "es-MX") ||
    left.playerName.localeCompare(right.playerName, "es-MX")
  );
}

export async function getTrainingGroupsManagementData(filters: TrainingGroupFilters): Promise<TrainingGroupsManagementData | null> {
  const context = await getPermissionContext();
  const access = context?.attendanceCampusAccess;
  if (!context || !context.hasAttendanceWriteAccess || !access || access.campusIds.length === 0) return null;

  const selectedCampusId = filters.campusId && canAccessAttendanceCampus(access, filters.campusId) ? filters.campusId : "";
  const selectedProgram = normalizeTrainingGroupProgram(filters.program);
  const selectedStatus = normalizeTrainingGroupStatus(filters.status || "active");
  const selectedReview = normalizeReviewState(filters.review);
  const selectedBirthYear = /^\d{4}$/.test(filters.birthYear ?? "") ? String(filters.birthYear) : "";
  const admin = createAdminClient();

  const [{ data: groups }, { data: coachRows }, { data: activeAssignments }, { data: coachOptions }, { data: enrollments }, { data: competitionAssignments }] =
    await Promise.all([
      admin
        .from("training_groups")
        .select("id, campus_id, name, program, level_label, group_code, gender, birth_year_min, birth_year_max, start_time, end_time, status, notes, campuses(name)")
        .in("campus_id", access.campusIds)
        .order("campus_id", { ascending: true })
        .order("program", { ascending: true })
        .order("birth_year_max", { ascending: false })
        .order("name", { ascending: true })
        .returns<GroupRow[]>(),
      admin
        .from("training_group_coaches")
        .select("training_group_id, coach_id, is_primary, coaches(first_name, last_name)")
        .returns<GroupCoachRow[]>(),
      admin
        .from("training_group_assignments")
        .select("id, training_group_id, enrollment_id, player_id, start_date, training_groups(id, name)")
        .is("end_date", null)
        .returns<ActiveAssignmentRow[]>(),
      admin
        .from("coaches")
        .select("id, campus_id, first_name, last_name, campuses(name)")
        .in("campus_id", access.campusIds)
        .eq("is_active", true)
        .order("campus_id", { ascending: true })
        .order("first_name", { ascending: true })
        .returns<CoachOptionRow[]>(),
      admin
        .from("enrollments")
        .select("id, campus_id, start_date, status, campuses(name), players(id, first_name, last_name, birth_date, gender, level)")
        .in("campus_id", access.campusIds)
        .eq("status", "active")
        .order("campus_id", { ascending: true })
        .order("start_date", { ascending: false })
        .returns<EnrollmentQueueRow[]>(),
      admin
        .from("team_assignments")
        .select("enrollment_id, teams(id, name, level, type)")
        .is("end_date", null)
        .returns<CompetitionAssignmentRow[]>(),
    ]);

  const assignmentCountByGroup = new Map<string, number>();
  const activeAssignmentByEnrollment = new Map<string, ActiveAssignmentRow>();
  for (const row of activeAssignments ?? []) {
    assignmentCountByGroup.set(row.training_group_id, (assignmentCountByGroup.get(row.training_group_id) ?? 0) + 1);
    activeAssignmentByEnrollment.set(row.enrollment_id, row);
  }

  const coachRowsByGroup = new Map<string, GroupCoachRow[]>();
  for (const row of coachRows ?? []) {
    const arr = coachRowsByGroup.get(row.training_group_id) ?? [];
    arr.push(row);
    coachRowsByGroup.set(row.training_group_id, arr);
  }

  const filteredGroups = (groups ?? []).filter((group) => {
    if (selectedCampusId && group.campus_id !== selectedCampusId) return false;
    if (filters.program && group.program !== selectedProgram) return false;
    if (filters.status && group.status !== selectedStatus) return false;
    return true;
  });

  const groupSummaries: TrainingGroupSummaryRow[] = filteredGroups.map((group) => {
    const groupedCoaches = coachRowsByGroup.get(group.id) ?? [];
    const sortedCoaches = [...groupedCoaches].sort((a, b) => Number(b.is_primary) - Number(a.is_primary));
    const coachNames = sortedCoaches.map((row) => getCoachName(row.coaches)).filter((value): value is string => Boolean(value));
    return {
      id: group.id,
      campusId: group.campus_id,
      campusName: group.campuses?.name ?? "Campus",
      name: group.name,
      program: group.program,
      programLabel: TRAINING_GROUP_PROGRAM_LABELS[group.program] ?? group.program,
      levelLabel: group.level_label,
      groupCode: group.group_code,
      gender: normalizeTrainingGroupGender(group.gender),
      genderLabel: TRAINING_GROUP_GENDER_LABELS[group.gender] ?? group.gender,
      birthYearMin: group.birth_year_min,
      birthYearMax: group.birth_year_max,
      birthYearLabel: formatTrainingGroupBirthYearRange(group.birth_year_min, group.birth_year_max),
      startTime: normalizeTime(group.start_time),
      endTime: normalizeTime(group.end_time),
      status: normalizeTrainingGroupStatus(group.status),
      statusLabel: TRAINING_GROUP_STATUS_LABELS[group.status] ?? group.status,
      notes: group.notes,
      coachIds: groupedCoaches.map((row) => row.coach_id),
      primaryCoachId: groupedCoaches.find((row) => row.is_primary)?.coach_id ?? groupedCoaches[0]?.coach_id ?? null,
      coachNames,
      coachNamesLabel: formatTrainingGroupCoachNames(coachNames),
      activeAssignments: assignmentCountByGroup.get(group.id) ?? 0,
    };
  });

  const competitionByEnrollment = new Map<string, Array<{ name: string; level: string | null; type: string }>>();
  for (const row of competitionAssignments ?? []) {
    if (!row.teams) continue;
    const arr = competitionByEnrollment.get(row.enrollment_id) ?? [];
    arr.push({
      name: row.teams.name ?? "Equipo",
      level: row.teams.level ?? null,
      type: row.teams.type,
    });
    competitionByEnrollment.set(row.enrollment_id, arr);
  }

  const candidateGroups: TrainingGroupCandidate[] = (groups ?? [])
    .filter((group) => group.status === "active" || group.status === "projected")
    .map((group) => ({
      id: group.id,
      name: group.name,
      campusId: group.campus_id,
      program: group.program,
      gender: group.gender,
      birthYearMin: group.birth_year_min,
      birthYearMax: group.birth_year_max,
      groupCode: group.group_code,
      status: group.status,
    }));

  const scopedReviewRows: TrainingGroupReviewRow[] = (enrollments ?? [])
    .filter((row) => !selectedCampusId || row.campus_id === selectedCampusId)
    .map((row) => {
      const birthYear = getBirthYear(row.players?.birth_date);
      const competitionTeams = competitionByEnrollment.get(row.id) ?? [];
      const primaryCompetition = competitionTeams[0] ?? null;
      const resolvedLevel = primaryCompetition?.level ?? row.players?.level ?? null;
      const resolvedProgram = deriveTrainingGroupProgramFromLevel(resolvedLevel);
      const currentAssignment = activeAssignmentByEnrollment.get(row.id) ?? null;
      const suggestion = resolveTrainingGroupSuggestion({
        groups: candidateGroups,
        campusId: row.campus_id,
        birthYear,
        gender: row.players?.gender ?? null,
        resolvedLevel,
      });

      let reviewState: TrainingGroupReviewState = "unmatched";
      let suggestionConfidence: TrainingGroupSuggestionConfidence = suggestion.confidence;
      let suggestionGroupId: string | null = null;
      let suggestionGroupName: string | null = null;
      let suggestionReason = suggestion.suggestionReason;

      if (currentAssignment) {
        reviewState = "assigned";
        suggestionConfidence = "assigned";
        suggestionGroupId = currentAssignment.training_group_id;
        suggestionGroupName = currentAssignment.training_groups?.name ?? "Grupo";
        suggestionReason = "Ya tiene grupo activo";
      } else {
        reviewState = suggestion.reviewState;
        suggestionGroupId = suggestion.suggestionGroupId;
        suggestionGroupName = suggestion.suggestionGroupName;
      }

      const manualOptions = candidateGroups
        .filter((group) => group.campusId === row.campus_id)
        .sort((a, b) => {
          const leftYear = `${a.birthYearMax ?? 0}`.padStart(4, "0");
          const rightYear = `${b.birthYearMax ?? 0}`.padStart(4, "0");
          return rightYear.localeCompare(leftYear) || a.name.localeCompare(b.name, "es-MX");
        })
        .map((group) => ({
          id: group.id,
          label: `${group.name} | ${formatTrainingGroupBirthYearRange(group.birthYearMin, group.birthYearMax)} | ${TRAINING_GROUP_PROGRAM_LABELS[group.program] ?? group.program}`,
        }));

      return {
        enrollmentId: row.id,
        playerId: row.players?.id ?? "",
        playerName: getPlayerName(row.players),
        campusId: row.campus_id,
        campusName: row.campuses?.name ?? "Campus",
        birthYear,
        gender: row.players?.gender ?? null,
        genderLabel: getGenderLabel(row.players?.gender),
        enrollmentStartDate: row.start_date,
        playerLevel: row.players?.level ?? null,
        resolvedLevel,
        resolvedProgram,
        resolvedProgramLabel: TRAINING_GROUP_PROGRAM_LABELS[resolvedProgram] ?? resolvedProgram,
        currentTrainingGroupId: currentAssignment?.training_group_id ?? null,
        currentTrainingGroupName: currentAssignment?.training_groups?.name ?? null,
        competitionTeamNames: competitionTeams.map((team) => team.name),
        reviewState,
        suggestionConfidence,
        suggestionGroupId,
        suggestionGroupName,
        suggestionReason,
        suggestionCount: currentAssignment ? 1 : suggestion.suggestionCount,
        manualOptions,
      };
    })
    .filter((row) => !selectedBirthYear || String(row.birthYear ?? "") === selectedBirthYear)
    .sort(sortReviewRows);

  const reviewCounts: Record<TrainingGroupReviewState, number> = {
    assigned: scopedReviewRows.filter((row) => row.reviewState === "assigned").length,
    suggested: scopedReviewRows.filter((row) => row.reviewState === "suggested").length,
    ambiguous: scopedReviewRows.filter((row) => row.reviewState === "ambiguous").length,
    unmatched: scopedReviewRows.filter((row) => row.reviewState === "unmatched").length,
  };

  const reviewRows = scopedReviewRows.filter((row) => selectedReview === "all" || row.reviewState === selectedReview);

  return {
    campuses: access.campuses.map((campus) => ({ id: campus.id, name: campus.name })),
    selectedCampusId,
    selectedProgram: filters.program ? selectedProgram : "",
    selectedStatus: filters.status ? selectedStatus : "",
    selectedReview,
    selectedBirthYear,
    canManage: context.isDirector || context.isSportsDirector,
    coachOptions: (coachOptions ?? []).map((coach) => ({
      id: coach.id,
      campusId: coach.campus_id,
      campusName: coach.campuses?.name ?? "Campus",
      name: getCoachName(coach) ?? "Coach",
    })),
    groups: groupSummaries,
    reviewRows,
    reviewCounts,
  };
}
