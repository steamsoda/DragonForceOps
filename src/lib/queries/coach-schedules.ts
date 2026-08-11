import { getPermissionContext } from "@/lib/auth/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMonterreyWeekStart } from "@/lib/queries/weekly-callups";

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
  campusId: string;
  campusName: string;
  name: string;
  program: "selectivo" | "futbol_para_todos";
  categoryLabel: string;
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
  training_group_id: string;
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
  status: string;
};
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
  const [coachResult, linksResult] = await Promise.all([
    admin.from("coaches").select("id, first_name, last_name").eq("id", context.coachId).eq("is_active", true).maybeSingle<{ id: string; first_name: string | null; last_name: string | null }>(),
    admin
      .from("training_group_coaches")
      .select("training_group_id, training_groups(id, campus_id, name, program, birth_year_min, birth_year_max, status, campuses(name))")
      .eq("coach_id", context.coachId)
      .returns<LinkRow[]>(),
  ]);
  if (coachResult.error) throw coachResult.error;
  if (linksResult.error) throw linksResult.error;
  if (!coachResult.data) return null;

  const links = (linksResult.data ?? []).filter((link) =>
    link.training_groups?.status === "active"
    && (link.training_groups.program === "selectivo" || link.training_groups.program === "futbol_para_todos"),
  );
  const groupIds = links.map((link) => link.training_group_id);
  const campusIds = [...new Set(links.map((link) => link.training_groups!.campus_id))];
  const [tournamentsResult, reportsResult] = await Promise.all([
    campusIds.length
      ? admin.from("tournaments").select("id, campus_id, name, products(name)").in("campus_id", campusIds).eq("is_active", true).order("name")
      : Promise.resolve({ data: [], error: null }),
    groupIds.length
      ? admin.from("coach_weekly_schedule_reports").select("id, training_group_id, tournament_id, is_rest, notes, updated_at").eq("week_start", selectedWeekStart).in("training_group_id", groupIds).returns<ReportRow[]>()
      : Promise.resolve({ data: [] as ReportRow[], error: null }),
  ]);
  if (tournamentsResult.error) throw tournamentsResult.error;
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

  const squadGroupsResult = groupIds.length
    ? await admin
        .from("competition_roster_squad_groups")
        .select("squad_id, training_group_id")
        .in("training_group_id", groupIds)
        .returns<SquadGroupRow[]>()
    : { data: [] as SquadGroupRow[], error: null };
  if (squadGroupsResult.error) throw squadGroupsResult.error;
  const squadIds = [...new Set((squadGroupsResult.data ?? []).map((row) => row.squad_id))];
  const squadsResult = squadIds.length
    ? await admin
        .from("competition_roster_squads")
        .select("id, tournament_id, name, status")
        .in("id", squadIds)
        .neq("status", "archived")
        .order("sort_order")
        .order("name")
        .returns<SquadRow[]>()
    : { data: [] as SquadRow[], error: null };
  if (squadsResult.error) throw squadsResult.error;

  const activeSquadIds = (squadsResult.data ?? []).map((squad) => squad.id);
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

  const reportsByGroup = new Map((reportsResult.data ?? []).map((report) => [report.training_group_id, report]));
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
  const squadById = new Map((squadsResult.data ?? []).map((squad) => [squad.id, squad]));
  const squadIdsByGroup = new Map<string, string[]>();
  for (const link of squadGroupsResult.data ?? []) {
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
    groups: links
      .map((link) => {
        const group = link.training_groups!;
        const report = reportsByGroup.get(group.id);
        const squads: CoachScheduleSquad[] = (squadIdsByGroup.get(group.id) ?? [])
          .map((squadId) => squadById.get(squadId))
          .filter((squad): squad is SquadRow => Boolean(squad))
          .map((squad) => ({
            id: squad.id,
            tournamentId: squad.tournament_id,
            name: squad.name,
            players: membersBySquad.get(squad.id) ?? [],
          }));
        return {
          id: group.id,
          campusId: group.campus_id,
          campusName: group.campuses?.name ?? "Campus",
          name: group.name,
          program: group.program as CoachScheduleGroup["program"],
          categoryLabel: categoryLabel(group),
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
                  const players = savedPlayers.length
                    ? savedPlayers.map((player) => ({
                        enrollmentId: player.enrollment_id,
                        playerId: player.player_id,
                        playerName: player.player_name_snapshot,
                        rosterStatus: player.roster_status,
                      }))
                    : (membersBySquad.get(squadId) ?? []).map((player) => ({ ...player, rosterStatus: "included" as const }));
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
        };
      })
      .sort((a, b) => a.campusName.localeCompare(b.campusName, "es") || b.categoryLabel.localeCompare(a.categoryLabel, "es") || a.name.localeCompare(b.name, "es")),
  };
}
