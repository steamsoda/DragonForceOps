import "server-only";
import { requireDirectorPageReader } from "@/lib/auth/operational-page-reader";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProductChargeLedgerExportData } from "./products";
import { paymentCompletionDate, type FundingEvent, type ProductSalesData } from "@/lib/exports/product-sales";
import { getMonterreyDayBounds } from "@/lib/time";

type Metadata = {
  id: string; size: string | null; amount: number;
  enrollments: { campus_id: string; players: { public_player_id: string | null } | null };
};

export async function getProductSalesExportData(productId: string, campusId: string, paidFrom: string | null, paidTo: string | null): Promise<ProductSalesData | null> {
  const context = await requireDirectorPageReader();
  const campuses = context.campusAccess?.campuses ?? [];
  const selected = campusId ? campuses.filter(c => c.id === campusId) : campuses;
  if (!selected.length) return null;
  // The existing ledger supplies names/current groups, without its cash-only date filter.
  const ledger = await getProductChargeLedgerExportData({ productId, paidFrom: null, paidTo: null, paidFromTimestamp: null, paidToTimestamp: null });
  if (!ledger) return null;
  const db = context.isDirectorReadOnly ? createAdminClient() : context.supabase;
  const from = paidFrom ? getMonterreyDayBounds(paidFrom).start : null;
  const to = paidTo ? getMonterreyDayBounds(paidTo).end : null;
  const result: ProductSalesData = { productName: ledger.productName, campusName: campusId ? selected[0].name : "Todos los campus autorizados", paidFrom, paidTo, rows: [] };
  const sales = [...new Map(ledger.rows.map(row => [row.chargeId, row])).values()];
  for (let offset = 0; offset < sales.length; offset += 100) {
    const batch = sales.slice(offset, offset + 100);
    const metadata = await db.from("charges")
      .select("id, size, amount, enrollments!inner(campus_id, players(public_player_id))")
      .eq("product_id", productId).neq("status", "void")
      .in("enrollments.campus_id", selected.map(c => c.id))
      .in("id", batch.map(row => row.chargeId)).returns<Metadata[]>();
    if (metadata.error) throw metadata.error;
    const meta = new Map((metadata.data ?? []).map(row => [row.id, row]));
    const ids = [...meta.keys()];
    if (!ids.length) continue;
    const balances = await db.from("v_charge_collection_balances").select("charge_id, balance").in("charge_id", ids);
    if (balances.error) throw balances.error;
    const balanceMap = new Map((balances.data ?? []).map(row => [row.charge_id, Number(row.balance)]));
    const events = new Map<string, FundingEvent[]>();
    const add = (id: string, event: FundingEvent) => {
      const list = events.get(id) ?? [];
      list.push(event);
      events.set(id, list);
    };
    for (let page = 0; ; page += 500) {
      const allocations = await db.from("payment_allocations")
        .select("id, charge_id, amount, payments!inner(status, paid_at)")
        .in("charge_id", ids).eq("payments.status", "posted")
        .order("id").range(page, page + 499)
        .returns<Array<{ charge_id: string; amount: number; payments: { paid_at: string } }>>();
      if (allocations.error) throw allocations.error;
      for (const row of allocations.data ?? []) add(row.charge_id, { amount: Number(row.amount), at: row.payments.paid_at });
      if ((allocations.data?.length ?? 0) < 500) break;
    }
    for (let page = 0; ; page += 500) {
      const credits = await db.from("enrollment_credit_applications").select("id, charge_id, amount, applied_at")
        .in("charge_id", ids).order("id").range(page, page + 499);
      if (credits.error) throw credits.error;
      for (const row of credits.data ?? []) add(row.charge_id, { amount: Number(row.amount), at: row.applied_at });
      if ((credits.data?.length ?? 0) < 500) break;
    }
    for (const sale of batch) {
      const detail = meta.get(sale.chargeId);
      if (!detail) continue;
      if (Number(detail.amount) <= 0) continue;
      if (!balanceMap.has(sale.chargeId)) throw new Error("product_sales_balance_missing");
      if (balanceMap.get(sale.chargeId)! > 0) continue;
      const paidAt = paymentCompletionDate(Number(detail.amount), events.get(sale.chargeId) ?? []);
      if (!paidAt && Number(detail.amount) > 0) throw new Error("product_sales_payment_date_missing");
      if ((from && (!paidAt || Date.parse(paidAt) < Date.parse(from))) || (to && (!paidAt || Date.parse(paidAt) >= Date.parse(to)))) continue;
      // Caja stores each sized item as its own charge; payments are not units.
      result.rows.push({ chargeId: sale.chargeId, playerCode: detail.enrollments.players?.public_player_id ?? null,
        playerName: sale.playerName, campusName: sale.campusName, birthYear: sale.birthYear,
        trainingGroupName: sale.trainingGroupName, size: detail.size, quantity: 1, paidAt });
    }
  }
  result.rows.sort((a, b) => (b.paidAt ?? "").localeCompare(a.paidAt ?? "") || a.playerName.localeCompare(b.playerName, "es") || a.chargeId.localeCompare(b.chargeId));
  return result;
}
