import { createClient } from "@/lib/supabase/server";
import { canAccessCampus, getOperationalCampusAccess } from "@/lib/auth/campuses";

export type ReceiptSearchRow = {
  paymentId: string;
  folio: string | null;
  paidAt: string;
  playerName: string;
  campusId: string;
  campusName: string;
  amount: number;
  method: string;
  enrollmentId: string;
  externalSource: string;
};

export type ReceiptSearchResult = {
  rows: ReceiptSearchRow[];
  total: number;
  pageSize: number;
  error: string | null;
};

const PAGE_SIZE = 30;

type ReceiptRpcRow = {
  payment_id: string;
  folio: string | null;
  paid_at: string;
  player_name: string;
  campus_id: string;
  campus_name: string;
  amount: number | string;
  method: string;
  enrollment_id: string;
  external_source: string;
  total_count: number;
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
  const campusAccess = await getOperationalCampusAccess();
  if (!campusAccess || campusAccess.campusIds.length === 0) {
    return { rows: [], total: 0, pageSize: PAGE_SIZE, error: null };
  }

  if (campusId && !canAccessCampus(campusAccess, campusId)) {
    return { rows: [], total: 0, pageSize: PAGE_SIZE, error: null };
  }

  const resolvedCampusId = campusId || (campusAccess.campusIds.length === 1 ? campusAccess.campusIds[0] : null);
  const safePage = Math.max(page, 1);
  const offset = (safePage - 1) * PAGE_SIZE;

  const { data, error } = await supabase.rpc("search_receipts", {
    p_query: q?.trim() || null,
    p_campus_id: resolvedCampusId,
    p_payment_id: paymentId || null,
    p_limit: PAGE_SIZE,
    p_offset: offset,
  });

  if (error) {
    console.error("[searchReceipts] rpc failed:", error);
    const isMissingFunction =
      error.code === "42883" || error.message.toLowerCase().includes("search_receipts");
    return {
      rows: [],
      total: 0,
      pageSize: PAGE_SIZE,
      error: isMissingFunction
        ? "La busqueda de recibos no esta disponible en esta base de datos. Falta aplicar la migracion requerida para `search_receipts(...)`."
        : "No se pudo cargar la busqueda de recibos. Revisa la configuracion de la base de datos o intenta de nuevo.",
    };
  }

  const rows = ((data ?? []) as ReceiptRpcRow[])
    .filter((row) => canAccessCampus(campusAccess, row.campus_id))
    .map((row) => ({
      paymentId: row.payment_id,
      folio: row.folio,
      paidAt: row.paid_at,
      playerName: row.player_name,
      campusId: row.campus_id,
      campusName: row.campus_name,
      amount: typeof row.amount === "number" ? row.amount : Number(row.amount),
      method: row.method,
      enrollmentId: row.enrollment_id,
      externalSource: row.external_source,
    }));

  return {
    rows,
    total: data && data.length > 0 ? Number((data[0] as ReceiptRpcRow).total_count) : 0,
    pageSize: PAGE_SIZE,
    error: null,
  };
}
