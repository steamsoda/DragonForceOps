import type { PendingRow } from "@/components/pending/pending-table";
import {
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

export type CallsOrganizeMode = "birthYear" | "pendingMonths" | "followUp";

export type CallsDetailGroup = {
  key: string;
  label: string;
  rows: PendingRow[];
};

export type CallsDetailData = {
  title: string;
  subtitle: string;
  campusId: string;
  selectedMonth: string;
  bucket: string;
  birthYear: string;
  birthYearOptions: Array<{ value: string; label: string; count: number }>;
  q: string;
  followUpStatus: PendingFollowUpFilter;
  organizeBy: CallsOrganizeMode;
  rows: PendingRow[];
  groups: CallsDetailGroup[];
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

function filterPlayersByBucket(players: PendingTuitionPlayer[], bucket: string) {
  if (bucket === "1") return players.filter((player) => player.pendingMonthCount === 1);
  if (bucket === "2") return players.filter((player) => player.pendingMonthCount === 2);
  if (bucket === "3plus") return players.filter((player) => player.pendingMonthCount >= 3);
  return players;
}

function filterPlayersByBirthYear(players: PendingTuitionPlayer[], birthYear: string) {
  if (!birthYear) return players;
  if (birthYear === "sin-categoria") return players.filter((player) => !player.birthYear);
  return players.filter((player) => String(player.birthYear ?? "") === birthYear);
}

function getBucketLabel(bucket: string) {
  if (bucket === "1") return "1 mes pendiente";
  if (bucket === "2") return "2 meses pendientes";
  if (bucket === "3plus") return "3+ meses pendientes";
  return "";
}

function buildBirthYearOptions(players: PendingTuitionPlayer[]) {
  const counts = new Map<string, number>();
  for (const player of players) {
    const key = player.birthYear ? String(player.birthYear) : "sin-categoria";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([value, count]) => ({
      value,
      count,
      label: value === "sin-categoria" ? "Sin categoria" : value,
    }))
    .sort((a, b) => {
      if (a.value === "sin-categoria") return 1;
      if (b.value === "sin-categoria") return -1;
      return Number(a.value) - Number(b.value);
    });
}

function normalizeOrganizeMode(value: string | undefined): CallsOrganizeMode {
  if (value === "pendingMonths" || value === "followUp") return value;
  return "birthYear";
}

function pendingMonthsGroup(row: PendingRow) {
  const count = row.pendingMonths?.length ?? 0;
  if (count >= 3) return { key: "3plus", label: "3+ meses pendientes" };
  if (count === 2) return { key: "2", label: "2 meses pendientes" };
  if (count === 1) return { key: "1", label: "1 mes pendiente" };
  return { key: "none", label: "Sin meses pendientes" };
}

function followUpGroup(row: PendingRow) {
  switch (row.followUpStatus) {
    case "no_answer":
      return { key: "no_answer", label: "No contesta" };
    case "contacted":
      return { key: "contacted", label: "Contactado" };
    case "promise_to_pay":
      return { key: "promise_to_pay", label: "Promesa de pago" };
    case "will_not_return":
      return { key: "will_not_return", label: "No regresara" };
    default:
      return { key: "uncontacted", label: "No contactado" };
  }
}

function groupRows(rows: PendingRow[], organizeBy: CallsOrganizeMode): CallsDetailGroup[] {
  const groups = new Map<string, CallsDetailGroup>();

  for (const row of rows) {
    const group =
      organizeBy === "pendingMonths"
        ? pendingMonthsGroup(row)
        : organizeBy === "followUp"
          ? followUpGroup(row)
          : {
              key: row.birthYear ? String(row.birthYear) : "sin-categoria",
              label: row.birthYear ? `Cat. ${row.birthYear}` : "Sin categoria",
            };

    const existing = groups.get(group.key);
    if (existing) {
      existing.rows.push(row);
    } else {
      groups.set(group.key, { ...group, rows: [row] });
    }
  }

  const orderByMode: Record<CallsOrganizeMode, string[]> = {
    birthYear: [],
    pendingMonths: ["3plus", "2", "1", "none"],
    followUp: ["uncontacted", "no_answer", "contacted", "promise_to_pay", "will_not_return"],
  };
  const preferredOrder = orderByMode[organizeBy];

  return [...groups.values()].sort((a, b) => {
    if (organizeBy === "birthYear") {
      if (a.key === "sin-categoria") return 1;
      if (b.key === "sin-categoria") return -1;
      return Number(a.key) - Number(b.key);
    }
    return preferredOrder.indexOf(a.key) - preferredOrder.indexOf(b.key);
  });
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
  organizeBy?: string;
}): Promise<CallsDetailData | null> {
  const dashboard = await getPendingTuitionDashboardData({ campusId: filters.campusId, month: filters.month });
  const bucket = filters.bucket === "1" || filters.bucket === "2" || filters.bucket === "3plus" ? filters.bucket : "";
  const requestedBirthYear =
    filters.birthYear === "sin-categoria" || (filters.birthYear && /^\d{4}$/.test(filters.birthYear))
      ? filters.birthYear
      : "";
  const followUpStatus = filters.followUpStatus ?? "all";
  const organizeBy = normalizeOrganizeMode(filters.organizeBy);
  const q = (filters.q ?? "").trim();

  const basePlayers = flattenDashboardPlayers(dashboard);
  const bucketPlayers = filterPlayersByBucket(basePlayers, bucket);
  const birthYearOptions = buildBirthYearOptions(bucketPlayers);
  const players = filterPlayersByBirthYear(bucketPlayers, requestedBirthYear);
  const campusName = dashboard.selectedCampusId
    ? dashboard.campusBoards.find((board) => board.campusId === dashboard.selectedCampusId)?.campusName ?? "Campus"
    : "Todos los campus";
  const selectedBirthYearLabel = birthYearOptions.find((option) => option.value === requestedBirthYear)?.label;
  const titleParts = ["Llamadas", getBucketLabel(bucket), selectedBirthYearLabel ? `Cat. ${selectedBirthYearLabel}` : ""].filter(Boolean);
  const title = titleParts.join(" - ");
  const subtitle = `${campusName}${dashboard.selectedMonth ? ` | ${dashboard.selectedMonth}` : ""}`;

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
  const groups = groupRows(rows, organizeBy);

  return {
    title,
    subtitle,
    campusId: dashboard.selectedCampusId,
    selectedMonth: dashboard.selectedMonth,
    bucket,
    birthYear: requestedBirthYear,
    birthYearOptions,
    q,
    followUpStatus,
    organizeBy,
    rows,
    groups,
    followUpCounts,
  };
}
