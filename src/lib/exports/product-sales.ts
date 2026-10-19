export type ProductSalesRow = {
  chargeId: string;
  playerCode: string | null;
  playerName: string;
  campusName: string;
  birthYear: number | null;
  trainingGroupName: string | null;
  size: string | null;
  quantity: number;
  paidAt: string | null;
};

export type ProductSalesData = {
  productName: string;
  campusName: string;
  paidFrom: string | null;
  paidTo: string | null;
  rows: ProductSalesRow[];
};

export type FundingEvent = { amount: number; at: string };

// Use surviving posted allocations and explicit applications, never unused credit.
export function paymentCompletionDate(amount: number, events: FundingEvent[]) {
  const target = Math.round(amount * 100);
  if (target <= 0) return null;
  let funded = 0;
  for (const event of [...events].sort((a, b) => Date.parse(a.at) - Date.parse(b.at))) {
    funded += Math.round(event.amount * 100);
    if (funded >= target) return event.at;
  }
  return null;
}

export function summarizeProductSales(rows: ProductSalesRow[]) {
  const groups = new Map<string, { campus: string; size: string; quantity: number }>();
  for (const row of rows) {
    const size = row.size?.trim() || "Sin talla";
    const key = JSON.stringify([row.campusName, size]);
    const group = groups.get(key) ?? { campus: row.campusName, size, quantity: 0 };
    group.quantity += row.quantity;
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) =>
    a.campus.localeCompare(b.campus, "es") || a.size.localeCompare(b.size, "es", { numeric: true }));
}
