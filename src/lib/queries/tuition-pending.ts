import { canAccessCampus, getOperationalCampusAccess } from "@/lib/auth/campuses";
import { createAdminClient } from "@/lib/supabase/admin";

type EnrollmentRow = {
  id: string;
  player_id: string;
  campus_id: string;
  players: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    birth_date: string | null;
    level: string | null;
  } | null;
  campuses: {
    id: string;
    name: string;
    code: string;
  } | null;
};

type TuitionChargeRow = {
  id: string;
  enrollment_id: string;
  amount: number;
  period_month: string | null;
  due_date: string | null;
  payment_allocations: Array<{ amount: number }> | null;
};

type TeamAssignmentRow = {
  enrollment_id: string;
  teams: {
    name: string | null;
    level: string | null;
  } | null;
};

export type PendingTuitionMonth = {
  periodMonth: string;
  label: string;
  dueDate: string | null;
  isOverdue: boolean;
};

export type PendingTuitionPlayer = {
  enrollmentId: string;
  playerId: string;
  playerName: string;
  birthYear: number | null;
  campusId: string;
  campusName: string;
  campusCode: string;
  level: string | null;
  teamName: string | null;
  pendingMonths: PendingTuitionMonth[];
  pendingMonthCount: number;
  overdueMonthCount: number;
};

export type PendingTuitionCategoryGroup = {
  key: string;
  label: string;
  birthYear: number | null;
  playerCount: number;
  oneMonthCount: number;
  twoMonthCount: number;
  threePlusMonthCount: number;
  overdueCount: number;
  players: PendingTuitionPlayer[];
};

export type PendingTuitionCampusBoard = {
  campusId: string;
  campusName: string;
  totalPlayers: number;
  oneMonthCount: number;
  twoMonthCount: number;
  threePlusMonthCount: number;
  overdueCount: number;
  categories: PendingTuitionCategoryGroup[];
};

export type PendingTuitionDashboardData = {
  campuses: Array<{ id: string; name: string }>;
  selectedCampusId: string;
  selectedMonth: string;
  campusBoards: PendingTuitionCampusBoard[];
  totals: {
    players: number;
    oneMonth: number;
    twoMonths: number;
    threePlusMonths: number;
    overdue: number;
  };
};

export type PendingTuitionCategoryDetailData = {
  campusId: string;
  campusName: string;
  birthYear: number | null;
  categoryLabel: string;
  selectedMonth: string;
  players: PendingTuitionPlayer[];
};

export type PendingTuitionBucket = "1" | "2" | "3plus";

function getBirthYear(value: string | null | undefined) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.getUTCFullYear();
}

function getPlayerName(player: EnrollmentRow["players"]) {
  return `${player?.first_name ?? ""} ${player?.last_name ?? ""}`.trim() || "Sin nombre";
}

function normalizeMonth(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  return /^\d{4}-\d{2}$/.test(trimmed) ? trimmed : "";
}

function toPeriodMonth(value: string) {
  return value ? `${value}-01` : "";
}

