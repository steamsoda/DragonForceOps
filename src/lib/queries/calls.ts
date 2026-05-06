import type { PendingRow } from "@/components/pending/pending-table";
import {
  getPendingTuitionCategoryDetailData,
  getPendingTuitionDashboardData,
  type PendingTuitionDashboardData,
  type PendingTuitionPlayer,
} from "@/lib/queries/tuition-pending";
import { createAdminClient } from "@/lib/supabase/admin";
import type { PendingFollowUpFilter, PendingFollowUpStatus } from "@/lib/queries/enrollments";

type EnrollmentFollowUpRow = {
  id: string;
  follow_up_status: string | null;
  follow_up_at: string | null;
  follow_up_note: string | null;
  promise_date: string | null;
};

type GuardianPhoneRow = {
  player_id: string;
  guardians: { phone_primary: string | null } | null;
};

type EnrollmentBalanceRow = {
  enrollment_id: string;
  balance: number | string | null;
};

type FollowUpSnapshot = {
  status: PendingFollowUpStatus;
  at: string | null;
  note: string | null;
  promiseDate: string | null;
};

export type CallsDashboardData = PendingTuitionDashboardData & {
  followUpCounts: Record<PendingFollowUpFilter, number>;
};

export type CallsDetailData = {
  title: string;
  subtitle: string;
  campusId: string;
  selectedMonth: string;
  bucket: string;
  birthYear: string;
  q: string;
  followUpStatus: PendingFollowUpFilter;
  rows: PendingRow[];
  followUpCounts: Record<PendingFollowUpFilter, number>;
};

const FOLLOW_UP_STATUSES: PendingFollowUpStatus[] = [
  "uncontacted",
  "no_answer",
  "contacted",
  "promise_to_pay",
  "will_not_return",
];

function normalizeFollowUpStatus(value: string | null | undefined): PendingFollowUpStatus {
  return FOLLOW_UP_STATUSES.includes(value as PendingFollowUpStatus)
    ? (value as PendingFollowUpStatus)
    : "uncontacted";
}

function getOverdueDays(dueDate: string | null) {
  if (!dueDate) return 0;
  const today = new Date();
  const due = new Date(`${dueDate}T00:00:00`);
  const diffMs = today.getTime() - due.getTime();
  return Math.max(Math.floor(diffMs / (1000 * 60 * 60 * 24)), 0);
}

async function loadFollowUps(enrollmentIds: string[]) {
  const result = new Map<string, FollowUpSnapshot>();
  if (enrollmentIds.length === 0) return result;

  const admin = createAdminClient();
  const chunkSize = 500;
  for (let index = 0; index < enrollmentIds.length; index += chunkSize) {
    const { data, error } = await admin
      .from("enrollments")
      .select("id, follow_up_status, follow_up_at, follow_up_note, promise_date")
      .in("id", enrollmentIds.slice(index, index + chunkSize))
      .returns<EnrollmentFollowUpRow[]>();

    if (error) throw error;
    for (const row of data ?? []) {
      result.set(row.id, {
        status: normalizeFollowUpStatus(row.follow_up_status),
        at: row.follow_up_at,
        note: row.follow_up_note,
        promiseDate: row.promise_date,
      });
    }
  }

  return result;
}

async function loadPhones(playerIds: string[]) {
  const result = new Map<string, string | null>();
  if (playerIds.length === 0) return result;

  const admin = createAdminClient();
  const chunkSize = 500;
  for (let index = 0; index < playerIds.length; index += chunkSize) {
    const { data, error } = await admin
      .from("player_guardians")
      .select("player_id, guardians(phone_primary)")
      .in("player_id", playerIds.slice(index, index + chunkSize))
      .eq("is_primary", true)
      .returns<GuardianPhoneRow[]>();

    if (error) throw error;
    for (const row of data ?? []) {
      if (!result.has(row.player_id)) result.set(row.player_id, row.guardians?.phone_primary ?? null);
    }
  }

  return result;
}

async function loadBalances(enrollmentIds: string[]) {
  const result = new Map<string, number>();
  if (enrollmentIds.length === 0) return result;

  const admin = createAdminClient();
  const chunkSize = 500;
  for (let index = 0; index < enrollmentIds.length; index += chunkSize) {
    const { data, error } = await admin
      .from("v_enrollment_balances")
      .select("enrollment_id, balance")
      .in("enrollment_id", enrollmentIds.slice(index, index + chunkSize))
      .returns<EnrollmentBalanceRow[]>();

    if (error) throw error;
    for (const row of data ?? []) {
      result.set(row.enrollment_id, typeof row.balance === "string" ? Number(row.balance) : Number(row.balance ?? 0));
    }
  }

  return result;
}

function emptyFollowUpCounts(): Record<PendingFollowUpFilter, number> {
  return {
    all: 0,
    uncontacted: 0,
    no_answer: 0,
    contacted: 0,
    promise_to_pay: 0,
    will_not_return: 0,
  };
}

function countFollowUps(players: PendingTuitionPlayer[], followUps: Map<string, FollowUpSnapshot>) {
  const counts = emptyFollowUpCounts();
  for (const player of players) {
    const status = followUps.get(player.enrollmentId)?.status ?? "uncontacted";
    counts.all += 1;
    counts[status] += 1;
  }
  return counts;
}

