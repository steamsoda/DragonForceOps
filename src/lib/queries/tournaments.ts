import { getPermissionContext } from "@/lib/auth/permissions";
import { createAdminClient } from "@/lib/supabase/admin";

type TournamentRow = {
  id: string;
  name: string;
  campus_id: string | null;
  product_id: string | null;
  start_date: string | null;
  end_date: string | null;
  signup_deadline: string | null;
  eligible_birth_year_min: number | null;
  eligible_birth_year_max: number | null;
  is_active: boolean;
  campuses: { name: string | null } | null;
  products: { name: string | null } | null;
};

type SourceTeamLinkRow = {
  id: string;
  tournament_id: string;
  source_team_id: string;
  teams: {
    id: string;
    name: string;
    birth_year: number | null;
    level: string | null;
    coaches: { first_name: string | null; last_name: string | null } | null;
  } | null;
};

type SquadRow = {
  id: string;
  tournament_id: string;
  source_team_id: string;
  team_id: string;
  label: string;
  min_target_players: number;
  max_target_players: number;
  refuerzo_limit: number;
  teams: { id: string; name: string } | null;
};

type EntryRow = {
  id: string;
  tournament_id: string;
  enrollment_id: string;
  charge_id: string | null;
  signed_up_at: string;
  enrollments: {
    id: string;
    campus_id: string;
    player_id: string;
    players: {
      id: string;
      first_name: string;
      last_name: string;
      birth_date: string;
    } | null;
  } | null;
};

type AssignmentRosterRow = {
  id: string;
  team_id: string;
  enrollment_id: string;
  role: string;
  is_primary: boolean;
  start_date: string;
  enrollments: {
    id: string;
    status: string;
    campus_id: string;
    player_id: string;
    players: {
      id: string;
      first_name: string;
      last_name: string;
      birth_date: string;
    } | null;
  } | null;
};

type TeamOptionRow = {
  id: string;
  name: string;
  birth_year: number | null;
  level: string | null;
  type: string;
  campus_id: string;
  campuses: { name: string | null } | null;
};

type ProductOptionRow = {
  id: string;
  name: string;
  charge_types: { code: string | null } | null;
};

export type SportsCampusOption = {
  id: string;
  name: string;
};

export type CompetitionProductOption = {
  id: string;
  name: string;
};

export type SourceTeamOption = {
  id: string;
  name: string;
  campusId: string;
  campusName: string;
  birthYear: number | null;
  level: string | null;
  type: string;
};

export type TournamentPlayerSummary = {
  enrollmentId: string;
  playerId: string;
  playerName: string;
  birthYear: number | null;
  sourceTeamId: string | null;
  sourceTeamName: string | null;
  signedUpAt: string | null;
  isEligibleRegular: boolean;
};

export type TournamentSourceTeamProgress = {
  linkId: string;
  sourceTeamId: string;
  sourceTeamName: string;
  birthYear: number | null;
  level: string | null;
  coachName: string | null;
  eligibleCount: number;
  signedCount: number;
  unsignedCount: number;
  progressLabel: string;
};

export type TournamentSquadMember = {
  assignmentId: string;
  enrollmentId: string;
  playerId: string;
  playerName: string;
  birthYear: number | null;
  role: "regular" | "refuerzo";
};

export type TournamentSquadSummary = {
  id: string;
  teamId: string;
  teamName: string;
  sourceTeamId: string;
  sourceTeamName: string;
  label: string;
  minTargetPlayers: number;
  maxTargetPlayers: number;
  refuerzoLimit: number;
  assignedCount: number;
  regularCount: number;
  refuerzoCount: number;
  fillLabel: string;
  refuerzoLabel: string;
  members: TournamentSquadMember[];
};

export type TournamentListItem = {
  id: string;
  name: string;
  campusId: string;
  campusName: string;
  productId: string | null;
  productName: string | null;
  startDate: string | null;
  endDate: string | null;
  signupDeadline: string | null;
  eligibleBirthYearMin: number | null;
  eligibleBirthYearMax: number | null;
  isActive: boolean;
  sourceTeamCount: number;
  squadCount: number;
  signedCount: number;
  awaitingAssignmentCount: number;
};

