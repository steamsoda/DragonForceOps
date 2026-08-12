import { getPermissionContext } from "@/lib/auth/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  formatCampusCompetitionTeamName,
  formatCompetitionSquadDisplay,
  formatTournamentGroupCardDisplay,
} from "@/lib/training-groups/shared";
import {
  getMonterreyWeekStart,
  type WeeklyCallupsFoundationData,
  type WeeklyCallupProgram,
} from "@/lib/queries/weekly-callups";
import { getMonterreyDateString } from "@/lib/time";

export type CoachScheduleGame = {
  id: string | null;
  matchDate: string;
  arrivalTime: string;
  venue: string;
  opponent: string;
  squadId: string;
  players: CoachScheduleGamePlayer[];
};

export type CoachScheduleGamePlayer = {
  enrollmentId: string;
  playerId: string;
  playerName: string;
  rosterStatus: "included" | "excluded";
};

export type CoachScheduleSquad = {
  id: string;
  tournamentId: string;
  name: string;
  players: Array<Omit<CoachScheduleGamePlayer, "rosterStatus">>;
};

export type CoachScheduleGroup = {
  id: string;
  coachId: string | null;
  trainingGroupId: string;
  squadId: string;
  campusId: string;
  campusName: string;
  name: string;
  program: "selectivo" | "futbol_para_todos";
  categoryLabel: string;
  sourceGroupNames: string[];
  squads: CoachScheduleSquad[];
  report: {
    id: string;
    tournamentId: string;
    isRest: boolean;
    notes: string;
    updatedAt: string;
    games: CoachScheduleGame[];
  } | null;
};

export type CoachSchedulePageData = {
  coachId: string;
  coachName: string;
  selectedWeekStart: string;
  groups: CoachScheduleGroup[];
  tournaments: Array<{ id: string; campusId: string; name: string }>;
};

export type AdminScheduleDetailData = {
  campusName: string;
  program: WeeklyCallupProgram;
  selectedWeekStart: string;
  groups: CoachScheduleGroup[];
  tournaments: Array<{ id: string; campusId: string; name: string }>;
};

type LinkRow = {
  training_group_id: string;
  training_groups: {
    id: string;
    campus_id: string;
    name: string;
    program: string;
    birth_year_min: number | null;
    birth_year_max: number | null;
    status: string;
    campuses: { name: string | null } | null;
  } | null;
};

type ReportRow = {
  id: string;
  coach_id: string;
  training_group_id: string;
  competition_roster_squad_id: string | null;
  tournament_id: string;
  is_rest: boolean;
  notes: string | null;
  updated_at: string;
};

type GameRow = {
  id: string;
  report_id: string;
  competition_roster_squad_id: string | null;
  match_date: string;
  arrival_time: string;
  venue: string;
  opponent: string;
  sort_order: number;
};

type GamePlayerRow = {
  game_id: string;
  enrollment_id: string;
  player_id: string;
  player_name_snapshot: string;
  roster_status: "included" | "excluded";
};

type SquadGroupRow = { squad_id: string; training_group_id: string };
type SquadRow = {
  id: string;
  tournament_id: string;
  name: string;
  squad_kind: string;
  program: "selectivo" | "futbol_para_todos";
  category_label: string;
  coach_assignment_mode: "inherited" | "manual";
  status: string;
};
type DirectSquadCoachRow = { squad_id: string };
type SourceGroupRow = NonNullable<LinkRow["training_groups"]>;
type SquadMemberRow = {
  squad_id: string;
  enrollment_id: string;
  enrollments: {
    player_id: string;
    players: { first_name: string; last_name: string } | null;
  } | null;
};

function validMonday(value: string | undefined) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value ?? "")) return null;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isNaN(date.valueOf()) || date.getUTCDay() !== 1 ? null : value!;
}

