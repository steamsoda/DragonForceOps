import type { DashboardData } from "./dashboard";

export const RESTRICTED_VALUE = "\u2014";

type FinancialKey = "pendingBalance" | "paymentsToday" | "paymentsThisMonth" |
  "monthlyPaymentsPrevious" | "monthlyChargesThisMonth" | "monthlyChargesPrevious" |
  "paymentsByMethod" | "player360Amount" | "historicalCatchupAmount";

export type DashboardPresentation = Omit<DashboardData, FinancialKey | "enrollmentsWithBalance" |
  "player360Count" | "historicalCatchupCount" | "paymentCountThisMonth"> & {
  [K in FinancialKey]: DashboardData[K] | null;
} & {
  enrollmentsWithBalance: number | null;
  player360Count: number | null;
  historicalCatchupCount: number | null;
  paymentCountThisMonth: number | null;
};

export type OperationalDashboard = Pick<DashboardData, "activeEnrollments" |
  "newEnrollmentsThisMonth" | "bajasThisMonth" | "attendanceRateThisWeek" |
  "attendanceRecordsThisWeek" | "selectedMonth"> & Partial<Pick<DashboardData,
  "enrollmentsWithBalance" | "attendedPlayersThisMonth" | "playersWithoutAttendanceThisMonth" |
  "player360Count" | "historicalCatchupCount" | "paymentCountThisMonth">>;

// Explicit projection: never spread an upstream payload into the read-only presentation.
export function restrictedDashboard(data: OperationalDashboard): DashboardPresentation {
  return {
    activeEnrollments: data.activeEnrollments,
    newEnrollmentsThisMonth: data.newEnrollmentsThisMonth,
    bajasThisMonth: data.bajasThisMonth,
    attendanceRateThisWeek: data.attendanceRateThisWeek,
    attendanceRecordsThisWeek: data.attendanceRecordsThisWeek,
    selectedMonth: data.selectedMonth,
    enrollmentsWithBalance: data.enrollmentsWithBalance ?? null,
    attendedPlayersThisMonth: data.attendedPlayersThisMonth ?? null,
    playersWithoutAttendanceThisMonth: data.playersWithoutAttendanceThisMonth ?? null,
    pendingBalance: null, paymentsToday: null, paymentsThisMonth: null,
    monthlyPaymentsPrevious: null, monthlyChargesThisMonth: null, monthlyChargesPrevious: null,
    paymentsByMethod: null, player360Amount: null, historicalCatchupAmount: null,
    player360Count: data.player360Count ?? null, historicalCatchupCount: data.historicalCatchupCount ?? null,
    paymentCountThisMonth: data.paymentCountThisMonth ?? null,
  };
}
