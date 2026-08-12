import { getPermissionContext } from "@/lib/auth/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  formatCampusCompetitionTeamName,
  formatCompetitionSquadDisplay,
  formatTournamentGroupCardDisplay,
} from "@/lib/training-groups/shared";
import { getWeeklyCallupLivePaidRoster } from "@/lib/weekly-callups/live-roster";
import { getMonterreyDateString } from "@/lib/time";

export type WeeklyCallupProgram = "selectivo" | "futbol_para_todos";

export type WeeklyCallupTournamentOption = {
  id: string;
  campusId: string;
  productId: string;
  name: string;
  startDate: string | null;
  endDate: string | null;
  signupDeadline: string | null;
};

export type WeeklyCallupListRow = {
  id: string;
  campusId: string;
  campusName: string;
  tournamentName: string;
  program: WeeklyCallupProgram;
  weekStart: string;
  status: "draft" | "ready" | "shared";
  snapshotAt: string;
  categoryCount: number;
  playerCount: number;
};

export type WeeklyCallupsFoundationData = {
  campuses: Array<{ id: string; name: string }>;
  defaultCampusId: string;
  currentWeekStart: string;
  tournaments: WeeklyCallupTournamentOption[];
  groups: Array<{
    id: string;
    campusId: string;
    name: string;
    program: WeeklyCallupProgram;
    categoryLabel: string;
    primaryCoachName: string;
    auxiliaryCoachNames: string[];
  }>;
  scheduleUnits: Array<{
    id: string;
    trainingGroupId: string;
    squadId: string;
    fixedTournamentId: string;
    campusId: string;
    name: string;
    program: WeeklyCallupProgram;
    categoryLabel: string;
    sourceGroupNames: string[];
    primaryCoachId: string | null;
    primaryCoachName: string;
    auxiliaryCoachNames: string[];
  }>;
  canDeleteCallups: boolean;
  coachScheduleDefaults: Record<string, {
    tournamentId: string;
    isRest: boolean;
    notes: string;
    coachName: string;
    updatedAt: string;
    games: Array<{ id: string; squadId: string | null; matchDate: string; arrivalTime: string; venue: string; opponent: string }>;
  }>;
  callups: WeeklyCallupListRow[];
};

export type WeeklyCallupDetailGame = {
  id: string;
  matchDate: string;
  arrivalTime: string;
  venue: string;
  opponent: string;
  sortOrder: number;
  players: Array<{
    enrollmentId: string;
    playerId: string;
    playerName: string;
    rosterStatus: "included" | "excluded";
  }>;
};

export type WeeklyCallupDetailPlayer = {
  id: string;
  enrollmentId: string;
  playerId: string;
  playerName: string;
  birthYear: number | null;
  trainingGroupId: string | null;
  eligibilitySource: "direct" | "bundle" | "manual_unpaid";
  rosterStatus: "included" | "excluded";
  manualReason: string | null;
};

export type WeeklyCallupRosterDiffPlayer = {
  enrollmentId: string;
  playerName: string;
  categoryLabel: string;
};

export type WeeklyCallupRosterMove = WeeklyCallupRosterDiffPlayer & {
  previousCategoryLabel: string;
};

export type WeeklyCallupRosterComparison = {
  currentPaidCount: number;
  added: WeeklyCallupRosterDiffPlayer[];
  removed: WeeklyCallupRosterDiffPlayer[];
  moved: WeeklyCallupRosterMove[];
};

export type WeeklyCallupManualCandidate = {
  enrollmentId: string;
  playerId: string;
  playerName: string;
  birthYear: number | null;
  trainingGroupId: string;
  trainingGroupName: string;
  categoryLabel: string;
};

export type WeeklyCallupDetailCategory = {
  id: string;
  categoryLabel: string;
  trainingGroupName: string;
  tournamentName: string;
  coachNames: string;
  sortOrder: number;
  isRest: boolean;
  games: WeeklyCallupDetailGame[];
  players: WeeklyCallupDetailPlayer[];
};

export type WeeklyCallupDetailData = {
  id: string;
  campusName: string;
  tournamentName: string;
  program: WeeklyCallupProgram;
  weekStart: string;
  weekEnd: string;
  status: "draft" | "ready" | "shared";
  snapshotAt: string;
  canDeleteCallup: boolean;
  canManageExceptions: boolean;
  usesApprovedSquadSnapshot: boolean;
  rosterComparison: WeeklyCallupRosterComparison | null;
  manualCandidates: WeeklyCallupManualCandidate[];
  categories: WeeklyCallupDetailCategory[];
};

