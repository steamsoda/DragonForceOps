import { getPermissionContext } from "@/lib/auth/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMonterreyDateString, getMonterreyDayBounds, parseDateOnlyInput } from "@/lib/time";

type CampusRow = { id: string; name: string; code: string };

type EnrollmentRow = {
  id: string;
  player_id: string;
  campus_id: string;
  status: string;
  created_at: string;
  inscription_date: string | null;
  start_date: string | null;
  campuses: { id: string; name: string; code: string } | null;
  players: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    birth_date: string | null;
    gender: string | null;
    level: string | null;
  } | null;
};

type TeamAssignmentRow = {
  enrollment_id: string;
  teams: {
    id: string;
    name: string | null;
    level: string | null;
  } | null;
};

type TrainingGroupAssignmentRow = {
  enrollment_id: string;
  training_groups: {
    id: string;
    name: string | null;
  } | null;
};

type MeasurementRow = {
  enrollment_id: string;
};

export type NewEnrollmentWorkflowFilter = "all" | "pending_sports" | "pending_nutrition" | "complete";

export type NewEnrollmentIntakeRow = {
  enrollmentId: string;
  playerId: string;
  playerName: string;
  campusId: string;
  campusName: string;
  campusCode: string;
  status: string;
  createdAt: string;
  inscriptionDate: string | null;
  birthYear: number | null;
  gender: string | null;
  genderLabel: string;
  currentTeamId: string | null;
  currentTeamName: string | null;
  currentTrainingGroupId: string | null;
  currentTrainingGroupName: string | null;
  resolvedLevel: string | null;
  sportsComplete: boolean;
  nutritionComplete: boolean;
  sportsActionHref: string | null;
  nutritionActionHref: string | null;
  playerActionHref: string | null;
};

export type NewEnrollmentCampusBoard = {
  campusId: string;
  campusName: string;
  total: number;
  pendingSports: number;
  pendingNutrition: number;
  complete: number;
};

export type NewEnrollmentIntakeData = {
  campuses: Array<{ id: string; name: string }>;
  selectedCampusId: string;
  selectedStartDate: string;
  selectedEndDate: string;
  selectedBirthYear: string;
  selectedStatus: NewEnrollmentWorkflowFilter;
  campusBoards: NewEnrollmentCampusBoard[];
  birthYearOptions: number[];
  rows: NewEnrollmentIntakeRow[];
  totals: {
    total: number;
    pendingSports: number;
    pendingNutrition: number;
    complete: number;
  };
  access: {
    canOpenSports: boolean;
    canOpenNutrition: boolean;
    canOpenPlayer: boolean;
  };
};

export type NewEnrollmentIntakeFilters = {
  campusId?: string;
  startDate?: string;
  endDate?: string;
  birthYear?: string;
  status?: string;
};

function dedupeCampuses(campuses: CampusRow[]) {
  const byId = new Map<string, CampusRow>();
  for (const campus of campuses) byId.set(campus.id, campus);
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, "es-MX"));
}

function getBirthYear(value: string | null | undefined) {
  if (!value) return null;
  const year = Number.parseInt(value.slice(0, 4), 10);
  return Number.isFinite(year) ? year : null;
}

function getPlayerName(player: EnrollmentRow["players"]) {
  return `${player?.first_name ?? ""} ${player?.last_name ?? ""}`.replace(/\s+/g, " ").trim() || "Jugador";
}

function getGenderLabel(value: string | null | undefined) {
  if (value === "male") return "Varonil";
  if (value === "female") return "Femenil";
  return "Mixto / sin genero";
}

function normalizeStatus(value: string | null | undefined): NewEnrollmentWorkflowFilter {
  if (value === "pending_sports" || value === "pending_nutrition" || value === "complete") return value;
  return "all";
}

function addDays(dateOnly: string, days: number) {
  const [year, month, day] = dateOnly.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0));
  date.setUTCDate(date.getUTCDate() + days);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function normalizeDateRange(filters: Pick<NewEnrollmentIntakeFilters, "startDate" | "endDate">) {
  const today = getMonterreyDateString();
  const endDate = parseDateOnlyInput(filters.endDate) ?? today;
  const startDate = parseDateOnlyInput(filters.startDate) ?? addDays(endDate, -29);

  if (startDate > endDate) {
    return { startDate: endDate, endDate: startDate };
  }

  return { startDate, endDate };
}

