import { createAdminClient } from "@/lib/supabase/admin";
import {
  canAccessNutritionCampus,
  getNutritionCampusAccess,
  type AccessibleCampus,
} from "@/lib/auth/campuses";
import { getMonterreyMonthBounds, getMonterreyMonthString } from "@/lib/time";
import {
  buildGrowthProfile,
  getGrowthSex,
  type GrowthProfile,
  type WhoGrowthReferenceRow,
} from "@/lib/nutrition/growth";
import {
  TRAINING_GROUP_GENDER_LABELS,
  TRAINING_GROUP_PROGRAM_LABELS,
  formatTrainingGroupBirthYearRange,
} from "@/lib/training-groups/shared";

type ActiveNutritionEnrollmentRow = {
  id: string;
  player_id: string;
  campus_id: string;
  created_at: string;
  start_date: string;
  inscription_date: string;
  campuses: { name: string | null } | null;
  players: {
    public_player_id?: string | null;
    first_name: string | null;
    last_name: string | null;
    birth_date: string | null;
    gender: string | null;
    medical_notes: string | null;
    level: string | null;
  } | null;
};

type NutritionTrainingGroupRow = {
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
};

type NutritionTrainingGroupAssignmentRow = {
  enrollment_id: string;
  training_group_id: string;
  training_groups: NutritionTrainingGroupRow | null;
};

