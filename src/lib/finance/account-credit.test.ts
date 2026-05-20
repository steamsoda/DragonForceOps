import assert from "node:assert/strict";
import { planAccountCreditApplications, summarizeAccountCredit } from "./account-credit";

const summary = summarizeAccountCredit({
  explicitAvailableAmount: 250,
  explicitOriginalAmount: 400,
  explicitAppliedAmount: 150,
  openCreditCount: 1,
  payments: [
    { status: "posted", amount: 1000, allocatedAmount: 700 },
    { status: "void", amount: 500, allocatedAmount: 0 },
    { status: "posted", amount: 250, allocatedAmount: 250 },
  ],
});

assert.equal(summary.explicitAvailableAmount, 250);
assert.equal(summary.legacyImplicitCreditAmount, 300);
assert.equal(summary.totalVisibleCreditAmount, 550);
assert.equal(summary.hasAnyCredit, true);

const applications = planAccountCreditApplications({
  requestedAmount: 700,
  credits: [
    { id: "credit-a", availableAmount: 300 },
    { id: "credit-b", availableAmount: 600 },
  ],
  charges: [
    { id: "charge-1", pendingAmount: 500 },
    { id: "charge-2", pendingAmount: 400 },
  ],
});

assert.deepEqual(applications, {
  appliedAmount: 700,
  rows: [
    { creditId: "credit-a", chargeId: "charge-1", amount: 300 },
    { creditId: "credit-b", chargeId: "charge-1", amount: 200 },
    { creditId: "credit-b", chargeId: "charge-2", amount: 200 },
  ],
});
