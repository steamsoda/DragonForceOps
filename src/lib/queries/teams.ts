import { createClient } from "@/lib/supabase/server";
import { getPermissionContext } from "@/lib/auth/permissions";
import { canAccessCampus, getOperationalCampusAccess } from "@/lib/auth/campuses";
import { createAdminClient } from "@/lib/supabase/admin";
import { BASE_TEAM_LEVELS, TEAM_GENDER_LABELS, TEAM_GENDER_OPTIONS } from "@/lib/teams/shared";

// ── Shared helpers ────────────────────────────────────────────────────────────

export function generateTeamName(
  campusCode: string,
  birthYear: number | null,
  gender: string | null,
  level: string,
  type: string
): string {
  if (type === "class") {
    return birthYear
      ? `${campusCode} ${birthYear} Clases`
      : `${campusCode} Clases`;
  }
  const genderLabel =
    gender === "male"
      ? "Varonil"
      : gender === "female"
        ? "Femenil"
        : gender === "mixed"
          ? "Mixto"
          : "";
  const parts = [campusCode, birthYear, genderLabel, level].filter(Boolean);
  return parts.join(" ");
}

export const LEVELS = BASE_TEAM_LEVELS;
export type Level = (typeof LEVELS)[number];

// ── Types ─────────────────────────────────────────────────────────────────────

type TeamRow = {
  id: string;
  name: string;
  birth_year: number | null;
  gender: string | null;
  level: string | null;
  type: string;
  campus_id: string;
  is_active: boolean;
  season_label: string | null;
  campuses: { name: string | null; code: string | null } | null;
  coaches: { id: string; first_name: string; last_name: string } | null;
};

type ChargeTypeRow = {
  id: string;
  code: string;
  name: string;
};

type CountRow = {
  team_id: string;
  player_count: number;
  new_arrival_count: number;
};

type RosterRow = {
  id: string;
  enrollment_id: string;
  is_new_arrival: boolean;
  role: string;
  is_primary: boolean;
  start_date: string;
  enrollments: {
    players: {
      id: string;
      first_name: string;
      last_name: string;
      birth_date: string;
    } | null;
  } | null;
};

type HistoryRow = {
  id: string;
  enrollment_id: string;
  role: string;
  is_primary: boolean;
  start_date: string;
  end_date: string;
  enrollments: {
    players: {
      id: string;
      first_name: string;
      last_name: string;
    } | null;
  } | null;
};

type CoachRow = {
  id: string;
  first_name: string;
  last_name: string;
  campus_id: string;
};

// ── Exports ───────────────────────────────────────────────────────────────────

export type TeamOption = {
  id: string;
  name: string;
  campusId: string;
  campusName: string;
  birthYear: number | null;
  gender: string | null;
  level: string | null;
};

export type TeamListItem = {
  id: string;
  name: string;
  campusId: string;
  campusName: string;
  campusCode: string;
  birthYear: number | null;
  gender: string | null;
  level: string | null;
  type: string;
  coachName: string | null;
  coachId: string | null;
  isActive: boolean;
  seasonLabel: string | null;
  playerCount: number;
  newArrivalCount: number;
  isCompetitionSquad?: boolean;
};

export type TeamDetail = TeamListItem & {
  roster: RosterPlayer[];
  history: HistoryPlayer[];
};

export type RosterPlayer = {
  assignmentId: string;
  enrollmentId: string;
  playerId: string;
  playerName: string;
  birthDate: string;
  isNewArrival: boolean;
  role: "regular" | "refuerzo";
  isPrimary: boolean;
  startDate: string;
  daysOnTeam: number;
};

export type HistoryPlayer = {
  assignmentId: string;
  enrollmentId: string;
  playerId: string;
  playerName: string;
  role: string;
  isPrimary: boolean;
  startDate: string;
  endDate: string;
  daysOnTeam: number;
};

export type CoachOption = {
  id: string;
  name: string;
  campusId: string;
};

export type BulkChargeType = {
  id: string;
  code: string;
  name: string;
};

export type BaseTeamBoardPlayer = {
  enrollmentId: string;
  playerId: string;
  playerName: string;
  birthYear: number | null;
  gender: string | null;
  currentTeamId: string | null;
  currentTeamName: string | null;
  currentLevel: string | null;
};

export type BaseTeamBoardSlot = {
  level: string;
  team: TeamListItem | null;
  roster: BaseTeamBoardPlayer[];
};

