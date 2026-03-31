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
  enrollmentId: string,
  paymentsToLink: PostedPaymentLink[],
  userId: string
): Promise<boolean> {
  const cashPayments = paymentsToLink.filter((p) => p.method === "cash");
  if (cashPayments.length === 0) return false;

  const { data: campusRow } = await supabase
    .from("enrollments")
    .select("campus_id")
    .eq("id", enrollmentId)
    .maybeSingle<{ campus_id: string }>();

  const campusId = campusRow?.campus_id ?? null;
  if (!campusId) return false;

  const openSession = await getOpenSessionForCampus(campusId);
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
  }: {
    actorUserId: string;
    actorEmail: string | null;
    recordId: string;
    enrollmentId: string;
    amount: number;
    method: string;
    source: "caja" | "ledger";
    split: boolean;
  }
) {
  await writeAuditLog(supabase, {
    actorUserId,
    actorEmail,
    action: "payment.posted",
    tableName: "payments",
    recordId,
    afterData: { enrollment_id: enrollmentId, amount, method, source, split }
  });
}

export async function revalidatePaymentSurfaces(ledger: EnrollmentLedger) {
  revalidatePath(`/enrollments/${ledger.enrollment.id}/charges`);
  revalidatePath("/receipts");
  revalidatePath("/caja");
  revalidatePath("/reports/corte-diario");
  if (ledger.enrollment.playerId) {
    revalidatePath(`/players/${ledger.enrollment.playerId}`);
  }
}
