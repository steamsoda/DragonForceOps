"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { assertDebugWritesAllowed } from "@/lib/auth/debug-view";
import { writeAuditLog } from "@/lib/audit";
import { canAccessEnrollmentRecord, getPermissionContext } from "@/lib/auth/permissions";
import { getEnrollmentLedger } from "@/lib/queries/billing";
import { captureEnrollmentAnomalySnapshot, writeEnrollmentAnomalyAuditTrail } from "@/server/actions/finance-anomaly-monitoring";

type RepairAllocationPlanRow = {
  paymentId: string;
  chargeId: string;
  amount: number;
};

function normalizeReturnTo(returnTo: string | null | undefined, fallback: string) {
  if (typeof returnTo !== "string") return fallback;
  const trimmed = returnTo.trim();
  if (!trimmed.startsWith("/")) return fallback;
  return trimmed;
}

function redirectWithStatus(returnTo: string, key: "ok" | "err", value: string): never {
  const joiner = returnTo.includes("?") ? "&" : "?";
  redirect(`${returnTo}${joiner}${key}=${encodeURIComponent(value)}`);
}

function parseAmountInput(raw: FormDataEntryValue | null) {
  const value = Number(String(raw ?? "").trim());
  if (!Number.isFinite(value) || Math.abs(value) < 0.01) return null;
  return Math.round(value * 100) / 100;
}

function parseRequiredText(raw: FormDataEntryValue | null) {
  const value = String(raw ?? "").trim();
  return value.length > 0 ? value : null;
}

function parseRepairAllocationPlan(raw: FormDataEntryValue | null): RepairAllocationPlanRow[] | null {
  const value = String(raw ?? "").trim();
  if (!value) return null;

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return null;

    return parsed
      .map((row) => {
        if (!row || typeof row !== "object") return null;
        const paymentId = String((row as { paymentId?: unknown }).paymentId ?? "").trim();
        const chargeId = String((row as { chargeId?: unknown }).chargeId ?? "").trim();
        const amount = Number((row as { amount?: unknown }).amount ?? NaN);
        if (!paymentId || !chargeId || !Number.isFinite(amount) || amount <= 0) return null;
        return {
          paymentId,
          chargeId,
          amount: Math.round(amount * 100) / 100,
        };
      })
      .filter((row): row is RepairAllocationPlanRow => row !== null);
  } catch {
    return null;
  }
}

function parseStringArrayJson(raw: FormDataEntryValue | null): string[] | null {
  const value = String(raw ?? "").trim();
  if (!value) return null;

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return null;
    const values = parsed
      .map((entry) => String(entry ?? "").trim())
      .filter(Boolean);
    return Array.from(new Set(values));
  } catch {
    return null;
  }
}

async function getCorrectionContext(enrollmentId: string, returnTo: string) {
  const context = await getPermissionContext();
  if (!context?.isSuperAdmin) redirectWithStatus(returnTo, "err", "unauthorized");
  if (!(await canAccessEnrollmentRecord(enrollmentId, context))) {
    redirectWithStatus(returnTo, "err", "unauthorized");
  }

  const ledger = await getEnrollmentLedger(enrollmentId);
  if (!ledger) redirectWithStatus(returnTo, "err", "enrollment_not_found");

  return {
    context,
    ledger,
    supabase: context.supabase,
    user: context.user,
  };
}

async function getChargeTypeIdByCode(
  supabase: Awaited<ReturnType<typeof getCorrectionContext>>["supabase"],
  code: string,
) {
  const { data } = await supabase
    .from("charge_types")
    .select("id")
    .eq("code", code)
    .eq("is_active", true)
    .maybeSingle<{ id: string } | null>();

  return data?.id ?? null;
}

