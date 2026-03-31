import { createClient } from "@/lib/supabase/server";

export type ReceiptSearchRow = {
  paymentId: string;
  folio: string | null;
  paidAt: string;
  playerName: string;
  campusName: string;
  amount: number;
  method: string;
  enrollmentId: string;
};

export type ReceiptSearchResult = {
  rows: ReceiptSearchRow[];
  total: number;
  pageSize: number;
};

const PAGE_SIZE = 30;

type PaymentRow = {
  id: string;
  folio: string | null;
  paid_at: string;
  amount: number;
  method: string;
  enrollment_id: string;
};

type EnrollmentInfoRow = {
  id: string;
  campus_id: string;
  campuses: { name: string | null } | null;
  players: { first_name: string | null; last_name: string | null } | null;
};

export async function searchReceipts({
  q,
  campusId,
  paymentId,
  page = 1,
}: {
  q?: string;
  campusId?: string;
  paymentId?: string;
  page?: number;
}): Promise<ReceiptSearchResult> {
  const supabase = await createClient();
  const trimmed = q?.trim() ?? "";
  const trimmedLower = trimmed.toLowerCase();
  const trimmedPaymentId = paymentId?.trim() ?? "";
  const offset = (page - 1) * PAGE_SIZE;

  let query = supabase
    .from("payments")
    .select("id, folio, paid_at, amount, method, enrollment_id")
    .eq("status", "posted")
    .order("paid_at", { ascending: false });

  if (trimmedPaymentId) {
    query = query.eq("id", trimmedPaymentId) as typeof query;
  }

  if (trimmed && looksLikeFolio(trimmed)) {
    query = query.ilike("folio", `%${trimmed}%`) as typeof query;
  }

  const { data: paymentRows } = await query.returns<PaymentRow[]>();
  const payments = paymentRows ?? [];

  const enrollmentIds = Array.from(new Set(payments.map((row) => row.enrollment_id)));
  const enrollmentInfoById = new Map<string, EnrollmentInfoRow>();

  if (enrollmentIds.length > 0) {
    const { data: enrollmentRows } = await supabase
      .from("enrollments")
      .select("id, campus_id, campuses(name), players(first_name, last_name)")
      .in("id", enrollmentIds)
      .returns<EnrollmentInfoRow[]>();

    (enrollmentRows ?? []).forEach((row) => {
      enrollmentInfoById.set(row.id, row);
    });
  }

  const filteredRows = payments
    .map<ReceiptSearchRow>((row) => {
      const enrollment = enrollmentInfoById.get(row.enrollment_id);
      const firstName = enrollment?.players?.first_name?.trim() ?? "";
      const lastName = enrollment?.players?.last_name?.trim() ?? "";

      return {
        paymentId: row.id,
        folio: row.folio,
        paidAt: row.paid_at,
        playerName: `${firstName} ${lastName}`.trim() || "Jugador",
        campusName: enrollment?.campuses?.name ?? "-",
        amount: row.amount,
        method: row.method,
        enrollmentId: row.enrollment_id,
      };
    })
    .filter((row) => {
      const enrollment = enrollmentInfoById.get(row.enrollmentId);

      if (campusId && enrollment?.campus_id !== campusId) {
        return false;
      }

      if (trimmed && !looksLikeFolio(trimmed)) {
        return row.playerName.toLowerCase().includes(trimmedLower);
      }

      return true;
    });

  return {
    rows: filteredRows.slice(offset, offset + PAGE_SIZE),
    total: filteredRows.length,
    pageSize: PAGE_SIZE,
  };
}

function looksLikeFolio(q: string): boolean {
  return /^[A-Z]{2,}-/.test(q);
}
