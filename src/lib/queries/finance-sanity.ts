import { getPermissionContext, type PermissionContext } from "@/lib/auth/permissions";
import {
  ENROLLMENT_FINANCE_ANOMALY_CODES,
  FINANCE_ANOMALY_AUDIT_ACTIONS,
  type EnrollmentFinanceAnomaly,
  type EnrollmentFinanceAnomalyCode,
  type EnrollmentFinanceAnomalyEvent,
  type EnrollmentFinanceAnomalySeverity,
} from "@/lib/finance/enrollment-anomalies";
import { getEnrollmentFinanceDiagnostics } from "@/lib/queries/enrollment-finance-diagnostics";

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

type FinanceReconciliationSnapshotRow = {
  snapshot_at: string;
  campus_id: string | null;
  capture_mode: string | null;
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
  balance_drift_enrollment_count: number | string | null;
};

type EnrollmentCandidateRow = {
  id: string;
};

type AuditLogRow = {
  id: string;
  event_at: string;
  action: string;
  table_name: string | null;
  before_data: Record<string, unknown> | null;
  after_data: Record<string, unknown> | null;
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

export type FinanceSanitySnapshot = {
  snapshotAt: string;
  captureMode: "scheduled" | "manual";
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
  balanceDriftEnrollmentCount: number;
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

export type FinanceSanityActiveAnomalyRow = {
  enrollmentId: string;
  playerId: string | null;
  playerName: string;
  birthYear: number | null;
  campusId: string;
  campusName: string;
  canonicalBalance: number;
  derivedBalance: number;
  anomalyCount: number;
  highestSeverity: EnrollmentFinanceAnomalySeverity;
  anomalies: EnrollmentFinanceAnomaly[];
};

export type FinanceSanityData = {
  summary: FinanceSanitySummary;
  latestSnapshot: FinanceSanitySnapshot | null;
  scannedEnrollmentCount: number;
  driftRows: FinanceSanityDriftRow[];
  activeAnomalyRows: FinanceSanityActiveAnomalyRow[];
  recentAnomalyEvents: EnrollmentFinanceAnomalyEvent[];
  isHealthy: boolean;
};

export type FinanceSanityScanMode = "recent" | "deep";

const RECENT_FINANCE_ACTIVITY_ACTIONS = [
  "payment.created",
  "payment.created.historical_regularization_contry",
  "payment.created.historical_regularization_admin",
  "charge.created",
  "charge.created.caja",
  "charge.created.caja_advance_tuition",
  "charge.updated",
  "charge.updated.caja_advance_tuition",
  "charge.voided",
  "payment.voided",
  "payment.refunded",
  "payment.reassigned",
  "charge.corrective_created",
  "balance_adjustment.created",
  "payment_allocations.repaired",
] as const;

function getEnrollmentIdFromAuditRow(row: AuditLogRow) {
  const afterEnrollmentId = typeof row.after_data?.enrollment_id === "string" ? row.after_data.enrollment_id : null;
  if (afterEnrollmentId) return afterEnrollmentId;
  return typeof row.before_data?.enrollment_id === "string" ? row.before_data.enrollment_id : null;
}

function normalizeSeverity(value: unknown): EnrollmentFinanceAnomalySeverity | null {
  return value === "warning" || value === "needs_correction" ? value : null;
}

function normalizeAnomalyCode(value: unknown): EnrollmentFinanceAnomalyCode | null {
  return typeof value === "string" && ENROLLMENT_FINANCE_ANOMALY_CODES.includes(value as EnrollmentFinanceAnomalyCode)
    ? (value as EnrollmentFinanceAnomalyCode)
    : null;
}

function parseAnomalyEvent(row: AuditLogRow): EnrollmentFinanceAnomalyEvent | null {
  if (
    row.action !== FINANCE_ANOMALY_AUDIT_ACTIONS.detected &&
    row.action !== FINANCE_ANOMALY_AUDIT_ACTIONS.resolved
  ) {
    return null;
  }

  const payload = row.after_data ?? {};
  const enrollmentId = typeof payload.enrollment_id === "string" ? payload.enrollment_id : null;
  const code = normalizeAnomalyCode(payload.code);
  const severity = normalizeSeverity(payload.severity);
  if (!enrollmentId || !code || !severity) return null;

  return {
    id: row.id,
    action: row.action,
    eventAt: row.event_at,
    enrollmentId,
    playerId: typeof payload.player_id === "string" ? payload.player_id : null,
    playerName: typeof payload.player_name === "string" ? payload.player_name : "-",
    birthYear: typeof payload.birth_year === "number" ? payload.birth_year : null,
    campusId: typeof payload.campus_id === "string" ? payload.campus_id : null,
    campusName: typeof payload.campus_name === "string" ? payload.campus_name : "-",
    code,
    severity,
    title: typeof payload.title === "string" ? payload.title : code,
    detail: typeof payload.detail === "string" ? payload.detail : "",
    triggerAction: typeof payload.trigger_action === "string" ? payload.trigger_action : null,
  };
}

function filterAnomalies(
  anomalies: EnrollmentFinanceAnomaly[],
  anomalyCode?: EnrollmentFinanceAnomalyCode,
  severity?: EnrollmentFinanceAnomalySeverity,
) {
  return anomalies.filter((anomaly) => {
    if (anomalyCode && anomaly.code !== anomalyCode) return false;
    if (severity && anomaly.severity !== severity) return false;
    return true;
  });
}

function getHighestSeverity(anomalies: EnrollmentFinanceAnomaly[]): EnrollmentFinanceAnomalySeverity {
  return anomalies.some((anomaly) => anomaly.severity === "needs_correction") ? "needs_correction" : "warning";
}

function isOptionalSnapshotError(error: { code?: string | null; message?: string | null; details?: string | null }) {
  const haystack = `${error.code ?? ""} ${error.message ?? ""} ${error.details ?? ""}`.toLowerCase();
  return (
    error.code === "PGRST202" ||
    error.code === "42883" ||
    error.code === "42P01" ||
    haystack.includes("get_latest_finance_reconciliation_snapshot") ||
    haystack.includes("finance_reconciliation_snapshots")
  );
}

export async function getFinanceSanityData(
  campusId?: string,
  filters?: {
    anomalyCode?: EnrollmentFinanceAnomalyCode;
    severity?: EnrollmentFinanceAnomalySeverity;
    scanMode?: FinanceSanityScanMode;
  },
  permissionContext?: PermissionContext | null,
): Promise<FinanceSanityData> {
  const context = permissionContext ?? (await getPermissionContext());
  if (!context?.isSuperAdmin) {
    throw new Error("finance_sanity_requires_superadmin");
  }

  const supabase = context.supabase;
  const scanMode = filters?.scanMode === "deep" ? "deep" : "recent";
  const driftLimit = scanMode === "deep" ? 250 : 50;
  const auditLimit = scanMode === "deep" ? 2000 : 250;
  const candidateLimit = scanMode === "deep" ? 1500 : 40;

  const [
    { data: summaryRow, error: summaryError },
    { data: latestSnapshotRow, error: latestSnapshotError },
    { data: driftRows, error: driftError },
    { data: auditRows, error: auditError },
    { data: balanceCandidateRows, error: balanceCandidateError },
    { data: activeEnrollmentRows, error: activeEnrollmentError },
  ] =
    await Promise.all([
      supabase
        .rpc("get_finance_reconciliation_summary", { p_campus_id: campusId ?? null })
        .maybeSingle<FinanceReconciliationSummaryRow>(),
      supabase
        .rpc("get_latest_finance_reconciliation_snapshot", { p_campus_id: null })
        .maybeSingle<FinanceReconciliationSnapshotRow>(),
      supabase
        .rpc("list_finance_reconciliation_drift", { p_campus_id: campusId ?? null, p_limit: driftLimit })
        .returns<FinanceReconciliationDriftRow[]>(),
      supabase
        .from("audit_logs")
        .select("id, event_at, action, table_name, before_data, after_data")
        .or(
          [
            `action.eq.${FINANCE_ANOMALY_AUDIT_ACTIONS.detected}`,
            `action.eq.${FINANCE_ANOMALY_AUDIT_ACTIONS.resolved}`,
            ...RECENT_FINANCE_ACTIVITY_ACTIONS.map((action) => `action.eq.${action}`),
          ].join(","),
        )
        .order("event_at", { ascending: false })
        .limit(auditLimit)
        .returns<AuditLogRow[]>(),
      scanMode === "deep"
        ? supabase
            .from("v_enrollment_balances")
            .select("enrollment_id")
            .neq("balance", 0)
            .limit(candidateLimit)
            .returns<Array<{ enrollment_id: string }>>()
        : Promise.resolve({ data: [] as Array<{ enrollment_id: string }>, error: null }),
      scanMode === "deep"
        ? supabase
            .from("enrollments")
            .select("id")
            .eq("status", "active")
            .limit(candidateLimit)
            .returns<EnrollmentCandidateRow[]>()
        : Promise.resolve({ data: [] as EnrollmentCandidateRow[], error: null }),
    ]);

  if (summaryError) {
    throw new Error(`finance_sanity_summary_failed:${summaryError.message}`);
  }

  if (driftError) {
    throw new Error(`finance_sanity_drift_failed:${driftError.message}`);
  }

  if (latestSnapshotError && !isOptionalSnapshotError(latestSnapshotError)) {
    throw new Error(`finance_sanity_snapshot_failed:${latestSnapshotError.message}`);
  }

  if (auditError) {
    throw new Error(`finance_sanity_audit_failed:${auditError.message}`);
  }

  if (balanceCandidateError) {
    throw new Error(`finance_sanity_balance_candidates_failed:${balanceCandidateError.message}`);
  }

  if (activeEnrollmentError) {
    throw new Error(`finance_sanity_active_candidates_failed:${activeEnrollmentError.message}`);
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

  const latestSnapshot: FinanceSanitySnapshot | null =
    latestSnapshotError && isOptionalSnapshotError(latestSnapshotError)
      ? null
      : latestSnapshotRow
        ? {
            snapshotAt: latestSnapshotRow.snapshot_at,
            captureMode: latestSnapshotRow.capture_mode === "manual" ? "manual" : "scheduled",
            canonicalPendingBalance: toNumber(latestSnapshotRow.canonical_pending_balance),
            canonicalEnrollmentsWithBalance: Number(latestSnapshotRow.canonical_enrollments_with_balance ?? 0),
            pendingRpcBalance: toNumber(latestSnapshotRow.pending_rpc_balance),
            pendingRpcEnrollments: Number(latestSnapshotRow.pending_rpc_enrollments ?? 0),
            dashboardPendingBalance: toNumber(latestSnapshotRow.dashboard_pending_balance),
            dashboardEnrollmentsWithBalance: Number(latestSnapshotRow.dashboard_enrollments_with_balance ?? 0),
            pendingVsCanonicalBalanceDrift: toNumber(latestSnapshotRow.pending_vs_canonical_balance_drift),
            dashboardVsCanonicalBalanceDrift: toNumber(latestSnapshotRow.dashboard_vs_canonical_balance_drift),
            pendingVsCanonicalCountDrift: Number(latestSnapshotRow.pending_vs_canonical_count_drift ?? 0),
            dashboardVsCanonicalCountDrift: Number(latestSnapshotRow.dashboard_vs_canonical_count_drift ?? 0),
            balanceDriftEnrollmentCount: Number(latestSnapshotRow.balance_drift_enrollment_count ?? 0),
          }
        : null;

  const normalizedDriftRows: FinanceSanityDriftRow[] = (Array.isArray(driftRows) ? driftRows : []).map((row) => ({
    enrollmentId: row.enrollment_id,
    playerId: row.player_id,
    playerName: row.player_name ?? "-",
    campusName: row.campus_name ?? "-",
    canonicalBalance: toNumber(row.canonical_balance),
    pendingRpcBalance: toNumber(row.pending_rpc_balance),
    balanceDrift: toNumber(row.balance_drift),
  }));

  const recentAnomalyEvents = (Array.isArray(auditRows) ? auditRows : [])
    .map(parseAnomalyEvent)
    .filter((row): row is EnrollmentFinanceAnomalyEvent => row !== null)
    .filter((row) => {
      if (campusId && row.campusId !== campusId) return false;
      if (filters?.anomalyCode && row.code !== filters.anomalyCode) return false;
      if (filters?.severity && row.severity !== filters.severity) return false;
      return true;
    })
    .slice(0, 30);

  const candidateEnrollmentIds = Array.from(
    new Set(
      [
        ...normalizedDriftRows.map((row) => row.enrollmentId),
        ...recentAnomalyEvents.map((row) => row.enrollmentId),
        ...(Array.isArray(auditRows) ? auditRows : [])
          .map(getEnrollmentIdFromAuditRow)
          .filter((value): value is string => Boolean(value)),
        ...(balanceCandidateRows ?? []).map((row) => row.enrollment_id),
        ...(activeEnrollmentRows ?? []).map((row) => row.id),
      ].filter(Boolean),
    ),
  ).slice(0, candidateLimit);

  const diagnosticsList = await Promise.all(
    candidateEnrollmentIds.map((enrollmentId) => getEnrollmentFinanceDiagnostics(enrollmentId, context)),
  );

  const activeAnomalyRows: FinanceSanityActiveAnomalyRow[] = diagnosticsList
    .filter((row): row is NonNullable<typeof row> => row !== null)
    .map((row) => {
      const filteredAnomalies = filterAnomalies(row.anomalies, filters?.anomalyCode, filters?.severity);
      return {
        enrollmentId: row.enrollment.enrollmentId,
        playerId: row.enrollment.playerId,
        playerName: row.enrollment.playerName,
        birthYear: row.enrollment.birthYear,
        campusId: row.enrollment.campusId,
        campusName: row.enrollment.campusName,
        canonicalBalance: row.canonicalBalance,
        derivedBalance: row.ledgerTotals.derivedOperationalBalance,
        anomalyCount: filteredAnomalies.length,
        highestSeverity: getHighestSeverity(filteredAnomalies),
        anomalies: filteredAnomalies,
      };
    })
    .filter((row) => row.anomalies.length > 0)
    .filter((row) => !campusId || row.campusId === campusId)
    .sort((left, right) => {
      const severityRank = (value: EnrollmentFinanceAnomalySeverity) => (value === "needs_correction" ? 0 : 1);
      const severityDiff = severityRank(left.highestSeverity) - severityRank(right.highestSeverity);
      if (severityDiff !== 0) return severityDiff;
      if (right.anomalyCount !== left.anomalyCount) return right.anomalyCount - left.anomalyCount;
      return left.playerName.localeCompare(right.playerName, "es-MX");
    });

  const isHealthy =
    Math.abs(summary.pendingVsCanonicalBalanceDrift) < 0.01 &&
    Math.abs(summary.dashboardVsCanonicalBalanceDrift) < 0.01 &&
    summary.pendingVsCanonicalCountDrift === 0 &&
    summary.dashboardVsCanonicalCountDrift === 0 &&
    normalizedDriftRows.length === 0 &&
    activeAnomalyRows.length === 0;

  return {
    summary,
    latestSnapshot,
    scannedEnrollmentCount: candidateEnrollmentIds.length,
    driftRows: normalizedDriftRows,
    activeAnomalyRows,
    recentAnomalyEvents,
    isHealthy,
  };
}