type TournamentRow = {
  id: string;
  campus_id: string;
  product_id: string;
  name: string;
  start_date: string | null;
  end_date: string | null;
  signup_deadline: string | null;
  products: { name: string | null } | null;
};

type CallupRow = {
  id: string;
  campus_id: string;
  tournament_id: string;
  program: WeeklyCallupProgram;
  week_start: string;
  status: "draft" | "ready" | "shared";
  roster_snapshot_at: string;
  tournaments: { name: string | null } | null;
};

type CategoryRow = { id: string; weekly_callup_id: string; tournament_name_snapshot: string | null };
type PlayerRow = { weekly_callup_category_id: string };

type DetailCallupRow = Omit<CallupRow, "tournaments"> & {
  competition_roster_snapshot_id: string | null;
  tournaments: { name: string | null; product_id: string } | null;
};

type DetailCategoryRow = {
  id: string;
  weekly_callup_id: string;
  category_label: string;
  training_group_name_snapshot: string;
  tournament_name_snapshot: string | null;
  coach_names_snapshot: string | null;
  sort_order: number;
  is_rest: boolean;
};

type ComposerGroupRow = {
  id: string;
  campus_id: string;
  name: string;
  program: WeeklyCallupProgram;
  birth_year_min: number | null;
  birth_year_max: number | null;
};

type ComposerCoachRow = {
  training_group_id: string;
  is_primary: boolean;
  coaches: { id: string; first_name: string | null; last_name: string | null } | null;
};

type CoachScheduleReportRow = {
  id: string;
  training_group_id: string;
  competition_roster_squad_id: string | null;
  tournament_id: string;
  is_rest: boolean;
  notes: string | null;
  updated_at: string;
  coaches: { first_name: string | null; last_name: string | null } | null;
};

type FoundationSquadRow = {
  id: string;
  tournament_id: string;
  name: string;
  squad_kind: string;
  program: WeeklyCallupProgram;
  category_label: string;
  coach_assignment_mode: "inherited" | "manual";
  status: string;
};

type FoundationSquadGroupRow = { squad_id: string; training_group_id: string };
type FoundationSquadCoachRow = {
  squad_id: string;
  is_primary: boolean;
  coaches: { id: string; first_name: string | null; last_name: string | null } | null;
};

type CoachScheduleGameRow = {
  id: string;
  report_id: string;
  competition_roster_squad_id: string | null;
  match_date: string;
  arrival_time: string;
  venue: string;
  opponent: string;
  sort_order: number;
};

type DetailPlayerRow = {
  id: string;
  weekly_callup_category_id: string;
  enrollment_id: string;
  player_id: string;
  player_name_snapshot: string;
  birth_year: number | null;
  training_group_id: string | null;
  eligibility_source: "direct" | "bundle" | "manual_unpaid";
  roster_status: "included" | "excluded";
  manual_reason: string | null;
};

type DetailGameRow = {
  id: string;
  weekly_callup_category_id: string;
  match_date: string;
  arrival_time: string | null;
  venue: string | null;
  opponent: string | null;
  sort_order: number;
};

type DetailGamePlayerRow = {
  weekly_callup_game_id: string;
  enrollment_id: string;
  player_id: string;
  player_name_snapshot: string;
  roster_status: "included" | "excluded";
};

type ManualCandidateAssignmentRow = {
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
  enrollments: {
    id: string;
    campus_id: string;
    status: string;
    players: {
      id: string;
      first_name: string;
      last_name: string;
      birth_date: string | null;
      status: string;
    } | null;
  } | null;
};

function getBirthYear(value: string | null | undefined) {
  if (!value) return null;
  const year = Number(value.slice(0, 4));
  return Number.isInteger(year) ? year : null;
}

function detailCategoryLabel(group: NonNullable<ManualCandidateAssignmentRow["training_groups"]>) {
  if (group.birth_year_min && group.birth_year_max) {
    return group.birth_year_min === group.birth_year_max
      ? String(group.birth_year_min)
      : `${group.birth_year_min}/${group.birth_year_max}`;
  }
  return group.name;
}

