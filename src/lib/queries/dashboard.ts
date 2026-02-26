import { createClient } from "@/lib/supabase/server";

type SumRow = {
  amount: number | string | null;
};

export type DashboardFilters = {
  campusId?: string;
  month?: string;
};

export type DashboardData = {
  activeEnrollments: number;
  pendingBalance: number;
  paymentsToday: number;
  paymentsThisMonth: number;
  monthlyPaymentsPrevious: number;
  monthlyChargesThisMonth: number;
  monthlyChargesPrevious: number;
  selectedMonth: string;
};

type MonthRange = {
  selectedMonth: string;
  monthStartIso: string;
  nextMonthStartIso: string;
  previousMonthStartIso: string;
  todayStartIso: string;
  tomorrowStartIso: string;
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

function resolveMonthRange(monthInput?: string): MonthRange {
  const now = new Date();
  const selectedMonth = /^\d{4}-\d{2}$/.test(monthInput ?? "") ? (monthInput as string) : formatMonthValue(now);
  const [yearRaw, monthRaw] = selectedMonth.split("-");
  const year = Number(yearRaw);
  const monthIndex = Number(monthRaw) - 1;

  const monthStart = new Date(year, monthIndex, 1);
  const nextMonthStart = new Date(year, monthIndex + 1, 1);
  const previousMonthStart = new Date(year, monthIndex - 1, 1);
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

  return {
    selectedMonth,
    monthStartIso: monthStart.toISOString(),
    nextMonthStartIso: nextMonthStart.toISOString(),
    previousMonthStartIso: previousMonthStart.toISOString(),
    todayStartIso: todayStart.toISOString(),
    tomorrowStartIso: tomorrowStart.toISOString()
  };
}

export async function getDashboardData(filters: DashboardFilters): Promise<DashboardData> {
  const supabase = await createClient();
  const monthRange = resolveMonthRange(filters.month);

  let activeEnrollmentCountQuery = supabase.from("enrollments").select("id", { count: "exact", head: true }).eq("status", "active");
  if (filters.campusId) {
    activeEnrollmentCountQuery = activeEnrollmentCountQuery.eq("campus_id", filters.campusId);
  }

  let activeEnrollmentIdsQuery = supabase.from("enrollments").select("id").eq("status", "active");
  if (filters.campusId) {
    activeEnrollmentIdsQuery = activeEnrollmentIdsQuery.eq("campus_id", filters.campusId);
  }

  let paymentsTodayQuery = supabase
    .from("payments")
    .select("amount, enrollments!inner(campus_id)")
    .eq("status", "posted")
    .gte("paid_at", monthRange.todayStartIso)
    .lt("paid_at", monthRange.tomorrowStartIso);

  let paymentsCurrentMonthQuery = supabase
    .from("payments")
    .select("amount, enrollments!inner(campus_id)")
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

  if (filters.campusId) {
    paymentsTodayQuery = paymentsTodayQuery.eq("enrollments.campus_id", filters.campusId);
    paymentsCurrentMonthQuery = paymentsCurrentMonthQuery.eq("enrollments.campus_id", filters.campusId);
    paymentsPreviousMonthQuery = paymentsPreviousMonthQuery.eq("enrollments.campus_id", filters.campusId);
    chargesCurrentMonthQuery = chargesCurrentMonthQuery.eq("enrollments.campus_id", filters.campusId);
    chargesPreviousMonthQuery = chargesPreviousMonthQuery.eq("enrollments.campus_id", filters.campusId);
  }

  const [
    activeEnrollmentCountResult,
    activeEnrollmentIdsResult,
    paymentsTodayResult,
    paymentsCurrentMonthResult,
    paymentsPreviousMonthResult,
    chargesCurrentMonthResult,
    chargesPreviousMonthResult
  ] = await Promise.all([
    activeEnrollmentCountQuery,
    activeEnrollmentIdsQuery.returns<{ id: string }[]>(),
    paymentsTodayQuery.returns<SumRow[]>(),
    paymentsCurrentMonthQuery.returns<SumRow[]>(),
    paymentsPreviousMonthQuery.returns<SumRow[]>(),
    chargesCurrentMonthQuery.returns<SumRow[]>(),
    chargesPreviousMonthQuery.returns<SumRow[]>()
  ]);

  const activeEnrollmentIds = (activeEnrollmentIdsResult.data ?? []).map((row) => row.id);

  let pendingBalance = 0;
  if (activeEnrollmentIds.length > 0) {
    const { data: balances } = await supabase
      .from("v_enrollment_balances")
      .select("balance")
      .gt("balance", 0)
      .in("enrollment_id", activeEnrollmentIds)
      .returns<{ balance: number | string | null }[]>();

    pendingBalance = (balances ?? []).reduce((sum, row) => sum + toNumber(row.balance), 0);
  }

  return {
    activeEnrollments: activeEnrollmentCountResult.count ?? 0,
    pendingBalance,
    paymentsToday: (paymentsTodayResult.data ?? []).reduce((sum, row) => sum + toNumber(row.amount), 0),
    paymentsThisMonth: (paymentsCurrentMonthResult.data ?? []).reduce((sum, row) => sum + toNumber(row.amount), 0),
    monthlyPaymentsPrevious: (paymentsPreviousMonthResult.data ?? []).reduce((sum, row) => sum + toNumber(row.amount), 0),
    monthlyChargesThisMonth: (chargesCurrentMonthResult.data ?? []).reduce((sum, row) => sum + toNumber(row.amount), 0),
    monthlyChargesPrevious: (chargesPreviousMonthResult.data ?? []).reduce((sum, row) => sum + toNumber(row.amount), 0),
    selectedMonth: monthRange.selectedMonth
  };
}