export type TournamentDetailData = TournamentListItem & {
  campuses: SportsCampusOption[];
  products: CompetitionProductOption[];
  availableSourceTeams: SourceTeamOption[];
  attachedSourceTeams: TournamentSourceTeamProgress[];
  unsignedPlayers: TournamentPlayerSummary[];
  awaitingAssignmentPlayers: TournamentPlayerSummary[];
  squads: TournamentSquadSummary[];
};

export type DirectorDashboardCompetition = TournamentListItem & {
  sourceTeamProgress: TournamentSourceTeamProgress[];
  squads: TournamentSquadSummary[];
};

export type DirectorDashboardData = {
  campuses: SportsCampusOption[];
  selectedCampusId: string | null;
  competitions: DirectorDashboardCompetition[];
};

type SportsQueryContext = {
  campusIds: string[];
  campuses: SportsCampusOption[];
};

function getBirthYear(value: string | null | undefined) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.getUTCFullYear();
}

function withinBirthWindow(
  birthYear: number | null,
  min: number | null,
  max: number | null,
) {
  if (!birthYear) return false;
  if (min !== null && birthYear < min) return false;
  if (max !== null && birthYear > max) return false;
  return true;
}

function formatPlayerName(player: { first_name: string; last_name: string } | null | undefined) {
  return player ? `${player.first_name} ${player.last_name}`.trim() : "Jugador";
}

function buildCoachName(coach: { first_name: string | null; last_name: string | null } | null | undefined) {
  if (!coach) return null;
  return `${coach.first_name ?? ""} ${coach.last_name ?? ""}`.trim() || null;
}

async function getSportsQueryContext(): Promise<SportsQueryContext | null> {
  const context = await getPermissionContext();
  if (!context?.hasSportsAccess) return null;
  const campuses = context.campusAccess?.campuses ?? [];
  if (campuses.length === 0) return null;
  return {
    campusIds: campuses.map((campus) => campus.id),
    campuses: campuses.map((campus) => ({ id: campus.id, name: campus.name })),
  };
}

async function listCompetitionProductsForCampusAccess(admin: ReturnType<typeof createAdminClient>) {
  const { data } = await admin
    .from("products")
    .select("id, name, charge_types(code)")
    .eq("is_active", true)
    .returns<ProductOptionRow[]>();

  return (data ?? [])
    .filter((row) => row.charge_types?.code === "tournament" || row.charge_types?.code === "cup")
    .map((row) => ({ id: row.id, name: row.name }))
    .sort((a, b) => a.name.localeCompare(b.name, "es-MX"));
}

async function listSourceTeamsForCampusAccess(admin: ReturnType<typeof createAdminClient>, campusIds: string[]) {
  const { data } = await admin
    .from("teams")
    .select("id, name, birth_year, level, type, campus_id, campuses(name)")
    .in("campus_id", campusIds)
    .eq("is_active", true)
    .order("name")
    .returns<TeamOptionRow[]>();

  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    campusId: row.campus_id,
    campusName: row.campuses?.name ?? "Campus",
    birthYear: row.birth_year,
    level: row.level,
    type: row.type,
  }));
}

