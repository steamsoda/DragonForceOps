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
