export function outstandingChargeAmount(charges: ReadonlyArray<{ status: string; pendingAmount: number }>) {
  let cents = 0;
  for (const charge of charges) {
    if (charge.status === "void") continue;
    if (!Number.isFinite(charge.pendingAmount)) throw Error("collection_balance_unavailable");
    cents += Math.max(Math.round(charge.pendingAmount * 100), 0);
  }
  return cents / 100;
}
