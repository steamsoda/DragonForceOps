export type PrioritizedPendingCharge = {
  id: string;
  pendingAmount: number;
};

export function allocateChargesWithPriority(
  budget: number,
  charges: PrioritizedPendingCharge[],
  priorityIds: Iterable<string>,
) {
  const prioritySet = new Set(priorityIds);
  const orderedCharges =
    prioritySet.size > 0
      ? [...charges.filter((charge) => prioritySet.has(charge.id)), ...charges.filter((charge) => !prioritySet.has(charge.id))]
      : charges;

  const allocations: Array<{ chargeId: string; amount: number }> = [];
  let remaining = Math.round(budget * 100) / 100;

  for (const charge of orderedCharges) {
    if (remaining <= 0) break;
    if (charge.pendingAmount <= 0) continue;

    const allocated = Math.round(Math.min(remaining, charge.pendingAmount) * 100) / 100;
    if (allocated <= 0) continue;

    allocations.push({ chargeId: charge.id, amount: allocated });
    remaining = Math.round((remaining - allocated) * 100) / 100;
  }

  return {
    allocations,
    remaining,
  };
}
