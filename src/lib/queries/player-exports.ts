import { getOperationalCampusAccess } from "@/lib/auth/campuses";
import { createClient } from "@/lib/supabase/server";

type ExportEnrollmentRow = {
  id: string;
  campus_id: string;
  campuses: {
    name: string | null;
    code: string | null;
  } | null;
  players: {
    id: string;
    first_name: string;
    last_name: string;
    birth_date: string;
    gender: string | null;
    level: string | null;
  } | null;
};

type ExportGuardianRow = {
  player_id: string;
  is_primary: boolean;
  guardians: {
    phone_primary: string | null;
  } | null;
};

type ExportTeamRow = {
  enrollment_id: string;
  teams: {
    name: string;
    level: string | null;
  } | null;
};

export type AttendanceExportRow = {
  campusId: string;
  campusName: string;
  campusCode: string;
  birthYear: number;
  genderLabel: string;
  level: string;
  teamName: string;
  playerName: string;
  guardianPhone: string;
};

export type AttendanceExportWarning = {
  campusId: string;
  campusName: string;
  birthYear: number;
  count: number;
};

export type AttendanceExportData = {
  rows: AttendanceExportRow[];
  excludedMissingGenderCount: number;
  excludedMissingGender: AttendanceExportWarning[];
};

function normalizeGenderLabel(value: string | null | undefined) {
  if (value === "male") return "Varonil";
  if (value === "female") return "Femenil";
  return null;
}

function normalizeLevel(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : "Sin nivel";
}

export async function getAttendanceExportData(): Promise<AttendanceExportData> {
  const campusAccess = await getOperationalCampusAccess();
  if (!campusAccess || campusAccess.campusIds.length === 0) {
    return {
      rows: [],
      excludedMissingGenderCount: 0,
      excludedMissingGender: [],
    };
  }

  const supabase = await createClient();
  const { data: enrollments } = await supabase
    .from("enrollments")
    .select("id, campus_id, campuses(name, code), players!inner(id, first_name, last_name, birth_date, gender, level)")
    .eq("status", "active")
    .in("campus_id", campusAccess.campusIds)
    .order("campus_id", { ascending: true })
    .order("start_date", { ascending: false })
    .returns<ExportEnrollmentRow[]>();

  if (!enrollments || enrollments.length === 0) {
    return {
      rows: [],
      excludedMissingGenderCount: 0,
      excludedMissingGender: [],
    };
  }

  const playerIds = enrollments.map((row) => row.players?.id).filter(Boolean) as string[];
  const enrollmentIds = enrollments.map((row) => row.id);

  const [{ data: guardianRows }, { data: teamRows }] = await Promise.all([
    supabase
      .from("player_guardians")
      .select("player_id, is_primary, guardians(phone_primary)")
      .in("player_id", playerIds)
      .returns<ExportGuardianRow[]>(),
    supabase
      .from("team_assignments")
      .select("enrollment_id, teams(name, level)")
      .in("enrollment_id", enrollmentIds)
      .is("end_date", null)
      .eq("is_primary", true)
      .returns<ExportTeamRow[]>(),
  ]);

  const guardiansByPlayer = new Map<string, ExportGuardianRow[]>();
  for (const row of guardianRows ?? []) {
    const current = guardiansByPlayer.get(row.player_id) ?? [];
    current.push(row);
    guardiansByPlayer.set(row.player_id, current);
  }

  const teamByEnrollment = new Map<string, ExportTeamRow["teams"]>();
  for (const row of teamRows ?? []) {
    teamByEnrollment.set(row.enrollment_id, row.teams ?? null);
  }

  const warningMap = new Map<string, AttendanceExportWarning>();

  const rows = enrollments
    .filter((row) => !!row.players?.birth_date)
    .flatMap((row) => {
      const player = row.players!;
      const birthYear = parseInt(player.birth_date.slice(0, 4), 10);
      const genderLabel = normalizeGenderLabel(player.gender);

      if (!genderLabel) {
        const warningKey = `${row.campus_id}:${birthYear}`;
        const current = warningMap.get(warningKey) ?? {
          campusId: row.campus_id,
          campusName: row.campuses?.name ?? "-",
          birthYear,
          count: 0,
        };
        current.count += 1;
        warningMap.set(warningKey, current);
        return [];
      }

      const guardianLinks = guardiansByPlayer.get(player.id) ?? [];
      const guardianPhone =
        guardianLinks.find((link) => link.is_primary)?.guardians?.phone_primary ??
        guardianLinks.find((link) => !!link.guardians?.phone_primary)?.guardians?.phone_primary ??
        "-";
      const team = teamByEnrollment.get(row.id) ?? null;

      return [{
        campusId: row.campus_id,
        campusName: row.campuses?.name ?? "-",
        campusCode: row.campuses?.code ?? "",
        birthYear,
        genderLabel,
        level: normalizeLevel(team?.level ?? player.level),
        teamName: team?.name?.trim() || "-",
        playerName: `${player.first_name} ${player.last_name}`.replace(/\s+/g, " ").trim(),
        guardianPhone: guardianPhone || "-",
      }];
    })
    .sort((a, b) => {
      const campusDiff = a.campusName.localeCompare(b.campusName, "es-MX");
      if (campusDiff !== 0) return campusDiff;
      if (a.birthYear !== b.birthYear) return a.birthYear - b.birthYear;
      const genderDiff = a.genderLabel.localeCompare(b.genderLabel, "es-MX");
      if (genderDiff !== 0) return genderDiff;
      const levelDiff = a.level.localeCompare(b.level, "es-MX");
      if (levelDiff !== 0) return levelDiff;
      return a.playerName.localeCompare(b.playerName, "es-MX");
    });

  const excludedMissingGender = [...warningMap.values()].sort((a, b) => {
    const campusDiff = a.campusName.localeCompare(b.campusName, "es-MX");
    if (campusDiff !== 0) return campusDiff;
    return a.birthYear - b.birthYear;
  });

  return {
    rows,
    excludedMissingGenderCount: excludedMissingGender.reduce((sum, row) => sum + row.count, 0),
    excludedMissingGender,
  };
}

export async function getAttendanceExportRows(): Promise<AttendanceExportRow[]> {
  const data = await getAttendanceExportData();
  return data.rows;
}
