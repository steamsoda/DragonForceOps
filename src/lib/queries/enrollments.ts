import { createClient } from "@/lib/supabase/server";

const PAGE_SIZE = 20;

export type PendingBalanceBucket = "all" | "small" | "medium" | "high";
export type PendingOverdueFilter = "all" | "overdue" | "7plus" | "30plus";

export type PendingEnrollmentsFilters = {
  q?: string;
  campusId?: string;
  teamId?: string;
  balanceBucket?: PendingBalanceBucket;
  overdue?: PendingOverdueFilter;
  page?: number;
};

type EnrollmentBalanceRow = {
  enrollment_id: string;
  balance: number;
};

type TeamOptionRow = {
  id: string;
  name: string;
};

export async function listTeamsForPending(campusId?: string) {
  const supabase = await createClient();
  let query = supabase
    .from("teams")
    .select("id, name")
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (campusId) {
    query = query.eq("campus_id", campusId);
  }

  const { data } = await query.returns<TeamOptionRow[]>();
  return data ?? [];
}

function getOverdueDays(dueDate: string | null) {
  if (!dueDate) return 0;
  const today = new Date();
  const due = new Date(dueDate);
  const diffMs = today.getTime() - due.getTime();
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  return Math.max(days, 0);
}

function balanceBucketMatches(balance: number, bucket: PendingBalanceBucket) {
  if (bucket === "all") return true;
  if (bucket === "small") return balance <= 1000;
  if (bucket === "medium") return balance > 1000 && balance <= 3000;
  if (bucket === "high") return balance > 3000;
  return true;
}

function overdueMatches(overdueDays: number, filter: PendingOverdueFilter) {
  if (filter === "all") return true;
  if (filter === "overdue") return overdueDays > 0;
  if (filter === "7plus") return overdueDays >= 7;
  if (filter === "30plus") return overdueDays >= 30;
  return true;
}

type PendingRpcRow = {
  enrollment_id: string;
  player_id: string;
  campus_id: string;
  player_first_name: string | null;
  player_last_name: string | null;
  campus_name: string | null;
  campus_code: string | null;
  phone_primary: string | null;
  balance: number | string;
  team_id: string | null;
  team_name: string | null;
  earliest_due_date: string | null;
};

export async function listPendingEnrollments(filters: PendingEnrollmentsFilters) {
  const supabase = await createClient();
  const page = Math.max(1, filters.page ?? 1);
  const balanceBucket = filters.balanceBucket ?? "all";
  const overdueFilter = filters.overdue ?? "all";
  const textQuery = (filters.q ?? "").trim().toLowerCase();

  const { data: rpcData } = await supabase
    .rpc("list_pending_enrollments_full", { p_campus_id: filters.campusId ?? null });
  const rpcRows = (rpcData ?? []) as PendingRpcRow[];

  const rows = rpcRows
    .map((r) => {
      const balance = typeof r.balance === "string" ? Number(r.balance) : (r.balance ?? 0);
      const overdueDays = getOverdueDays(r.earliest_due_date);
      const playerName = `${r.player_first_name ?? ""} ${r.player_last_name ?? ""}`.trim();
      return {
        enrollmentId: r.enrollment_id,
        playerId: r.player_id,
        playerName,
        campusName: r.campus_name ?? "-",
        campusCode: r.campus_code ?? "-",
        teamId: r.team_id ?? null,
        teamName: r.team_name ?? "-",
        primaryPhone: r.phone_primary ?? null,
        balance,
        dueDate: r.earliest_due_date ?? null,
        overdueDays
      };
    })
    .filter((row) => {
      if (filters.teamId && row.teamId !== filters.teamId) return false;
      if (!balanceBucketMatches(row.balance, balanceBucket)) return false;
      if (!overdueMatches(row.overdueDays, overdueFilter)) return false;
      if (textQuery.length > 0) {
        const haystack = `${row.playerName} ${row.primaryPhone ?? ""} ${row.teamName}`.toLowerCase();
        if (!haystack.includes(textQuery)) return false;
      }
      return true;
    })
    .sort((a, b) => b.balance - a.balance || b.overdueDays - a.overdueDays || a.playerName.localeCompare(b.playerName));

  const total = rows.length;
  const from = (page - 1) * PAGE_SIZE;
  const paged = rows.slice(from, from + PAGE_SIZE);

  return { rows: paged, total, page, pageSize: PAGE_SIZE };
}

