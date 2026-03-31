"use server";

import { createClient } from "@/lib/supabase/server";
import { formatDateMonterrey, formatTimeMonterrey } from "@/lib/time";

const METHOD_LABELS: Record<string, string> = {
  cash: "Efectivo",
  transfer: "Transferencia",
  card: "Tarjeta",
  stripe_360player: "360Player/Stripe",
  other: "Otro"
};

type ReceiptData = {
  playerName: string;
  campusName: string;
  birthYear: number | null;
  method: string;
  amount: number;
  currency: string;
  remainingBalance: number;
  chargesPaid: { description: string; amount: number }[];
  paymentId: string;
  folio: string | null;
  date: string;
  time: string;
  splitPayment?: { amount: number; method: string };
};

export type ReceiptPrintResult =
  | { ok: true; receipt: ReceiptData }
  | { ok: false; error: string };

type PaymentRow = {
  id: string;
  folio: string | null;
  paid_at: string;
  amount: number;
  currency: string;
  method: string;
  enrollment_id: string;
  enrollments: {
    campuses: { name: string } | null;
    players: { first_name: string; last_name: string; birth_date: string | null } | null;
  } | null;
};

type AllocationRow = {
  amount: number;
  charges: { description: string | null } | null;
};

type ChargeBalanceRow = {
  amount: number;
  status: string;
  created_at: string;
};

type PaymentBalanceRow = {
  id: string;
  amount: number;
  status: string;
  paid_at: string;
};

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function getBirthYear(value: string | null): number | null {
  if (!value) return null;
  const year = new Date(value).getUTCFullYear();
  return Number.isFinite(year) ? year : null;
}

export async function getReceiptForPrintAction(paymentId: string): Promise<ReceiptPrintResult> {
  if (!paymentId) return { ok: false, error: "invalid_payment" };

  const supabase = await createClient();
  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();

  if (userError || !user) return { ok: false, error: "unauthenticated" };

  const { data: payment } = await supabase
    .from("payments")
    .select("id, folio, paid_at, amount, currency, method, enrollment_id, enrollments(campuses(name), players(first_name, last_name, birth_date))")
    .eq("id", paymentId)
    .eq("status", "posted")
    .maybeSingle()
    .returns<PaymentRow | null>();

  if (!payment || !payment.enrollments?.players) {
    return { ok: false, error: "receipt_not_found" };
  }

  const [{ data: allocations }, { data: charges }, { data: payments }] = await Promise.all([
    supabase
      .from("payment_allocations")
      .select("amount, charges(description)")
      .eq("payment_id", paymentId)
      .returns<AllocationRow[]>(),
    supabase
      .from("charges")
      .select("amount, status, created_at")
      .eq("enrollment_id", payment.enrollment_id)
      .returns<ChargeBalanceRow[]>(),
    supabase
      .from("payments")
      .select("id, amount, status, paid_at")
      .eq("enrollment_id", payment.enrollment_id)
      .eq("status", "posted")
      .returns<PaymentBalanceRow[]>()
  ]);

  const paidAtMs = new Date(payment.paid_at).getTime();
  const chargesTotal = roundMoney(
    (charges ?? [])
      .filter((row) => row.status !== "void" && new Date(row.created_at).getTime() <= paidAtMs)
      .reduce((sum, row) => sum + row.amount, 0)
  );
  const paymentsTotal = roundMoney(
    (payments ?? [])
      .filter((row) => row.status === "posted" && new Date(row.paid_at).getTime() <= paidAtMs)
      .reduce((sum, row) => sum + row.amount, 0)
  );
  const remainingBalance = roundMoney(chargesTotal - paymentsTotal);

  const chargesPaid = (allocations ?? []).length > 0
    ? (allocations ?? []).map((row) => ({
        description: row.charges?.description ?? "Cargo",
        amount: row.amount
      }))
    : [{ description: "Abono", amount: payment.amount }];

  const paidAt = new Date(payment.paid_at);

  return {
    ok: true,
    receipt: {
      playerName: `${payment.enrollments.players.first_name} ${payment.enrollments.players.last_name}`,
      campusName: payment.enrollments.campuses?.name ?? "-",
      birthYear: getBirthYear(payment.enrollments.players.birth_date),
      method: METHOD_LABELS[payment.method] ?? payment.method,
      amount: payment.amount,
      currency: payment.currency,
      remainingBalance,
      chargesPaid,
      paymentId: payment.id,
      folio: payment.folio,
      date: formatDateMonterrey(paidAt),
      time: formatTimeMonterrey(paidAt)
    }
  };
}