function formatPeriodMonth(value: string) {
  const [year, month] = value.slice(0, 7).split("-").map(Number);
  if (!year || !month) return value;
  const date = new Date(Date.UTC(year, month - 1, 1, 12, 0, 0));
  const formatted = new Intl.DateTimeFormat("es-MX", { month: "short", year: "numeric", timeZone: "UTC" }).format(date);
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

function isOverdue(dueDate: string | null) {
  if (!dueDate) return false;
  const today = new Date();
  const due = new Date(`${dueDate}T23:59:59`);
  return due.getTime() < today.getTime();
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

async function loadTeamAssignments(enrollmentIds: string[]) {
  if (enrollmentIds.length === 0) return new Map<string, TeamAssignmentRow["teams"]>();

  const admin = createAdminClient();
  const result = new Map<string, TeamAssignmentRow["teams"]>();
  const chunkSize = 500;

  for (let index = 0; index < enrollmentIds.length; index += chunkSize) {
    const { data, error } = await admin
      .from("team_assignments")
      .select("enrollment_id, teams(name, level)")
      .in("enrollment_id", enrollmentIds.slice(index, index + chunkSize))
      .is("end_date", null)
      .eq("is_primary", true)
      .returns<TeamAssignmentRow[]>();

    if (error) throw error;
    for (const row of data ?? []) result.set(row.enrollment_id, row.teams ?? null);
  }

  return result;
}

async function loadTuitionCharges(enrollmentIds: string[], selectedMonth: string) {
  if (enrollmentIds.length === 0) return [] as TuitionChargeRow[];

  const admin = createAdminClient();
  const rows: TuitionChargeRow[] = [];
  // The Pendientes board can easily span hundreds of active enrollments.
  // Large `.in(enrollment_id, [...])` requests hit two Supabase/PostgREST limits:
  // 1) request URL/header overflow from very large ID lists
  // 2) default 1000-row response caps on wide historical tuition queries
  // Keep the enrollment batches small and page each batch until it is exhausted.
  const chunkSize = 100;
  const pageSize = 500;

  for (let index = 0; index < enrollmentIds.length; index += chunkSize) {
    const enrollmentChunk = enrollmentIds.slice(index, index + chunkSize);

    for (let offset = 0; ; offset += pageSize) {
      let query = admin
        .from("charges")
        .select("id, enrollment_id, amount, period_month, due_date, charge_types!inner(code), payment_allocations(amount)")
        .in("enrollment_id", enrollmentChunk)
        .eq("charge_types.code", "monthly_tuition")
        .neq("status", "void")
        .range(offset, offset + pageSize - 1);

      if (selectedMonth) query = query.eq("period_month", toPeriodMonth(selectedMonth));

      const { data, error } = await query.returns<TuitionChargeRow[]>();
      if (error) throw error;

      const page = data ?? [];
      rows.push(...page);
      if (page.length < pageSize) break;
    }
  }

  return rows;
}

function countBuckets(players: PendingTuitionPlayer[]) {
  return {
    oneMonthCount: players.filter((player) => player.pendingMonthCount === 1).length,
    twoMonthCount: players.filter((player) => player.pendingMonthCount === 2).length,
    threePlusMonthCount: players.filter((player) => player.pendingMonthCount >= 3).length,
    overdueCount: players.filter((player) => player.overdueMonthCount > 0).length,
  };
}

function normalizeBucket(value: string | null | undefined): PendingTuitionBucket | "" {
  return value === "1" || value === "2" || value === "3plus" ? value : "";
}

function getBucketLabel(bucket: PendingTuitionBucket) {
  if (bucket === "1") return "1 mes pendiente";
  if (bucket === "2") return "2 meses pendientes";
  return "3+ meses pendientes";
}

function filterPlayersByBucket(players: PendingTuitionPlayer[], bucket: PendingTuitionBucket) {
  if (bucket === "1") return players.filter((player) => player.pendingMonthCount === 1);
  if (bucket === "2") return players.filter((player) => player.pendingMonthCount === 2);
  return players.filter((player) => player.pendingMonthCount >= 3);
}

export async function getPendingTuitionDashboardData(filters: { campusId?: string; month?: string }) {
  const campusAccess = await getOperationalCampusAccess();
  if (!campusAccess || campusAccess.campuses.length === 0) {
    return {
      campuses: [],
      selectedCampusId: "",
      selectedMonth: normalizeMonth(filters.month),
      campusBoards: [],
      totals: { players: 0, oneMonth: 0, twoMonths: 0, threePlusMonths: 0, overdue: 0 },
    } satisfies PendingTuitionDashboardData;
  }

  const selectedMonth = normalizeMonth(filters.month);
  const requestedCampusId = filters.campusId && canAccessCampus(campusAccess, filters.campusId) ? filters.campusId : "";
  const targetCampusIds = campusAccess.campusIds;
  const admin = createAdminClient();

  const { data: enrollments, error: enrollmentError } = await admin
    .from("enrollments")
    .select("id, player_id, campus_id, players(id, first_name, last_name, birth_date, level), campuses(id, name, code)")
    .eq("status", "active")
    .in("campus_id", targetCampusIds)
    .returns<EnrollmentRow[]>();

  if (enrollmentError) throw enrollmentError;

  const enrollmentRows = enrollments ?? [];
  const enrollmentById = new Map(enrollmentRows.map((row) => [row.id, row]));
  const enrollmentIds = enrollmentRows.map((row) => row.id);
  const [charges, teamByEnrollment] = await Promise.all([
    loadTuitionCharges(enrollmentIds, selectedMonth),
    loadTeamAssignments(enrollmentIds),
  ]);

  const pendingMonthsByEnrollment = new Map<string, PendingTuitionMonth[]>();
  for (const charge of charges) {
    if (!charge.period_month) continue;
    const allocated = (charge.payment_allocations ?? []).reduce((sum, allocation) => sum + Number(allocation.amount ?? 0), 0);
    const pendingAmount = roundMoney(Number(charge.amount ?? 0) - allocated);
    if (pendingAmount <= 0.009) continue;

    const months = pendingMonthsByEnrollment.get(charge.enrollment_id) ?? [];
    if (!months.some((month) => month.periodMonth === charge.period_month)) {
      months.push({
        periodMonth: charge.period_month,
        label: formatPeriodMonth(charge.period_month),
        dueDate: charge.due_date,
        isOverdue: isOverdue(charge.due_date),
      });
    }
    pendingMonthsByEnrollment.set(charge.enrollment_id, months);
  }

  const players: PendingTuitionPlayer[] = [];
  for (const [enrollmentId, months] of pendingMonthsByEnrollment) {
    const enrollment = enrollmentById.get(enrollmentId);
    if (!enrollment || !enrollment.campuses) continue;
    const team = teamByEnrollment.get(enrollmentId);
    const sortedMonths = months.sort((a, b) => a.periodMonth.localeCompare(b.periodMonth));

    players.push({
      enrollmentId,
      playerId: enrollment.player_id,
      playerName: getPlayerName(enrollment.players),
      birthYear: getBirthYear(enrollment.players?.birth_date),
      campusId: enrollment.campus_id,
      campusName: enrollment.campuses.name,
      campusCode: enrollment.campuses.code,
      level: team?.level ?? enrollment.players?.level ?? null,
      teamName: team?.name ?? null,
      pendingMonths: sortedMonths,
      pendingMonthCount: sortedMonths.length,
      overdueMonthCount: sortedMonths.filter((month) => month.isOverdue).length,
    });
  }

  players.sort(
    (a, b) =>
      (a.birthYear ?? 9999) - (b.birthYear ?? 9999) ||
      b.pendingMonthCount - a.pendingMonthCount ||
      b.overdueMonthCount - a.overdueMonthCount ||
      a.playerName.localeCompare(b.playerName, "es-MX")
  );

  const boards = targetCampusIds
    .map((campusId) => {
      const campus = campusAccess.campuses.find((candidate) => candidate.id === campusId);
      if (!campus) return null;
      const campusPlayers = players.filter((player) => player.campusId === campusId);
      const byCategory = new Map<string, PendingTuitionPlayer[]>();
      for (const player of campusPlayers) {
        const key = player.birthYear ? String(player.birthYear) : "sin-categoria";
        byCategory.set(key, [...(byCategory.get(key) ?? []), player]);
      }

      const categories = [...byCategory.entries()]
        .map(([key, categoryPlayers]) => {
          const birthYear = key === "sin-categoria" ? null : Number(key);
          const buckets = countBuckets(categoryPlayers);
          return {
            key,
            label: birthYear ? `Cat. ${birthYear}` : "Sin categoria",
            birthYear,
            playerCount: categoryPlayers.length,
            players: categoryPlayers,
            ...buckets,
          };
        })
        .sort((a, b) => (a.birthYear ?? 9999) - (b.birthYear ?? 9999));

      const buckets = countBuckets(campusPlayers);
      return {
        campusId,
        campusName: campus.name,
        totalPlayers: campusPlayers.length,
        categories,
        ...buckets,
      };
    })
    .filter((board): board is PendingTuitionCampusBoard => Boolean(board));

  const selectedBoard = requestedCampusId ? boards.find((board) => board.campusId === requestedCampusId) ?? null : null;
  const visiblePlayers = selectedBoard?.categories.flatMap((category) => category.players) ?? players;
  const totals = countBuckets(visiblePlayers);

  return {
    campuses: campusAccess.campuses.map((campus) => ({ id: campus.id, name: campus.name })),
    selectedCampusId: selectedBoard?.campusId ?? "",
    selectedMonth,
    campusBoards: boards,
    totals: {
      players: visiblePlayers.length,
      oneMonth: totals.oneMonthCount,
      twoMonths: totals.twoMonthCount,
      threePlusMonths: totals.threePlusMonthCount,
      overdue: totals.overdueCount,
    },
  } satisfies PendingTuitionDashboardData;
}

export async function getPendingTuitionCategoryDetailData(filters: {
  campusId?: string;
  birthYear?: string;
  month?: string;
  bucket?: string;
}) {
  const dashboard = await getPendingTuitionDashboardData({ campusId: filters.campusId, month: filters.month });
  const bucket = normalizeBucket(filters.bucket);
  const key = filters.birthYear && /^\d{4}$/.test(filters.birthYear) ? filters.birthYear : "sin-categoria";
  const selectedPlayers = dashboard.selectedCampusId
    ? dashboard.campusBoards
        .find((board) => board.campusId === dashboard.selectedCampusId)
        ?.categories.flatMap((category) => category.players) ?? []
    : dashboard.campusBoards.flatMap((board) => board.categories).flatMap((category) => category.players);

  if (bucket) {
    const players = filterPlayersByBucket(selectedPlayers, bucket).sort(
      (a, b) =>
        b.pendingMonthCount - a.pendingMonthCount ||
        b.overdueMonthCount - a.overdueMonthCount ||
        a.playerName.localeCompare(b.playerName, "es-MX")
    );

    return {
      campusId: dashboard.selectedCampusId,
      campusName:
        dashboard.campusBoards.find((board) => board.campusId === dashboard.selectedCampusId)?.campusName ??
        "Todos los campus",
      birthYear: null,
      categoryLabel: getBucketLabel(bucket),
      selectedMonth: dashboard.selectedMonth,
      players,
    } satisfies PendingTuitionCategoryDetailData;
  }

  if (!dashboard.selectedCampusId) {
    const players = dashboard.campusBoards
      .flatMap((board) => board.categories)
      .filter((candidate) => candidate.key === key)
      .flatMap((category) => category.players)
      .sort(
        (a, b) =>
          b.pendingMonthCount - a.pendingMonthCount ||
          b.overdueMonthCount - a.overdueMonthCount ||
          a.playerName.localeCompare(b.playerName, "es-MX")
      );

    if (players.length === 0) return null;
    const birthYear = key === "sin-categoria" ? null : Number(key);
    return {
      campusId: "",
      campusName: "Todos los campus",
      birthYear,
      categoryLabel: birthYear ? `Cat. ${birthYear}` : "Sin categoria",
      selectedMonth: dashboard.selectedMonth,
      players,
    } satisfies PendingTuitionCategoryDetailData;
  }

  const selectedBoard =
    dashboard.campusBoards.find((board) => board.campusId === dashboard.selectedCampusId) ??
    dashboard.campusBoards[0] ??
    null;

  if (!selectedBoard) return null;

  const category = selectedBoard.categories.find((candidate) => candidate.key === key) ?? null;
  if (!category) return null;

  return {
    campusId: selectedBoard.campusId,
    campusName: selectedBoard.campusName,
    birthYear: category.birthYear,
    categoryLabel: category.label,
    selectedMonth: dashboard.selectedMonth,
    players: category.players,
  } satisfies PendingTuitionCategoryDetailData;
}
