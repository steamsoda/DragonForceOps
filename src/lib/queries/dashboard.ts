import { canAccessCampus, getOperationalCampusAccess } from "@/lib/auth/campuses";
import { createClient } from "@/lib/supabase/server";
import { getMonterreyMonthBounds, getMonterreyMonthString } from "@/lib/time";

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: "Efectivo",
  transfer: "Transferencia",
  card: "Tarjeta",
  stripe_360player: "360Player",
  other: "Otro",
};

function toNumber(value: number | string | null | undefined) {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  return 0;
}

function parseJsonArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? (parsed as T[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}

export type DashboardFilters = {
  campusId?: string;
  month?: string;
};

export type PaymentByMethod = {
  method: string;
  methodLabel: string;
  total: number;
};

export type DashboardData = {
  activeEnrollments: number;
  enrollmentsWithBalance: number;
  pendingBalance: number;
  paymentsToday: number;
  paymentsThisMonth: number;
  monthlyPaymentsPrevious: number;
  monthlyChargesThisMonth: number;
  monthlyChargesPrevious: number;
  newEnrollmentsThisMonth: number;
  bajasThisMonth: number;
  paymentCountThisMonth: number;
  paymentsByMethod: PaymentByMethod[];
  player360Amount: number;
  player360Count: number;
  historicalCatchupAmount: number;
  historicalCatchupCount: number;
  selectedMonth: string;
};

export type DashboardNewEnrollmentRow = {
  enrollmentId: string;
  playerId: string;
  playerName: string;
  campusId: string;
  campusName: string;
  status: string;
  createdAt: string;
  inscriptionDate: string;
};

type DashboardRpcRow = {
  selected_month: string;
  active_enrollments: number | string | null;
  enrollments_with_balance: number | string | null;
  pending_balance: number | string | null;
  payments_today: number | string | null;
  payments_this_month: number | string | null;
  monthly_payments_previous: number | string | null;
  monthly_charges_this_month: number | string | null;
  monthly_charges_previous: number | string | null;
  new_enrollments_this_month: number | string | null;
  bajas_this_month: number | string | null;
  payment_count_this_month: number | string | null;
  payments_by_method: unknown;
  player_360_amount: number | string | null;
  player_360_count: number | string | null;
  historical_catchup_amount: number | string | null;
  historical_catchup_count: number | string | null;
};

export async function getDashboardData(filters: DashboardFilters): Promise<DashboardData> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("get_dashboard_finance_summary", {
      p_month: filters.month ?? null,
      p_campus_id: filters.campusId ?? null,
    })
    .maybeSingle<DashboardRpcRow>();

  if (error || !data) {
    return {
      activeEnrollments: 0,
      enrollmentsWithBalance: 0,
      pendingBalance: 0,
      paymentsToday: 0,
      paymentsThisMonth: 0,
      monthlyPaymentsPrevious: 0,
      monthlyChargesThisMonth: 0,
      monthlyChargesPrevious: 0,
      newEnrollmentsThisMonth: 0,
      bajasThisMonth: 0,
      paymentCountThisMonth: 0,
      paymentsByMethod: [],
      player360Amount: 0,
      player360Count: 0,
      historicalCatchupAmount: 0,
      historicalCatchupCount: 0,
      selectedMonth: filters.month ?? "",
    };
  }

  const paymentsByMethod = parseJsonArray<{
    method: string;
    methodLabel: string;
    total: number | string;
  }>(data.payments_by_method).map((row) => ({
    method: row.method,
    methodLabel: row.methodLabel ?? PAYMENT_METHOD_LABELS[row.method] ?? row.method,
    total: toNumber(row.total),
  }));

  return {
    activeEnrollments: Number(data.active_enrollments ?? 0),
    enrollmentsWithBalance: Number(data.enrollments_with_balance ?? 0),
    pendingBalance: toNumber(data.pending_balance),
    paymentsToday: toNumber(data.payments_today),
    paymentsThisMonth: toNumber(data.payments_this_month),
    monthlyPaymentsPrevious: toNumber(data.monthly_payments_previous),
    monthlyChargesThisMonth: toNumber(data.monthly_charges_this_month),
    monthlyChargesPrevious: toNumber(data.monthly_charges_previous),
    newEnrollmentsThisMonth: Number(data.new_enrollments_this_month ?? 0),
    bajasThisMonth: Number(data.bajas_this_month ?? 0),
    paymentCountThisMonth: Number(data.payment_count_this_month ?? 0),
    paymentsByMethod,
    player360Amount: toNumber(data.player_360_amount),
    player360Count: Number(data.player_360_count ?? 0),
    historicalCatchupAmount: toNumber(data.historical_catchup_amount),
    historicalCatchupCount: Number(data.historical_catchup_count ?? 0),
    selectedMonth: data.selected_month,
  };
}

export async function listDashboardNewEnrollments(filters: DashboardFilters) {
  const campusAccess = await getOperationalCampusAccess();
  if (!campusAccess || campusAccess.campusIds.length === 0) {
    return {
      selectedMonth: filters.month ?? "",
      rows: [] as DashboardNewEnrollmentRow[],
    };
  }

  const selectedCampusIds = filters.campusId
    ? canAccessCampus(campusAccess, filters.campusId)
      ? [filters.campusId]
      : []
    : campusAccess.campusIds;

  if (selectedCampusIds.length === 0) {
    return {
      selectedMonth: filters.month ?? "",
      rows: [] as DashboardNewEnrollmentRow[],
    };
  }

  const selectedMonth = filters.month ?? getMonterreyMonthString();
  const monthBounds = getMonterreyMonthBounds(selectedMonth);
  const supabase = await createClient();

  type EnrollmentRow = {
    id: string;
    player_id: string;
    status: string;
    created_at: string;
    inscription_date: string;
    campus_id: string;
    campuses: {
      name: string | null;
    } | null;
    players: {
      first_name: string | null;
      last_name: string | null;
    } | null;
  };

  const { data } = await supabase
    .from("enrollments")
    .select("id, player_id, status, created_at, inscription_date, campus_id, campuses(name), players(first_name, last_name)")
    .in("campus_id", selectedCampusIds)
    .gte("created_at", monthBounds.start)
    .lt("created_at", monthBounds.end)
    .order("created_at", { ascending: false })
    .returns<EnrollmentRow[]>();

  const rows = (data ?? []).map((row) => ({
    enrollmentId: row.id,
    playerId: row.player_id,
    playerName: `${row.players?.first_name ?? ""} ${row.players?.last_name ?? ""}`.replace(/\s+/g, " ").trim() || "Jugador",
    campusId: row.campus_id,
    campusName: row.campuses?.name ?? "Campus",
    status: row.status,
    createdAt: row.created_at,
    inscriptionDate: row.inscription_date,
  }));

  return {
    selectedMonth,
    rows,
  };
}
