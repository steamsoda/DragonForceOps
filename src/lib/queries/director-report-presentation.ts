import "server-only";
import { requireDirectorPageReader } from "@/lib/auth/operational-page-reader";
import { getResumenMensualData, getCorteSemanallData, PAYMENT_METHOD_LABELS } from "./reports";

type Counts = {
  month: string; activeEnrollments: number; paymentCount: number; enrollmentsWithBalance: number;
  player360Count: number; historicalCatchupCount: number;
  chargesByType: Array<{ typeCode: string; typeName: string; count: number }>;
  paymentsByMethod: Array<{ method: string; count: number }>;
  weeks: Array<{ weekNum: number; startDay: number; endDay: number; paymentCount: number; byMethod: Array<{ method: string }> }>;
};
type Filters = { month?: string; campusId?: string };
async function getCounts(filters: Filters) {
  const context = await requireDirectorPageReader();
  const { data, error } = await context.supabase.rpc("director_report_counts", {
    p_month: filters.month || null, p_campus_id: filters.campusId || null,
  });
  if (error || !data) throw new Error("report_counts_unavailable");
  return data as Counts;
}

export async function getDashboardPaymentCounts(filters: Filters) {
  const data = await getCounts(filters);
  return {
    enrollmentsWithBalance: data.enrollmentsWithBalance,
    player360Count: data.player360Count, historicalCatchupCount: data.historicalCatchupCount,
    paymentCountThisMonth: data.paymentCount,
  };
}

export async function getMonthlyReportPresentation(filters: Filters) {
  const context = await requireDirectorPageReader();
  if (!context.isDirectorReadOnly) return getResumenMensualData(filters);
  const data = await getCounts(filters);
  return {
    month: data.month, activeEnrollments: data.activeEnrollments, paymentCount: data.paymentCount,
    player360Count: data.player360Count, historicalCatchupCount: data.historicalCatchupCount,
    totalCargosEmitidos: null, totalCobrado: null, pendingBalance: null,
    player360Amount: null, historicalCatchupAmount: null,
    chargesByType: data.chargesByType.map(row => ({ typeCode: row.typeCode, typeName: row.typeName, count: row.count, total: null })),
    paymentsByMethod: data.paymentsByMethod.map(row => ({ method: row.method, count: row.count, methodLabel: PAYMENT_METHOD_LABELS[row.method] ?? row.method, total: null })),
  };
}

export async function getWeeklyReportPresentation(filters: Filters) {
  const context = await requireDirectorPageReader();
  if (!context.isDirectorReadOnly) return getCorteSemanallData(filters);
  const data = await getCounts(filters);
  const monthDate = new Date(`${data.month}-01T12:00:00Z`);
  const monthLabel = new Intl.DateTimeFormat("es-MX", { month: "long", year: "numeric", timeZone: "UTC" }).format(monthDate);
  const shortMonth = new Intl.DateTimeFormat("es-MX", { month: "short", timeZone: "UTC" }).format(monthDate);
  return {
    month: data.month, monthLabel, totalCobrado: null, paymentCount: data.paymentCount,
    player360Amount: null, player360Count: data.player360Count,
    historicalCatchupAmount: null, historicalCatchupCount: data.historicalCatchupCount,
    weeks: data.weeks.map(week => ({ weekNum: week.weekNum, startDay: week.startDay, endDay: week.endDay, paymentCount: week.paymentCount, label: `${week.startDay}-${week.endDay} ${shortMonth}`, totalCobrado: null,
      byMethod: week.byMethod.map(row => ({ method: row.method, methodLabel: PAYMENT_METHOD_LABELS[row.method] ?? row.method, total: null })),
    })),
  };
}