function flattenDashboardPlayers(dashboard: PendingTuitionDashboardData) {
  return dashboard.selectedCampusId
    ? dashboard.campusBoards
        .find((board) => board.campusId === dashboard.selectedCampusId)
        ?.categories.flatMap((category) => category.players) ?? []
    : dashboard.campusBoards.flatMap((board) => board.categories.flatMap((category) => category.players));
}

async function enrichCallRows(players: PendingTuitionPlayer[]) {
  const enrollmentIds = [...new Set(players.map((player) => player.enrollmentId))];
  const playerIds = [...new Set(players.map((player) => player.playerId))];
  const [followUps, phones, balances] = await Promise.all([
    loadFollowUps(enrollmentIds),
    loadPhones(playerIds),
    loadBalances(enrollmentIds),
  ]);

  return players.map((player): PendingRow => {
    const followUp = followUps.get(player.enrollmentId) ?? {
      status: "uncontacted" as PendingFollowUpStatus,
      at: null,
      note: null,
      promiseDate: null,
    };
    const firstDueDate = player.pendingMonths.find((month) => month.dueDate)?.dueDate ?? null;

    return {
      enrollmentId: player.enrollmentId,
      playerId: player.playerId,
      playerName: player.playerName,
      birthYear: player.birthYear,
      campusName: player.campusName,
      campusCode: player.campusCode,
      teamName: player.teamName ?? player.level ?? "-",
      primaryPhone: phones.get(player.playerId) ?? null,
      balance: balances.get(player.enrollmentId) ?? 0,
      dueDate: firstDueDate,
      overdueDays: getOverdueDays(firstDueDate),
      followUpStatus: followUp.status,
      followUpAt: followUp.at,
      followUpNote: followUp.note,
      promiseDate: followUp.promiseDate,
      pendingMonths: player.pendingMonths,
    };
  });
}

export async function getCallsDashboardData(filters: { campusId?: string; month?: string }): Promise<CallsDashboardData> {
  const dashboard = await getPendingTuitionDashboardData(filters);
  const players = flattenDashboardPlayers(dashboard);
  const followUps = await loadFollowUps([...new Set(players.map((player) => player.enrollmentId))]);

  return {
    ...dashboard,
    followUpCounts: countFollowUps(players, followUps),
  };
}

export async function getCallsDetailData(filters: {
  campusId?: string;
  birthYear?: string;
  month?: string;
  bucket?: string;
  q?: string;
  followUpStatus?: PendingFollowUpFilter;
}): Promise<CallsDetailData | null> {
  const dashboard = await getPendingTuitionDashboardData({ campusId: filters.campusId, month: filters.month });
  const bucket = filters.bucket === "1" || filters.bucket === "2" || filters.bucket === "3plus" ? filters.bucket : "";
  const requestedBirthYear =
    filters.birthYear === "sin-categoria" || (filters.birthYear && /^\d{4}$/.test(filters.birthYear))
      ? filters.birthYear
      : "";
  const followUpStatus = filters.followUpStatus ?? "all";
  const q = (filters.q ?? "").trim();

  let title = "Llamadas";
  let subtitle = dashboard.selectedMonth ? `Mensualidades pendientes | ${dashboard.selectedMonth}` : "Mensualidades pendientes";
  let players: PendingTuitionPlayer[] = [];

  if (bucket || requestedBirthYear) {
    const detail = await getPendingTuitionCategoryDetailData({
      campusId: filters.campusId,
      birthYear: requestedBirthYear || undefined,
      month: filters.month,
      bucket: bucket || undefined,
    });
    if (!detail) return null;
    players = detail.players;
    title = `Llamadas - ${detail.categoryLabel}`;
    subtitle = `${detail.campusName}${detail.selectedMonth ? ` | ${detail.selectedMonth}` : ""}`;
  } else {
    players = flattenDashboardPlayers(dashboard);
    title = dashboard.selectedCampusId
      ? `Llamadas - ${dashboard.campusBoards.find((board) => board.campusId === dashboard.selectedCampusId)?.campusName ?? "Campus"}`
      : "Llamadas - Todos los campus";
  }

  const allRows = await enrichCallRows(players);
  const followUpCounts = emptyFollowUpCounts();
  for (const row of allRows) {
    followUpCounts.all += 1;
    followUpCounts[row.followUpStatus] += 1;
  }

  const normalizedQ = q.toLowerCase();
  const rows = allRows.filter((row) => {
    if (followUpStatus !== "all" && row.followUpStatus !== followUpStatus) return false;
    if (!normalizedQ) return true;
    const haystack = `${row.playerName} ${row.primaryPhone ?? ""} ${row.teamName} ${row.campusName}`.toLowerCase();
    return haystack.includes(normalizedQ);
  });

  return {
    title,
    subtitle,
    campusId: dashboard.selectedCampusId,
    selectedMonth: dashboard.selectedMonth,
    bucket,
    birthYear: requestedBirthYear,
    q,
    followUpStatus,
    rows,
    followUpCounts,
  };
}
