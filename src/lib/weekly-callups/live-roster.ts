import { getCompetitionPaidCallupPlayers } from "@/lib/queries/sports-signups";
import { createAdminClient } from "@/lib/supabase/admin";

type WeeklyCallupProgram = "selectivo" | "futbol_para_todos";

type AssignmentRow = {
  enrollment_id: string;
  player_id: string;
  training_group_id: string;
  training_groups: {
    id: string;
    campus_id: string;
    name: string;
    program: string;
    birth_year_min: number | null;
    birth_year_max: number | null;
    status: string;
  } | null;
};

export type WeeklyCallupLiveRosterPlayer = {
  enrollmentId: string;
  playerId: string;
  playerName: string;
  birthYear: number | null;
  trainingGroupId: string;
  trainingGroupName: string;
  categoryLabel: string;
  birthYearMin: number | null;
  birthYearMax: number | null;
  eligibilitySource: "direct" | "bundle";
};

export function weeklyCallupCategoryLabel(group: NonNullable<AssignmentRow["training_groups"]>) {
  if (group.birth_year_min && group.birth_year_max) {
    return group.birth_year_min === group.birth_year_max
      ? String(group.birth_year_min)
      : `${group.birth_year_min}/${group.birth_year_max}`;
  }
  return group.name;
}

export async function getWeeklyCallupLivePaidRoster(input: {
  campusId: string;
  tournamentProductId: string;
  program: WeeklyCallupProgram;
}): Promise<WeeklyCallupLiveRosterPlayer[] | null> {
  const paidPlayers = await getCompetitionPaidCallupPlayers({
    campusId: input.campusId,
    competitionId: `product:${input.tournamentProductId}`,
  });
  if (!paidPlayers) return null;
  if (paidPlayers.length === 0) return [];

  const admin = createAdminClient();
  const enrollmentIds = paidPlayers.map((player) => player.enrollmentId);
  const assignments: AssignmentRow[] = [];
  const chunkSize = 300;
  for (let index = 0; index < enrollmentIds.length; index += chunkSize) {
    const chunk = enrollmentIds.slice(index, index + chunkSize);
    const result = await admin
      .from("training_group_assignments")
      .select("enrollment_id, player_id, training_group_id, training_groups(id, campus_id, name, program, birth_year_min, birth_year_max, status)")
      .in("enrollment_id", chunk)
      .is("end_date", null)
      .returns<AssignmentRow[]>();
    if (result.error) throw result.error;
    assignments.push(...(result.data ?? []));
  }

  const playerByEnrollment = new Map(paidPlayers.map((player) => [player.enrollmentId, player]));
  const eligibleAssignments = assignments
    .filter(
      (assignment) =>
        assignment.training_groups?.campus_id === input.campusId &&
        assignment.training_groups?.program === input.program &&
        assignment.training_groups?.status === "active",
    )
    .map((assignment) => {
      const player = playerByEnrollment.get(assignment.enrollment_id);
      const group = assignment.training_groups;
      if (!player || !group) return null;
      return {
        enrollmentId: player.enrollmentId,
        playerId: player.playerId,
        playerName: player.playerName,
        birthYear: player.birthYear,
        trainingGroupId: group.id,
        trainingGroupName: group.name,
        categoryLabel: weeklyCallupCategoryLabel(group),
        birthYearMin: group.birth_year_min,
        birthYearMax: group.birth_year_max,
        eligibilitySource: player.registrationSource,
      } satisfies WeeklyCallupLiveRosterPlayer;
    })
    .filter((player): player is WeeklyCallupLiveRosterPlayer => Boolean(player));

  const rosterByEnrollment = new Map<string, WeeklyCallupLiveRosterPlayer>();
  for (const player of eligibleAssignments) {
    const existing = rosterByEnrollment.get(player.enrollmentId);
    if (existing && existing.trainingGroupId !== player.trainingGroupId) {
      throw new Error(`weekly_callup_multiple_active_assignments:${player.enrollmentId}`);
    }
    rosterByEnrollment.set(player.enrollmentId, player);
  }

  return [...rosterByEnrollment.values()].sort((a, b) => a.playerName.localeCompare(b.playerName, "es-MX"));
}
