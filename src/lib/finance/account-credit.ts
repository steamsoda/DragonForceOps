export type AccountCreditSummary = {
  explicitOriginalAmount: number;
  explicitAppliedAmount: number;
  explicitAvailableAmount: number;
  openCreditCount: number;
  legacyImplicitCreditAmount: number;
  totalVisibleCreditAmount: number;
  hasExplicitCredit: boolean;
  hasLegacyImplicitCredit: boolean;
  hasAnyCredit: boolean;
};

type CreditPaymentInput = {
  status: string;
  amount: number;
  allocatedAmount: number;
};

type CreditApplicationCreditInput = {
  id: string;
  availableAmount: number;
};

type CreditApplicationChargeInput = {
  id: string;
  pendingAmount: number;
};

export type PlannedCreditApplication = {
  creditId: string;
  chargeId: string;
  amount: number;
};

function roundMoney(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

function positiveMoney(value: number) {
  return Math.max(roundMoney(value), 0);
}

export function summarizeAccountCredit({
  explicitAvailableAmount,
  explicitOriginalAmount = explicitAvailableAmount,
  explicitAppliedAmount = 0,
  openCreditCount = 0,
  payments,
}: {
  explicitAvailableAmount: number;
  explicitOriginalAmount?: number;
  explicitAppliedAmount?: number;
  openCreditCount?: number;
  payments: CreditPaymentInput[];
}): AccountCreditSummary {
  const explicitAvailable = positiveMoney(explicitAvailableAmount);
  const explicitOriginal = positiveMoney(explicitOriginalAmount);
  const explicitApplied = positiveMoney(explicitAppliedAmount);
  const legacyImplicit = payments.reduce((sum, payment) => {
    if (payment.status !== "posted") return sum;
    return roundMoney(sum + positiveMoney(payment.amount - payment.allocatedAmount));
  }, 0);
  const totalVisibleCredit = roundMoney(explicitAvailable + legacyImplicit);

  return {
    explicitOriginalAmount: explicitOriginal,
    explicitAppliedAmount: explicitApplied,
    explicitAvailableAmount: explicitAvailable,
    openCreditCount: Number.isFinite(openCreditCount) ? Math.max(Math.trunc(openCreditCount), 0) : 0,
    legacyImplicitCreditAmount: legacyImplicit,
    totalVisibleCreditAmount: totalVisibleCredit,
    hasExplicitCredit: explicitAvailable > 0.009,
    hasLegacyImplicitCredit: legacyImplicit > 0.009,
    hasAnyCredit: totalVisibleCredit > 0.009,
  };
}

export function planAccountCreditApplications({
  requestedAmount,
  credits,
  charges,
}: {
  requestedAmount: number;
  credits: CreditApplicationCreditInput[];
  charges: CreditApplicationChargeInput[];
}): { appliedAmount: number; rows: PlannedCreditApplication[] } {
  let remainingRequest = positiveMoney(requestedAmount);
  const remainingCredits = credits.map((credit) => ({
    id: credit.id,
    availableAmount: positiveMoney(credit.availableAmount),
  }));
  const rows: PlannedCreditApplication[] = [];

  for (const charge of charges) {
    let remainingCharge = positiveMoney(charge.pendingAmount);
    if (remainingCharge <= 0 || remainingRequest <= 0) continue;

    for (const credit of remainingCredits) {
      if (remainingCharge <= 0 || remainingRequest <= 0) break;
      if (credit.availableAmount <= 0) continue;

      const amount = roundMoney(Math.min(credit.availableAmount, remainingCharge, remainingRequest));
      if (amount <= 0) continue;

      rows.push({ creditId: credit.id, chargeId: charge.id, amount });
      credit.availableAmount = roundMoney(credit.availableAmount - amount);
      remainingCharge = roundMoney(remainingCharge - amount);
      remainingRequest = roundMoney(remainingRequest - amount);
    }
  }

  return {
    appliedAmount: roundMoney(rows.reduce((sum, row) => sum + row.amount, 0)),
    rows,
  };
}