export type BaseTeamBoardData = {
  campuses: Array<{ id: string; name: string }>;
  selectedCampusId: string | null;
  birthYearOptions: number[];
  selectedBirthYear: number | null;
  genderOptions: Array<{ value: string; label: string }>;
  selectedGender: string;
  players: BaseTeamBoardPlayer[];
  slots: BaseTeamBoardSlot[];
  selectedCampusName: string | null;
};

// ── Charge type codes that are auto-managed — exclude from bulk charge form ──

const EXCLUDED_CODES = new Set(["monthly_tuition", "inscription", "early_bird_discount"]);

type SportsTeamContext = {
  campusIds: string[];
  campuses: Array<{ id: string; name: string }>;
};

type EnrollmentBoardRow = {
  id: string;
  campus_id: string;
  player_id: string;
  players: {
    id: string;
    first_name: string;
    last_name: string;
    birth_date: string | null;
    gender: string | null;
  } | null;
};

type PrimaryAssignmentBoardRow = {
  enrollment_id: string;
  teams: {
    id: string;
    name: string;
    birth_year: number | null;
    gender: string | null;
    level: string | null;
  } | null;
};

async function getSportsTeamsContext(): Promise<SportsTeamContext | null> {
  const context = await getPermissionContext();
  if (!context?.hasSportsAccess) return null;
  const campuses = context.campusAccess?.campuses ?? [];
  if (campuses.length === 0) return null;
  return {
    campusIds: campuses.map((campus) => campus.id),
    campuses: campuses.map((campus) => ({ id: campus.id, name: campus.name })),
  };
}

function getBirthYearFromDate(value: string | null | undefined) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.getUTCFullYear();
}

function matchesBoardGender(playerGender: string | null, selectedGender: string) {
  if (selectedGender === "mixed") return true;
  if (!selectedGender) return true;
  return playerGender === selectedGender;
}

// ── Queries ───────────────────────────────────────────────────────────────────

export async function listTeams(): Promise<TeamListItem[]> {
  const context = await getSportsTeamsContext();
  if (!context || context.campusIds.length === 0) return [];
  const admin = createAdminClient();

  const { data: squadRows } = await admin
    .from("tournament_squads")
    .select("team_id")
    .returns<Array<{ team_id: string }>>();
  const squadTeamIds = new Set((squadRows ?? []).map((row) => row.team_id));

  const [{ data: teams }, { data: counts }] = await Promise.all([
    admin
      .from("teams")
      .select("id, name, birth_year, gender, level, type, campus_id, is_active, season_label, campuses(name, code), coaches(id, first_name, last_name)")
      .in("campus_id", context.campusIds)
      .order("campus_id", { ascending: true })
      .order("birth_year", { ascending: false })
      .order("name", { ascending: true })
      .returns<TeamRow[]>(),
    admin.rpc("list_teams_with_counts")
  ]);

  const countMap = new Map(((counts ?? []) as CountRow[]).map((r) => [r.team_id, r]));

  return (teams ?? []).map((row) => {
    const c = countMap.get(row.id);
    return {
      id: row.id,
      name: row.name,
      campusId: row.campus_id,
      campusName: row.campuses?.name ?? "-",
      campusCode: row.campuses?.code ?? "",
      birthYear: row.birth_year,
      gender: row.gender,
      level: row.level,
      type: row.type,
      coachName: row.coaches ? `${row.coaches.first_name} ${row.coaches.last_name}`.trim() : null,
      coachId: row.coaches?.id ?? null,
      isActive: row.is_active,
      seasonLabel: row.season_label,
      playerCount: c?.player_count ?? 0,
      newArrivalCount: c?.new_arrival_count ?? 0,
      isCompetitionSquad: squadTeamIds.has(row.id),
    };
  });
}

