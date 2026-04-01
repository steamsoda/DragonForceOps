"use server";

import { revalidatePath } from "next/cache";
import { canAccessCampus, getOperationalCampusAccess } from "@/lib/auth/campuses";
import { writeAuditLog } from "@/lib/audit";
import { getOrCreateCurrentCorteCheckpoint } from "@/lib/queries/corte-checkpoints";
import { getCorteDiarioData } from "@/lib/queries/reports";
import { createClient } from "@/lib/supabase/server";
import type { CorteData } from "@/lib/printer";

type CheckpointCloseResult =
  | { ok: true; printData: CorteData }
  | { ok: false; error: string };

export async function closeAndPrepareCortePrintAction(campusId: string): Promise<CheckpointCloseResult> {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) return { ok: false, error: "unauthenticated" };

  const campusAccess = await getOperationalCampusAccess();
  if (!canAccessCampus(campusAccess, campusId)) {
    return { ok: false, error: "unauthorized" };
  }

  const checkpoint = await getOrCreateCurrentCorteCheckpoint(campusId);
  if (!checkpoint) return { ok: false, error: "checkpoint_not_found" };

  const closedAt = new Date().toISOString();
  const { error: closeError } = await supabase
    .from("corte_checkpoints")
    .update({
      status: "closed",
      closed_at: closedAt,
      printed_at: closedAt,
      closed_by: user.id,
    })
    .eq("id", checkpoint.id)
    .eq("status", "open");

  if (closeError) return { ok: false, error: "checkpoint_close_failed" };

  const { error: newCheckpointError } = await supabase
    .from("corte_checkpoints")
    .insert({
      campus_id: campusId,
      opened_at: closedAt,
      status: "open",
    });

  if (newCheckpointError) {
    return { ok: false, error: "checkpoint_roll_failed" };
  }

  const corteData = await getCorteDiarioData({
    campusId,
    openedAt: checkpoint.openedAt,
    closedAt,
  });

  await writeAuditLog(supabase, {
    actorUserId: user.id,
    actorEmail: user.email ?? null,
    action: "corte.printed",
    tableName: "corte_checkpoints",
    recordId: checkpoint.id,
    afterData: {
      campus_id: campusId,
      opened_at: checkpoint.openedAt,
      closed_at: closedAt,
      total_cobrado: corteData.totalCobrado,
      counted_payments_count: corteData.countedPaymentsCount,
      excluded_payments_count: corteData.excludedPaymentsCount,
    },
  });

  revalidatePath("/reports/corte-diario");
  revalidatePath("/caja");

  return {
    ok: true,
    printData: {
      campusLabel: corteData.campusName,
      currency: "MXN",
      openedAt: corteData.openedAt,
      closedAt: corteData.closedAt ?? closedAt,
      totalCobrado: corteData.totalCobrado,
      byMethod: corteData.byMethod.map((row) => ({
        methodLabel: row.methodLabel,
        count: row.count,
        total: row.total,
      })),
      byChargeType: corteData.byChargeType.map((row) => ({
        typeName: row.typeName,
        total: row.total,
      })),
      payments: corteData.payments.map((payment) => ({
        playerName: payment.playerName,
        amount: payment.amount,
        methodLabel: payment.excludedFromCorte
          ? `${payment.methodLabel} (externo)`
          : payment.isCrossCampus
          ? `${payment.methodLabel} (cruzado)`
          : payment.methodLabel,
        paidAt: payment.paidAt,
      })),
    },
  };
}
