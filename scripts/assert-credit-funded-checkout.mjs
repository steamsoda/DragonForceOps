import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [credit, caja, receipts, printer, syncMigration, repairMigration] = await Promise.all([
  readFile("src/lib/finance/account-credit.ts", "utf8"),
  readFile("src/server/actions/caja.ts", "utf8"),
  readFile("src/server/actions/receipts.ts", "utf8"),
  readFile("src/lib/printer.ts", "utf8"),
  readFile("supabase/migrations/20260819120000_credit_aware_tournament_signup.sql", "utf8"),
  readFile("supabase/migrations/20260819130000_repair_reynold_alejandro_credit_checkout.sql", "utf8"),
]);

assert.match(credit, /amount\s*- payment\.allocatedAmount\s*- \(payment\.explicitCreditOriginalAmount/);
assert.match(credit, /- \(payment\.chargeCashRefundedAmount/);
assert.match(caja, /getReusablePaymentRemainder/);
assert.match(caja, /creditAppliedAmount/);
assert.match(receipts, /enrollment_credit_applications/);
assert.match(printer, /Credito aplicado/);
assert.match(syncMigration, /enrollment_credit_applications application/);
assert.match(syncMigration, /paid\.funded_amount \+ 0\.009 >= charge\.amount/);
assert.match(repairMigration, /reynold_new_payment_state_changed/);
assert.match(repairMigration, /alejandro_legacy_balance_changed/);
assert.doesNotMatch(repairMigration, /update public\.payments\s+set\s+amount/i);
assert.doesNotMatch(repairMigration, /delete from public\.payments/i);

console.log("Credit-funded checkout assertions passed.");