export async function getTeamDetail(teamId: string): Promise<TeamDetail | null> {
  const admin = createAdminClient();
  const campusAccess = await getOperationalCampusAccess();
  if (!campusAccess) return null;

  const [{ data: team }, { data: rosterRows }, { data: historyRows }] = await Promise.all([
    admin
      .from("teams")
      .select("id, name, birth_year, gender, level, type, campus_id, is_active, season_label, campuses(name, code), coaches(id, first_name, last_name)")
      .eq("id", teamId)
      .maybeSingle()
      .returns<TeamRow | null>(),
    admin
      .from("team_assignments")
      .select("id, enrollment_id, is_new_arrival, role, is_primary, start_date, enrollments!inner(players!inner(id, first_name, last_name, birth_date))")
      .eq("team_id", teamId)
      .is("end_date", null)
      .eq("enrollments.status", "active")
      .order("start_date", { ascending: true })
      .returns<RosterRow[]>(),
    admin
      .from("team_assignments")
      .select("id, enrollment_id, role, is_primary, start_date, end_date, enrollments(players(id, first_name, last_name))")
      .eq("team_id", teamId)
      .not("end_date", "is", null)
      .order("end_date", { ascending: false })
      .limit(50)
      .returns<HistoryRow[]>()
  ]);

  if (!team) return null;
  if (!canAccessCampus(campusAccess, team.campus_id)) return null;

  const today = new Date();

  const roster: RosterPlayer[] = (rosterRows ?? [])
    .filter((r) => r.enrollments?.players)
    .map((r) => {
      const start = new Date(r.start_date);
      const days = Math.floor((today.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
      return {
        assignmentId: r.id,
        enrollmentId: r.enrollment_id,
        playerId: r.enrollments!.players!.id,
        playerName: `${r.enrollments!.players!.first_name} ${r.enrollments!.players!.last_name}`.trim(),
        birthDate: r.enrollments!.players!.birth_date,
        isNewArrival: r.is_new_arrival,
        role: r.role as "regular" | "refuerzo",
        isPrimary: r.is_primary,
        startDate: r.start_date,
        daysOnTeam: days,
      };
    })
    .sort((a, b) => {
      // New arrivals first, then alphabetical
      if (a.isNewArrival !== b.isNewArrival) return a.isNewArrival ? -1 : 1;
      return a.playerName.localeCompare(b.playerName);
    });

  const history: HistoryPlayer[] = (historyRows ?? [])
    .filter((r) => r.enrollments?.players)
    .map((r) => {
      const start = new Date(r.start_date);
      const end = new Date(r.end_date);
      const days = Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
      return {
        assignmentId: r.id,
        enrollmentId: r.enrollment_id,
        playerId: r.enrollments!.players!.id,
        playerName: `${r.enrollments!.players!.first_name} ${r.enrollments!.players!.last_name}`.trim(),
        role: r.role,
        isPrimary: r.is_primary,
        startDate: r.start_date,
        endDate: r.end_date,
        daysOnTeam: days,
      };
    });

  const counts = await admin.rpc("list_teams_with_counts");
  const countMap = new Map(((counts.data ?? []) as CountRow[]).map((r) => [r.team_id, r]));
  const c = countMap.get(teamId);

  return {
    id: team.id,
    name: team.name,
    campusId: team.campus_id,
    campusName: team.campuses?.name ?? "-",
    campusCode: team.campuses?.code ?? "",
    birthYear: team.birth_year,
    gender: team.gender,
    level: team.level,
    type: team.type,
    coachName: team.coaches ? `${team.coaches.first_name} ${team.coaches.last_name}`.trim() : null,
    coachId: team.coaches?.id ?? null,
    isActive: team.is_active,
    seasonLabel: team.season_label,
    playerCount: c?.player_count ?? roster.length,
    newArrivalCount: c?.new_arrival_count ?? roster.filter((r) => r.isNewArrival).length,
    roster,
    history,
  };
}

export async function listCoaches(): Promise<CoachOption[]> {
  const context = await getSportsTeamsContext();
  if (!context || context.campusIds.length === 0) return [];
  const admin = createAdminClient();
  const { data } = await admin
    .from("coaches")
    .select("id, first_name, last_name, campus_id")
    .eq("is_active", true)
    .in("campus_id", context.campusIds)
    .order("last_name", { ascending: true })
    .returns<CoachRow[]>();

  return (data ?? []).map((r) => ({
    id: r.id,
    name: `${r.first_name} ${r.last_name}`.trim(),
    campusId: r.campus_id,
  }));
}

/** Find the active B2 competition team for auto-assign on enrollment. */
export async function findB2TeamForAutoAssign(
  campusId: string,
  birthYear: number,
  gender: string | null
): Promise<{ id: string } | null> {
  const supabase = await createClient();
  let query = supabase
    .from("teams")
    .select("id")
    .eq("campus_id", campusId)
    .eq("birth_year", birthYear)
    .eq("level", "B2")
    .eq("type", "competition")
    .eq("is_active", true);

  if (gender) {
    query = query.eq("gender", gender);
  }

  const { data } = await query.maybeSingle().returns<{ id: string } | null>();
  return data ?? null;
}

// ── Legacy exports (used by existing pages) ───────────────────────────────────

export async function listTeamsWithCampus(): Promise<TeamOption[]> {
  const context = await getSportsTeamsContext();
  if (!context || context.campusIds.length === 0) return [];
  const admin = createAdminClient();
  const { data } = await admin
    .from("teams")
    .select("id, name, birth_year, gender, level, campus_id, campuses(name)")
    .eq("is_active", true)
    .in("campus_id", context.campusIds)
    .order("campus_id", { ascending: true })
    .order("birth_year", { ascending: true })
    .order("name", { ascending: true })
    .returns<TeamRow[]>();

  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    campusId: row.campus_id,
    campusName: row.campuses?.name ?? "-",
    birthYear: row.birth_year,
    gender: row.gender,
    level: row.level,
  }));
}