// ── Baja enrollments with outstanding balance ─────────────────────────────────

export type BajaEnrollmentRow = {
  enrollmentId: string;
  playerId: string;
  playerName: string;
  campusName: string;
  enrollmentStatus: "ended" | "cancelled";
  endDate: string | null;
  dropoutReason: string | null;
  pendingChargeCount: number;
  pendingTotal: number;
};

type BajaEnrollmentDbRow = {
  id: string;
  player_id: string;
  status: string;
  end_date: string | null;
  dropout_reason: string | null;
  players: { first_name: string | null; last_name: string | null } | null;
  campuses: { name: string | null } | null;
};

type PendingChargeRow = {
  enrollment_id: string;
  amount: number;
};

export async function listBajaEnrollmentsWithBalance(): Promise<BajaEnrollmentRow[]> {
  const supabase = await createClient();

  const [{ data: balanceRows }, { data: enrollmentRows }, { data: chargeRows }] = await Promise.all([
    supabase
      .from("v_enrollment_balances")
      .select("enrollment_id, balance")
      .gt("balance", 0)
      .returns<EnrollmentBalanceRow[]>(),
    supabase
      .from("enrollments")
      .select("id, player_id, status, end_date, dropout_reason, players(first_name, last_name), campuses(name)")
      .in("status", ["ended", "cancelled"])
      .order("end_date", { ascending: false })
      .returns<BajaEnrollmentDbRow[]>(),
    supabase
      .from("charges")
      .select("enrollment_id, amount")
      .eq("status", "pending")
      .returns<PendingChargeRow[]>()
  ]);

  const balanceMap = new Map((balanceRows ?? []).map((r) => [r.enrollment_id, r.balance]));
  const chargesByEnrollment = new Map<string, PendingChargeRow[]>();
  (chargeRows ?? []).forEach((c) => {
    const list = chargesByEnrollment.get(c.enrollment_id) ?? [];
    list.push(c);
    chargesByEnrollment.set(c.enrollment_id, list);
  });

  return (enrollmentRows ?? [])
    .filter((e) => (balanceMap.get(e.id) ?? 0) > 0)
    .map((e) => {
      const charges = chargesByEnrollment.get(e.id) ?? [];
      return {
        enrollmentId: e.id,
        playerId: e.player_id,
        playerName: `${e.players?.first_name ?? ""} ${e.players?.last_name ?? ""}`.trim(),
        campusName: e.campuses?.name ?? "-",
        enrollmentStatus: e.status as "ended" | "cancelled",
        endDate: e.end_date,
        dropoutReason: e.dropout_reason,
        pendingChargeCount: charges.length,
        pendingTotal: charges.reduce((sum, c) => sum + c.amount, 0)
      };
    })
    .sort((a, b) => b.pendingTotal - a.pendingTotal);
}

// ── Enrollment edit context ───────────────────────────────────────────────────

type EnrollmentEditRow = {
  id: string;
  status: string;
  start_date: string;
  end_date: string | null;
  notes: string | null;
  campus_id: string;
  dropout_reason: string | null;
  dropout_notes: string | null;
  campuses: { id: string; name: string; code: string } | null;
  players: { first_name: string; last_name: string } | null;
};

export type EnrollmentEditContext = {
  enrollment: {
    id: string;
    status: string;
    startDate: string;
    endDate: string | null;
    notes: string | null;
    campusId: string;
    campusName: string;
    playerName: string;
    dropoutReason: string | null;
    dropoutNotes: string | null;
  };
  campuses: Array<{ id: string; code: string; name: string }>;
};

