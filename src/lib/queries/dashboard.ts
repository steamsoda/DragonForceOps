import { createClient } from "@/lib/supabase/server";

type SumRow = {
  amount: number | string | null;
};

function toNumber(value: number | string | null | undefined) {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  return 0;
}

export async function getDashboardKpis() {
  const supabase = await createClient();

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const startOfTomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const [activeEnrollmentsResult, balancesResult, paymentsTodayResult, paymentsMonthResult] = await Promise.all([
    supabase.from("enrollments").select("id", { count: "exact", head: true }).eq("status", "active"),
    supabase
      .from("v_enrollment_balances")
      .select("balance")
      .gt("balance", 0)
      .returns<{ balance: number | string | null }[]>(),
    supabase
      .from("payments")
      .select("amount")
      .eq("status", "posted")
      .gte("paid_at", startOfToday)
      .lt("paid_at", startOfTomorrow)
      .returns<SumRow[]>(),
    supabase
      .from("payments")
      .select("amount")
      .eq("status", "posted")
      .gte("paid_at", startOfMonth)
      .lt("paid_at", startOfTomorrow)
      .returns<SumRow[]>()
  ]);

  const pendingBalance = (balancesResult.data ?? []).reduce((sum, row) => sum + toNumber(row.balance), 0);
  const paymentsToday = (paymentsTodayResult.data ?? []).reduce((sum, row) => sum + toNumber(row.amount), 0);
  const paymentsThisMonth = (paymentsMonthResult.data ?? []).reduce((sum, row) => sum + toNumber(row.amount), 0);

  return {
    activeEnrollments: activeEnrollmentsResult.count ?? 0,
    pendingBalance,
    paymentsToday,
    paymentsThisMonth
  };
}