async function loadTournamentGraph(campusIds: string[], tournamentId?: string) {
  const admin = createAdminClient();

  let tournamentsQuery = admin
    .from("tournaments")
    .select(
      "id, name, campus_id, product_id, start_date, end_date, signup_deadline, eligible_birth_year_min, eligible_birth_year_max, is_active, campuses(name), products(name)"
    )
    .in("campus_id", campusIds)
    .order("start_date", { ascending: false })
    .order("name", { ascending: true });

  if (tournamentId) tournamentsQuery = tournamentsQuery.eq("id", tournamentId);

  const { data: tournaments } = await tournamentsQuery.returns<TournamentRow[]>();
  const resolvedTournaments = (tournaments ?? []).filter((row): row is TournamentRow & { campus_id: string } => Boolean(row.campus_id));
  const tournamentIds = resolvedTournaments.map((row) => row.id);

  if (tournamentIds.length === 0) {
    return {
      admin,
      tournaments: [] as TournamentRow[],
      sourceLinks: [] as SourceTeamLinkRow[],
      squads: [] as SquadRow[],
      entries: [] as EntryRow[],
      primaryAssignments: [] as AssignmentRosterRow[],
      squadAssignments: [] as AssignmentRosterRow[],
      products: await listCompetitionProductsForCampusAccess(admin),
      sourceTeams: await listSourceTeamsForCampusAccess(admin, campusIds),
    };
  }

  const [{ data: sourceLinks }, { data: squads }, { data: entries }] = await Promise.all([
    admin
      .from("tournament_source_teams")
      .select("id, tournament_id, source_team_id, teams(id, name, birth_year, level, coaches(first_name, last_name))")
      .in("tournament_id", tournamentIds)
      .returns<SourceTeamLinkRow[]>(),
    admin
      .from("tournament_squads")
      .select("id, tournament_id, source_team_id, team_id, label, min_target_players, max_target_players, refuerzo_limit, teams(id, name)")
      .in("tournament_id", tournamentIds)
      .returns<SquadRow[]>(),
    admin
      .from("tournament_player_entries")
      .select(
        "id, tournament_id, enrollment_id, charge_id, signed_up_at, enrollments(id, campus_id, player_id, players(id, first_name, last_name, birth_date))"
      )
      .in("tournament_id", tournamentIds)
      .returns<EntryRow[]>(),
  ]);

  const sourceTeamIds = Array.from(new Set((sourceLinks ?? []).map((row) => row.source_team_id)));
  const squadTeamIds = Array.from(new Set((squads ?? []).map((row) => row.team_id)));

  const [primaryAssignments, squadAssignments, products, sourceTeams] = await Promise.all([
    sourceTeamIds.length > 0
      ? admin
          .from("team_assignments")
          .select(
            "id, team_id, enrollment_id, role, is_primary, start_date, enrollments!inner(id, status, campus_id, player_id, players(id, first_name, last_name, birth_date))"
          )
          .in("team_id", sourceTeamIds)
          .is("end_date", null)
          .eq("is_primary", true)
          .eq("enrollments.status", "active")
          .returns<AssignmentRosterRow[]>()
      : Promise.resolve({ data: [] as AssignmentRosterRow[] }),
    squadTeamIds.length > 0
      ? admin
          .from("team_assignments")
          .select(
            "id, team_id, enrollment_id, role, is_primary, start_date, enrollments!inner(id, status, campus_id, player_id, players(id, first_name, last_name, birth_date))"
          )
          .in("team_id", squadTeamIds)
          .is("end_date", null)
          .eq("is_primary", false)
          .eq("enrollments.status", "active")
          .returns<AssignmentRosterRow[]>()
      : Promise.resolve({ data: [] as AssignmentRosterRow[] }),
    listCompetitionProductsForCampusAccess(admin),
    listSourceTeamsForCampusAccess(admin, campusIds),
  ]);

  return {
    admin,
    tournaments: resolvedTournaments,
    sourceLinks: sourceLinks ?? [],
    squads: squads ?? [],
    entries: entries ?? [],
    primaryAssignments: primaryAssignments.data ?? [],
    squadAssignments: squadAssignments.data ?? [],
    products,
    sourceTeams,
  };
}