export function getMonterreyWeekStart(now = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Monterrey",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(now).map((part) => [part.type, part.value]),
  );
  const localDate = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)));
  const isoDay = localDate.getUTCDay() || 7;
  localDate.setUTCDate(localDate.getUTCDate() - isoDay + 1);
  return localDate.toISOString().slice(0, 10);
}

function validMonday(value: string | undefined) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value ?? "")) return null;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isNaN(date.valueOf()) || date.getUTCDay() !== 1 ? null : value!;
}

export async function getWeeklyCallupsFoundationData(week?: string): Promise<WeeklyCallupsFoundationData | null> {
  const context = await getPermissionContext();
  if (!context || (!context.hasOperationalAccess && !context.hasSportsAccess)) return null;

  const campusAccess = context.campusAccess;
  if (!campusAccess || campusAccess.campusIds.length === 0) return null;

  const admin = createAdminClient();
  const today = getMonterreyDateString();
  const [tournamentsResult, callupsResult, groupsResult, coachesResult] = await Promise.all([
    admin
      .from("tournaments")
      .select("id, campus_id, product_id, name, start_date, end_date, signup_deadline, products(name)")
      .in("campus_id", campusAccess.campusIds)
      .eq("is_active", true)
      .or(`end_date.is.null,end_date.gte.${today}`)
      .order("start_date", { ascending: true, nullsFirst: false })
      .returns<TournamentRow[]>(),
    admin
      .from("weekly_callups")
      .select("id, campus_id, tournament_id, program, week_start, status, roster_snapshot_at, tournaments(name)")
      .in("campus_id", campusAccess.campusIds)
      .order("week_start", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(30)
      .returns<CallupRow[]>(),
    admin
      .from("training_groups")
      .select("id, campus_id, name, program, birth_year_min, birth_year_max")
      .in("campus_id", campusAccess.campusIds)
      .eq("status", "active")
      .in("program", ["selectivo", "futbol_para_todos"])
      .order("birth_year_max", { ascending: false, nullsFirst: false })
      .order("name")
      .returns<ComposerGroupRow[]>(),
    admin
      .from("training_group_coaches")
      .select("training_group_id, is_primary, coaches(id, first_name, last_name)")
      .returns<ComposerCoachRow[]>(),
  ]);

  if (tournamentsResult.error) throw tournamentsResult.error;
  if (callupsResult.error) throw callupsResult.error;
  if (groupsResult.error) throw groupsResult.error;
  if (coachesResult.error) throw coachesResult.error;

  const currentWeekStart = validMonday(week) ?? getMonterreyWeekStart();
  const groupIds = (groupsResult.data ?? []).map((group) => group.id);
  const tournamentIds = (tournamentsResult.data ?? []).map((tournament) => tournament.id);
  const squadsResult = tournamentIds.length
    ? await admin
        .from("competition_roster_squads")
        .select("id, tournament_id, name, squad_kind, program, category_label, coach_assignment_mode, status")
        .in("tournament_id", tournamentIds)
        .neq("status", "archived")
        .order("sort_order")
        .order("name")
        .returns<FoundationSquadRow[]>()
    : { data: [] as FoundationSquadRow[], error: null };
  if (squadsResult.error) throw squadsResult.error;
  const squadIds = (squadsResult.data ?? []).map((squad) => squad.id);
  const [squadGroupsResult, squadCoachesResult] = await Promise.all([
    squadIds.length
      ? admin.from("competition_roster_squad_groups").select("squad_id, training_group_id").in("squad_id", squadIds).returns<FoundationSquadGroupRow[]>()
      : Promise.resolve({ data: [] as FoundationSquadGroupRow[], error: null }),
    squadIds.length
      ? admin.from("competition_roster_squad_coaches").select("squad_id, is_primary, coaches(id, first_name, last_name)").in("squad_id", squadIds).returns<FoundationSquadCoachRow[]>()
      : Promise.resolve({ data: [] as FoundationSquadCoachRow[], error: null }),
  ]);
  if (squadGroupsResult.error) throw squadGroupsResult.error;
  if (squadCoachesResult.error) throw squadCoachesResult.error;

  const coachReportsResult = squadIds.length
    ? await admin
        .from("coach_weekly_schedule_reports")
        .select("id, training_group_id, competition_roster_squad_id, tournament_id, is_rest, notes, updated_at, coaches(first_name, last_name)")
        .eq("week_start", currentWeekStart)
        .in("competition_roster_squad_id", squadIds)
        .returns<CoachScheduleReportRow[]>()
    : { data: [] as CoachScheduleReportRow[], error: null };
  if (coachReportsResult.error) throw coachReportsResult.error;
  const coachReportIds = (coachReportsResult.data ?? []).map((report) => report.id);
  const coachGamesResult = coachReportIds.length
    ? await admin
        .from("coach_weekly_schedule_games")
        .select("id, report_id, competition_roster_squad_id, match_date, arrival_time, venue, opponent, sort_order")
        .in("report_id", coachReportIds)
        .order("sort_order")
        .returns<CoachScheduleGameRow[]>()
    : { data: [] as CoachScheduleGameRow[], error: null };
  if (coachGamesResult.error) throw coachGamesResult.error;

  const coachRowsByGroup = new Map<string, ComposerCoachRow[]>();
  for (const row of coachesResult.data ?? []) {
    const current = coachRowsByGroup.get(row.training_group_id) ?? [];
    current.push(row);
    coachRowsByGroup.set(row.training_group_id, current);
  }
  const directCoachRowsBySquad = new Map<string, FoundationSquadCoachRow[]>();
  for (const row of squadCoachesResult.data ?? []) {
    const current = directCoachRowsBySquad.get(row.squad_id) ?? [];
    current.push(row);
    directCoachRowsBySquad.set(row.squad_id, current);
  }
  const sourceGroupIdsBySquad = new Map<string, string[]>();
  for (const row of squadGroupsResult.data ?? []) {
    const current = sourceGroupIdsBySquad.get(row.squad_id) ?? [];
    current.push(row.training_group_id);
    sourceGroupIdsBySquad.set(row.squad_id, current);
  }
  const groupById = new Map((groupsResult.data ?? []).map((group) => [group.id, group]));

  const callupIds = (callupsResult.data ?? []).map((row) => row.id);
  const categoriesResult = callupIds.length
    ? await admin
        .from("weekly_callup_categories")
        .select("id, weekly_callup_id, tournament_name_snapshot")
        .in("weekly_callup_id", callupIds)
        .returns<CategoryRow[]>()
    : { data: [] as CategoryRow[], error: null };
  if (categoriesResult.error) throw categoriesResult.error;

  const categoryIds = (categoriesResult.data ?? []).map((row) => row.id);
  const playersResult = categoryIds.length
    ? await admin
        .from("weekly_callup_players")
        .select("weekly_callup_category_id")
        .in("weekly_callup_category_id", categoryIds)
        .eq("roster_status", "included")
        .returns<PlayerRow[]>()
    : { data: [] as PlayerRow[], error: null };
  if (playersResult.error) throw playersResult.error;

  const categoriesByCallup = new Map<string, CategoryRow[]>();
  for (const category of categoriesResult.data ?? []) {
    const current = categoriesByCallup.get(category.weekly_callup_id) ?? [];
    current.push(category);
    categoriesByCallup.set(category.weekly_callup_id, current);
  }
  const playerCountByCategory = new Map<string, number>();
  for (const player of playersResult.data ?? []) {
    playerCountByCategory.set(
      player.weekly_callup_category_id,
      (playerCountByCategory.get(player.weekly_callup_category_id) ?? 0) + 1,
    );
  }

  const campusNameById = new Map(campusAccess.campuses.map((campus) => [campus.id, campus.name]));

  return {
    campuses: campusAccess.campuses.map((campus) => ({ id: campus.id, name: campus.name })),
    defaultCampusId: campusAccess.defaultCampusId ?? campusAccess.campusIds[0],
    currentWeekStart,
    tournaments: (tournamentsResult.data ?? []).map((row) => ({
      id: row.id,
      campusId: row.campus_id,
      productId: row.product_id,
      name: row.name || row.products?.name || "Torneo",
      startDate: row.start_date,
      endDate: row.end_date,
      signupDeadline: row.signup_deadline,
    })),
    groups: (groupsResult.data ?? []).map((group) => {
      const coachRows = (coachRowsByGroup.get(group.id) ?? []).sort(
        (a, b) => Number(b.is_primary) - Number(a.is_primary),
      );
      const coach = coachRows[0]?.coaches;
      const coachName = (row: ComposerCoachRow) =>
        [row.coaches?.first_name, row.coaches?.last_name].filter(Boolean).join(" ");
      const display = formatTournamentGroupCardDisplay({
        name: group.name,
        program: group.program,
        birthYearMin: group.birth_year_min,
        birthYearMax: group.birth_year_max,
      });
      return {
        id: group.id,
        campusId: group.campus_id,
        name: display.title,
        program: group.program,
        categoryLabel: group.birth_year_min && group.birth_year_max
          ? group.birth_year_min === group.birth_year_max
            ? String(group.birth_year_min)
            : `${group.birth_year_min}/${group.birth_year_max}`
          : group.name,
        primaryCoachName: [coach?.first_name, coach?.last_name].filter(Boolean).join(" ") || "Sin profesor",
        auxiliaryCoachNames: coachRows.slice(1).map(coachName).filter(Boolean),
      };
    }),
    scheduleUnits: (squadsResult.data ?? []).flatMap((squad) => {
      const sourceGroupIds = sourceGroupIdsBySquad.get(squad.id) ?? [];
      const sourceGroups = sourceGroupIds.map((id) => groupById.get(id)).filter((group): group is ComposerGroupRow => Boolean(group));
      const anchorGroup = sourceGroups[0];
      if (!anchorGroup) return [];
      const inheritedCoachRows = sourceGroupIds.flatMap((id) => coachRowsByGroup.get(id) ?? []);
      const coachRows = (squad.coach_assignment_mode === "manual" ? directCoachRowsBySquad.get(squad.id) ?? [] : inheritedCoachRows).sort(
        (a, b) => Number(b.is_primary) - Number(a.is_primary),
      );
      const coach = coachRows[0]?.coaches;
      const coachName = (row: ComposerCoachRow | FoundationSquadCoachRow) =>
        [row.coaches?.first_name, row.coaches?.last_name].filter(Boolean).join(" ");
      const display = formatCompetitionSquadDisplay({
        name: squad.name,
        program: squad.program,
        categoryLabel: squad.category_label || undefined,
        kind: squad.squad_kind,
        sourceGroupCount: sourceGroups.length,
      });
      return [{
        id: squad.id,
        trainingGroupId: anchorGroup.id,
        squadId: squad.id,
        fixedTournamentId: squad.tournament_id,
        campusId: anchorGroup.campus_id,
        name: formatCampusCompetitionTeamName(
          campusNameById.get(anchorGroup.campus_id),
          display.title,
        ),
        program: squad.program,
        categoryLabel: display.categoryLabel,
        sourceGroupNames: sourceGroups.map((group) => formatTournamentGroupCardDisplay({
          name: group.name,
          program: group.program,
          birthYearMin: group.birth_year_min,
          birthYearMax: group.birth_year_max,
        }).title),
        primaryCoachId: coach?.id ?? null,
        primaryCoachName: [coach?.first_name, coach?.last_name].filter(Boolean).join(" ") || "Sin profesor",
        auxiliaryCoachNames: coachRows.slice(1).map(coachName).filter(Boolean),
      }];
    }),
    canDeleteCallups: context.isSportsDirector,
    coachScheduleDefaults: Object.fromEntries((coachReportsResult.data ?? []).flatMap((report) => {
      if (!report.competition_roster_squad_id) return [];
      const coach = report.coaches;
      return [[report.competition_roster_squad_id, {
        tournamentId: report.tournament_id,
        isRest: report.is_rest,
        notes: report.notes ?? "",
        coachName: [coach?.first_name, coach?.last_name].filter(Boolean).join(" ") || "Coach",
        updatedAt: report.updated_at,
        games: (coachGamesResult.data ?? [])
          .filter((game) => game.report_id === report.id)
          .map((game) => ({ id: game.id, squadId: game.competition_roster_squad_id, matchDate: game.match_date, arrivalTime: game.arrival_time.slice(0, 5), venue: game.venue, opponent: game.opponent })),
      }] as const];
    })),
    callups: (callupsResult.data ?? []).map((row) => {
      const categories = categoriesByCallup.get(row.id) ?? [];
      return {
        id: row.id,
        campusId: row.campus_id,
        campusName: campusNameById.get(row.campus_id) ?? "Campus",
        tournamentName: new Set(categories.map((category) => category.tournament_name_snapshot).filter(Boolean)).size > 1
          ? "Convocatoria mixta"
          : categories.find((category) => category.tournament_name_snapshot)?.tournament_name_snapshot ?? row.tournaments?.name ?? "Torneo",
        program: row.program,
        weekStart: row.week_start,
        status: row.status,
        snapshotAt: row.roster_snapshot_at,
        categoryCount: categories.length,
        playerCount: categories.reduce(
          (total, category) => total + (playerCountByCategory.get(category.id) ?? 0),
          0,
        ),
      };
    }),
  };
}

export async function getWeeklyCallupDetail(
  callupId: string,
  options: { includeComparison?: boolean; includeCandidates?: boolean } = {},
): Promise<WeeklyCallupDetailData | null> {
  const context = await getPermissionContext();
  if (!context || (!context.hasOperationalAccess && !context.hasSportsAccess)) return null;
  const campusAccess = context.campusAccess;
  if (!campusAccess || campusAccess.campusIds.length === 0) return null;

  const admin = createAdminClient();
  const callupResult = await admin
    .from("weekly_callups")
    .select("id, campus_id, tournament_id, program, week_start, status, roster_snapshot_at, competition_roster_snapshot_id, tournaments(name, product_id)")
    .eq("id", callupId)
    .maybeSingle<DetailCallupRow | null>();
  if (callupResult.error) throw callupResult.error;
  const callup = callupResult.data;
  if (!callup || !campusAccess.campusIds.includes(callup.campus_id)) return null;

  const categoriesResult = await admin
    .from("weekly_callup_categories")
    .select("id, weekly_callup_id, category_label, training_group_name_snapshot, tournament_name_snapshot, coach_names_snapshot, sort_order, is_rest")
    .eq("weekly_callup_id", callup.id)
    .order("sort_order")
    .order("category_label")
    .returns<DetailCategoryRow[]>();
  if (categoriesResult.error) throw categoriesResult.error;
  const categories = categoriesResult.data ?? [];
  const categoryIds = categories.map((category) => category.id);

  const players: DetailPlayerRow[] = [];
  if (categoryIds.length > 0) {
    const pageSize = 1000;
    for (let offset = 0; ; offset += pageSize) {
      const page = await admin
        .from("weekly_callup_players")
        .select("id, weekly_callup_category_id, enrollment_id, player_id, player_name_snapshot, birth_year, training_group_id, eligibility_source, roster_status, manual_reason")
        .in("weekly_callup_category_id", categoryIds)
        .order("player_name_snapshot")
        .range(offset, offset + pageSize - 1)
        .returns<DetailPlayerRow[]>();
      if (page.error) throw page.error;
      players.push(...(page.data ?? []));
      if ((page.data?.length ?? 0) < pageSize) break;
    }
  }

  const gamesResult = categoryIds.length
    ? await admin
        .from("weekly_callup_games")
        .select("id, weekly_callup_category_id, match_date, arrival_time, venue, opponent, sort_order")
        .in("weekly_callup_category_id", categoryIds)
        .order("match_date")
        .order("sort_order")
        .returns<DetailGameRow[]>()
    : { data: [] as DetailGameRow[], error: null };
  if (gamesResult.error) throw gamesResult.error;
  const gameIds = (gamesResult.data ?? []).map((game) => game.id);
  const gamePlayersResult = gameIds.length
    ? await admin
        .from("weekly_callup_game_players")
        .select("weekly_callup_game_id, enrollment_id, player_id, player_name_snapshot, roster_status")
        .in("weekly_callup_game_id", gameIds)
        .order("player_name_snapshot")
        .returns<DetailGamePlayerRow[]>()
    : { data: [] as DetailGamePlayerRow[], error: null };
  if (gamePlayersResult.error) throw gamePlayersResult.error;

  const playersByCategory = new Map<string, DetailPlayerRow[]>();
  for (const player of players) {
    const current = playersByCategory.get(player.weekly_callup_category_id) ?? [];
    current.push(player);
    playersByCategory.set(player.weekly_callup_category_id, current);
  }
  const gamesByCategory = new Map<string, DetailGameRow[]>();
  for (const game of gamesResult.data ?? []) {
    const current = gamesByCategory.get(game.weekly_callup_category_id) ?? [];
    current.push(game);
    gamesByCategory.set(game.weekly_callup_category_id, current);
  }
  const playersByGame = new Map<string, DetailGamePlayerRow[]>();
  for (const player of gamePlayersResult.data ?? []) {
    const current = playersByGame.get(player.weekly_callup_game_id) ?? [];
    current.push(player);
    playersByGame.set(player.weekly_callup_game_id, current);
  }

  const weekEndDate = new Date(`${callup.week_start}T12:00:00Z`);
  weekEndDate.setUTCDate(weekEndDate.getUTCDate() + 6);
  const campusName = campusAccess.campuses.find((campus) => campus.id === callup.campus_id)?.name ?? "Campus";
  const categoryTournamentNames = new Set(categories.map((category) => category.tournament_name_snapshot).filter(Boolean));
  const hasMixedTournaments = categoryTournamentNames.size > 1;
  const usesApprovedSquadSnapshot = Boolean(callup.competition_roster_snapshot_id);
  const shouldLoadLiveRoster = !hasMixedTournaments
    && !usesApprovedSquadSnapshot
    && (options.includeComparison || (options.includeCandidates && context.isSportsDirector));
  const livePaidRoster = shouldLoadLiveRoster && callup.tournaments?.product_id
    ? await getWeeklyCallupLivePaidRoster({
        campusId: callup.campus_id,
        tournamentProductId: callup.tournaments.product_id,
        program: callup.program,
      })
    : null;

  let rosterComparison: WeeklyCallupRosterComparison | null = null;
  if (options.includeComparison && livePaidRoster) {
    const categoryById = new Map(categories.map((category) => [category.id, category]));
    const frozenByEnrollment = new Map(players.map((player) => [player.enrollment_id, player]));
    const liveByEnrollment = new Map(livePaidRoster.map((player) => [player.enrollmentId, player]));
    rosterComparison = {
      currentPaidCount: livePaidRoster.length,
      added: livePaidRoster
        .filter((player) => !frozenByEnrollment.has(player.enrollmentId))
        .map((player) => ({
          enrollmentId: player.enrollmentId,
          playerName: player.playerName,
          categoryLabel: `${player.categoryLabel} - ${player.trainingGroupName}`,
        })),
      removed: players
        .filter((player) => player.eligibility_source !== "manual_unpaid" && !liveByEnrollment.has(player.enrollment_id))
        .map((player) => {
          const category = categoryById.get(player.weekly_callup_category_id);
          return {
            enrollmentId: player.enrollment_id,
            playerName: player.player_name_snapshot,
            categoryLabel: category ? `${category.category_label} - ${category.training_group_name_snapshot}` : "Sin categoria",
          };
        }),
      moved: livePaidRoster
        .filter((player) => {
          const frozen = frozenByEnrollment.get(player.enrollmentId);
          return Boolean(frozen && frozen.training_group_id !== player.trainingGroupId);
        })
        .map((player) => {
          const frozen = frozenByEnrollment.get(player.enrollmentId)!;
          const previousCategory = categoryById.get(frozen.weekly_callup_category_id);
          return {
            enrollmentId: player.enrollmentId,
            playerName: player.playerName,
            categoryLabel: `${player.categoryLabel} - ${player.trainingGroupName}`,
            previousCategoryLabel: previousCategory
              ? `${previousCategory.category_label} - ${previousCategory.training_group_name_snapshot}`
              : "Grupo anterior",
          };
        }),
    };
  }

  let manualCandidates: WeeklyCallupManualCandidate[] = [];
  if (options.includeCandidates && context.isSportsDirector && livePaidRoster) {
    const rows: ManualCandidateAssignmentRow[] = [];
    const pageSize = 1000;
    for (let offset = 0; ; offset += pageSize) {
      const page = await admin
        .from("training_group_assignments")
        .select("enrollment_id, player_id, training_group_id, training_groups!inner(id, campus_id, name, program, birth_year_min, birth_year_max, status), enrollments!inner(id, campus_id, status, players!inner(id, first_name, last_name, birth_date, status))")
        .is("end_date", null)
        .eq("training_groups.campus_id", callup.campus_id)
        .eq("training_groups.program", callup.program)
        .eq("training_groups.status", "active")
        .eq("enrollments.campus_id", callup.campus_id)
        .eq("enrollments.status", "active")
        .range(offset, offset + pageSize - 1)
        .returns<ManualCandidateAssignmentRow[]>();
      if (page.error) throw page.error;
      rows.push(...(page.data ?? []));
      if ((page.data?.length ?? 0) < pageSize) break;
    }
    const frozenEnrollmentIds = new Set(players.map((player) => player.enrollment_id));
    const paidEnrollmentIds = new Set(livePaidRoster.map((player) => player.enrollmentId));
    manualCandidates = rows
      .filter(
        (row) =>
          row.training_groups &&
          row.enrollments?.players?.status === "active" &&
          !frozenEnrollmentIds.has(row.enrollment_id) &&
          !paidEnrollmentIds.has(row.enrollment_id),
      )
      .map((row) => ({
        enrollmentId: row.enrollment_id,
        playerId: row.player_id,
        playerName: `${row.enrollments!.players!.first_name} ${row.enrollments!.players!.last_name}`.trim(),
        birthYear: getBirthYear(row.enrollments!.players!.birth_date),
        trainingGroupId: row.training_group_id,
        trainingGroupName: row.training_groups!.name,
        categoryLabel: detailCategoryLabel(row.training_groups!),
      }))
      .sort((a, b) => a.playerName.localeCompare(b.playerName, "es-MX"));
  }

  return {
    id: callup.id,
    campusName,
    tournamentName: callup.tournaments?.name ?? "Torneo",
    program: callup.program,
    weekStart: callup.week_start,
    weekEnd: weekEndDate.toISOString().slice(0, 10),
    status: callup.status,
    snapshotAt: callup.roster_snapshot_at,
    canDeleteCallup: context.isSportsDirector,
    canManageExceptions: context.isSportsDirector && !hasMixedTournaments && !usesApprovedSquadSnapshot,
    usesApprovedSquadSnapshot,
    rosterComparison,
    manualCandidates,
    categories: categories.map((category) => {
      const display = formatCompetitionSquadDisplay({
        name: category.training_group_name_snapshot,
        program: callup.program,
        categoryLabel: category.category_label,
      });
      return {
      id: category.id,
      categoryLabel: display.categoryLabel,
      trainingGroupName: formatCampusCompetitionTeamName(campusName, display.teamLabel),
      tournamentName: category.tournament_name_snapshot ?? callup.tournaments?.name ?? "Torneo",
      coachNames: category.coach_names_snapshot ?? "Sin profesor",
      sortOrder: category.sort_order,
      isRest: category.is_rest,
      games: (gamesByCategory.get(category.id) ?? []).map((game) => {
        const gamePlayers = playersByGame.get(game.id) ?? [];
        const fallbackPlayers = (playersByCategory.get(category.id) ?? []).map((player) => ({
          enrollmentId: player.enrollment_id,
          playerId: player.player_id,
          playerName: player.player_name_snapshot,
          rosterStatus: player.roster_status,
        }));
        const categoryIncluded = new Set((playersByCategory.get(category.id) ?? []).filter((player) => player.roster_status === "included").map((player) => player.enrollment_id));
        return {
          id: game.id,
          matchDate: game.match_date,
          arrivalTime: game.arrival_time?.slice(0, 5) ?? "",
          venue: game.venue ?? "",
          opponent: game.opponent ?? "",
          sortOrder: game.sort_order,
          players: (gamePlayers.length ? gamePlayers.map((player) => ({
            enrollmentId: player.enrollment_id,
            playerId: player.player_id,
            playerName: player.player_name_snapshot,
            rosterStatus: categoryIncluded.has(player.enrollment_id) ? player.roster_status : "excluded" as const,
          })) : fallbackPlayers),
        };
      }),
      players: (playersByCategory.get(category.id) ?? []).map((player) => ({
        id: player.id,
        enrollmentId: player.enrollment_id,
        playerId: player.player_id,
        playerName: player.player_name_snapshot,
        birthYear: player.birth_year,
        trainingGroupId: player.training_group_id,
        eligibilitySource: player.eligibility_source,
        rosterStatus: player.roster_status,
        manualReason: player.manual_reason,
      })),
    };
    }),
  };
}