async function revalidateCorrectionSurfaces(enrollmentId: string, playerId: string | null) {
  revalidatePath(`/enrollments/${enrollmentId}/charges`);
  if (playerId) revalidatePath(`/players/${playerId}`);
  revalidatePath("/pending");
  revalidatePath("/dashboard");
  revalidatePath("/admin/finance-sanity");
  revalidatePath("/admin/actividad");
  revalidatePath("/activity");
}

export async function createCorrectiveChargeAction(
  enrollmentId: string,
  returnToRaw: string,
  formData: FormData,
): Promise<void> {
  const fallbackPath = `/enrollments/${enrollmentId}/charges`;
  const returnTo = normalizeReturnTo(returnToRaw, fallbackPath);
  await assertDebugWritesAllowed(returnTo);

  const description = parseRequiredText(formData.get("description"));
  const reason = parseRequiredText(formData.get("reason"));
  const notes = parseRequiredText(formData.get("notes"));
  const status = String(formData.get("status") ?? "").trim();
  const amount = parseAmountInput(formData.get("amount"));

  if (!description || !reason || !notes || !amount || (status !== "pending" && status !== "posted")) {
    redirectWithStatus(returnTo, "err", "correction_invalid_form");
  }

  const { supabase, ledger, user } = await getCorrectionContext(enrollmentId, returnTo);
  const anomalyBefore = await captureEnrollmentAnomalySnapshot(enrollmentId);
  const correctiveChargeTypeId = await getChargeTypeIdByCode(supabase, "corrective_charge");
  if (!correctiveChargeTypeId) redirectWithStatus(returnTo, "err", "correction_charge_type_missing");

  const { data: insertedCharge, error } = await supabase
    .from("charges")
    .insert({
      enrollment_id: enrollmentId,
      charge_type_id: correctiveChargeTypeId,
      description,
      amount,
      currency: ledger.enrollment.currency,
      status,
      created_by: user.id,
    })
    .select("id")
    .single<{ id: string }>();

  if (error || !insertedCharge) redirectWithStatus(returnTo, "err", "correction_insert_failed");

  await writeAuditLog(supabase, {
    actorUserId: user.id,
    actorEmail: user.email ?? null,
    action: "charge.corrective_created",
    tableName: "charges",
    recordId: insertedCharge.id,
    afterData: {
      enrollment_id: enrollmentId,
      amount,
      description,
      status,
      reason,
      notes,
      correction_kind: "corrective_charge",
      non_cash: status === "posted",
    },
  });

  await writeEnrollmentAnomalyAuditTrail({
    enrollmentId,
    actorUserId: user.id,
    actorEmail: user.email ?? null,
    triggerAction: "charge.corrective_created",
    before: anomalyBefore,
  });
  await revalidateCorrectionSurfaces(enrollmentId, ledger.enrollment.playerId);
  redirectWithStatus(returnTo, "ok", "corrective_charge_created");
}

