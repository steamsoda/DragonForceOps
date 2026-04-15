import { getPermissionContext } from "@/lib/auth/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import { TEAM_GENDER_LABELS } from "@/lib/teams/shared";

type TournamentRow = {
  id: string;
  name: string;
  campus_id: string | null;
  product_id: string | null;
  gender: string | null;
  start_date: string | null;
  end_date: string | null;
  signup_deadline: string | null;
  eligible_birth_year_min: number | null;
  eligible_birth_year_max: number | null;
  is_active: boolean;
};

type ProductRow = {
  id: string;
  name: string;
  charge_type_code: string | null;
};

type SourceLinkRow = {
  id: string;
  tournament_id: string;
  source_team_id: string;
  participation_mode: "competitive" | "invited";
  roster_status: "planning" | "approved";
  approved_at: string | null;
  approved_by: string | null;
  default_squad_id: string | null;
};

type TeamRow = {
  id: string;
  name: string;
  campus_id: string;
  birth_year: number | null;
  gender: string | null;
  level: string | null;
  type: string;
  season_label: string | null;
  coach_id: string | null;
};

type CoachRow = {
  id: string;
  first_name: string;
  last_name: string;
};

type TournamentEntryRow = {
  id: string;
  tournament_id: string;
  enrollment_id: string;
  charge_id: string | null;
  entry_status: "confirmed" | "interested";
  signed_up_at: string | null;
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
};

type AssignmentRow = {
  id: string;
  enrollment_id: string;
  team_id: string;
  role: "regular" | "refuerzo";
  is_primary: boolean;
  start_date: string;
  enrollments: {
    player_id: string;
    players: {
      id: string;
      first_name: string;
      last_name: string;
      birth_date: string | null;
      gender: string | null;
    } | null;
  } | null;
};

export type TournamentPlayerSummary = {
  enrollmentId: string;
  playerId: string;
  playerName: string;
  birthYear: number | null;
  gender: string | null;
  entryStatus: "confirmed" | "interested" | "missing";
  isEligibleRegular: boolean;
  assignmentId: string | null;
  role: "regular" | "refuerzo" | null;
};

export type TournamentSourceTeamProgress = {
  linkId: string;
  sourceTeamId: string;
  sourceTeamName: string;
  categoryLabel: string;
  birthYear: number | null;
  gender: string | null;
  level: string | null;
  coachName: string | null;
  participationMode: "competitive" | "invited";
  rosterStatus: "planning" | "approved";
  approvedAt: string | null;
  defaultSquadId: string | null;
  rosterCount: number;
  confirmedCount: number;
  interestedCount: number;
  missingCount: number;
  finalRosterCount: number;
  confirmedPendingFinalCount: number;
  progressLabel: string;
  finalRosterLabel: string;
  confirmedPlayers: TournamentPlayerSummary[];
  interestedPlayers: TournamentPlayerSummary[];
  missingPlayers: TournamentPlayerSummary[];
  finalRosterPlayers: TournamentPlayerSummary[];
};

export type TournamentCategoryGroup = {
  key: string;
  label: string;
  rosterCount: number;
  confirmedCount: number;
  interestedCount: number;
  finalRosterCount: number;
  teamCount: number;
  progressLabel: string;
  teams: TournamentSourceTeamProgress[];
};

export type TournamentSquadSummary = {
  id: string;
  sourceTeamId: string;
  sourceTeamName: string;
  teamId: string;
  teamName: string;
  label: string;
  isDefault: boolean;
  fillLabel: string;
  refuerzoLabel: string;
  members: TournamentPlayerSummary[];
};

export type TournamentListItem = {
  id: string;
  name: string;
  campusId: string;
  campusName: string;
  productId: string | null;
  productName: string | null;
  gender: string | null;
  startDate: string | null;
  endDate: string | null;
  signupDeadline: string | null;
  isActive: boolean;
  sourceTeamCount: number;
  categoryCount: number;
  signedCount: number;
  interestedCount: number;
  finalRosterCount: number;
  approvedTeamCount: number;
};