export async function getBaseTeamBoardData(filters?: {
  campusId?: string | null;
  birthYear?: string | number | null;
  gender?: string | null;
}): Promise<BaseTeamBoardData> {
  const context = await getSportsTeamsContext();
  if (!context) {
    return {
      campuses: [],
      selectedCampusId: null,
      birthYearOptions: [],
      selectedBirthYear: null,
      genderOptions: [
        { value: "male", label: TEAM_GENDER_LABELS.male },
        { value: "female", label: TEAM_GENDER_LABELS.female },
        { value: "mixed", label: TEAM_GENDER_LABELS.mixed },
      ],
      selectedGender: "male",
      players: [],
      slots: BASE_TEAM_LEVELS.map((level) => ({ level, team: null, roster: [] })),
      selectedCampusName: null,
    };
  }

  const admin = createAdminClient();
  const selectedCampusId =
    filters?.campusId && context.campusIds.includes(filters.campusId)
      ? filters.campusId
      : context.campuses[0]?.id ?? null;

  const { data: squadRows } = await admin
    .from("tournament_squads")
    .select("team_id")
    .returns<Array<{ team_id: string }>>();
  const squadTeamIds = new Set((squadRows ?? []).map((row) => row.team_id));

  const [{ data: allTeams }, { data: counts }, { data: enrollments }] = await Promise.all([
    admin
      .from("teams")
      .select("id, name, birth_year, gender, level, type, campus_id, is_active, season_label, campuses(name, code), coaches(id, first_name, last_name)")
      .in("campus_id", context.campusIds)
      .eq("is_active", true)
      .returns<TeamRow[]>(),
    admin.rpc("list_teams_with_counts"),
    admin
      .from("enrollments")
      .select("id, campus_id, player_id, players(id, first_name, last_name, birth_date, gender)")
      .in("campus_id", context.campusIds)
      .eq("status", "active")
      .returns<EnrollmentBoardRow[]>(),
  ]);

  const enrollmentIds = (enrollments ?? []).map((row) => row.id);
  const { data: assignmentRows } = enrollmentIds.length
    ? await admin
        .from("team_assignments")
        .select("enrollment_id, teams(id, name, birth_year, gender, level)")
        .in("enrollment_id", enrollmentIds)
        .eq("is_primary", true)
        .is("end_date", null)
        .returns<PrimaryAssignmentBoardRow[]>()
    : { data: [] as PrimaryAssignmentBoardRow[] };

  const assignmentByEnrollment = new Map((assignmentRows ?? []).map((row) => [row.enrollment_id, row.teams]));
  const countMap = new Map(((counts ?? []) as CountRow[]).map((row) => [row.team_id, row]));
  const baseTeams = (allTeams ?? [])
    .filter((team) => team.type === "competition" && !squadTeamIds.has(team.id))
    .map<TeamListItem>((row) => {
      const c = countMap.get(row.id);
      return {
        id: row.id,
        name: row.name,
        campusId: row.campus_id,
        campusName: row.campuses?.name ?? "-",
        campusCode: row.campuses?.code ?? "",
        birthYear: row.birth_year,
        gender: row.gender,
        level: row.level,
        type: row.type,
        coachName: row.coaches ? `${row.coaches.first_name} ${row.coaches.last_name}`.trim() : null,
        coachId: row.coaches?.id ?? null,
        isActive: row.is_active,
        seasonLabel: row.season_label,
        playerCount: c?.player_count ?? 0,
        newArrivalCount: c?.new_arrival_count ?? 0,
        isCompetitionSquad: false,
      };
    });

  const campusRows = (enrollments ?? []).filter((row) => row.campus_id === selectedCampusId);
  const birthYearOptions = Array.from(
    new Set(campusRows.map((row) => getBirthYearFromDate(row.players?.birth_date)).filter((value): value is number => value !== null)),
  ).sort((a, b) => b - a);
  const selectedBirthYearRaw =
    typeof filters?.birthYear === "string"
      ? Number.parseInt(filters.birthYear, 10)
      : typeof filters?.birthYear === "number"
        ? filters.birthYear
        : null;
  const selectedBirthYear =
    selectedBirthYearRaw && birthYearOptions.includes(selectedBirthYearRaw)
      ? selectedBirthYearRaw
      : birthYearOptions[0] ?? null;

  const availableGenderSet = new Set<string>();
  for (const row of campusRows) {
    const birthYear = getBirthYearFromDate(row.players?.birth_date);
    if (selectedBirthYear !== null && birthYear !== selectedBirthYear) continue;
    if (row.players?.gender === "male" || row.players?.gender === "female") availableGenderSet.add(row.players.gender);
  }
  if (
    baseTeams.some(
      (team) =>
        team.campusId === selectedCampusId &&
        team.birthYear === selectedBirthYear &&
        team.gender === "mixed",
    ) ||
    campusRows.some((row) => getBirthYearFromDate(row.players?.birth_date) === selectedBirthYear)
  ) {
    availableGenderSet.add("mixed");
  }

  const genderSeed = String(filters?.gender ?? "").trim();
  const selectedGender = TEAM_GENDER_OPTIONS.includes(genderSeed as (typeof TEAM_GENDER_OPTIONS)[number])
    ? genderSeed
    : availableGenderSet.has("male")
      ? "male"
      : availableGenderSet.has("female")
        ? "female"
        : "mixed";

  const players = (campusRows ?? [])
    .map<BaseTeamBoardPlayer | null>((row) => {
      const birthYear = getBirthYearFromDate(row.players?.birth_date);
      if (selectedBirthYear !== null && birthYear !== selectedBirthYear) return null;
      if (!matchesBoardGender(row.players?.gender ?? null, selectedGender)) return null;
      const currentTeam = assignmentByEnrollment.get(row.id) ?? null;
      return {
        enrollmentId: row.id,
        playerId: row.player_id,
        playerName: row.players ? `${row.players.first_name} ${row.players.last_name}`.trim() : "Jugador",
        birthYear,
        gender: row.players?.gender ?? null,
        currentTeamId: currentTeam?.id ?? null,
        currentTeamName: currentTeam?.name ?? null,
        currentLevel: currentTeam?.level ?? null,
      };
    })
    .filter((row): row is BaseTeamBoardPlayer => row !== null)
    .sort((a, b) => a.playerName.localeCompare(b.playerName, "es-MX"));

  const playersByTeamId = new Map<string, BaseTeamBoardPlayer[]>();
  for (const player of players) {
    if (!player.currentTeamId) continue;
    const list = playersByTeamId.get(player.currentTeamId) ?? [];
    list.push(player);
    playersByTeamId.set(player.currentTeamId, list);
  }

  const slots: BaseTeamBoardSlot[] = BASE_TEAM_LEVELS.map((level) => {
    const team =
      baseTeams.find(
        (candidate) =>
          candidate.campusId === selectedCampusId &&
          candidate.birthYear === selectedBirthYear &&
          candidate.gender === selectedGender &&
          candidate.level === level,
      ) ?? null;
    return {
      level,
      team,
      roster: team ? (playersByTeamId.get(team.id) ?? []).sort((a, b) => a.playerName.localeCompare(b.playerName, "es-MX")) : [],
    };
  });

  return {
    campuses: context.campuses,
    selectedCampusId,
    birthYearOptions,
    selectedBirthYear,
    genderOptions: [
      { value: "male", label: TEAM_GENDER_LABELS.male },
      { value: "female", label: TEAM_GENDER_LABELS.female },
      { value: "mixed", label: TEAM_GENDER_LABELS.mixed },
    ],
    selectedGender,
    players,
    slots,
    selectedCampusName: context.campuses.find((campus) => campus.id === selectedCampusId)?.name ?? null,
  };
}

export async function listBulkChargeTypes(): Promise<BulkChargeType[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("charge_types")
    .select("id, code, name")
    .eq("is_active", true)
    .order("name", { ascending: true })
    .returns<ChargeTypeRow[]>();

  return (data ?? [])
    .filter((row) => !EXCLUDED_CODES.has(row.code))
    .map((row) => ({ id: row.id, code: row.code, name: row.name }));
}
