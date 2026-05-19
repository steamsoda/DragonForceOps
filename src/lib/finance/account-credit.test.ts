import assert from "node:assert/strict";
import { summarizeAccountCredit } from "./account-credit";

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
