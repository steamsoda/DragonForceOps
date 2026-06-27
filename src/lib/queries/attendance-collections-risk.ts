import { canAccessCampus, getOperationalCampusAccess } from "@/lib/auth/campuses";
import {
  getPlayerAttendanceRiskByPlayerIds,
  getRecentPlayerAttendanceByPlayerIds,
  type PlayerAttendanceRisk,
  type RecentPlayerAttendanceItem,
} from "@/lib/queries/attendance";
import { getPendingTuitionDashboardData } from "@/lib/queries/tuition-pending";
import { createAdminClient } from "@/lib/supabase/admin";

type ActiveEnrollmentRow = {
  id: string;
  player_id: string;
  campus_id: string;
  players: {
    id: string;
    public_player_id: string | null;
    first_name: string | null;
    last_name: string | null;
    birth_date: string | null;
    status: string | null;
  } | null;
  campuses: {
    id: string;
    name: string;
  } | null;
};

type TrainingGroupAssignmentRow = {
  enrollment_id: string;
  training_groups: {
    name: string | null;
  } | null;
};

export type AttendanceCollectionsRiskStatus = "pending_at_risk" | "pending_attending" | "current_at_risk" | "current_no_recent";

export type AttendanceCollectionsRiskRow = {
  enrollmentId: string;
  playerId: string;
  playerName: string;
  publicPlayerId: string | null;
  campusId: string;
  campusName: string;
  birthYear: number | null;
  trainingGroupName: string | null;
  pendingMonthCount: number;
  relationStatus: AttendanceCollectionsRiskStatus;
  relationLabel: string;
  relationDetail: string;
  recentAttendance: RecentPlayerAttendanceItem[];
  attendanceRisk: PlayerAttendanceRisk | null;
};

export type AttendanceCollectionsRiskReport = {
  campuses: Array<{ id: string; name: string }>;
  selectedCampusId: string;
  rows: AttendanceCollectionsRiskRow[];
  summary: {
    pendingAtRisk: number;
    pendingAttending: number;
    currentAtRisk: number;
    currentNoRecent: number;
  };
};

function getBirthYear(value: string | null | undefined) {
  if (!value) return null;
  const year = Number(value.slice(0, 4));
  return Number.isFinite(year) ? year : null;
}

function getPlayerName(player: ActiveEnrollmentRow["players"]) {
  return `${player?.first_name ?? ""} ${player?.last_name ?? ""}`.trim() || "Sin nombre";
}

function hasPositiveRecentAttendance(items: RecentPlayerAttendanceItem[]) {
  return items.some((item) => item.status === "present" || item.status === "injury" || item.status === "justified");
}

function classifyRelation(pendingMonthCount: number, recentAttendance: RecentPlayerAttendanceItem[], risk: PlayerAttendanceRisk | null) {
  if (pendingMonthCount > 0 && risk?.tier) {
    return {
      status: "pending_at_risk" as const,
      label: "Debe y esta en riesgo",
      detail: "Tiene mensualidades pendientes y una senal activa de asistencia.",
    };
  }

  if (pendingMonthCount > 0 && hasPositiveRecentAttendance(recentAttendance)) {
    return {
      status: "pending_attending" as const,
      label: "Debe y sigue asistiendo",
      detail: "Tiene mensualidades pendientes, pero registra asistencia reciente.",
    };
  }

  if (pendingMonthCount === 0 && risk?.tier) {
    return {
      status: "current_at_risk" as const,
      label: "Al corriente con riesgo",
      detail: "No aparece en pendientes, pero tiene una senal activa de asistencia.",
    };
  }

  if (pendingMonthCount === 0 && recentAttendance.length === 0) {
    return {
      status: "current_no_recent" as const,
      label: "Al corriente sin registros",
      detail: "No aparece en pendientes y no tiene registros recientes de asistencia.",
    };
  }

  return null;
}

async function loadTrainingGroups(enrollmentIds: string[]) {
  const admin = createAdminClient();
  const result = new Map<string, string | null>();
  const chunkSize = 100;

  for (let index = 0; index < enrollmentIds.length; index += chunkSize) {
    const chunk = enrollmentIds.slice(index, index + chunkSize);
    const { data, error } = await admin
      .from("training_group_assignments")
      .select("enrollment_id, training_groups(name)")
      .in("enrollment_id", chunk)
      .is("end_date", null)
      .returns<TrainingGroupAssignmentRow[]>();

    if (error) throw error;

    for (const row of data ?? []) {
      if (!result.has(row.enrollment_id)) {
        result.set(row.enrollment_id, row.training_groups?.name ?? null);
      }
    }
  }

  return result;
}

