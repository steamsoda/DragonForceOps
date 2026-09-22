"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getPermissionContext, canAccessEnrollmentRecord } from "@/lib/auth/permissions";
import { isDebugWriteBlocked } from "@/lib/auth/debug-view";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEnrollmentLedger } from "@/lib/queries/billing";
import { creditCommandSchema, type CreditLoadResult, type CreditReceipt, type CreditResult } from "@/lib/finance/explicit-credit";

export async function loadExplicitCredit(enrollmentId: string): Promise<CreditLoadResult> {
  if (!z.string().uuid().safeParse(enrollmentId).success) return { ok: false, code: "forbidden" };
  const context = await getPermissionContext();
  if (!context || context.roleCodes.includes("porto_viewer") ||
    !(context.isDirector || context.isFrontDesk || context.isDirectorReadOnly)) return { ok: false, code: "forbidden" };
  try {
    // Canonical loader enforces real enrollment/campus or reviewed reader scope.
    // Use the scoped ledger without any payment or allocation side effects.
    const ledger = await getEnrollmentLedger(enrollmentId);
    if (!ledger) return { ok: false, code: "forbidden" };
    const pending = await createAdminClient().from("explicit_credit_intents").select("actor_id,command")
      .eq("enrollment_id", enrollmentId).eq("state", "pending").maybeSingle();
    if (pending.error) return { ok: false, code: "load_failed" };
    const ownPending = pending.data?.actor_id === context.user.id && !context.isDirectorReadOnly;
    const recovery = ownPending ? creditCommandSchema.parse(pending.data?.command) : null;
    if (recovery && (recovery.enrollmentId !== enrollmentId || recovery.selection.some(line => !ledger.charges.some(charge => charge.id === line.chargeId)))) {
      return { ok: false, code: "load_failed" };
    }
    const { data, error } = await createAdminClient().from("explicit_credit_operations")
      .select("receipt").eq("enrollment_id", ledger.enrollment.id)
      .order("created_at", { ascending: false }).limit(20);
    if (error) return { ok: false, code: "load_failed" };
    const checkouts = await createAdminClient().from("explicit_cart_checkouts").select("receipt")
      .eq("enrollment_id", ledger.enrollment.id).eq("receipt->>moneyReceived", "0")
      .order("created_at", { ascending: false }).limit(20);
    if (checkouts.error) return { ok: false, code: "load_failed" };
    const receipts = [...(data ?? []), ...(checkouts.data ?? [])].map(row => row.receipt as CreditReceipt)
      .filter(receipt => receipt.moneyReceived === 0).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
    return { ok: true, workspace: {
      enrollmentId: ledger.enrollment.id, playerName: ledger.enrollment.playerName,
      campusName: ledger.enrollment.campusName, currency: ledger.enrollment.currency,
      availableCredit: ledger.accountCredit.explicitAvailableAmount,
      legacyReview: ledger.accountCredit.legacyImplicitCreditAmount,
      readOnly: context.isDirectorReadOnly || await isDebugWriteBlocked(),
      actorId: context.user.id, recovery, recoveryBlocked: !!pending.data && !ownPending,
      canResolvePending: context.isDirector || context.isDirectorReadOnly,
      charges: ledger.charges.filter((charge) => (charge.status !== "void" && charge.pendingAmount > 0)
        || recovery?.selection.some(line => line.chargeId === charge.id))
        .map((charge) => ({ id: charge.id, description: charge.description, pending: charge.pendingAmount,
          eligible: !charge.copaTigresInstallments })),
      receipts: Array.from(new Map(receipts.map(receipt => [receipt.operationId, receipt])).values()).slice(0, 20),
    } };
  } catch { return { ok: false, code: "load_failed" }; }
}

export async function confirmExplicitCredit(input: unknown, expectedActorId: string): Promise<CreditResult> {
  if (await isDebugWriteBlocked()) return { ok: false, code: "debug_read_only" };
  const context = await getPermissionContext();
  if (!context || context.isDirectorReadOnly || context.roleCodes.includes("porto_viewer") ||
    !(context.isDirector || context.isFrontDesk) || context.user.id !== expectedActorId) return { ok: false, code: "forbidden" };
  const parsed = creditCommandSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid_credit_selection" };
  try {
    const command = parsed.data;
    const staged = await context.supabase.rpc("stage_explicit_credit", {
      p_enrollment: command.enrollmentId, p_request: command.requestId, p_command: command,
    });
    if (staged.error) {
      const code = ["forbidden", "invalid_credit_selection", "credit_request_conflict", "credit_selection_changed", "credit_in_progress"].find(value => staged.error.message === value);
      return code ? { ok: false, code } : { ok: false, code: "uncertain", uncertain: true };
    }
    // Authenticated RPC independently checks actor, current roles and campus.
    const { data, error } = await context.supabase.rpc("apply_explicit_credit_selection", {
      p_enrollment: command.enrollmentId, p_request: command.requestId,
      p_selection: command.selection, p_expected_available: command.expectedAvailable,
    });
    if (error) {
      const known = ["forbidden", "credit_selection_changed", "invalid_credit_selection", "invalid_target_charge",
        "credit_source_requires_review", "copa_tigres_no_credit", "credit_request_conflict", "enrollment_not_found", "enrollment_inactive", "credit_in_progress"];
      const code = known.find((value) => error.message === value);
      if (code && !["forbidden", "credit_request_conflict"].includes(code)) {
        const closed = await context.supabase.rpc("resolve_explicit_credit_intent", { p_request: command.requestId, p_failed: true });
        if (closed.error) return { ok: false, code: "uncertain", uncertain: true };
      }
      return code ? { ok: false, code } : { ok: false, code: "uncertain", uncertain: true };
    }
    if (!data || data.operationId !== command.requestId) return { ok: false, code: "uncertain", uncertain: true };
    // A cache failure must not turn a committed operation into a failed payment.
    try {
      for (const path of ["/caja", "/players", "/pending", "/llamadas", "/uniforms", "/sports-signups", "/receipts",
        `/enrollments/${command.enrollmentId}/charges`]) revalidatePath(path);
    } catch { /* Receipt remains the authoritative committed result. */ }
    return { ok: true, receipt: data as CreditReceipt };
  } catch { return { ok: false, code: "uncertain", uncertain: true }; }
}

export async function acknowledgeExplicitCredit(enrollmentId: string, requestId: string) {
  if (!z.string().uuid().safeParse(enrollmentId).success || !z.string().uuid().safeParse(requestId).success || await isDebugWriteBlocked()) return;
  const context = await getPermissionContext();
  if (!context || context.isDirectorReadOnly || context.roleCodes.includes("porto_viewer") || !(context.isDirector || context.isFrontDesk)
    || !await canAccessEnrollmentRecord(enrollmentId, context)) return;
  const { data } = await createAdminClient().from("explicit_credit_intents").select("id")
    .eq("id", requestId).eq("enrollment_id", enrollmentId).eq("actor_id", context.user.id).maybeSingle();
  if (data) await context.supabase.rpc("resolve_explicit_credit_intent", { p_request: requestId, p_failed: false });
}