export type TournamentDetailData = {
  id: string;
  name: string;
  campusId: string;
  campusName: string;
  productId: string | null;
  productName: string | null;
  gender: string | null;
  startDate: string | null;
  endDate: string | null;
  signupDeadline: string | null;
  eligibleBirthYearMin: number | null;
  eligibleBirthYearMax: number | null;
  isActive: boolean;
  campuses: Array<{ id: string; name: string }>;
  products: Array<{ id: string; name: string }>;
  availableSourceTeams: Array<{
    id: string;
    name: string;
    birthYear: number | null;
    gender: string | null;
    level: string | null;
  }>;
  sourceTeams: TournamentSourceTeamProgress[];
  categoryGroups: TournamentCategoryGroup[];
  selectedSourceTeamId: string | null;
  selectedSourceTeam: TournamentSourceTeamProgress | null;
  squads: TournamentSquadSummary[];
  advancedSquads: TournamentSquadSummary[];
};

export type DirectorDashboardData = {
  campuses: Array<{ id: string; name: string }>;
  selectedCampusId: string | null;
  tournaments: TournamentListItem[];
  selectedTournamentId: string | null;
  selectedTournament: TournamentListItem | null;
  categoryGroups: TournamentCategoryGroup[];
};

function getBirthYear(value: string | null | undefined) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.getUTCFullYear();
}

function formatCategoryLabel(teamName: string, birthYear: number | null) {
  const fullRange = teamName.match(/(20\d{2})\s*[-/]\s*(20\d{2})/);
  if (fullRange) return `Categoría ${fullRange[1]}-${fullRange[2]}`;
  const shortRange = teamName.match(/(20\d{2})\s*[-/]\s*(\d{2})/);
  if (shortRange) return `Categoría ${shortRange[1]}-${shortRange[1].slice(0, 2)}${shortRange[2]}`;
  const subLabel = teamName.match(/\bSub\s*\d+\b/i);
  if (subLabel) return subLabel[0].replace(/\s+/g, " ");
  if (birthYear !== null) return `Categoría ${birthYear}`;
  return "Categoría flexible";
}

function sortByName<T extends { label?: string; sourceTeamName?: string; playerName?: string }>(rows: T[]) {
  return [...rows].sort((a, b) =>
    (a.playerName ?? a.sourceTeamName ?? a.label ?? "").localeCompare(
      b.playerName ?? b.sourceTeamName ?? b.label ?? "",
      "es-MX",
    ),
  );
}

async function getSportsQueryContext() {
  const context = await getPermissionContext();
  if (!context?.hasSportsAccess) return null;
  const campuses = context.campusAccess?.campuses ?? [];
  if (campuses.length === 0) return null;
  return {
    admin: createAdminClient(),
    campusIds: campuses.map((campus) => campus.id),
    campuses: campuses.map((campus) => ({ id: campus.id, name: campus.name })),
  };
}

async function loadProducts(admin: ReturnType<typeof createAdminClient>) {
  const { data } = await admin
    .from("products")
    .select("id, name, charge_types(code)")
    .eq("is_active", true)
    .returns<Array<{ id: string; name: string; charge_types: { code: string | null } | null }>>();

  return (data ?? [])
    .map<ProductRow>((row) => ({
      id: row.id,
      name: row.name,
      charge_type_code: row.charge_types?.code ?? null,
    }))
    .filter((row) => row.charge_type_code === "tournament" || row.charge_type_code === "cup")
    .sort((a, b) => a.name.localeCompare(b.name, "es-MX"));
}

async function loadTournamentRows(
  admin: ReturnType<typeof createAdminClient>,
  campusIds: string[],
  selectedCampusId?: string | null,
) {
  let query = admin
    .from("tournaments")
    .select("id, name, campus_id, product_id, gender, start_date, end_date, signup_deadline, eligible_birth_year_min, eligible_birth_year_max, is_active")
    .in("campus_id", campusIds)
    .order("start_date", { ascending: false, nullsFirst: false })
    .order("name", { ascending: true });
  if (selectedCampusId && campusIds.includes(selectedCampusId)) {
    query = query.eq("campus_id", selectedCampusId);
  }
  const { data } = await query.returns<TournamentRow[]>();
  return data ?? [];
}

