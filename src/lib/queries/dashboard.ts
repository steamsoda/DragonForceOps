import { createClient } from "@/lib/supabase/server";

type SumRow = {
  amount: number | string | null;
};

type PaymentWithMethodRow = {
  amount: number | string | null;
  method: string;
};

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: "Efectivo",
  transfer: "Transferencia",
  card: "Tarjeta",
  stripe_360player: "360Player/Stripe",
  other: "Otro"
};

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
  paymentsByMethod: PaymentByMethod[];
  selectedMonth: string;
};

type MonthRange = {
  selectedMonth: string;
  monthStartIso: string;
  nextMonthStartIso: string;
  previousMonthStartIso: string;
  todayStartIso: string;
  tomorrowStartIso: string;
  monthStartDateStr: string;
  nextMonthStartDateStr: string;
};

function toNumber(value: number | string | null | undefined) {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  return 0;
}

function formatMonthValue(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${date.getFullYear()}-${month}`;
}

// Monterrey is permanently UTC-6 (Mexico abolished DST in 2023).
const CST_OFFSET_MS = 6 * 60 * 60 * 1000;

function resolveMonthRange(monthInput?: string): MonthRange {
  // Shift to Monterrey local time so date components align to Monterrey midnight, not UTC.
  const now = new Date(Date.now() - CST_OFFSET_MS);
  const selectedMonth = /^\d{4}-\d{2}$/.test(monthInput ?? "") ? (monthInput as string) : formatMonthValue(now);
  const [yearRaw, monthRaw] = selectedMonth.split("-");
  const year = Number(yearRaw);
  const monthIndex = Number(monthRaw) - 1;

  const monthStart = new Date(year, monthIndex, 1);
  const nextMonthStart = new Date(year, monthIndex + 1, 1);
  const previousMonthStart = new Date(year, monthIndex - 1, 1);
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

  const nextYear = nextMonthStart.getFullYear();
  const nextMonth = String(nextMonthStart.getMonth() + 1).padStart(2, "0");

  return {
    selectedMonth,
    monthStartIso: monthStart.toISOString(),
    nextMonthStartIso: nextMonthStart.toISOString(),
    previousMonthStartIso: previousMonthStart.toISOString(),
    todayStartIso: todayStart.toISOString(),
    tomorrowStartIso: tomorrowStart.toISOString(),
    monthStartDateStr: `${yearRaw}-${monthRaw}-01`,
    nextMonthStartDateStr: `${nextYear}-${nextMonth}-01`
  };
}

export async function getDashboardData(filters: DashboardFilters): Promise<DashboardData> {
  const supabase = await createClient();
  const monthRange = resolveMonthRange(filters.month);

  let activeEnrollmentCountQuery = supabase.from("enrollments").select("id", { count: "exact", head: true }).eq("status", "active");
  if (filters.campusId) {
    activeEnrollmentCountQuery = activeEnrollmentCountQuery.eq("campus_id", filters.campusId);
  }

  let paymentsTodayQuery = supabase
    .from("payments")
    .select("amount, enrollments!inner(campus_id)")
    .eq("status", "posted")
    .gte("paid_at", monthRange.todayStartIso)
    .lt("paid_at", monthRange.tomorrowStartIso);

  let paymentsCurrentMonthQuery = supabase
    .from("payments")
    .select("amount, method, enrollments!inner(campus_id)")
    .eq("status", "posted")
    .gte("paid_at", monthRange.monthStartIso)
    .lt("paid_at", monthRange.nextMonthStartIso);

  let paymentsPreviousMonthQuery = supabase
    .from("payments")
    .select("amount, enrollments!inner(campus_id)")
    .eq("status", "posted")
    .gte("paid_at", monthRange.previousMonthStartIso)
    .lt("paid_at", monthRange.monthStartIso);

  let chargesCurrentMonthQuery = supabase
    .from("charges")
    .select("amount, enrollments!inner(campus_id)")
    .neq("status", "void")
    .gte("created_at", monthRange.monthStartIso)
    .lt("created_at", monthRange.nextMonthStartIso);

  let chargesPreviousMonthQuery = supabase
    .from("charges")
    .select("amount, enrollments!inner(campus_id)")
    .neq("status", "void")
    .gte("created_at", monthRange.previousMonthStartIso)
    .lt("created_at", monthRange.monthStartIso);

  let newEnrollmentsQuery = supabase
    .from("enrollments")
    .select("id", { count: "exact", head: true })
    .gte("created_at", monthRange.monthStartIso)
    .lt("created_at", monthRange.nextMonthStartIso);

  let bajasQuery = supabase
    .from("enrollments")
    .select("id", { count: "exact", head: true })
    .in("status", ["ended", "cancelled"])
    .gte("end_date", monthRange.monthStartDateStr)
    .lt("end_date", monthRange.nextMonthStartDateStr);

  if (filters.campusId) {
    paymentsTodayQuery = paymentsTodayQuery.eq("enrollments.campus_id", filters.campusId);
    paymentsCurrentMonthQuery = paymentsCurrentMonthQuery.eq("enrollments.campus_id", filters.campusId);
    paymentsPreviousMonthQuery = paymentsPreviousMonthQuery.eq("enrollments.campus_id", filters.campusId);
    chargesCurrentMonthQuery = chargesCurrentMonthQuery.eq("enrollments.campus_id", filters.campusId);
    chargesPreviousMonthQuery = chargesPreviousMonthQuery.eq("enrollments.campus_id", filters.campusId);
    newEnrollmentsQuery = newEnrollmentsQuery.eq("campus_id", filters.campusId);
    bajasQuery = bajasQuery.eq("campus_id", filters.campusId);
  }

  const [
    activeEnrollmentCountResult,
    balanceKpiResult,
    paymentsTodayResult,
    paymentsCurrentMonthResult,
    paymentsPreviousMonthResult,
    chargesCurrentMonthResult,
    chargesPreviousMonthResult,
    newEnrollmentsResult,
    bajasResult
  ] = await Promise.all([
    activeEnrollmentCountQuery,
    supabase.rpc("get_balance_kpis", { p_campus_id: filters.campusId ?? null }),
    paymentsTodayQuery.returns<SumRow[]>(),
    paymentsCurrentMonthQuery.returns<PaymentWithMethodRow[]>(),
    paymentsPreviousMonthQuery.returns<SumRow[]>(),
    chargesCurrentMonthQuery.returns<SumRow[]>(),
    chargesPreviousMonthQuery.returns<SumRow[]>(),
    newEnrollmentsQuery,
    bajasQuery
  ]);

  type KpiRow = { pending_balance: number | string; enrollments_with_balance: number | string };
  const kpiRow = ((balanceKpiResult.data ?? []) as KpiRow[])[0];
  const pendingBalance = toNumber(kpiRow?.pending_balance);
  const enrollmentsWithBalance = Number(kpiRow?.enrollments_with_balance ?? 0);

  const currentMonthPayments = paymentsCurrentMonthResult.data ?? [];
  const methodMap = new Map<string, { methodLabel: string; total: number }>();
  currentMonthPayments.forEach((p) => {
    const prev = methodMap.get(p.method) ?? { methodLabel: PAYMENT_METHOD_LABELS[p.method] ?? p.method, total: 0 };
    methodMap.set(p.method, { methodLabel: prev.methodLabel, total: prev.total + toNumber(p.amount) });
  });
  const paymentsByMethod: PaymentByMethod[] = Array.from(methodMap.entries())
    .map(([method, { methodLabel, total }]) => ({ method, methodLabel, total }))
    .sort((a, b) => b.total - a.total);

  return {
    activeEnrollments: activeEnrollmentCountResult.count ?? 0,
    enrollmentsWithBalance,
    pendingBalance,
    paymentsToday: (paymentsTodayResult.data ?? []).reduce((sum, row) => sum + toNumber(row.amount), 0),
    paymentsThisMonth: currentMonthPayments.reduce((sum, row) => sum + toNumber(row.amount), 0),
    monthlyPaymentsPrevious: (paymentsPreviousMonthResult.data ?? []).reduce((sum, row) => sum + toNumber(row.amount), 0),
    monthlyChargesThisMonth: (chargesCurrentMonthResult.data ?? []).reduce((sum, row) => sum + toNumber(row.amount), 0),
    monthlyChargesPrevious: (chargesPreviousMonthResult.data ?? []).reduce((sum, row) => sum + toNumber(row.amount), 0),
    newEnrollmentsThisMonth: newEnrollmentsResult.count ?? 0,
    bajasThisMonth: bajasResult.count ?? 0,
    paymentsByMethod,
    selectedMonth: monthRange.selectedMonth
  };
}
