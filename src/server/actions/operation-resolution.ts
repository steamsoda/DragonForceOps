"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getPermissionContext, canAccessEnrollmentRecord } from "@/lib/auth/permissions";
import { isDebugWriteBlocked } from "@/lib/auth/debug-view";
import { canAccessCampus } from "@/lib/auth/campuses";
import { directorReadOnlyEnabled } from "@/lib/auth/director-readonly-policy";
import type { PendingOperations, OperationResolution } from "@/lib/finance/operation-resolution";

async function authorize(enrollmentId: string, write: boolean) {
  if (!z.string().uuid().safeParse(enrollmentId).success) return null;
  const context = await getPermissionContext();
  if (!context || context.roleCodes.includes("porto_viewer") || !(context.isDirector || context.isDirectorReadOnly)
    || (write && (context.isDirectorReadOnly || await isDebugWriteBlocked()))) return null;
  if (context.isDirectorReadOnly) {
    if (!directorReadOnlyEnabled()) return null;
    const { data, error } = await context.supabase.from("v_director_readonly_enrollments")
      .select("campus_id").eq("id", enrollmentId).maybeSingle();
    if (error || !data || !canAccessCampus(context.campusAccess, data.campus_id)) return null;
  } else if (!await canAccessEnrollmentRecord(enrollmentId, context)) return null;
  return context;
}

export async function loadPendingOperations(enrollmentId: string): Promise<{ ok: true; data: PendingOperations; readOnly: boolean } | { ok: false; code: string }> {
  const context = await authorize(enrollmentId, false);
  if (!context) return { ok: false, code: "forbidden" };
  try {
    const { data, error } = await context.supabase.rpc("list_explicit_pending_operations", { p_enrollment: enrollmentId });
    if (error || !Array.isArray(data?.pending) || !Array.isArray(data?.history)) return { ok: false, code: "unavailable" };
    return { ok: true, data: data as PendingOperations, readOnly: context.isDirectorReadOnly || await isDebugWriteBlocked() };
  } catch { return { ok: false, code: "unavailable" }; }
}

export async function resolvePendingOperation(input: unknown): Promise<{ ok: true; result: OperationResolution } | { ok: false; code: string }> {
  const parsed = z.object({ enrollmentId: z.string().uuid(), requestId: z.string().uuid(), kind: z.enum(["cart", "credit"]),
    reason: z.string().trim().min(8).max(500), confirmed: z.literal(true) }).strict().safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid_resolution" };
  const command = parsed.data;
  const context = await authorize(command.enrollmentId, true);
  if (!context) return { ok: false, code: "forbidden" };
  try {
    const { data, error } = await context.supabase.rpc("resolve_explicit_pending_operation", {
      p_enrollment: command.enrollmentId, p_kind: command.kind, p_request: command.requestId, p_reason: command.reason,
    });
    if (error) {
      const known = ["forbidden", "invalid_resolution", "operation_not_found", "operation_already_resolved", "operation_too_recent", "operation_receipt_mismatch"];
      return { ok: false, code: known.includes(error.message) ? error.message : "unavailable" };
    }
    if (data?.requestId !== command.requestId || data?.kind !== command.kind) return { ok: false, code: "unavailable" };
    try { revalidatePath("/caja"); revalidatePath(`/enrollments/${command.enrollmentId}/charges`); } catch { /* Resolution is already recorded. */ }
    return { ok: true, result: data as OperationResolution };
  } catch { return { ok: false, code: "unavailable" }; }
}
