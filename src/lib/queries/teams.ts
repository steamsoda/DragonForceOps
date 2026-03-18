import { createClient } from "@/lib/supabase/server";

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
  const genderLabel = gender === "male" ? "Varonil" : gender === "female" ? "Femenil" : "";
  const parts = [campusCode, birthYear, genderLabel, level].filter(Boolean);
  return parts.join(" ");
}

export const LEVELS = ["B2", "B1", "Selectivo"] as const;
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

// ── Charge type codes that are auto-managed — exclude from bulk charge form ──

const EXCLUDED_CODES = new Set(["monthly_tuition", "inscription", "early_bird_discount"]);

// ── Queries ───────────────────────────────────────────────────────────────────

export async function listTeams(): Promise<TeamListItem[]> {
  const supabase = await createClient();

  const [{ data: teams }, { data: counts }] = await Promise.all([
    supabase
      .from("teams")
      .select("id, name, birth_year, gender, level, type, campus_id, is_active, season_label, campuses(name, code), coaches(id, first_name, last_name)")
      .order("campus_id", { ascending: true })
      .order("birth_year", { ascending: false })
      .order("name", { ascending: true })
      .returns<TeamRow[]>(),
    supabase.rpc("list_teams_with_counts").returns<CountRow[]>()
  ]);

  const countMap = new Map((counts ?? []).map((r) => [r.team_id, r]));

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
    };
  });
}

export async function getTeamDetail(teamId: string): Promise<TeamDetail | null> {
  const supabase = await createClient();

  const [{ data: team }, { data: rosterRows }, { data: historyRows }] = await Promise.all([
    supabase
      .from("teams")
      .select("id, name, birth_year, gender, level, type, campus_id, is_active, season_label, campuses(name, code), coaches(id, first_name, last_name)")
      .eq("id", teamId)
      .maybeSingle()
      .returns<TeamRow | null>(),
    supabase
      .from("team_assignments")
      .select("id, enrollment_id, is_new_arrival, role, is_primary, start_date, enrollments!inner(players!inner(id, first_name, last_name, birth_date))")
      .eq("team_id", teamId)
      .is("end_date", null)
      .eq("enrollments.status", "active")
      .order("start_date", { ascending: true })
      .returns<RosterRow[]>(),
    supabase
      .from("team_assignments")
      .select("id, enrollment_id, role, is_primary, start_date, end_date, enrollments(players(id, first_name, last_name))")
      .eq("team_id", teamId)
      .not("end_date", "is", null)
      .order("end_date", { ascending: false })
      .limit(50)
      .returns<HistoryRow[]>()
  ]);

  if (!team) return null;

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

  const counts = await supabase.rpc("list_teams_with_counts").returns<CountRow[]>();
  const countMap = new Map((counts.data ?? []).map((r) => [r.team_id, r]));
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
  const supabase = await createClient();
  const { data } = await supabase
    .from("coaches")
    .select("id, first_name, last_name, campus_id")
    .eq("is_active", true)
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
  const supabase = await createClient();
  const { data } = await supabase
    .from("teams")
    .select("id, name, birth_year, gender, level, campus_id, campuses(name)")
    .eq("is_active", true)
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