async function loadTournamentSnapshot(
  admin: ReturnType<typeof createAdminClient>,
  tournament: TournamentRow,
  campuses: Array<{ id: string; name: string }>,
) {
  const [{ data: linkRows }, { data: squadRows }, { data: entryRows }, { data: allTeams }, { data: coachRows }] =
    await Promise.all([
      admin
        .from("tournament_source_teams")
        .select("id, tournament_id, source_team_id, participation_mode, roster_status, approved_at, approved_by, default_squad_id")
        .eq("tournament_id", tournament.id)
        .returns<SourceLinkRow[]>(),
      admin
        .from("tournament_squads")
        .select("id, tournament_id, source_team_id, team_id, label, min_target_players, max_target_players, refuerzo_limit")
        .eq("tournament_id", tournament.id)
        .returns<SquadRow[]>(),
      admin
        .from("tournament_player_entries")
        .select("id, tournament_id, enrollment_id, charge_id, entry_status, signed_up_at")
        .eq("tournament_id", tournament.id)
        .returns<TournamentEntryRow[]>(),
      admin
        .from("teams")
        .select("id, name, campus_id, birth_year, gender, level, type, season_label, coach_id")
        .eq("campus_id", tournament.campus_id ?? "")
        .eq("is_active", true)
        .returns<TeamRow[]>(),
      admin
        .from("coaches")
        .select("id, first_name, last_name")
        .eq("is_active", true)
        .returns<CoachRow[]>(),
    ]);

  const sourceLinks = linkRows ?? [];
  const squads = squadRows ?? [];
  const entries = entryRows ?? [];
  const teams = allTeams ?? [];
  const coaches = coachRows ?? [];

  const squadTeamIds = squads.map((row) => row.team_id);
  const sourceTeamIds = sourceLinks.map((row) => row.source_team_id);

  const [sourceAssignmentsResult, squadAssignmentsResult] = await Promise.all([
    sourceTeamIds.length
      ? admin
          .from("team_assignments")
          .select("id, enrollment_id, team_id, role, is_primary, start_date, enrollments(player_id, players(id, first_name, last_name, birth_date, gender))")
          .in("team_id", sourceTeamIds)
          .eq("is_primary", true)
          .is("end_date", null)
          .returns<AssignmentRow[]>()
      : Promise.resolve({ data: [] as AssignmentRow[] }),
    squadTeamIds.length
      ? admin
          .from("team_assignments")
          .select("id, enrollment_id, team_id, role, is_primary, start_date, enrollments(player_id, players(id, first_name, last_name, birth_date, gender))")
          .in("team_id", squadTeamIds)
          .eq("is_primary", false)
          .is("end_date", null)
          .returns<AssignmentRow[]>()
      : Promise.resolve({ data: [] as AssignmentRow[] }),
  ]);

  const teamMap = new Map(teams.map((row) => [row.id, row]));
  const coachMap = new Map(coaches.map((row) => [row.id, `${row.first_name} ${row.last_name}`.trim()]));
  const entryByEnrollment = new Map(entries.map((row) => [row.enrollment_id, row]));
  const sourceAssignments = sourceAssignmentsResult.data ?? [];
  const squadAssignments = squadAssignmentsResult.data ?? [];

  const sourceAssignmentsByTeam = new Map<string, AssignmentRow[]>();
  for (const row of sourceAssignments) {
    const list = sourceAssignmentsByTeam.get(row.team_id) ?? [];
    list.push(row);
    sourceAssignmentsByTeam.set(row.team_id, list);
  }

  const squadAssignmentsByTeam = new Map<string, AssignmentRow[]>();
  for (const row of squadAssignments) {
    const list = squadAssignmentsByTeam.get(row.team_id) ?? [];
    list.push(row);
    squadAssignmentsByTeam.set(row.team_id, list);
  }

  const sourceTeams = sourceLinks
    .map<TournamentSourceTeamProgress | null>((link) => {
      const team = teamMap.get(link.source_team_id);
      if (!team) return null;
      const categoryLabel = formatCategoryLabel(team.name, team.birth_year);
      const members = (sourceAssignmentsByTeam.get(team.id) ?? []).map<TournamentPlayerSummary>((assignment) => {
        const player = assignment.enrollments?.players;
        const entry = entryByEnrollment.get(assignment.enrollment_id);
        const squadAssignment = squads
          .flatMap((squad) =>
            (squadAssignmentsByTeam.get(squad.team_id) ?? []).filter(
              (row) => row.enrollment_id === assignment.enrollment_id,
            ),
          )
          .at(0);
        return {
          enrollmentId: assignment.enrollment_id,
          playerId: assignment.enrollments?.player_id ?? player?.id ?? assignment.enrollment_id,
          playerName: player ? `${player.first_name} ${player.last_name}`.trim() : "Jugador",
          birthYear: getBirthYear(player?.birth_date),
          gender: player?.gender ?? null,
          entryStatus: entry?.entry_status ?? "missing",
          isEligibleRegular: true,
          assignmentId: squadAssignment?.id ?? null,
          role: squadAssignment?.role ?? null,
        };
      });

      const confirmedPlayers = sortByName(members.filter((player) => player.entryStatus === "confirmed"));
      const interestedPlayers = sortByName(members.filter((player) => player.entryStatus === "interested"));
      const missingPlayers = sortByName(members.filter((player) => player.entryStatus === "missing"));

      const defaultSquad = link.default_squad_id ? squads.find((squad) => squad.id === link.default_squad_id) : null;
      const finalRosterPlayers = defaultSquad
        ? sortByName(
            (squadAssignmentsByTeam.get(defaultSquad.team_id) ?? []).map<TournamentPlayerSummary>((assignment) => {
              const player = assignment.enrollments?.players;
              const entry = entryByEnrollment.get(assignment.enrollment_id);
              return {
                enrollmentId: assignment.enrollment_id,
                playerId: assignment.enrollments?.player_id ?? player?.id ?? assignment.enrollment_id,
                playerName: player ? `${player.first_name} ${player.last_name}`.trim() : "Jugador",
                birthYear: getBirthYear(player?.birth_date),
                gender: player?.gender ?? null,
                entryStatus: entry?.entry_status ?? "missing",
                isEligibleRegular: assignment.role !== "refuerzo",
                assignmentId: assignment.id,
                role: assignment.role,
              };
            }),
          )
        : [];

      const finalRosterEnrollmentIds = new Set(finalRosterPlayers.map((player) => player.enrollmentId));
      return {
        linkId: link.id,
        sourceTeamId: team.id,
        sourceTeamName: team.name,
        categoryLabel,
        birthYear: team.birth_year,
        gender: team.gender,
        level: team.level,
        coachName: team.coach_id ? coachMap.get(team.coach_id) ?? null : null,
        participationMode: link.participation_mode,
        rosterStatus: link.roster_status,
        approvedAt: link.approved_at,
        defaultSquadId: link.default_squad_id,
        rosterCount: members.length,
        confirmedCount: confirmedPlayers.length,
        interestedCount: interestedPlayers.length,
        missingCount: missingPlayers.length,
        finalRosterCount: finalRosterPlayers.length,
        confirmedPendingFinalCount: confirmedPlayers.filter((player) => !finalRosterEnrollmentIds.has(player.enrollmentId)).length,
        progressLabel: `${confirmedPlayers.length}/${members.length}`,
        finalRosterLabel: `${finalRosterPlayers.length}/${confirmedPlayers.length}`,
        confirmedPlayers,
        interestedPlayers,
        missingPlayers,
        finalRosterPlayers,
      };
    })
    .filter((row): row is TournamentSourceTeamProgress => row !== null);

  const categoryMap = new Map<string, TournamentCategoryGroup>();
  for (const team of sourceTeams) {
    const existing = categoryMap.get(team.categoryLabel);
    if (existing) {
      existing.rosterCount += team.rosterCount;
      existing.confirmedCount += team.confirmedCount;
      existing.interestedCount += team.interestedCount;
      existing.finalRosterCount += team.finalRosterCount;
      existing.teamCount += 1;
      existing.teams.push(team);
      existing.progressLabel = `${existing.confirmedCount}/${existing.rosterCount}`;
      continue;
    }
    categoryMap.set(team.categoryLabel, {
      key: team.categoryLabel,
      label: team.categoryLabel,
      rosterCount: team.rosterCount,
      confirmedCount: team.confirmedCount,
      interestedCount: team.interestedCount,
      finalRosterCount: team.finalRosterCount,
      teamCount: 1,
      progressLabel: `${team.confirmedCount}/${team.rosterCount}`,
      teams: [team],
    });
  }

  const categoryGroups = sortByName(Array.from(categoryMap.values())).map((group) => ({
    ...group,
    teams: sortByName(group.teams),
  }));

  const squadSummaries = sortByName(
    squads.map<TournamentSquadSummary>((squad) => {
      const sourceTeam = teamMap.get(squad.source_team_id);
      const team = teamMap.get(squad.team_id);
      const members = sortByName(
        (squadAssignmentsByTeam.get(squad.team_id) ?? []).map<TournamentPlayerSummary>((assignment) => {
          const player = assignment.enrollments?.players;
          const entry = entryByEnrollment.get(assignment.enrollment_id);
          return {
            enrollmentId: assignment.enrollment_id,
            playerId: assignment.enrollments?.player_id ?? player?.id ?? assignment.enrollment_id,
            playerName: player ? `${player.first_name} ${player.last_name}`.trim() : "Jugador",
            birthYear: getBirthYear(player?.birth_date),
            gender: player?.gender ?? null,
            entryStatus: entry?.entry_status ?? "missing",
            isEligibleRegular: assignment.role !== "refuerzo",
            assignmentId: assignment.id,
            role: assignment.role,
          };
        }),
      );

      return {
        id: squad.id,
        sourceTeamId: squad.source_team_id,
        sourceTeamName: sourceTeam?.name ?? "Equipo base",
        teamId: squad.team_id,
        teamName: team?.name ?? "Equipo",
        label: squad.label,
        isDefault: sourceLinks.some((link) => link.default_squad_id === squad.id),
        fillLabel: `${members.length}/${squad.max_target_players}`,
        refuerzoLabel: `${members.filter((member) => member.role === "refuerzo").length}/${squad.refuerzo_limit}`,
        members,
      };
    }),
  );

  const productList = await loadProducts(admin);
  const productMap = new Map(productList.map((row) => [row.id, row.name]));
  const availableSourceTeams = teams
    .filter((team) => team.type === "competition")
    .filter((team) => !squadTeamIds.includes(team.id))
    .filter((team) => !sourceLinks.some((link) => link.source_team_id === team.id))
    .filter((team) => tournament.gender === "mixed" || team.gender === tournament.gender || team.gender === "mixed")
    .map((team) => ({
      id: team.id,
      name: team.name,
      birthYear: team.birth_year,
      gender: team.gender,
      level: team.level,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "es-MX"));

  return {
    id: tournament.id,
    name: tournament.name,
    campusId: tournament.campus_id ?? "",
    campusName: campuses.find((campus) => campus.id === tournament.campus_id)?.name ?? "Campus",
    productId: tournament.product_id,
    productName: tournament.product_id ? productMap.get(tournament.product_id) ?? null : null,
    gender: tournament.gender,
    startDate: tournament.start_date,
    endDate: tournament.end_date,
    signupDeadline: tournament.signup_deadline,
    eligibleBirthYearMin: tournament.eligible_birth_year_min,
    eligibleBirthYearMax: tournament.eligible_birth_year_max,
    isActive: tournament.is_active,
    campuses,
    products: productList.map((row) => ({ id: row.id, name: row.name })),
    availableSourceTeams,
    sourceTeams: sortByName(sourceTeams),
    categoryGroups,
    squads: squadSummaries,
  };
}

export async function listTournamentsPageData(): Promise<{
  campuses: Array<{ id: string; name: string }>;
  products: Array<{ id: string; name: string }>;
  tournaments: TournamentListItem[];
}> {
  const context = await getSportsQueryContext();
  if (!context) return { campuses: [], products: [], tournaments: [] };

  const { admin, campuses, campusIds } = context;
  const [products, tournaments] = await Promise.all([
    loadProducts(admin),
    loadTournamentRows(admin, campusIds),
  ]);

  const summaries = await Promise.all(
    tournaments.map(async (tournament) => {
      const snapshot = await loadTournamentSnapshot(admin, tournament, campuses);
      return {
        id: snapshot.id,
        name: snapshot.name,
        campusId: snapshot.campusId,
        campusName: snapshot.campusName,
        productId: snapshot.productId,
        productName: snapshot.productName,
        gender: snapshot.gender,
        startDate: snapshot.startDate,
        endDate: snapshot.endDate,
        signupDeadline: snapshot.signupDeadline,
        isActive: snapshot.isActive,
        sourceTeamCount: snapshot.sourceTeams.length,
        categoryCount: snapshot.categoryGroups.length,
        signedCount: snapshot.sourceTeams.reduce((sum, team) => sum + team.confirmedCount, 0),
        interestedCount: snapshot.sourceTeams.reduce((sum, team) => sum + team.interestedCount, 0),
        finalRosterCount: snapshot.sourceTeams.reduce((sum, team) => sum + team.finalRosterCount, 0),
        approvedTeamCount: snapshot.sourceTeams.filter((team) => team.rosterStatus === "approved").length,
      } satisfies TournamentListItem;
    }),
  );

  return {
    campuses,
    products: products.map((row) => ({ id: row.id, name: row.name })),
    tournaments: summaries,
  };
}

export async function getTournamentDetailData(
  tournamentId: string,
  selectedSourceTeamId?: string | null,
): Promise<TournamentDetailData | null> {
  const context = await getSportsQueryContext();
  if (!context) return null;

  const { admin, campuses, campusIds } = context;
  const tournament = (
    await admin
      .from("tournaments")
      .select("id, name, campus_id, product_id, gender, start_date, end_date, signup_deadline, eligible_birth_year_min, eligible_birth_year_max, is_active")
      .eq("id", tournamentId)
      .in("campus_id", campusIds)
      .maybeSingle<TournamentRow | null>()
  ).data;

  if (!tournament) return null;

  const snapshot = await loadTournamentSnapshot(admin, tournament, campuses);
  const selectedSourceTeam =
    snapshot.sourceTeams.find((team) => team.sourceTeamId === selectedSourceTeamId || team.linkId === selectedSourceTeamId) ??
    snapshot.sourceTeams[0] ??
    null;

  return {
    ...snapshot,
    selectedSourceTeamId: selectedSourceTeam?.sourceTeamId ?? null,
    selectedSourceTeam,
    advancedSquads: snapshot.squads.filter((squad) => !squad.isDefault),
  };
}

export async function getDirectorDashboardData(
  selectedCampusId?: string | null,
  selectedTournamentId?: string | null,
): Promise<DirectorDashboardData> {
  const context = await getSportsQueryContext();
  if (!context) {
    return {
      campuses: [],
      selectedCampusId: null,
      tournaments: [],
      selectedTournamentId: null,
      selectedTournament: null,
      categoryGroups: [],
    };
  }

  const { admin, campuses, campusIds } = context;
  const effectiveCampusId =
    selectedCampusId && campusIds.includes(selectedCampusId) ? selectedCampusId : campuses[0]?.id ?? null;
  const tournaments = await loadTournamentRows(admin, campusIds, effectiveCampusId);
  const summaries = (await listTournamentsPageData()).tournaments.filter((row) =>
    effectiveCampusId ? row.campusId === effectiveCampusId : true,
  );
  const effectiveTournamentId =
    selectedTournamentId && summaries.some((row) => row.id === selectedTournamentId)
      ? selectedTournamentId
      : summaries[0]?.id ?? null;
  const selectedTournament = summaries.find((row) => row.id === effectiveTournamentId) ?? null;
  const selectedTournamentRow = tournaments.find((row) => row.id === effectiveTournamentId) ?? null;
  const snapshot = selectedTournamentRow
    ? await loadTournamentSnapshot(admin, selectedTournamentRow, campuses)
    : null;

  return {
    campuses,
    selectedCampusId: effectiveCampusId,
    tournaments: summaries,
    selectedTournamentId: effectiveTournamentId,
    selectedTournament,
    categoryGroups: snapshot?.categoryGroups ?? [],
  };
}

export { TEAM_GENDER_LABELS };