export async function getEnrollmentEditContext(enrollmentId: string): Promise<EnrollmentEditContext | null> {
  const supabase = await createClient();

  const [enrollmentResult, campusResult] = await Promise.all([
    supabase
      .from("enrollments")
      .select("id, status, start_date, end_date, notes, campus_id, dropout_reason, dropout_notes, campuses(id, name, code), players(first_name, last_name)")
      .eq("id", enrollmentId)
      .maybeSingle()
      .returns<EnrollmentEditRow | null>(),
    supabase
      .from("campuses")
      .select("id, code, name")
      .eq("is_active", true)
      .order("name")
      .returns<CampusRow[]>()
  ]);

  if (!enrollmentResult.data) return null;

  const e = enrollmentResult.data;
  return {
    enrollment: {
      id: e.id,
      status: e.status,
      startDate: e.start_date,
      endDate: e.end_date,
      notes: e.notes,
      campusId: e.campus_id,
      campusName: e.campuses?.name ?? "-",
      playerName: `${e.players?.first_name ?? ""} ${e.players?.last_name ?? ""}`.trim(),
      dropoutReason: e.dropout_reason,
      dropoutNotes: e.dropout_notes
    },
    campuses: campusResult.data ?? []
  };
}

// ── Enrollment creation form context ─────────────────────────────────────────

type PlayerRow = { id: string; first_name: string; last_name: string };
type CampusRow = { id: string; code: string; name: string };
type PlanRow = { id: string; name: string; currency: string };
type ActiveEnrollmentRow = { id: string };
type PlanItemRow = { amount: number; charge_types: { code: string } | null };

const DEFAULT_INSCRIPTION_AMOUNT = 1800;
const DEFAULT_FIRST_MONTH_AMOUNT = 600;

export type EnrollmentCreateFormContext = {
  player: { id: string; fullName: string };
  hasActiveEnrollment: boolean;
  campuses: Array<{ id: string; code: string; name: string }>;
  plan: { id: string; name: string; currency: string } | null;
  defaultInscriptionAmount: number;
  defaultFirstMonthAmount: number;
};

export async function getEnrollmentCreateFormContext(
  playerId: string
): Promise<EnrollmentCreateFormContext | null> {
  const supabase = await createClient();

  const [playerResult, campusResult, planResult, activeEnrollmentResult] = await Promise.all([
    supabase
      .from("players")
      .select("id, first_name, last_name")
      .eq("id", playerId)
      .maybeSingle()
      .returns<PlayerRow | null>(),
    supabase
      .from("campuses")
      .select("id, code, name")
      .eq("is_active", true)
      .order("name")
      .returns<CampusRow[]>(),
    supabase
      .from("pricing_plans")
      .select("id, name, currency")
      .eq("is_active", true)
      .order("name")
      .limit(1)
      .maybeSingle()
      .returns<PlanRow | null>(),
    supabase
      .from("enrollments")
      .select("id")
      .eq("player_id", playerId)
      .eq("status", "active")
      .maybeSingle()
      .returns<ActiveEnrollmentRow | null>()
  ]);

  if (!playerResult.data) return null;

  // Read default inscription amount from DB; fall back to the constant if not found
  let defaultInscriptionAmount = DEFAULT_INSCRIPTION_AMOUNT;
  if (planResult.data) {
    const { data: planItems } = await supabase
      .from("pricing_plan_items")
      .select("amount, charge_types(code)")
      .eq("pricing_plan_id", planResult.data.id)
      .eq("is_active", true)
      .returns<PlanItemRow[]>();

    const inscriptionItem = (planItems ?? []).find((item) => item.charge_types?.code === "inscription");
    if (inscriptionItem) defaultInscriptionAmount = inscriptionItem.amount;
  }

  const p = playerResult.data;
  return {
    player: { id: p.id, fullName: `${p.first_name} ${p.last_name}`.trim() },
    hasActiveEnrollment: !!activeEnrollmentResult.data,
    campuses: campusResult.data ?? [],
    plan: planResult.data,
    defaultInscriptionAmount,
    defaultFirstMonthAmount: DEFAULT_FIRST_MONTH_AMOUNT
  };
}