function buildTournamentModels(graph: Awaited<ReturnType<typeof loadTournamentGraph>>) {
  const sourceLinksByTournament = new Map<string, SourceTeamLinkRow[]>();
  const squadsByTournament = new Map<string, SquadRow[]>();
  const entriesByTournament = new Map<string, EntryRow[]>();
  const primaryAssignmentsByTeam = new Map<string, AssignmentRosterRow[]>();
  const squadAssignmentsByTeam = new Map<string, AssignmentRosterRow[]>();

  for (const row of graph.sourceLinks) {
    const list = sourceLinksByTournament.get(row.tournament_id) ?? [];
    list.push(row);
    sourceLinksByTournament.set(row.tournament_id, list);
  }
  for (const row of graph.squads) {
    const list = squadsByTournament.get(row.tournament_id) ?? [];
    list.push(row);
    squadsByTournament.set(row.tournament_id, list);
  }
  for (const row of graph.entries) {
    const list = entriesByTournament.get(row.tournament_id) ?? [];
    list.push(row);
    entriesByTournament.set(row.tournament_id, list);
  }
  for (const row of graph.primaryAssignments) {
    const list = primaryAssignmentsByTeam.get(row.team_id) ?? [];
    list.push(row);
    primaryAssignmentsByTeam.set(row.team_id, list);
  }
  for (const row of graph.squadAssignments) {
    const list = squadAssignmentsByTeam.get(row.team_id) ?? [];
    list.push(row);
    squadAssignmentsByTeam.set(row.team_id, list);
  }

  return graph.tournaments.map((tournament) => {
    const sourceLinks = sourceLinksByTournament.get(tournament.id) ?? [];
    const squads = squadsByTournament.get(tournament.id) ?? [];
    const entries = entriesByTournament.get(tournament.id) ?? [];
    const entryByEnrollment = new Map(entries.map((row) => [row.enrollment_id, row]));
    const squadTeamIds = new Set(squads.map((row) => row.team_id));

    const sourceTeamProgress: TournamentSourceTeamProgress[] = sourceLinks.map((link) => {
      const sourceRoster = (primaryAssignmentsByTeam.get(link.source_team_id) ?? []).filter((assignment) =>
        withinBirthWindow(
          getBirthYear(assignment.enrollments?.players?.birth_date),
          tournament.eligible_birth_year_min,
          tournament.eligible_birth_year_max,
        )
      );
      const signedCount = sourceRoster.filter((assignment) => entryByEnrollment.has(assignment.enrollment_id)).length;
      return {
        linkId: link.id,
        sourceTeamId: link.source_team_id,
        sourceTeamName: link.teams?.name ?? "Equipo",
        birthYear: link.teams?.birth_year ?? null,
        level: link.teams?.level ?? null,
        coachName: buildCoachName(link.teams?.coaches),
        eligibleCount: sourceRoster.length,
        signedCount,
        unsignedCount: Math.max(sourceRoster.length - signedCount, 0),
        progressLabel: `${signedCount}/${sourceRoster.length}`,
      };
    });

    const eligibleSourceNames = new Map(sourceTeamProgress.map((item) => [item.sourceTeamId, item.sourceTeamName]));
    const unsignedPlayers: TournamentPlayerSummary[] = [];
    for (const link of sourceLinks) {
      const sourceRoster = primaryAssignmentsByTeam.get(link.source_team_id) ?? [];
      for (const assignment of sourceRoster) {
        const birthYear = getBirthYear(assignment.enrollments?.players?.birth_date);
        const isEligibleRegular = withinBirthWindow(
          birthYear,
          tournament.eligible_birth_year_min,
          tournament.eligible_birth_year_max,
        );
        if (!isEligibleRegular || entryByEnrollment.has(assignment.enrollment_id)) continue;
        unsignedPlayers.push({
          enrollmentId: assignment.enrollment_id,
          playerId: assignment.enrollments?.player_id ?? "",
          playerName: formatPlayerName(assignment.enrollments?.players),
          birthYear,
          sourceTeamId: link.source_team_id,
          sourceTeamName: link.teams?.name ?? "Equipo",
          signedUpAt: null,
          isEligibleRegular,
        });
      }
    }

    const assignedEnrollmentIds = new Set<string>();
    const squadSummaries: TournamentSquadSummary[] = squads.map((squad) => {
      const assignments = squadAssignmentsByTeam.get(squad.team_id) ?? [];
      for (const assignment of assignments) assignedEnrollmentIds.add(assignment.enrollment_id);

      const members: TournamentSquadMember[] = assignments.map((assignment) => ({
        assignmentId: assignment.id,
        enrollmentId: assignment.enrollment_id,
        playerId: assignment.enrollments?.player_id ?? "",
        playerName: formatPlayerName(assignment.enrollments?.players),
        birthYear: getBirthYear(assignment.enrollments?.players?.birth_date),
        role: assignment.role === "refuerzo" ? "refuerzo" : "regular",
      }));
      const refuerzoCount = members.filter((member) => member.role === "refuerzo").length;
      const regularCount = members.length - refuerzoCount;
      return {
        id: squad.id,
        teamId: squad.team_id,
        teamName: squad.teams?.name ?? squad.label,
        sourceTeamId: squad.source_team_id,
        sourceTeamName: eligibleSourceNames.get(squad.source_team_id) ?? "Equipo base",
        label: squad.label,
        minTargetPlayers: squad.min_target_players,
        maxTargetPlayers: squad.max_target_players,
        refuerzoLimit: squad.refuerzo_limit,
        assignedCount: members.length,
        regularCount,
        refuerzoCount,
        fillLabel: `${members.length}/${squad.max_target_players}`,
        refuerzoLabel: `${refuerzoCount}/${squad.refuerzo_limit}`,
        members,
      };
    });

    const sourceTeamIds = new Set(sourceLinks.map((link) => link.source_team_id));
    const awaitingAssignmentPlayers: TournamentPlayerSummary[] = entries
      .filter((entry) => !assignedEnrollmentIds.has(entry.enrollment_id))
      .map((entry) => {
        const birthYear = getBirthYear(entry.enrollments?.players?.birth_date);
        const sourceAssignment = graph.primaryAssignments.find((assignment) => assignment.enrollment_id === entry.enrollment_id);
        const sourceTeamId = sourceAssignment?.team_id ?? null;
        const isEligibleRegular =
          Boolean(sourceTeamId && sourceTeamIds.has(sourceTeamId)) &&
          withinBirthWindow(birthYear, tournament.eligible_birth_year_min, tournament.eligible_birth_year_max);

        return {
          enrollmentId: entry.enrollment_id,
          playerId: entry.enrollments?.player_id ?? "",
          playerName: formatPlayerName(entry.enrollments?.players),
          birthYear,
          sourceTeamId,
          sourceTeamName: sourceTeamId ? eligibleSourceNames.get(sourceTeamId) ?? null : null,
          signedUpAt: entry.signed_up_at,
          isEligibleRegular,
        };
      })
      .sort((a, b) => a.playerName.localeCompare(b.playerName, "es-MX"));

    const signedCount = entries.length;
    const awaitingAssignmentCount = awaitingAssignmentPlayers.length;

    return {
      id: tournament.id,
      name: tournament.name,
      campusId: tournament.campus_id!,
      campusName: tournament.campuses?.name ?? "Campus",
      productId: tournament.product_id,
      productName: tournament.products?.name ?? null,
      startDate: tournament.start_date,
      endDate: tournament.end_date,
      signupDeadline: tournament.signup_deadline,
      eligibleBirthYearMin: tournament.eligible_birth_year_min,
      eligibleBirthYearMax: tournament.eligible_birth_year_max,
      isActive: tournament.is_active,
      sourceTeamCount: sourceLinks.length,
      squadCount: squads.length,
      signedCount,
      awaitingAssignmentCount,
      sourceTeamProgress,
      unsignedPlayers: unsignedPlayers.sort((a, b) => a.playerName.localeCompare(b.playerName, "es-MX")),
      awaitingAssignmentPlayers,
      squads: squadSummaries,
    };
  });
}

