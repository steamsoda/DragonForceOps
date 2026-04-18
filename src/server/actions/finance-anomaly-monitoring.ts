"use server";

import type { PermissionContext } from "@/lib/auth/permissions";
import { getPermissionContext } from "@/lib/auth/permissions";
import {
  writeEnrollmentFinanceAnomalyAuditDiffs,
  type EnrollmentFinanceAnomalySnapshot,
} from "@/lib/finance/enrollment-anomalies";
import { getEnrollmentFinanceDiagnostics } from "@/lib/queries/enrollment-finance-diagnostics";

export async function captureEnrollmentAnomalySnapshot(
  enrollmentId: string,
  permissionContext?: PermissionContext | null,
): Promise<EnrollmentFinanceAnomalySnapshot | null> {
  const context = permissionContext ?? (await getPermissionContext());
  if (!context?.hasOperationalAccess) return null;

  const diagnostics = await getEnrollmentFinanceDiagnostics(enrollmentId, context);
  return diagnostics?.anomalySnapshot ?? null;
}

export async function writeEnrollmentAnomalyAuditTrail(params: {
  enrollmentId: string;
  actorUserId: string;
  actorEmail?: string | null;
  triggerAction: string;
  before: EnrollmentFinanceAnomalySnapshot | null;
  permissionContext?: PermissionContext | null;
}) {
  const context = params.permissionContext ?? (await getPermissionContext());
  if (!context?.hasOperationalAccess) return;

  const after = await captureEnrollmentAnomalySnapshot(params.enrollmentId, context);

  await writeEnrollmentFinanceAnomalyAuditDiffs({
    supabase: context.supabase,
    actorUserId: params.actorUserId,
    actorEmail: params.actorEmail ?? null,
    triggerAction: params.triggerAction,
    before: params.before,
    after,
  });
}