type MeasurementSessionRow = {
  id: string;
  player_id: string;
  enrollment_id: string;
  campus_id: string;
  measured_at: string;
  source: "initial_intake" | "follow_up";
  weight_kg: number | string;
  height_cm: number | string;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type RecentMeasurementRow = MeasurementSessionRow & {
  players: { first_name: string | null; last_name: string | null } | null;
  campuses: { name: string | null } | null;
};

type GuardianLinkRow = {
  player_id: string;
  is_primary: boolean | null;
  guardians: {
    first_name: string | null;
    last_name: string | null;
    phone_primary: string | null;
    phone_secondary: string | null;
    email: string | null;
    relationship_label: string | null;
  } | null;
};

export type NutritionGuardianContact = {
  name: string;
  phonePrimary: string | null;
  phoneSecondary: string | null;
  email: string | null;
  relationshipLabel: string | null;
};

function toNumber(value: number | string | null | undefined) {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  return 0;
}

function getPlayerName(player: ActiveNutritionEnrollmentRow["players"] | RecentMeasurementRow["players"]) {
  return `${player?.first_name ?? ""} ${player?.last_name ?? ""}`.replace(/\s+/g, " ").trim() || "Jugador";
}

function getGenderLabel(value: string | null | undefined) {
  if (value === "male") return "Varonil";
  if (value === "female") return "Femenil";
  return "Sin genero";
}

function mapGuardianContact(row: GuardianLinkRow | null | undefined): NutritionGuardianContact | null {
  const guardian = row?.guardians;
  if (!guardian) return null;
  const name = `${guardian.first_name ?? ""} ${guardian.last_name ?? ""}`.replace(/\s+/g, " ").trim();

  return {
    name: name || "Tutor",
    phonePrimary: guardian.phone_primary ?? null,
    phoneSecondary: guardian.phone_secondary ?? null,
    email: guardian.email ?? null,
    relationshipLabel: guardian.relationship_label ?? null,
  };
}

function getBirthYear(value: string | null | undefined) {
  return value ? Number.parseInt(value.slice(0, 4), 10) : null;
}

function normalizeGenderFilter(value: string | null | undefined): "male" | "female" | "" {
  return value === "male" || value === "female" ? value : "";
}

function groupMatchesGender(group: NutritionTrainingGroupRow, gender: "male" | "female" | "") {
  if (!gender) return true;
  return group.gender === gender || group.gender === "mixed";
}

function normalizeBirthYearFilter(value: string | number | null | undefined) {
  const year = typeof value === "number" ? value : Number.parseInt(value ?? "", 10);
  return Number.isFinite(year) && year >= 2000 && year <= 2100 ? year : null;
}

function groupMatchesBirthYear(group: NutritionTrainingGroupRow, birthYear: number | null) {
  if (!birthYear) return true;
  const min = group.birth_year_min;
  const max = group.birth_year_max;
  if (min == null && max == null) return true;
  if (min != null && max != null) return birthYear >= min && birthYear <= max;
  return birthYear === (min ?? max);
}

function trainingGroupSubtitle(group: NutritionTrainingGroupRow) {
  const parts = [
    TRAINING_GROUP_PROGRAM_LABELS[group.program] ?? group.program,
    `Cat. ${formatTrainingGroupBirthYearRange(group.birth_year_min, group.birth_year_max)}`,
    TRAINING_GROUP_GENDER_LABELS[group.gender] ?? group.gender,
  ];
  if (group.start_time && group.end_time) parts.push(`${group.start_time.slice(0, 5)}-${group.end_time.slice(0, 5)}`);
  return parts.join(" | ");
}

function programRank(program: string | null) {
  if (program === "selectivo") return 0;
  if (program === "futbol_para_todos") return 1;
  if (program === "little_dragons") return 2;
  return 9;
}

function levelRank(value: string) {
  const normalized = value.trim().toLowerCase();
  if (normalized.includes("selectivo") || normalized === "sel") return 0;
  if (normalized === "b1") return 1;
  if (normalized === "b2") return 2;
  if (normalized === "b3") return 3;
  if (normalized.includes("little")) return 4;
  if (normalized === "sin nivel") return 9;
  return 5;
}

function getSelectedNutritionCampusIds(campuses: AccessibleCampus[], campusId?: string) {
  if (!campusId) return campuses.map((campus) => campus.id);
  return campuses.some((campus) => campus.id === campusId) ? [campusId] : [];
}

function buildMonthSeries(selectedMonth: string, count = 6) {
  const [yearRaw, monthRaw] = selectedMonth.split("-");
  const anchor = new Date(Date.UTC(Number(yearRaw), Number(monthRaw) - 1, 1, 12, 0, 0, 0));

  return Array.from({ length: count }, (_, index) => {
    const current = new Date(anchor);
    current.setUTCMonth(anchor.getUTCMonth() - (count - index - 1));

    const year = current.getUTCFullYear();
    const month = String(current.getUTCMonth() + 1).padStart(2, "0");
    const key = `${year}-${month}`;
    const label = new Intl.DateTimeFormat("es-MX", {
      month: "short",
      year: "2-digit",
      timeZone: "UTC",
    }).format(current);

    return { key, label };
  });
}

async function listAccessibleActiveEnrollments(selectedCampusIds: string[]) {
  if (selectedCampusIds.length === 0) return [] as ActiveNutritionEnrollmentRow[];

  const admin = createAdminClient();
  const { data } = await admin
    .from("enrollments")
    .select("id, player_id, campus_id, created_at, start_date, inscription_date, campuses(name), players(public_player_id, first_name, last_name, birth_date, gender, medical_notes, level)")
    .eq("status", "active")
    .in("campus_id", selectedCampusIds)
    .order("created_at", { ascending: false })
    .returns<ActiveNutritionEnrollmentRow[]>();

  return data ?? [];
}

async function listNutritionTrainingGroups(selectedCampusId: string, selectedGender: "male" | "female" | "") {
  const admin = createAdminClient();
  let query = admin
    .from("training_groups")
    .select("id, campus_id, name, program, level_label, group_code, gender, birth_year_min, birth_year_max, start_time, end_time, status")
    .eq("campus_id", selectedCampusId)
    .eq("status", "active")
    .order("program", { ascending: true })
    .order("start_time", { ascending: true });

  if (selectedGender) {
    query = query.in("gender", [selectedGender, "mixed"]);
  }

  const { data } = await query.returns<NutritionTrainingGroupRow[]>();
  return data ?? [];
}

async function listNutritionTrainingGroupAssignments(selectedCampusId: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("training_group_assignments")
    .select("enrollment_id, training_group_id, training_groups!inner(id, campus_id, name, program, level_label, group_code, gender, birth_year_min, birth_year_max, start_time, end_time, status)")
    .is("end_date", null)
    .eq("training_groups.campus_id", selectedCampusId)
    .returns<NutritionTrainingGroupAssignmentRow[]>();

  return data ?? [];
}

async function listMeasurementSessionsForPlayers(playerIds: string[]) {
  if (playerIds.length === 0) return [] as MeasurementSessionRow[];

  const admin = createAdminClient();
  const { data } = await admin
    .from("player_measurement_sessions")
    .select("id, player_id, enrollment_id, campus_id, measured_at, source, weight_kg, height_cm, notes, created_at, updated_at")
    .in("player_id", playerIds)
    .order("measured_at", { ascending: false })
    .returns<MeasurementSessionRow[]>();

  return data ?? [];
}

async function listGuardianContactsForPlayers(playerIds: string[]) {
  if (playerIds.length === 0) return new Map<string, NutritionGuardianContact>();

  const admin = createAdminClient();
  const { data } = await admin
    .from("player_guardians")
    .select("player_id, is_primary, guardians(first_name, last_name, phone_primary, phone_secondary, email, relationship_label)")
    .in("player_id", playerIds)
    .order("is_primary", { ascending: false })
    .returns<GuardianLinkRow[]>();

  const byPlayer = new Map<string, NutritionGuardianContact>();
  for (const row of data ?? []) {
    if (byPlayer.has(row.player_id)) continue;
    const contact = mapGuardianContact(row);
    if (contact) byPlayer.set(row.player_id, contact);
  }

  return byPlayer;
}

export type NutritionDashboardFilters = {
  campusId?: string;
  month?: string;
};

export type NutritionMeasurementListFilters = {
  campusId?: string;
  q?: string;
  intakeStatus?: "pending" | "all";
};

export type NutritionGroupedRosterFilters = {
  campusId?: string;
  gender?: string;
  birthYear?: string | number;
  intakeStatus?: "pending" | "all";
};

export type NutritionActivityPoint = {
  label: string;
  total: number;
};

export type NutritionRecentSession = {
  id: string;
  playerId: string;
  playerName: string;
  campusName: string;
  measuredAt: string;
  source: "initial_intake" | "follow_up";
  weightKg: number;
  heightCm: number;
};

export type NutritionDashboardData = {
  selectedMonth: string;
  pendingFirstMeasurement: number;
  measuredPlayers: number;
  sessionsThisMonth: number;
  latestEnrollmentsPendingIntake: number;
  activity: NutritionActivityPoint[];
  recentSessions: NutritionRecentSession[];
};

export type NutritionMeasurementListRow = {
  playerId: string;
  enrollmentId: string;
  playerName: string;
  campusId: string;
  campusName: string;
  birthYear: number | null;
  gender: string | null;
  genderLabel: string;
  level: string | null;
  medicalNotes: string | null;
  guardianContact: NutritionGuardianContact | null;
  latestEnrollmentDate: string;
  hasCurrentEnrollmentMeasurement: boolean;
  latestMeasurementAt: string | null;
  latestWeightKg: number | null;
  latestHeightCm: number | null;
};

export type NutritionGroupedRosterRow = {
  enrollmentId: string;
  playerId: string;
  publicPlayerId: string;
  playerName: string;
  birthYear: number | null;
  genderLabel: string;
  levelGroup: string;
  guardianContact: NutritionGuardianContact | null;
  latestEnrollmentDate: string;
  hasCurrentEnrollmentMeasurement: boolean;
  latestMeasurementAt: string | null;
  latestWeightKg: number | null;
  latestHeightCm: number | null;
};

export type NutritionGroupedRosterSection = {
  id: string;
  name: string;
  subtitle: string;
  sortKey: string;
  rows: NutritionGroupedRosterRow[];
};

export type NutritionGroupedRosterData = {
  campuses: AccessibleCampus[];
  selectedCampusId: string;
  selectedCampusName: string;
  selectedGender: "male" | "female" | "";
  selectedBirthYear: number | null;
  birthYears: number[];
  intakeStatus: "pending" | "all";
  sections: NutritionGroupedRosterSection[];
  totalPlayers: number;
  unassignedCount: number;
};

export type NutritionProfileSession = {
  id: string;
  enrollmentId: string;
  campusId: string;
  measuredAt: string;
  source: "initial_intake" | "follow_up";
  weightKg: number;
  heightCm: number;
  notes: string | null;
};

export type NutritionProfileData = {
  playerId: string;
  playerName: string;
  birthDate: string | null;
  birthYear: number | null;
  gender: string | null;
  genderLabel: string;
  level: string | null;
  medicalNotes: string | null;
  guardianContact: NutritionGuardianContact | null;
  campusId: string;
  campusName: string;
  activeEnrollmentId: string;
  latestEnrollmentDate: string;
  currentEnrollmentHasMeasurement: boolean;
  latestSession: NutritionProfileSession | null;
  previousSession: NutritionProfileSession | null;
  deltaWeightKg: number | null;
  deltaHeightCm: number | null;
  history: NutritionProfileSession[];
  chartPoints: Array<{ label: string; weightKg: number; heightCm: number }>;
  growthProfile: GrowthProfile;
};

export async function listNutritionCampuses() {
  const access = await getNutritionCampusAccess();
  return access?.campuses ?? [];
}

export async function getNutritionDashboardData(filters: NutritionDashboardFilters): Promise<NutritionDashboardData> {
  const access = await getNutritionCampusAccess();
  const selectedMonth = filters.month ?? getMonterreyMonthString();

  if (!access || access.campuses.length === 0) {
    return {
      selectedMonth,
      pendingFirstMeasurement: 0,
      measuredPlayers: 0,
      sessionsThisMonth: 0,
      latestEnrollmentsPendingIntake: 0,
      activity: buildMonthSeries(selectedMonth).map((month) => ({ label: month.label, total: 0 })),
      recentSessions: [],
    };
  }

  const selectedCampusIds = getSelectedNutritionCampusIds(
    access.campuses.filter((campus) => canAccessNutritionCampus(access, campus.id)),
    filters.campusId,
  );

  if (selectedCampusIds.length === 0) {
    return {
      selectedMonth,
      pendingFirstMeasurement: 0,
      measuredPlayers: 0,
      sessionsThisMonth: 0,
      latestEnrollmentsPendingIntake: 0,
      activity: buildMonthSeries(selectedMonth).map((month) => ({ label: month.label, total: 0 })),
      recentSessions: [],
    };
  }

  const monthBounds = getMonterreyMonthBounds(selectedMonth);
  const monthSeries = buildMonthSeries(selectedMonth);
  const firstActivityBounds = getMonterreyMonthBounds(monthSeries[0].key);
  const activeEnrollments = await listAccessibleActiveEnrollments(selectedCampusIds);
  const playerIds = [...new Set(activeEnrollments.map((row) => row.player_id))];
  const allSessions = await listMeasurementSessionsForPlayers(playerIds);
  const currentEnrollmentSessionSet = new Set(allSessions.map((session) => session.enrollment_id));

  const activeEnrollmentIds = new Set(activeEnrollments.map((row) => row.id));
  const pendingFirstMeasurement = activeEnrollments.filter((row) => !currentEnrollmentSessionSet.has(row.id)).length;
  const measuredPlayers = activeEnrollments.length - pendingFirstMeasurement;
  const latestEnrollmentsPendingIntake = activeEnrollments.filter(
    (row) =>
      row.created_at >= monthBounds.start &&
      row.created_at < monthBounds.end &&
      !currentEnrollmentSessionSet.has(row.id),
  ).length;

  const admin = createAdminClient();
  const [{ data: currentMonthSessions }, { data: recentRows }] = await Promise.all([
    admin
      .from("player_measurement_sessions")
      .select("id")
      .in("campus_id", selectedCampusIds)
      .gte("measured_at", monthBounds.start)
      .lt("measured_at", monthBounds.end)
      .returns<Array<{ id: string }>>(),
    admin
      .from("player_measurement_sessions")
      .select("id, player_id, enrollment_id, campus_id, measured_at, source, weight_kg, height_cm, notes, created_at, updated_at, players(first_name, last_name), campuses(name)")
      .in("campus_id", selectedCampusIds)
      .order("measured_at", { ascending: false })
      .limit(8)
      .returns<RecentMeasurementRow[]>(),
  ]);

  const activityCounts = new Map<string, number>();
  for (const session of allSessions) {
    if (!activeEnrollmentIds.has(session.enrollment_id)) continue;
    if (session.measured_at < firstActivityBounds.start || session.measured_at >= monthBounds.end) continue;
    const key = session.measured_at.slice(0, 7);
    activityCounts.set(key, (activityCounts.get(key) ?? 0) + 1);
  }

  return {
    selectedMonth,
    pendingFirstMeasurement,
    measuredPlayers,
    sessionsThisMonth: currentMonthSessions?.length ?? 0,
    latestEnrollmentsPendingIntake,
    activity: monthSeries.map((month) => ({
      label: month.label,
      total: activityCounts.get(month.key) ?? 0,
    })),
    recentSessions: (recentRows ?? []).map((row) => ({
      id: row.id,
      playerId: row.player_id,
      playerName: getPlayerName(row.players),
      campusName: row.campuses?.name ?? "Campus",
      measuredAt: row.measured_at,
      source: row.source,
      weightKg: toNumber(row.weight_kg),
      heightCm: toNumber(row.height_cm),
    })),
  };
}

export async function listNutritionMeasurementRows(filters: NutritionMeasurementListFilters) {
  const access = await getNutritionCampusAccess();
  const intakeStatus = filters.intakeStatus ?? "pending";

  if (!access || access.campuses.length === 0) {
    return [] as NutritionMeasurementListRow[];
  }

  const selectedCampusIds = getSelectedNutritionCampusIds(
    access.campuses.filter((campus) => canAccessNutritionCampus(access, campus.id)),
    filters.campusId,
  );

  if (selectedCampusIds.length === 0) {
    return [] as NutritionMeasurementListRow[];
  }

  const activeEnrollments = await listAccessibleActiveEnrollments(selectedCampusIds);
  const playerIds = [...new Set(activeEnrollments.map((row) => row.player_id))];
  const [sessions, guardianContacts] = await Promise.all([
    listMeasurementSessionsForPlayers(playerIds),
    listGuardianContactsForPlayers(playerIds),
  ]);

  const latestSessionByPlayer = new Map<string, MeasurementSessionRow>();
  const currentEnrollmentSessionSet = new Set<string>();
  for (const session of sessions) {
    if (!latestSessionByPlayer.has(session.player_id)) {
      latestSessionByPlayer.set(session.player_id, session);
    }
    currentEnrollmentSessionSet.add(session.enrollment_id);
  }

  const queryText = (filters.q ?? "").trim().toLowerCase();

  return activeEnrollments
    .map((row) => {
      const latestPlayerSession = latestSessionByPlayer.get(row.player_id) ?? null;
      return {
        playerId: row.player_id,
        enrollmentId: row.id,
        playerName: getPlayerName(row.players),
        campusId: row.campus_id,
        campusName: row.campuses?.name ?? "Campus",
        birthYear: getBirthYear(row.players?.birth_date),
        gender: row.players?.gender ?? null,
        genderLabel: getGenderLabel(row.players?.gender),
        level: row.players?.level ?? null,
        medicalNotes: row.players?.medical_notes ?? null,
        guardianContact: guardianContacts.get(row.player_id) ?? null,
        latestEnrollmentDate: row.inscription_date,
        hasCurrentEnrollmentMeasurement: currentEnrollmentSessionSet.has(row.id),
        latestMeasurementAt: latestPlayerSession?.measured_at ?? null,
        latestWeightKg: latestPlayerSession ? toNumber(latestPlayerSession.weight_kg) : null,
        latestHeightCm: latestPlayerSession ? toNumber(latestPlayerSession.height_cm) : null,
      };
    })
    .filter((row) => {
      if (intakeStatus === "pending" && row.hasCurrentEnrollmentMeasurement) return false;
      if (queryText && !row.playerName.toLowerCase().includes(queryText)) return false;
      return true;
    })
    .sort((left, right) => {
      if (left.hasCurrentEnrollmentMeasurement !== right.hasCurrentEnrollmentMeasurement) {
        return Number(left.hasCurrentEnrollmentMeasurement) - Number(right.hasCurrentEnrollmentMeasurement);
      }
      return left.playerName.localeCompare(right.playerName, "es-MX");
    });
}

export async function getNutritionGroupedRosterData(filters: NutritionGroupedRosterFilters = {}): Promise<NutritionGroupedRosterData | null> {
  const access = await getNutritionCampusAccess();
  const intakeStatus = filters.intakeStatus ?? "pending";

  if (!access || access.campuses.length === 0) return null;

  const accessibleCampuses = access.campuses.filter((campus) => canAccessNutritionCampus(access, campus.id));
  const selectedCampus =
    filters.campusId && accessibleCampuses.some((campus) => campus.id === filters.campusId)
      ? accessibleCampuses.find((campus) => campus.id === filters.campusId)
      : accessibleCampuses[0];

  if (!selectedCampus) return null;

  const selectedGender = normalizeGenderFilter(filters.gender);
  const selectedBirthYear = normalizeBirthYearFilter(filters.birthYear);
  const activeEnrollments = await listAccessibleActiveEnrollments([selectedCampus.id]);
  const genderFilteredEnrollments = selectedGender
    ? activeEnrollments.filter((row) => row.players?.gender === selectedGender)
    : activeEnrollments;
  const birthYears = [...new Set(genderFilteredEnrollments.map((row) => getBirthYear(row.players?.birth_date)).filter((year): year is number => year != null))].sort((a, b) => b - a);
  const visibleEnrollments = selectedBirthYear
    ? genderFilteredEnrollments.filter((row) => getBirthYear(row.players?.birth_date) === selectedBirthYear)
    : genderFilteredEnrollments;
  const playerIds = [...new Set(visibleEnrollments.map((row) => row.player_id))];

  const [sessions, guardianContacts, groups, assignments] = await Promise.all([
    listMeasurementSessionsForPlayers(playerIds),
    listGuardianContactsForPlayers(playerIds),
    listNutritionTrainingGroups(selectedCampus.id, selectedGender),
    listNutritionTrainingGroupAssignments(selectedCampus.id),
  ]);

  const latestSessionByPlayer = new Map<string, MeasurementSessionRow>();
  const currentEnrollmentSessionSet = new Set<string>();
  for (const session of sessions) {
    if (!latestSessionByPlayer.has(session.player_id)) {
      latestSessionByPlayer.set(session.player_id, session);
    }
    currentEnrollmentSessionSet.add(session.enrollment_id);
  }

  const groupsById = new Map(groups.map((group) => [group.id, group]));
  const assignmentByEnrollment = new Map(assignments.map((assignment) => [assignment.enrollment_id, assignment.training_groups]));
  const sectionMap = new Map<string, NutritionGroupedRosterSection>();

  for (const group of [...groups]
    .sort((a, b) => {
      const programDiff = programRank(a.program) - programRank(b.program);
      if (programDiff !== 0) return programDiff;
      const startDiff = (a.start_time ?? "99:99").localeCompare(b.start_time ?? "99:99");
      if (startDiff !== 0) return startDiff;
      const yearDiff = (a.birth_year_min ?? 9999) - (b.birth_year_min ?? 9999);
      if (yearDiff !== 0) return yearDiff;
      return a.name.localeCompare(b.name, "es-MX");
    })
    .filter((group) => groupMatchesGender(group, selectedGender) && groupMatchesBirthYear(group, selectedBirthYear))) {
    sectionMap.set(group.id, {
      id: group.id,
      name: group.name,
      subtitle: trainingGroupSubtitle(group),
      sortKey: `${programRank(group.program)}:${group.start_time ?? "99:99"}:${group.birth_year_min ?? 9999}:${group.name}`,
      rows: [],
    });
  }

  const unassignedSection: NutritionGroupedRosterSection = {
    id: "sin-grupo",
    name: "Sin grupo",
    subtitle: "Jugadores activos sin grupo de entrenamiento asignado",
    sortKey: "99:sin-grupo",
    rows: [],
  };

  for (const enrollment of visibleEnrollments) {
    const hasCurrentMeasurement = currentEnrollmentSessionSet.has(enrollment.id);
    if (intakeStatus === "pending" && hasCurrentMeasurement) continue;

    const player = enrollment.players;
    const assignedGroup = assignmentByEnrollment.get(enrollment.id) ?? null;
    const canonicalGroup = assignedGroup?.id ? groupsById.get(assignedGroup.id) ?? assignedGroup : null;
    const targetSection = canonicalGroup?.id ? sectionMap.get(canonicalGroup.id) ?? unassignedSection : unassignedSection;
    const latestSession = latestSessionByPlayer.get(enrollment.player_id) ?? null;
    const levelGroup =
      canonicalGroup?.level_label?.trim() ||
      canonicalGroup?.group_code?.trim() ||
      player?.level?.trim() ||
      canonicalGroup?.name ||
      "Sin nivel";

    targetSection.rows.push({
      enrollmentId: enrollment.id,
      playerId: enrollment.player_id,
      publicPlayerId: player?.public_player_id ?? "Pendiente",
      playerName: getPlayerName(player),
      birthYear: getBirthYear(player?.birth_date),
      genderLabel: getGenderLabel(player?.gender),
      levelGroup,
      guardianContact: guardianContacts.get(enrollment.player_id) ?? null,
      latestEnrollmentDate: enrollment.inscription_date,
      hasCurrentEnrollmentMeasurement: hasCurrentMeasurement,
      latestMeasurementAt: latestSession?.measured_at ?? null,
      latestWeightKg: latestSession ? toNumber(latestSession.weight_kg) : null,
      latestHeightCm: latestSession ? toNumber(latestSession.height_cm) : null,
    });
  }

  const sections = [...sectionMap.values(), ...(unassignedSection.rows.length > 0 ? [unassignedSection] : [])]
    .map((section) => ({
      ...section,
      rows: [...section.rows].sort((left, right) => {
        const levelDiff = levelRank(left.levelGroup) - levelRank(right.levelGroup);
        if (levelDiff !== 0) return levelDiff;
        const yearDiff = (left.birthYear ?? 9999) - (right.birthYear ?? 9999);
        if (yearDiff !== 0) return yearDiff;
        return left.playerName.localeCompare(right.playerName, "es-MX");
      }),
    }))
    .sort((left, right) => left.sortKey.localeCompare(right.sortKey, "es-MX"));

  return {
    campuses: accessibleCampuses,
    selectedCampusId: selectedCampus.id,
    selectedCampusName: selectedCampus.name,
    selectedGender,
    selectedBirthYear,
    birthYears,
    intakeStatus,
    sections,
    totalPlayers: sections.reduce((sum, section) => sum + section.rows.length, 0),
    unassignedCount: unassignedSection.rows.length,
  };
}

export async function getNutritionPlayerProfile(playerId: string): Promise<NutritionProfileData | null> {
  const access = await getNutritionCampusAccess();
  if (!access || access.campuses.length === 0) return null;

  const admin = createAdminClient();
  const { data: enrollments } = await admin
    .from("enrollments")
    .select("id, player_id, campus_id, status, inscription_date, start_date, campuses(name), players(first_name, last_name, birth_date, gender, medical_notes, level)")
    .eq("player_id", playerId)
    .eq("status", "active")
    .order("start_date", { ascending: false })
    .returns<Array<ActiveNutritionEnrollmentRow & { status: string }>>();

  const activeEnrollment = (enrollments ?? []).find((row) => canAccessNutritionCampus(access, row.campus_id));
  if (!activeEnrollment) return null;

  const [{ data: sessionRows }, guardianContacts] = await Promise.all([
    admin
      .from("player_measurement_sessions")
      .select("id, player_id, enrollment_id, campus_id, measured_at, source, weight_kg, height_cm, notes, created_at, updated_at")
      .eq("player_id", playerId)
      .order("measured_at", { ascending: false })
      .returns<MeasurementSessionRow[]>(),
    listGuardianContactsForPlayers([playerId]),
  ]);

  const history = (sessionRows ?? []).map((row) => ({
    id: row.id,
    enrollmentId: row.enrollment_id,
    campusId: row.campus_id,
    measuredAt: row.measured_at,
    source: row.source,
    weightKg: toNumber(row.weight_kg),
    heightCm: toNumber(row.height_cm),
    notes: row.notes,
  }));

  const latestSession = history[0] ?? null;
  const previousSession = history[1] ?? null;
  const growthSex = getGrowthSex(activeEnrollment.players?.gender ?? null);
  const { data: growthReferenceRows } = growthSex
    ? await admin
        .from("who_growth_reference")
        .select("indicator, sex, age_months, l, m, s")
        .eq("sex", growthSex)
        .order("indicator", { ascending: true })
        .order("age_months", { ascending: true })
        .returns<WhoGrowthReferenceRow[]>()
    : { data: [] as WhoGrowthReferenceRow[] };

  const growthProfile = buildGrowthProfile({
    birthDate: activeEnrollment.players?.birth_date ?? null,
    gender: activeEnrollment.players?.gender ?? null,
    measurements: history.map((session) => ({
      id: session.id,
      measuredAt: session.measuredAt,
      weightKg: session.weightKg,
      heightCm: session.heightCm,
    })),
    referenceRows: growthReferenceRows ?? [],
  });

  return {
    playerId,
    playerName: getPlayerName(activeEnrollment.players),
    birthDate: activeEnrollment.players?.birth_date ?? null,
    birthYear: getBirthYear(activeEnrollment.players?.birth_date),
    gender: activeEnrollment.players?.gender ?? null,
    genderLabel: getGenderLabel(activeEnrollment.players?.gender),
    level: activeEnrollment.players?.level ?? null,
    medicalNotes: activeEnrollment.players?.medical_notes ?? null,
    guardianContact: guardianContacts.get(playerId) ?? null,
    campusId: activeEnrollment.campus_id,
    campusName: activeEnrollment.campuses?.name ?? "Campus",
    activeEnrollmentId: activeEnrollment.id,
    latestEnrollmentDate: activeEnrollment.inscription_date,
    currentEnrollmentHasMeasurement: history.some((session) => session.enrollmentId === activeEnrollment.id),
    latestSession,
    previousSession,
    deltaWeightKg: latestSession && previousSession ? latestSession.weightKg - previousSession.weightKg : null,
    deltaHeightCm: latestSession && previousSession ? latestSession.heightCm - previousSession.heightCm : null,
    history,
    chartPoints: [...history]
      .reverse()
      .map((session) => ({
        label: new Intl.DateTimeFormat("es-MX", {
          day: "2-digit",
          month: "2-digit",
          year: "2-digit",
          timeZone: "America/Monterrey",
        }).format(new Date(session.measuredAt)),
        weightKg: session.weightKg,
        heightCm: session.heightCm,
      })),
    growthProfile,
  };
}
