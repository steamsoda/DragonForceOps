export const COPA_TIGRES_TOTAL = 1250;
export const COPA_TIGRES_DEPOSIT = 600;

export function copaTigresPaymentOptions(paid: number): number[] {
  if (paid === 0) return [600, 1250];
  if (paid === 600) return [650];
  return [];
}

export function competitionReservationThreshold(charge: { amount: number; copa_tigres_installments?: boolean }): number {
  return charge.copa_tigres_installments ? COPA_TIGRES_DEPOSIT : Number(charge.amount);
}