export async function createBalanceAdjustmentAction(
  enrollmentId: string,
  returnToRaw: string,
  formData: FormData,
): Promise<void> {
  const fallbackPath = `/enrollments/${enrollmentId}/charges`;
  const returnTo = normalizeReturnTo(returnToRaw, fallbackPath);
  await assertDebugWritesAllowed(returnTo);

  const description = parseRequiredText(formData.get("description"));
  const reason = parseRequiredText(formData.get("reason"));
  const notes = parseRequiredText(formData.get("notes"));
  const amount = parseAmountInput(formData.get("amount"));

  if (!description || !reason || !notes || !amount) {
    redirectWithStatus(returnTo, "err", "balance_adjustment_invalid_form");
  }

  const { supabase, ledger, user } = await getCorrectionContext(enrollmentId, returnTo);
  const anomalyBefore = await captureEnrollmentAnomalySnapshot(enrollmentId);
  const balanceAdjustmentTypeId = await getChargeTypeIdByCode(supabase, "balance_adjustment");
  if (!balanceAdjustmentTypeId) redirectWithStatus(returnTo, "err", "balance_adjustment_type_missing");

  const { data: insertedCharge, error } = await supabase
    .from("charges")
    .insert({
      enrollment_id: enrollmentId,
      charge_type_id: balanceAdjustmentTypeId,
      description,
      amount,
      currency: ledger.enrollment.currency,
      status: "posted",
      created_by: user.id,
    })
    .select("id")
    .single<{ id: string }>();

  if (error || !insertedCharge) redirectWithStatus(returnTo, "err", "balance_adjustment_insert_failed");

  await writeAuditLog(supabase, {
    actorUserId: user.id,
    actorEmail: user.email ?? null,
    action: "balance_adjustment.created",
    tableName: "charges",
    recordId: insertedCharge.id,
    afterData: {
      enrollment_id: enrollmentId,
      amount,
      description,
      status: "posted",
      reason,
      notes,
      correction_kind: "balance_adjustment",
      non_cash: true,
    },
  });

  await writeEnrollmentAnomalyAuditTrail({
    enrollmentId,
    actorUserId: user.id,
    actorEmail: user.email ?? null,
    triggerAction: "balance_adjustment.created",
    before: anomalyBefore,
  });
  await revalidateCorrectionSurfaces(enrollmentId, ledger.enrollment.playerId);
  redirectWithStatus(returnTo, "ok", "balance_adjustment_created");
}

export async function repairPaymentAllocationsAction(
  enrollmentId: string,
  returnToRaw: string,
  formData: FormData,
): Promise<void> {
  const fallbackPath = `/enrollments/${enrollmentId}/charges`;
  const returnTo = normalizeReturnTo(returnToRaw, fallbackPath);
  await assertDebugWritesAllowed(returnTo);

  const reason = parseRequiredText(formData.get("reason"));
  const notes = parseRequiredText(formData.get("notes"));
  const selectedPaymentIds = parseStringArrayJson(formData.get("selectedPaymentIds"));
  const selectedChargeIds = parseStringArrayJson(formData.get("selectedChargeIds"));
  const allocationPlan = parseRepairAllocationPlan(formData.get("allocationPlan"));

  if (!reason || !notes || !selectedPaymentIds || !selectedChargeIds || !allocationPlan) {
    redirectWithStatus(returnTo, "err", "allocation_repair_invalid_form");
  }

  const { supabase, ledger, user } = await getCorrectionContext(enrollmentId, returnTo);
  const anomalyBefore = await captureEnrollmentAnomalySnapshot(enrollmentId);
  const { data, error } = await supabase.rpc("repair_payment_allocations", {
    p_enrollment_id: enrollmentId,
    p_payment_ids: selectedPaymentIds,
    p_charge_ids: selectedChargeIds,
    p_allocations: allocationPlan,
  });

  const resultRow = Array.isArray(data) ? data[0] : data;
  if (error || !resultRow?.ok) {
    redirectWithStatus(returnTo, "err", resultRow?.error_code ?? "allocation_repair_failed");
  }

  await writeAuditLog(supabase, {
    actorUserId: user.id,
    actorEmail: user.email ?? null,
    action: "payment_allocations.repaired",
    tableName: "payment_allocations",
    afterData: {
      enrollment_id: enrollmentId,
      reason,
      notes,
      selected_payment_ids: selectedPaymentIds,
      selected_charge_ids: selectedChargeIds,
      before_allocations: resultRow.before_allocations ?? [],
      after_allocations: resultRow.after_allocations ?? [],
    },
  });

  await writeEnrollmentAnomalyAuditTrail({
    enrollmentId,
    actorUserId: user.id,
    actorEmail: user.email ?? null,
    triggerAction: "payment_allocations.repaired",
    before: anomalyBefore,
  });
  await revalidateCorrectionSurfaces(enrollmentId, ledger.enrollment.playerId);
  redirectWithStatus(returnTo, "ok", "payment_allocations_repaired");
}