export async function listTournamentsPageData(): Promise<{
  campuses: SportsCampusOption[];
  products: CompetitionProductOption[];
  sourceTeams: SourceTeamOption[];
  tournaments: TournamentListItem[];
}> {
  const context = await getSportsQueryContext();
  if (!context) return { campuses: [], products: [], sourceTeams: [], tournaments: [] };
  const graph = await loadTournamentGraph(context.campusIds);
  const tournaments = buildTournamentModels(graph).map((item) => ({
    id: item.id,
    name: item.name,
    campusId: item.campusId,
    campusName: item.campusName,
    productId: item.productId,
    productName: item.productName,
    startDate: item.startDate,
    endDate: item.endDate,
    signupDeadline: item.signupDeadline,
    eligibleBirthYearMin: item.eligibleBirthYearMin,
    eligibleBirthYearMax: item.eligibleBirthYearMax,
    isActive: item.isActive,
    sourceTeamCount: item.sourceTeamCount,
    squadCount: item.squadCount,
    signedCount: item.signedCount,
    awaitingAssignmentCount: item.awaitingAssignmentCount,
  }));

  return {
    campuses: context.campuses,
    products: graph.products,
    sourceTeams: graph.sourceTeams,
    tournaments,
  };
}

export async function getTournamentDetailData(tournamentId: string): Promise<TournamentDetailData | null> {
  const context = await getSportsQueryContext();
  if (!context) return null;
  const graph = await loadTournamentGraph(context.campusIds, tournamentId);
  const item = buildTournamentModels(graph)[0];
  if (!item) return null;

  return {
    id: item.id,
    name: item.name,
    campusId: item.campusId,
    campusName: item.campusName,
    productId: item.productId,
    productName: item.productName,
    startDate: item.startDate,
    endDate: item.endDate,
    signupDeadline: item.signupDeadline,
    eligibleBirthYearMin: item.eligibleBirthYearMin,
    eligibleBirthYearMax: item.eligibleBirthYearMax,
    isActive: item.isActive,
    sourceTeamCount: item.sourceTeamCount,
    squadCount: item.squadCount,
    signedCount: item.signedCount,
    awaitingAssignmentCount: item.awaitingAssignmentCount,
    campuses: context.campuses,
    products: graph.products,
    availableSourceTeams: graph.sourceTeams.filter((team) => team.campusId === item.campusId),
    attachedSourceTeams: item.sourceTeamProgress,
    unsignedPlayers: item.unsignedPlayers,
    awaitingAssignmentPlayers: item.awaitingAssignmentPlayers,
    squads: item.squads,
  };
}

