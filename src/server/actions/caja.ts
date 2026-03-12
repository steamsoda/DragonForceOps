"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getEnrollmentLedger } from "@/lib/queries/billing";
import { parsePaymentFormData } from "@/lib/validations/payment";
import { writeAuditLog } from "@/lib/audit";
import { applyEarlyBirdDiscountIfEligible } from "@/server/actions/payments";

export type CajaPlayerResult = {
  playerId: string;
  playerName: string;
  birthYear: number | null;
  enrollmentId: string;
  campusName: string;
  balance: number;
};

export type CajaPendingCharge = {
  id: string;
  typeName: string;
  typeCode: string;
  description: string;
  amount: number;
  pendingAmount: number;
  periodMonth: string | null;
};

export type CajaEnrollmentData = {
  enrollmentId: string;
  playerName: string;
  campusName: string;
  balance: number;
  currency: string;
  pendingCharges: CajaPendingCharge[];
};

export type CajaPaymentResult =
  | { ok: true; paymentId: string; amount: number; playerName: string; campusName: string; method: string; remainingBalance: number; currency: string }
  | { ok: false; error: string };

// ── Player search — single RPC call ───────────────────────────────────────────

type CajaSearchRow = {
  player_id: string;
  player_name: string;
  birth_year: number | null;
  enrollment_id: string;
  campus_name: string;
  balance: number;
};

export async function searchPlayersForCajaAction(q: string): Promise<CajaPlayerResult[]> {
  if (!q || q.trim().length < 2) return [];

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .rpc("search_players_for_caja", { search_query: q.trim() });

  if (error || !data) return [];

  return (data as CajaSearchRow[]).map((row) => ({
    playerId: row.player_id,
    playerName: row.player_name,
    birthYear: row.birth_year,
    enrollmentId: row.enrollment_id,
    campusName: row.campus_name,
    balance: row.balance
  }));
}

// ── Load enrollment data for Caja panel ───────────────────────────────────────

export async function getEnrollmentForCajaAction(enrollmentId: string): Promise<CajaEnrollmentData | null> {
  const ledger = await getEnrollmentLedger(enrollmentId);
  if (!ledger) return null;

  const pendingCharges = ledger.charges
    .filter((c) => c.pendingAmount > 0 && c.status !== "void")
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    .map((c) => ({
      id: c.id,
      typeName: c.typeName,
      typeCode: c.typeCode,
      description: c.description,
      amount: c.amount,
      pendingAmount: c.pendingAmount,
      periodMonth: c.periodMonth
    }));

  return {
    enrollmentId,
    playerName: ledger.enrollment.playerName,
    campusName: ledger.enrollment.campusName,
    balance: ledger.totals.balance,
    currency: ledger.enrollment.currency,
    pendingCharges
  };
}

// ── Post payment from Caja (returns result, does not redirect) ────────────────

export async function postCajaPaymentAction(enrollmentId: string, formData: FormData): Promise<CajaPaymentResult> {
  const parsed = parsePaymentFormData(formData);
  if (!parsed) return { ok: false, error: "invalid_form" };

  const supabase = await createClient();
  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();
  if (userError || !user) return { ok: false, error: "unauthenticated" };

  const ledger = await getEnrollmentLedger(enrollmentId);
  if (!ledger) return { ok: false, error: "enrollment_not_found" };

  const pendingCharges = ledger.charges
    .filter((c) => c.pendingAmount > 0 && c.status !== "void")
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  // Allow overpayment (creates credit balance) — only block if enrollment is ended/cancelled
  if (ledger.enrollment.status === "ended" || ledger.enrollment.status === "cancelled") {
    return { ok: false, error: "enrollment_inactive" };
  }

  const allocations: Array<{ chargeId: string; amount: number }> = [];
  let remaining = parsed.amount;

  for (const charge of pendingCharges) {
    if (remaining <= 0) break;
    const allocated = Math.min(remaining, charge.pendingAmount);
    allocations.push({ chargeId: charge.id, amount: Math.round(allocated * 100) / 100 });
    remaining = Math.round((remaining - allocated) * 100) / 100;
  }

  const providerRef = `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const { data: paymentRow, error: paymentError } = await supabase
    .from("payments")
    .insert({
      enrollment_id: enrollmentId,
      paid_at: new Date().toISOString(),
      method: parsed.method,
      amount: parsed.amount,
      currency: ledger.enrollment.currency,
      status: "posted",
      provider_ref: providerRef,
      external_source: "manual",
      notes: parsed.notes,
      created_by: user.id
    })
    .select("id")
    .single<{ id: string }>();

  if (paymentError || !paymentRow) return { ok: false, error: "payment_insert_failed" };

  if (allocations.length > 0) {
    const { error: allocationError } = await supabase.from("payment_allocations").insert(
      allocations.map((a) => ({
        payment_id: paymentRow.id,
        charge_id: a.chargeId,
        amount: a.amount
      }))
    );

    if (allocationError) {
      await supabase.from("payments").delete().eq("id", paymentRow.id);
      return { ok: false, error: "allocation_insert_failed" };
    }
  }

  await applyEarlyBirdDiscountIfEligible(supabase, enrollmentId, allocations, ledger, user.id);

  await writeAuditLog(supabase, {
    actorUserId: user.id,
    action: "payment.posted",
    tableName: "payments",
    recordId: paymentRow.id,
    afterData: { enrollment_id: enrollmentId, amount: parsed.amount, method: parsed.method, source: "caja" }
  });

  revalidatePath("/caja");

  const newBalance = ledger.totals.balance - parsed.amount;

  return {
    ok: true,
    paymentId: paymentRow.id,
    amount: parsed.amount,
    playerName: ledger.enrollment.playerName,
    campusName: ledger.enrollment.campusName,
    method: parsed.method,
    remainingBalance: newBalance,
    currency: ledger.enrollment.currency
  };
}
