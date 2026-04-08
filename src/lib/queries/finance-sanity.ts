import { createClient } from "@/lib/supabase/server";

function toNumber(value: number | string | null | undefined) {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  return 0;
}

type FinanceReconciliationSummaryRow = {
  canonical_pending_balance: number | string | null;
  canonical_enrollments_with_balance: number | string | null;
  pending_rpc_balance: number | string | null;
  pending_rpc_enrollments: number | string | null;
  dashboard_pending_balance: number | string | null;
  dashboard_enrollments_with_balance: number | string | null;
  pending_vs_canonical_balance_drift: number | string | null;
  dashboard_vs_canonical_balance_drift: number | string | null;
  pending_vs_canonical_count_drift: number | string | null;
  dashboard_vs_canonical_count_drift: number | string | null;
};

type FinanceReconciliationDriftRow = {
  enrollment_id: string;
  player_id: string;
  player_name: string | null;
  campus_name: string | null;
  canonical_balance: number | string | null;
  pending_rpc_balance: number | string | null;
  balance_drift: number | string | null;
};

export type FinanceSanitySummary = {
  canonicalPendingBalance: number;
  canonicalEnrollmentsWithBalance: number;
  pendingRpcBalance: number;
  pendingRpcEnrollments: number;
  dashboardPendingBalance: number;
  dashboardEnrollmentsWithBalance: number;
  pendingVsCanonicalBalanceDrift: number;
  dashboardVsCanonicalBalanceDrift: number;
  pendingVsCanonicalCountDrift: number;
  dashboardVsCanonicalCountDrift: number;
};

export type FinanceSanityDriftRow = {
  enrollmentId: string;
  playerId: string;
  playerName: string;
  campusName: string;
  canonicalBalance: number;
  pendingRpcBalance: number;
  balanceDrift: number;
};

export type FinanceSanityData = {
  summary: FinanceSanitySummary;
  driftRows: FinanceSanityDriftRow[];
  isHealthy: boolean;
};

export async function getFinanceSanityData(campusId?: string): Promise<FinanceSanityData> {
  const supabase = await createClient();

  const [{ data: summaryRow, error: summaryError }, { data: driftRows, error: driftError }] = await Promise.all([
    supabase
      .rpc("get_finance_reconciliation_summary", { p_campus_id: campusId ?? null })
      .maybeSingle<FinanceReconciliationSummaryRow>(),
    supabase
      .rpc("list_finance_reconciliation_drift", { p_campus_id: campusId ?? null, p_limit: 50 })
      .returns<FinanceReconciliationDriftRow[]>(),
  ]);

  if (summaryError) {
    throw new Error(`finance_sanity_summary_failed:${summaryError.message}`);
  }

  if (driftError) {
    throw new Error(`finance_sanity_drift_failed:${driftError.message}`);
  }

  const summary: FinanceSanitySummary = {
    canonicalPendingBalance: toNumber(summaryRow?.canonical_pending_balance),
    canonicalEnrollmentsWithBalance: Number(summaryRow?.canonical_enrollments_with_balance ?? 0),
    pendingRpcBalance: toNumber(summaryRow?.pending_rpc_balance),
    pendingRpcEnrollments: Number(summaryRow?.pending_rpc_enrollments ?? 0),
    dashboardPendingBalance: toNumber(summaryRow?.dashboard_pending_balance),
    dashboardEnrollmentsWithBalance: Number(summaryRow?.dashboard_enrollments_with_balance ?? 0),
    pendingVsCanonicalBalanceDrift: toNumber(summaryRow?.pending_vs_canonical_balance_drift),
    dashboardVsCanonicalBalanceDrift: toNumber(summaryRow?.dashboard_vs_canonical_balance_drift),
    pendingVsCanonicalCountDrift: Number(summaryRow?.pending_vs_canonical_count_drift ?? 0),
    dashboardVsCanonicalCountDrift: Number(summaryRow?.dashboard_vs_canonical_count_drift ?? 0),
  };

  const driftList = Array.isArray(driftRows) ? driftRows : [];

  const normalizedDriftRows: FinanceSanityDriftRow[] = driftList.map((row: FinanceReconciliationDriftRow) => ({
    enrollmentId: row.enrollment_id,
    playerId: row.player_id,
    playerName: row.player_name ?? "-",
    campusName: row.campus_name ?? "-",
    canonicalBalance: toNumber(row.canonical_balance),
    pendingRpcBalance: toNumber(row.pending_rpc_balance),
    balanceDrift: toNumber(row.balance_drift),
  }));

  const isHealthy =
    Math.abs(summary.pendingVsCanonicalBalanceDrift) < 0.01 &&
    Math.abs(summary.dashboardVsCanonicalBalanceDrift) < 0.01 &&
    summary.pendingVsCanonicalCountDrift === 0 &&
    summary.dashboardVsCanonicalCountDrift === 0 &&
    normalizedDriftRows.length === 0;

  return {
    summary,
    driftRows: normalizedDriftRows,
    isHealthy,
  };
}
