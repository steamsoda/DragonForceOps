"use server";

import { revalidatePath } from "next/cache";
import { writeAuditLog } from "@/lib/audit";
import { getOpenSessionForCampus } from "@/lib/queries/cash-sessions";
import type { EnrollmentLedger } from "@/lib/queries/billing";
import { createClient } from "@/lib/supabase/server";

export type PostedPaymentLink = {
  id: string;
  amount: number;
  method: string;
};

type UniformChargeSyncRow = {
  id: string;
  enrollment_id: string;
  charge_id: string | null;
  size: string | null;
  uniform_fulfillment_mode: "deliver_now" | "pending_order" | null;
  charge_types: { code: string } | null;
  enrollments: { player_id: string | null } | null;
  payment_allocations: Array<{ amount: number | null }> | null;
  uniform_orders: Array<{ id: string }> | null;
  amount: number;
};

export async function fetchPaymentFolio(
  supabase: Awaited<ReturnType<typeof createClient>>,
  paymentId: string
): Promise<string | null> {
  const { data } = await supabase
    .from("payments")
    .select("folio")
    .eq("id", paymentId)
    .maybeSingle<{ folio: string | null }>();
  return data?.folio ?? null;
}

export async function linkCashPaymentsToOpenSession(
  supabase: Awaited<ReturnType<typeof createClient>>,
  operatorCampusId: string,
  paymentsToLink: PostedPaymentLink[],
  userId: string
): Promise<boolean> {
  const cashPayments = paymentsToLink.filter((p) => p.method === "cash");
  if (cashPayments.length === 0) return false;

  const openSession = await getOpenSessionForCampus(operatorCampusId);
  if (!openSession) return true;

  await supabase.from("cash_session_entries").insert(
    cashPayments.map((p) => ({
      cash_session_id: openSession.id,
      payment_id: p.id,
      entry_type: "payment_in",
      amount: p.amount,
      created_by: userId
    }))
  );

  return false;
}

export async function writePostedPaymentAudit(
  supabase: Awaited<ReturnType<typeof createClient>>,
  {
    actorUserId,
    actorEmail,
    recordId,
    enrollmentId,
    amount,
    method,
    source,
    split,
    paidAt,
    recordedAt,
    folio,
  }: {
    actorUserId: string;
    actorEmail: string | null;
    recordId: string;
    enrollmentId: string;
    amount: number;
    method: string;
    source: "caja" | "ledger";
    split: boolean;
    paidAt: string;
    recordedAt: string;
    folio: string | null;
  }
) {
  await writeAuditLog(supabase, {
    actorUserId,
    actorEmail,
    action: "payment.posted",
    tableName: "payments",
    recordId,
    afterData: {
      enrollment_id: enrollmentId,
      amount,
      method,
      source,
      split,
      folio,
      paid_at: paidAt,
      recorded_at: recordedAt,
      backdated: paidAt !== recordedAt,
    }
  });
}

export async function syncPaidUniformOrders(
  supabase: Awaited<ReturnType<typeof createClient>>,
  {
    chargeIds,
    actorUserId,
    soldAt,
  }: {
    chargeIds: string[];
    actorUserId: string;
    soldAt: string;
  }
) {
  const uniqueChargeIds = Array.from(new Set(chargeIds.filter(Boolean)));
  if (uniqueChargeIds.length === 0) return;

  const { data } = await supabase
    .from("charges")
    .select(
      "id, enrollment_id, size, uniform_fulfillment_mode, amount, charge_types(code), enrollments(player_id), payment_allocations(amount), uniform_orders(id)"
    )
    .in("id", uniqueChargeIds)
    .returns<UniformChargeSyncRow[]>();

  const rows = data ?? [];
  const ordersToInsert = rows
    .filter((row) => row.charge_types?.code === "uniform_training" || row.charge_types?.code === "uniform_game")
    .filter((row) => !row.uniform_orders || row.uniform_orders.length === 0)
    .filter((row) => {
      const allocated = (row.payment_allocations ?? []).reduce((sum, allocation) => sum + (allocation.amount ?? 0), 0);
      return row.amount - allocated <= 0.009;
    })
    .flatMap((row) => {
      if (!row.enrollments?.player_id) return [];
      return [
        {
          player_id: row.enrollments.player_id,
          enrollment_id: row.enrollment_id,
          charge_id: row.id,
          uniform_type: row.charge_types?.code === "uniform_training" ? "training" : "game",
          size: row.size,
          status: row.uniform_fulfillment_mode === "deliver_now" ? "delivered" : "pending_order",
          sold_at: soldAt,
          ordered_at: null,
          delivered_at: row.uniform_fulfillment_mode === "deliver_now" ? soldAt : null,
          created_by: actorUserId,
        },
      ];
    });

  if (ordersToInsert.length === 0) return;

  await supabase.from("uniform_orders").insert(ordersToInsert);
}

export async function revalidatePaymentSurfaces(ledger: EnrollmentLedger) {
  revalidatePath(`/enrollments/${ledger.enrollment.id}/charges`);
  revalidatePath("/receipts");
  revalidatePath("/caja");
  revalidatePath("/uniforms");
  revalidatePath("/reports/corte-diario");
  if (ledger.enrollment.playerId) {
    revalidatePath(`/players/${ledger.enrollment.playerId}`);
  }
}