function categoryLabel(group: NonNullable<LinkRow["training_groups"]>) {
  if (group.birth_year_min && group.birth_year_max) {
    return group.birth_year_min === group.birth_year_max
      ? String(group.birth_year_min)
      : `${group.birth_year_min}/${group.birth_year_max}`;
  }
  return group.name;
}

export async function getCoachSchedulePageData(week?: string): Promise<CoachSchedulePageData | null> {
  const context = await getPermissionContext();
  if (!context?.hasCoachScheduleAccess || !context.coachId) return null;
  const selectedWeekStart = validMonday(week) ?? getMonterreyWeekStart();
  const admin = createAdminClient();
  const [coachResult, linksResult, directSquadCoachResult] = await Promise.all([
    admin.from("coaches").select("id, first_name, last_name").eq("id", context.coachId).eq("is_active", true).maybeSingle<{ id: string; first_name: string | null; last_name: string | null }>(),
    admin
      .from("training_group_coaches")
      .select("training_group_id, training_groups(id, campus_id, name, program, birth_year_min, birth_year_max, status, campuses(name))")
      .eq("coach_id", context.coachId)
      .returns<LinkRow[]>(),
    admin
      .from("competition_roster_squad_coaches")
      .select("squad_id")
      .eq("coach_id", context.coachId)
      .returns<DirectSquadCoachRow[]>(),
  ]);
  if (coachResult.error) throw coachResult.error;
  if (linksResult.error) throw linksResult.error;
  if (directSquadCoachResult.error) throw directSquadCoachResult.error;
  if (!coachResult.data) return null;

  const links = (linksResult.data ?? []).filter((link) =>
    link.training_groups?.status === "active"
    && (link.training_groups.program === "selectivo" || link.training_groups.program === "futbol_para_todos"),
  );
  const groupIds = links.map((link) => link.training_group_id);
  const campusIds = [...new Set(links.map((link) => link.training_groups!.campus_id))];
  const today = getMonterreyDateString();
  const tournamentsResult = campusIds.length
    ? await admin
        .from("tournaments")
        .select("id, campus_id, name, products(name)")
        .in("campus_id", campusIds)
        .eq("is_active", true)
        .or(`end_date.is.null,end_date.gte.${today}`)
        .order("name")
    : { data: [], error: null };
  if (tournamentsResult.error) throw tournamentsResult.error;
  const activeTournamentIds = new Set((tournamentsResult.data ?? []).map((row: any) => row.id as string));

  const squadGroupsResult = groupIds.length
    ? await admin
        .from("competition_roster_squad_groups")
        .select("squad_id, training_group_id")
        .in("training_group_id", groupIds)
        .returns<SquadGroupRow[]>()
    : { data: [] as SquadGroupRow[], error: null };
  if (squadGroupsResult.error) throw squadGroupsResult.error;
  const inheritedCandidateIds = [...new Set((squadGroupsResult.data ?? []).map((row) => row.squad_id))];
  const directCandidateIds = (directSquadCoachResult.data ?? []).map((row) => row.squad_id);
  const candidateSquadIds = [...new Set([...inheritedCandidateIds, ...directCandidateIds])];
  const directSquadGroupsResult = directCandidateIds.length
    ? await admin
        .from("competition_roster_squad_groups")
        .select("squad_id, training_group_id")
        .in("squad_id", directCandidateIds)
        .returns<SquadGroupRow[]>()
    : { data: [] as SquadGroupRow[], error: null };
  if (directSquadGroupsResult.error) throw directSquadGroupsResult.error;
  const allSquadGroupLinks = [...(squadGroupsResult.data ?? [])];
  for (const row of directSquadGroupsResult.data ?? []) {
    if (!allSquadGroupLinks.some((existing) => existing.squad_id === row.squad_id && existing.training_group_id === row.training_group_id)) {
      allSquadGroupLinks.push(row);
    }
  }
  const allSourceGroupIds = [...new Set(allSquadGroupLinks.map((row) => row.training_group_id))];
  const sourceGroupsResult = allSourceGroupIds.length
    ? await admin
        .from("training_groups")
        .select("id, campus_id, name, program, birth_year_min, birth_year_max, status, campuses(name)")
        .in("id", allSourceGroupIds)
        .returns<SourceGroupRow[]>()
    : { data: [] as SourceGroupRow[], error: null };
  if (sourceGroupsResult.error) throw sourceGroupsResult.error;
  const sourceGroupById = new Map((sourceGroupsResult.data ?? []).map((group) => [group.id, group]));
  const squadsResult = candidateSquadIds.length && activeTournamentIds.size > 0
    ? await admin
        .from("competition_roster_squads")
        .select("id, tournament_id, name, squad_kind, program, category_label, coach_assignment_mode, status")
        .in("id", candidateSquadIds)
        .in("tournament_id", [...activeTournamentIds])
        .neq("status", "archived")
        .order("sort_order")
        .order("name")
        .returns<SquadRow[]>()
    : { data: [] as SquadRow[], error: null };
  if (squadsResult.error) throw squadsResult.error;
  const directSquadIds = new Set(directCandidateIds);
  const linkedGroupIds = new Set(groupIds);
  const eligibleSquads = (squadsResult.data ?? []).filter((squad) =>
    squad.coach_assignment_mode === "manual"
      ? directSquadIds.has(squad.id)
      : allSquadGroupLinks.some((row) => row.squad_id === squad.id && linkedGroupIds.has(row.training_group_id)),
  );
  const activeSquadIds = eligibleSquads.map((squad) => squad.id);

  const reportsResult = activeSquadIds.length
    ? await admin
        .from("coach_weekly_schedule_reports")
        .select("id, coach_id, training_group_id, competition_roster_squad_id, tournament_id, is_rest, notes, updated_at")
        .eq("week_start", selectedWeekStart)
        .in("competition_roster_squad_id", activeSquadIds)
        .returns<ReportRow[]>()
    : { data: [] as ReportRow[], error: null };
  if (reportsResult.error) throw reportsResult.error;
  const reportIds = (reportsResult.data ?? []).map((report) => report.id);
  const gamesResult = reportIds.length
    ? await admin.from("coach_weekly_schedule_games").select("id, report_id, competition_roster_squad_id, match_date, arrival_time, venue, opponent, sort_order").in("report_id", reportIds).order("sort_order").returns<GameRow[]>()
    : { data: [] as GameRow[], error: null };
  if (gamesResult.error) throw gamesResult.error;

  const gameIds = (gamesResult.data ?? []).map((game) => game.id);
  const gamePlayersResult = gameIds.length
    ? await admin
        .from("coach_weekly_schedule_game_players")
        .select("game_id, enrollment_id, player_id, player_name_snapshot, roster_status")
        .in("game_id", gameIds)
        .order("player_name_snapshot")
        .returns<GamePlayerRow[]>()
    : { data: [] as GamePlayerRow[], error: null };
  if (gamePlayersResult.error) throw gamePlayersResult.error;

  const squadMembers: SquadMemberRow[] = [];
  if (activeSquadIds.length) {
    const pageSize = 1000;
    for (let offset = 0; ; offset += pageSize) {
      const page = await admin
        .from("competition_roster_squad_members")
        .select("squad_id, enrollment_id, enrollments!inner(player_id, players!inner(first_name, last_name))")
        .in("squad_id", activeSquadIds)
        .order("enrollment_id")
        .range(offset, offset + pageSize - 1)
        .returns<SquadMemberRow[]>();
      if (page.error) throw page.error;
      squadMembers.push(...(page.data ?? []));
      if ((page.data?.length ?? 0) < pageSize) break;
    }
  }

  const reportsBySquad = new Map((reportsResult.data ?? []).flatMap((report) => report.competition_roster_squad_id ? [[report.competition_roster_squad_id, report] as const] : []));
  const gamesByReport = new Map<string, GameRow[]>();
  for (const game of gamesResult.data ?? []) {
    const current = gamesByReport.get(game.report_id) ?? [];
    current.push(game);
    gamesByReport.set(game.report_id, current);
  }
  const gamePlayersByGame = new Map<string, GamePlayerRow[]>();
  for (const player of gamePlayersResult.data ?? []) {
    const current = gamePlayersByGame.get(player.game_id) ?? [];
    current.push(player);
    gamePlayersByGame.set(player.game_id, current);
  }
  const membersBySquad = new Map<string, CoachScheduleSquad["players"]>();
  for (const member of squadMembers) {
    if (!member.enrollments?.players) continue;
    const current = membersBySquad.get(member.squad_id) ?? [];
    current.push({
      enrollmentId: member.enrollment_id,
      playerId: member.enrollments.player_id,
      playerName: `${member.enrollments.players.first_name} ${member.enrollments.players.last_name}`.trim(),
    });
    membersBySquad.set(member.squad_id, current);
  }
  for (const players of membersBySquad.values()) {
    players.sort((a, b) => a.playerName.localeCompare(b.playerName, "es-MX"));
  }
  const squadById = new Map(eligibleSquads.map((squad) => [squad.id, squad]));
  const squadIdsByGroup = new Map<string, string[]>();
  for (const link of allSquadGroupLinks) {
    if (!squadById.has(link.squad_id)) continue;
    const current = squadIdsByGroup.get(link.training_group_id) ?? [];
    current.push(link.squad_id);
    squadIdsByGroup.set(link.training_group_id, current);
  }

  return {
    coachId: context.coachId,
    coachName: [coachResult.data.first_name, coachResult.data.last_name].filter(Boolean).join(" ") || "Coach",
    selectedWeekStart,
    tournaments: (tournamentsResult.data ?? []).map((row: any) => ({
      id: row.id,
      campusId: row.campus_id,
      name: row.name || row.products?.name || "Torneo",
    })),
    groups: eligibleSquads
      .flatMap((squad): CoachScheduleGroup[] => {
        const sourceLinks = allSquadGroupLinks.filter((row) => row.squad_id === squad.id);
        const sourceGroups = sourceLinks
          .map((row) => sourceGroupById.get(row.training_group_id))
          .filter((group): group is SourceGroupRow => Boolean(group));
        const anchorGroup = sourceGroups[0] ?? links.find((link) => link.training_groups?.campus_id === (tournamentsResult.data ?? []).find((tournament: any) => tournament.id === squad.tournament_id)?.campus_id)?.training_groups;
        if (!anchorGroup) return [];
        const report = reportsBySquad.get(squad.id);
        const squads: CoachScheduleSquad[] = [{
          id: squad.id,
          tournamentId: squad.tournament_id,
          name: formatCampusCompetitionTeamName(
            anchorGroup.campuses?.name,
            formatCompetitionSquadDisplay({
              name: squad.name,
              program: squad.program,
              categoryLabel: squad.category_label,
              kind: squad.squad_kind,
              sourceGroupCount: sourceGroups.length,
            }).title,
          ),
          players: membersBySquad.get(squad.id) ?? [],
        }];
        const display = formatCompetitionSquadDisplay({
          name: squad.name,
          program: squad.program,
          categoryLabel: squad.category_label || categoryLabel(anchorGroup),
          kind: squad.squad_kind,
          sourceGroupCount: sourceGroups.length,
        });
        return [{
          id: squad.id,
          coachId: context.coachId,
          trainingGroupId: anchorGroup.id,
          squadId: squad.id,
          campusId: anchorGroup.campus_id,
          campusName: anchorGroup.campuses?.name ?? "Campus",
          name: formatCampusCompetitionTeamName(anchorGroup.campuses?.name, display.title),
          program: squad.program,
          categoryLabel: display.categoryLabel,
          sourceGroupNames: sourceGroups.map((group) => formatTournamentGroupCardDisplay({
            name: group.name,
            program: group.program,
            birthYearMin: group.birth_year_min,
            birthYearMax: group.birth_year_max,
          }).title),
          squads,
          report: report
            ? {
                id: report.id,
                tournamentId: report.tournament_id,
                isRest: report.is_rest,
                notes: report.notes ?? "",
                updatedAt: report.updated_at,
                games: (gamesByReport.get(report.id) ?? []).map((game) => {
                  const fallbackSquad = squads.find((squad) => squad.tournamentId === report.tournament_id);
                  const squadId = game.competition_roster_squad_id ?? fallbackSquad?.id ?? "";
                  const savedPlayers = gamePlayersByGame.get(game.id) ?? [];
                  const savedStatusByEnrollment = new Map(savedPlayers.map((player) => [player.enrollment_id, player.roster_status]));
                  const players = (membersBySquad.get(squadId) ?? []).map((player) => ({
                    ...player,
                    rosterStatus: savedStatusByEnrollment.get(player.enrollmentId) ?? "included" as const,
                  }));
                  return {
                    id: game.id,
                    matchDate: game.match_date,
                    arrivalTime: game.arrival_time.slice(0, 5),
                    venue: game.venue,
                    opponent: game.opponent,
                    squadId,
                    players,
                  };
                }),
              }
            : null,
        }];
      })
      .sort((a, b) => a.campusName.localeCompare(b.campusName, "es") || b.categoryLabel.localeCompare(a.categoryLabel, "es") || a.name.localeCompare(b.name, "es")),
  };
}