export async function getDirectorDashboardData(selectedCampusId?: string | null): Promise<DirectorDashboardData> {
  const context = await getSportsQueryContext();
  if (!context) return { campuses: [], selectedCampusId: null, competitions: [] };
  const filteredCampusIds =
    selectedCampusId && context.campusIds.includes(selectedCampusId) ? [selectedCampusId] : context.campusIds;
  const graph = await loadTournamentGraph(filteredCampusIds);
  const competitions = buildTournamentModels(graph).map((item) => ({
    id: item.id,
    name: item.name,
    campusId: item.campusId,
    campusName: item.campusName,
    productId: item.productId,
    productName: item.productName,
    startDate: item.startDate,
    endDate: item.endDate,
    signupDeadline: item.signupDeadline,
    eligibleBirthYearMin: item.eligibleBirthYearMin,
    eligibleBirthYearMax: item.eligibleBirthYearMax,
    isActive: item.isActive,
    sourceTeamCount: item.sourceTeamCount,
    squadCount: item.squadCount,
    signedCount: item.signedCount,
    awaitingAssignmentCount: item.awaitingAssignmentCount,
    sourceTeamProgress: item.sourceTeamProgress,
    squads: item.squads,
  }));

  return {
    campuses: context.campuses,
    selectedCampusId:
      selectedCampusId && context.campusIds.includes(selectedCampusId)
        ? selectedCampusId
        : context.campuses[0]?.id ?? null,
    competitions,
  };
}
