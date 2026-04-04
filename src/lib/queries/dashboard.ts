import { createClient } from "@/lib/supabase/server";

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