export async function getAdminScheduleDetailData(
  foundation: WeeklyCallupsFoundationData,
  campusId: string,
  program: WeeklyCallupProgram,
): Promise<AdminScheduleDetailData | null> {
  const context = await getPermissionContext();
  if (!context?.isSportsDirector || !context.campusAccess?.campusIds.includes(campusId)) return null;

  const units = foundation.scheduleUnits.filter((unit) => unit.campusId === campusId && unit.program === program);
  const squadIds = units.map((unit) => unit.squadId);
  const admin = createAdminClient();
  const reportsResult = squadIds.length
    ? await admin
        .from("coach_weekly_schedule_reports")
        .select("id, coach_id, training_group_id, competition_roster_squad_id, tournament_id, is_rest, notes, updated_at")
        .eq("week_start", foundation.currentWeekStart)
        .in("competition_roster_squad_id", squadIds)
        .returns<ReportRow[]>()
    : { data: [] as ReportRow[], error: null };
  if (reportsResult.error) throw reportsResult.error;

  const reportIds = (reportsResult.data ?? []).map((report) => report.id);
  const gamesResult = reportIds.length
    ? await admin
        .from("coach_weekly_schedule_games")
        .select("id, report_id, competition_roster_squad_id, match_date, arrival_time, venue, opponent, sort_order")
        .in("report_id", reportIds)
        .order("sort_order")
        .returns<GameRow[]>()
    : { data: [] as GameRow[], error: null };
  if (gamesResult.error) throw gamesResult.error;

  const gameIds = (gamesResult.data ?? []).map((game) => game.id);
  const gamePlayersResult = gameIds.length
    ? await admin
        .from("coach_weekly_schedule_game_players")
        .select("game_id, enrollment_id, player_id, player_name_snapshot, roster_status")
        .in("game_id", gameIds)
        .order("player_name_snapshot")
        .returns<GamePlayerRow[]>()
    : { data: [] as GamePlayerRow[], error: null };
  if (gamePlayersResult.error) throw gamePlayersResult.error;

  const squadMembers: SquadMemberRow[] = [];
  if (squadIds.length) {
    const pageSize = 1000;
    for (let offset = 0; ; offset += pageSize) {
      const page = await admin
        .from("competition_roster_squad_members")
        .select("squad_id, enrollment_id, enrollments!inner(player_id, players!inner(first_name, last_name))")
        .in("squad_id", squadIds)
        .order("enrollment_id")
        .range(offset, offset + pageSize - 1)
        .returns<SquadMemberRow[]>();
      if (page.error) throw page.error;
      squadMembers.push(...(page.data ?? []));
      if ((page.data?.length ?? 0) < pageSize) break;
    }
  }

  const reportsBySquad = new Map((reportsResult.data ?? []).flatMap((report) =>
    report.competition_roster_squad_id ? [[report.competition_roster_squad_id, report] as const] : [],
  ));
  const gamesByReport = new Map<string, GameRow[]>();
  for (const game of gamesResult.data ?? []) {
    const rows = gamesByReport.get(game.report_id) ?? [];
    rows.push(game);
    gamesByReport.set(game.report_id, rows);
  }
  const gamePlayersByGame = new Map<string, GamePlayerRow[]>();
  for (const player of gamePlayersResult.data ?? []) {
    const rows = gamePlayersByGame.get(player.game_id) ?? [];
    rows.push(player);
    gamePlayersByGame.set(player.game_id, rows);
  }
  const membersBySquad = new Map<string, CoachScheduleSquad["players"]>();
  for (const member of squadMembers) {
    if (!member.enrollments?.players) continue;
    const rows = membersBySquad.get(member.squad_id) ?? [];
    rows.push({
      enrollmentId: member.enrollment_id,
      playerId: member.enrollments.player_id,
      playerName: `${member.enrollments.players.first_name} ${member.enrollments.players.last_name}`.trim(),
    });
    membersBySquad.set(member.squad_id, rows);
  }
  for (const players of membersBySquad.values()) {
    players.sort((a, b) => a.playerName.localeCompare(b.playerName, "es-MX"));
  }

  return {
    campusName: foundation.campuses.find((campus) => campus.id === campusId)?.name ?? "Campus",
    program,
    selectedWeekStart: foundation.currentWeekStart,
    tournaments: foundation.tournaments.map((tournament) => ({
      id: tournament.id,
      campusId: tournament.campusId,
      name: tournament.name,
    })),
    groups: units.map((unit): CoachScheduleGroup => {
      const report = reportsBySquad.get(unit.squadId);
      const squad: CoachScheduleSquad = {
        id: unit.squadId,
        tournamentId: unit.fixedTournamentId,
        name: unit.name,
        players: membersBySquad.get(unit.squadId) ?? [],
      };
      return {
        id: unit.id,
        coachId: unit.primaryCoachId ?? report?.coach_id ?? null,
        trainingGroupId: unit.trainingGroupId,
        squadId: unit.squadId,
        campusId: unit.campusId,
        campusName: foundation.campuses.find((campus) => campus.id === unit.campusId)?.name ?? "Campus",
        name: unit.name,
        program: unit.program,
        categoryLabel: unit.categoryLabel,
        sourceGroupNames: unit.sourceGroupNames,
        squads: [squad],
        report: report
          ? {
              id: report.id,
              tournamentId: report.tournament_id,
              isRest: report.is_rest,
              notes: report.notes ?? "",
              updatedAt: report.updated_at,
              games: (gamesByReport.get(report.id) ?? []).map((game) => {
                const savedPlayers = gamePlayersByGame.get(game.id) ?? [];
                const savedStatusByEnrollment = new Map(savedPlayers.map((player) => [player.enrollment_id, player.roster_status]));
                return {
                  id: game.id,
                  matchDate: game.match_date,
                  arrivalTime: game.arrival_time.slice(0, 5),
                  venue: game.venue,
                  opponent: game.opponent,
                  squadId: game.competition_roster_squad_id ?? unit.squadId,
                  players: squad.players.map((player) => ({
                    ...player,
                    rosterStatus: savedStatusByEnrollment.get(player.enrollmentId) ?? "included" as const,
                  })),
                };
              }),
            }
          : null,
      };
    }),
  };
}
