import type { SupabaseClient } from "@supabase/supabase-js";
import { writeAuditLog } from "@/lib/audit";

export const ENROLLMENT_FINANCE_ANOMALY_CODES = [
  "canonical_vs_operational_drift",
  "unapplied_credit",
  "refunded_payment_with_allocations",
  "refund_amount_mismatch",
  "payment_without_allocations",
  "payment_partial_allocation",
  "payment_reassign_delicate",
  "void_charge_with_allocations",
  "charge_overapplied",
  "non_cash_adjustment_with_allocations",
  "charge_status_mismatch",
  "duplicate_monthly_tuition",
  "repricing_unsafe_monthly_tuition",
] as const;

export type EnrollmentFinanceAnomalyCode = (typeof ENROLLMENT_FINANCE_ANOMALY_CODES)[number];
export type EnrollmentFinanceAnomalySeverity = "warning" | "needs_correction";

export type EnrollmentFinanceAnomaly = {
  key: string;
  code: EnrollmentFinanceAnomalyCode;
  severity: EnrollmentFinanceAnomalySeverity;
  title: string;
  detail: string;
  chargeIds: string[];
  paymentIds: string[];
};

export type EnrollmentFinanceAnomalySnapshot = {
  enrollmentId: string;
  playerId: string | null;
  playerName: string;
  birthYear: number | null;
  campusId: string;
  campusName: string;
  canonicalBalance: number;
  derivedBalance: number;
  anomalies: EnrollmentFinanceAnomaly[];
};

export type EnrollmentFinanceAnomalyEvent = {
  id: string;
  action: "finance.anomaly_detected" | "finance.anomaly_resolved";
  eventAt: string;
  enrollmentId: string;
  playerId: string | null;
  playerName: string;
  birthYear: number | null;
  campusId: string | null;
  campusName: string;
  code: EnrollmentFinanceAnomalyCode;
  severity: EnrollmentFinanceAnomalySeverity;
  title: string;
  detail: string;
  triggerAction: string | null;
};

export const ENROLLMENT_FINANCE_ANOMALY_LABELS: Record<EnrollmentFinanceAnomalyCode, string> = {
  canonical_vs_operational_drift: "Drift operativo",
  unapplied_credit: "Credito no aplicado",
  refunded_payment_with_allocations: "Pago reembolsado con asignaciones",
  refund_amount_mismatch: "Reembolso con monto atipico",
  payment_without_allocations: "Pago sin asignaciones",
  payment_partial_allocation: "Pago parcialmente asignado",
  payment_reassign_delicate: "Pago con estructura delicada",
  void_charge_with_allocations: "Cargo anulado con pagos aplicados",
  charge_overapplied: "Cargo sobreaplicado",
  non_cash_adjustment_with_allocations: "Ajuste no caja con asignaciones",
  charge_status_mismatch: "Cargo con estatus inconsistente",
  duplicate_monthly_tuition: "Mensualidades duplicadas",
  repricing_unsafe_monthly_tuition: "Mensualidad con repricio inseguro",
};

export const FINANCE_ANOMALY_AUDIT_ACTIONS = {
  detected: "finance.anomaly_detected",
  resolved: "finance.anomaly_resolved",
} as const;

type DiffResult = {
  detected: EnrollmentFinanceAnomaly[];
  resolved: EnrollmentFinanceAnomaly[];
};

export function getEnrollmentFinanceAnomalyLabel(code: EnrollmentFinanceAnomalyCode) {
  return ENROLLMENT_FINANCE_ANOMALY_LABELS[code] ?? code;
}

export function compareEnrollmentFinanceAnomalies(
  before: EnrollmentFinanceAnomaly[],
  after: EnrollmentFinanceAnomaly[],
): DiffResult {
  const beforeByKey = new Map(before.map((anomaly) => [anomaly.key, anomaly]));
  const afterByKey = new Map(after.map((anomaly) => [anomaly.key, anomaly]));

  const detected = after.filter((anomaly) => !beforeByKey.has(anomaly.key));
  const resolved = before.filter((anomaly) => !afterByKey.has(anomaly.key));

  return { detected, resolved };
}

export async function writeEnrollmentFinanceAnomalyAuditDiffs({
  supabase,
  actorUserId,
  actorEmail,
  triggerAction,
  before,
  after,
}: {
  supabase: SupabaseClient;
  actorUserId: string;
  actorEmail?: string | null;
  triggerAction: string;
  before: EnrollmentFinanceAnomalySnapshot | null;
  after: EnrollmentFinanceAnomalySnapshot | null;
}) {
  if (!before && !after) return;

  const previous = before?.anomalies ?? [];
  const next = after?.anomalies ?? [];
  const diff = compareEnrollmentFinanceAnomalies(previous, next);
  const snapshot = after ?? before;

  if (!snapshot) return;

  await Promise.all([
    ...diff.detected.map((anomaly) =>
      writeAuditLog(supabase, {
        actorUserId,
        actorEmail,
        action: FINANCE_ANOMALY_AUDIT_ACTIONS.detected,
        tableName: "enrollments",
        recordId: snapshot.enrollmentId,
        afterData: {
          enrollment_id: snapshot.enrollmentId,
          player_id: snapshot.playerId,
          player_name: snapshot.playerName,
          birth_year: snapshot.birthYear,
          campus_id: snapshot.campusId,
          campus_name: snapshot.campusName,
          code: anomaly.code,
          severity: anomaly.severity,
          title: anomaly.title,
          detail: anomaly.detail,
          charge_ids: anomaly.chargeIds,
          payment_ids: anomaly.paymentIds,
          canonical_balance: snapshot.canonicalBalance,
          derived_balance: snapshot.derivedBalance,
          trigger_action: triggerAction,
        },
      }),
    ),
    ...diff.resolved.map((anomaly) =>
      writeAuditLog(supabase, {
        actorUserId,
        actorEmail,
        action: FINANCE_ANOMALY_AUDIT_ACTIONS.resolved,
        tableName: "enrollments",
        recordId: snapshot.enrollmentId,
        afterData: {
          enrollment_id: snapshot.enrollmentId,
          player_id: snapshot.playerId,
          player_name: snapshot.playerName,
          birth_year: snapshot.birthYear,
          campus_id: snapshot.campusId,
          campus_name: snapshot.campusName,
          code: anomaly.code,
          severity: anomaly.severity,
          title: anomaly.title,
          detail: anomaly.detail,
          charge_ids: anomaly.chargeIds,
          payment_ids: anomaly.paymentIds,
          canonical_balance: snapshot.canonicalBalance,
          derived_balance: snapshot.derivedBalance,
          trigger_action: triggerAction,
        },
      }),
    ),
  ]);
}