function buildSportsHref(row: NewEnrollmentIntakeRow) {
  const params = new URLSearchParams();
  params.set("campus", row.campusId);
  if (row.birthYear) params.set("birthYear", String(row.birthYear));
  return `/attendance/groups?${params.toString()}`;
}

function countRows(rows: NewEnrollmentIntakeRow[]) {
  return {
    total: rows.length,
    pendingSports: rows.filter((row) => row.status === "active" && !row.sportsComplete).length,
    pendingNutrition: rows.filter((row) => row.status === "active" && !row.nutritionComplete).length,
    complete: rows.filter((row) => row.status === "active" && row.sportsComplete && row.nutritionComplete).length,
  };
}

function applyWorkflowFilter(rows: NewEnrollmentIntakeRow[], status: NewEnrollmentWorkflowFilter) {
  if (status === "pending_sports") return rows.filter((row) => row.status === "active" && !row.sportsComplete);
  if (status === "pending_nutrition") return rows.filter((row) => row.status === "active" && !row.nutritionComplete);
  if (status === "complete") {
    return rows.filter((row) => row.status === "active" && row.sportsComplete && row.nutritionComplete);
  }
  return rows;
}

export async function getNewEnrollmentIntakeData(filters: NewEnrollmentIntakeFilters) {
  const context = await getPermissionContext();
  if (!context || (!context.hasOperationalAccess && !context.hasSportsAccess && !context.hasNutritionAccess)) {
    return null;
  }

  const accessibleCampuses = dedupeCampuses([
    ...(context.campusAccess?.campuses ?? []),
    ...(context.nutritionCampusAccess?.campuses ?? []),
  ]);

  if (accessibleCampuses.length === 0) {
    return {
      campuses: [],
      selectedCampusId: "",
      selectedStartDate: "",
      selectedEndDate: "",
      selectedBirthYear: "",
      selectedStatus: "all",
      campusBoards: [],
      birthYearOptions: [],
      rows: [],
      totals: { total: 0, pendingSports: 0, pendingNutrition: 0, complete: 0 },
      access: { canOpenSports: false, canOpenNutrition: false, canOpenPlayer: false },
    } satisfies NewEnrollmentIntakeData;
  }

  const { startDate, endDate } = normalizeDateRange(filters);
  const selectedStatus = normalizeStatus(filters.status);
  const selectedCampusId = filters.campusId && accessibleCampuses.some((campus) => campus.id === filters.campusId)
    ? filters.campusId
    : "";
  const selectedBirthYear = /^\d{4}$/.test(filters.birthYear ?? "") ? filters.birthYear ?? "" : "";
  const campusIds = accessibleCampuses.map((campus) => campus.id);
  const startBounds = getMonterreyDayBounds(startDate);
  const endBounds = getMonterreyDayBounds(endDate);
  const admin = createAdminClient();

  const { data: enrollments, error } = await admin
    .from("enrollments")
    .select("id, player_id, campus_id, status, created_at, inscription_date, start_date, campuses(id, name, code), players(id, first_name, last_name, birth_date, gender, level)")
    .in("campus_id", campusIds)
    .gte("created_at", startBounds.start)
    .lt("created_at", endBounds.end)
    .order("created_at", { ascending: false })
    .returns<EnrollmentRow[]>();

  if (error) throw error;

  const enrollmentRows = enrollments ?? [];
  const enrollmentIds = enrollmentRows.map((row) => row.id);

  const [{ data: assignments }, { data: trainingGroups }, { data: measurements }] = await Promise.all([
    enrollmentIds.length
      ? admin
          .from("team_assignments")
          .select("enrollment_id, teams(id, name, level)")
          .in("enrollment_id", enrollmentIds)
          .eq("is_primary", true)
          .is("end_date", null)
          .returns<TeamAssignmentRow[]>()
      : Promise.resolve({ data: [] as TeamAssignmentRow[] }),
    enrollmentIds.length
      ? admin
          .from("training_group_assignments")
          .select("enrollment_id, training_groups(id, name)")
          .in("enrollment_id", enrollmentIds)
          .is("end_date", null)
          .returns<TrainingGroupAssignmentRow[]>()
      : Promise.resolve({ data: [] as TrainingGroupAssignmentRow[] }),
    enrollmentIds.length
      ? admin
          .from("player_measurement_sessions")
          .select("enrollment_id")
          .in("enrollment_id", enrollmentIds)
          .returns<MeasurementRow[]>()
      : Promise.resolve({ data: [] as MeasurementRow[] }),
  ]);

  const teamByEnrollment = new Map((assignments ?? []).map((row) => [row.enrollment_id, row.teams]));
  const trainingGroupByEnrollment = new Map((trainingGroups ?? []).map((row) => [row.enrollment_id, row.training_groups]));
  const measuredEnrollmentIds = new Set((measurements ?? []).map((row) => row.enrollment_id));
  const canOpenSports = context.hasSportsAccess;
  const canOpenNutrition = context.hasNutritionAccess;
  const canOpenPlayer = context.hasOperationalAccess;

  const allRows = enrollmentRows
    .map<NewEnrollmentIntakeRow | null>((row) => {
      if (!row.campuses) return null;
      const team = teamByEnrollment.get(row.id) ?? null;
      const trainingGroup = trainingGroupByEnrollment.get(row.id) ?? null;
      const resolvedLevel = team?.level ?? row.players?.level ?? null;
      const birthYear = getBirthYear(row.players?.birth_date);
      const sportsComplete = row.status === "active" && Boolean(trainingGroup?.id);
      const nutritionComplete = row.status === "active" && measuredEnrollmentIds.has(row.id);
      const mapped: NewEnrollmentIntakeRow = {
        enrollmentId: row.id,
        playerId: row.player_id,
        playerName: getPlayerName(row.players),
        campusId: row.campus_id,
        campusName: row.campuses.name,
        campusCode: row.campuses.code,
        status: row.status,
        createdAt: row.created_at,
        inscriptionDate: row.inscription_date,
        birthYear,
        gender: row.players?.gender ?? null,
        genderLabel: getGenderLabel(row.players?.gender),
        currentTeamId: team?.id ?? null,
        currentTeamName: team?.name ?? null,
        currentTrainingGroupId: trainingGroup?.id ?? null,
        currentTrainingGroupName: trainingGroup?.name ?? null,
        resolvedLevel,
        sportsComplete,
        nutritionComplete,
        sportsActionHref: null,
        nutritionActionHref: canOpenNutrition ? `/nutrition/players/${row.player_id}` : null,
        playerActionHref: canOpenPlayer ? `/players/${row.player_id}` : null,
      };
      return {
        ...mapped,
        sportsActionHref: canOpenSports ? buildSportsHref(mapped) : null,
      };
    })
    .filter((row): row is NewEnrollmentIntakeRow => Boolean(row));

  const birthYearOptions = [...new Set(allRows.map((row) => row.birthYear).filter((value): value is number => value !== null))]
    .sort((a, b) => b - a);

  const scopedRows = allRows.filter((row) => {
    if (selectedCampusId && row.campusId !== selectedCampusId) return false;
    if (selectedBirthYear && row.birthYear !== Number(selectedBirthYear)) return false;
    return true;
  });
  const rows = applyWorkflowFilter(scopedRows, selectedStatus);
  const totals = countRows(rows);
  const campusBoards = accessibleCampuses.map((campus) => {
    const campusRows = applyWorkflowFilter(
      allRows.filter((row) => {
        if (row.campusId !== campus.id) return false;
        if (selectedBirthYear && row.birthYear !== Number(selectedBirthYear)) return false;
        return true;
      }),
      selectedStatus,
    );
    const counts = countRows(campusRows);
    return {
      campusId: campus.id,
      campusName: campus.name,
      total: counts.total,
      pendingSports: counts.pendingSports,
      pendingNutrition: counts.pendingNutrition,
      complete: counts.complete,
    };
  });

  return {
    campuses: accessibleCampuses.map((campus) => ({ id: campus.id, name: campus.name })),
    selectedCampusId,
    selectedStartDate: startDate,
    selectedEndDate: endDate,
    selectedBirthYear,
    selectedStatus,
    campusBoards,
    birthYearOptions,
    rows,
    totals,
    access: { canOpenSports, canOpenNutrition, canOpenPlayer },
  } satisfies NewEnrollmentIntakeData;
}