export async function getAttendanceCollectionsRiskReport(filters: { campusId?: string; birthYear?: number }) {
  const campusAccess = await getOperationalCampusAccess();
  if (!campusAccess || campusAccess.campuses.length === 0) {
    return {
      campuses: [],
      selectedCampusId: "",
      rows: [],
      summary: { pendingAtRisk: 0, pendingAttending: 0, currentAtRisk: 0, currentNoRecent: 0 },
    } satisfies AttendanceCollectionsRiskReport;
  }

  const selectedCampusId = filters.campusId && canAccessCampus(campusAccess, filters.campusId) ? filters.campusId : "";
  const targetCampusIds = selectedCampusId ? [selectedCampusId] : campusAccess.campusIds;
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("enrollments")
    .select("id, player_id, campus_id, players!inner(id, public_player_id, first_name, last_name, birth_date, status), campuses(id, name)")
    .eq("status", "active")
    .eq("players.status", "active")
    .in("campus_id", targetCampusIds)
    .returns<ActiveEnrollmentRow[]>();

  if (error) throw error;

  const activeEnrollments = (data ?? []).filter((row) => {
    const birthYear = getBirthYear(row.players?.birth_date);
    return filters.birthYear ? birthYear === filters.birthYear : true;
  });
  const enrollmentIds = activeEnrollments.map((row) => row.id);
  const playerIds = [...new Set(activeEnrollments.map((row) => row.player_id))];

  const [pendingDashboard, trainingGroupByEnrollment, recentAttendanceByPlayer, attendanceRiskByPlayer] = await Promise.all([
    getPendingTuitionDashboardData({ campusId: selectedCampusId }),
    loadTrainingGroups(enrollmentIds),
    getRecentPlayerAttendanceByPlayerIds(playerIds, { supabase: admin }),
    getPlayerAttendanceRiskByPlayerIds(playerIds, { supabase: admin }),
  ]);

  const pendingCountByEnrollment = new Map<string, number>();
  for (const player of pendingDashboard.campusBoards.flatMap((board) => board.categories).flatMap((category) => category.players)) {
    pendingCountByEnrollment.set(player.enrollmentId, player.pendingMonthCount);
  }

  const rows: AttendanceCollectionsRiskRow[] = [];
  const summary = { pendingAtRisk: 0, pendingAttending: 0, currentAtRisk: 0, currentNoRecent: 0 };

  for (const enrollment of activeEnrollments) {
    if (!enrollment.players || !enrollment.campuses) continue;
    const pendingMonthCount = pendingCountByEnrollment.get(enrollment.id) ?? 0;
    const recentAttendance = recentAttendanceByPlayer.get(enrollment.player_id) ?? [];
    const attendanceRisk = attendanceRiskByPlayer.get(enrollment.player_id) ?? null;
    const relation = classifyRelation(pendingMonthCount, recentAttendance, attendanceRisk);

    if (!relation) continue;

    if (relation.status === "pending_at_risk") summary.pendingAtRisk += 1;
    if (relation.status === "pending_attending") summary.pendingAttending += 1;
    if (relation.status === "current_at_risk") summary.currentAtRisk += 1;
    if (relation.status === "current_no_recent") summary.currentNoRecent += 1;

    rows.push({
      enrollmentId: enrollment.id,
      playerId: enrollment.player_id,
      playerName: getPlayerName(enrollment.players),
      publicPlayerId: enrollment.players.public_player_id,
      campusId: enrollment.campus_id,
      campusName: enrollment.campuses.name,
      birthYear: getBirthYear(enrollment.players.birth_date),
      trainingGroupName: trainingGroupByEnrollment.get(enrollment.id) ?? null,
      pendingMonthCount,
      relationStatus: relation.status,
      relationLabel: relation.label,
      relationDetail: relation.detail,
      recentAttendance,
      attendanceRisk,
    });
  }

  const priority: Record<AttendanceCollectionsRiskStatus, number> = {
    pending_at_risk: 0,
    pending_attending: 1,
    current_at_risk: 2,
    current_no_recent: 3,
  };

  rows.sort(
    (a, b) =>
      priority[a.relationStatus] - priority[b.relationStatus] ||
      b.pendingMonthCount - a.pendingMonthCount ||
      (a.birthYear ?? 9999) - (b.birthYear ?? 9999) ||
      a.playerName.localeCompare(b.playerName, "es-MX"),
  );

  return {
    campuses: campusAccess.campuses.map((campus) => ({ id: campus.id, name: campus.name })),
    selectedCampusId,
    rows,
    summary,
  } satisfies AttendanceCollectionsRiskReport;
}
