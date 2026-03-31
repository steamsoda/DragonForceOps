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
  const offset = (page - 1) * PAGE_SIZE;
  const trimmed = q?.trim() ?? "";
  const trimmedPaymentId = paymentId?.trim() ?? "";

  // If searching by player name, resolve to enrollment IDs first
  let enrollmentIds: string[] | null = null;
  if (trimmed && !looksLikeFolio(trimmed)) {
    const { data: players } = await supabase
      .from("players")
      .select("id")
      .or(`first_name.ilike.%${trimmed}%,last_name.ilike.%${trimmed}%`);

    if (players && players.length > 0) {
      const playerIds = players.map((p) => p.id);
      const { data: enrollments } = await supabase
        .from("enrollments")
        .select("id")
        .in("player_id", playerIds);
      enrollmentIds = (enrollments ?? []).map((e) => e.id);
    } else {
      enrollmentIds = []; // No matches
    }
  }

  // Resolve campus to enrollment IDs if needed
  let campusEnrollmentIds: string[] | null = null;
  if (campusId) {
    const { data: enrollments } = await supabase
      .from("enrollments")
      .select("id")
      .eq("campus_id", campusId);
    campusEnrollmentIds = (enrollments ?? []).map((e) => e.id);
  }

  // Build main payments query
  let query = supabase
    .from("payments")
    .select("id, folio, paid_at, amount, method, enrollment_id", { count: "exact" })
    .eq("status", "posted")
    .order("paid_at", { ascending: false });

  if (trimmedPaymentId) {
    query = query.eq("id", trimmedPaymentId) as typeof query;
  }

  // Apply folio filter if query looks like a folio
  if (trimmed && looksLikeFolio(trimmed)) {
    query = query.ilike("folio", `%${trimmed}%`) as typeof query;
  }

  // Apply enrollment ID filter for player name search
  if (enrollmentIds !== null) {
    if (enrollmentIds.length === 0) {
      // No player matches — return empty
      return { rows: [], total: 0, pageSize: PAGE_SIZE };
    }
    query = query.in("enrollment_id", enrollmentIds) as typeof query;
  }

  // Apply campus filter
  if (campusEnrollmentIds !== null) {
    if (campusEnrollmentIds.length === 0) {
      return { rows: [], total: 0, pageSize: PAGE_SIZE };
    }
    const ids = campusEnrollmentIds;
    query = enrollmentIds !== null
      ? query.in("enrollment_id", ids.filter((id) => enrollmentIds!.includes(id))) as typeof query
      : query.in("enrollment_id", ids) as typeof query;
  }

  const { data, count } = await (query.range(offset, offset + PAGE_SIZE - 1).returns<PaymentRow[]>());
  const payments = data ?? [];

  const enrollmentInfoById = new Map<string, EnrollmentInfoRow>();
  const paymentEnrollmentIds = Array.from(new Set(payments.map((row) => row.enrollment_id)));

  if (paymentEnrollmentIds.length > 0) {
    const { data: enrollmentRows } = await supabase
      .from("enrollments")
      .select("id, campuses(name), players(first_name, last_name)")
      .in("id", paymentEnrollmentIds)
      .returns<EnrollmentInfoRow[]>();

    (enrollmentRows ?? []).forEach((row) => {
      enrollmentInfoById.set(row.id, row);
    });
  }

  const rows: ReceiptSearchRow[] = payments.map((row) => {
    const enrollment = enrollmentInfoById.get(row.enrollment_id);
    const firstName = enrollment?.players?.first_name?.trim() ?? "";
    const lastName = enrollment?.players?.last_name?.trim() ?? "";
    const playerName = `${firstName} ${lastName}`.trim() || "Jugador";

    return {
      paymentId: row.id,
      folio: row.folio,
      paidAt: row.paid_at,
      playerName,
      campusName: enrollment?.campuses?.name ?? "-",
      amount: row.amount,
      method: row.method,
      enrollmentId: row.enrollment_id,
    };
  });

  return { rows, total: count ?? 0, pageSize: PAGE_SIZE };
}

function looksLikeFolio(q: string): boolean {
  // Folio format: LV-202603-00042 — starts with uppercase letters + dash
  return /^[A-Z]{2,}-/.test(q);
}
