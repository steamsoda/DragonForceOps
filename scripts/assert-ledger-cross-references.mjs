import assert from "node:assert/strict";
import fs from "node:fs";

const billingQuery = fs.readFileSync("src/lib/queries/billing.ts", "utf8");
const chargesTable = fs.readFileSync(
  "src/components/billing/charges-ledger-table.tsx",
  "utf8",
);
const paymentsTable = fs.readFileSync(
  "src/components/billing/payments-table.tsx",
  "utf8",
);
const playerPage = fs.readFileSync(
  "src/app/(protected)/players/[playerId]/page.tsx",
  "utf8",
);
const accountPage = fs.readFileSync(
  "src/app/(protected)/enrollments/[enrollmentId]/charges/page.tsx",
  "utf8",
);

assert.match(billingQuery, /\.select\("id, folio, paid_at,/);
assert.match(billingQuery, /\.select\("payment_id, charge_id, amount, created_at"\)/);
assert.match(billingQuery, /\.select\("id, charge_id, amount, applied_at"\)/);
assert.match(billingQuery, /paymentReferences/);
assert.match(billingQuery, /creditReferences/);
assert.match(billingQuery, /settledAt:/);
assert.match(billingQuery, /pendingAmount <= 0/);
assert.match(billingQuery, /sourceCharges/);

assert.match(chargesTable, /Pagos \/ folios/);
assert.match(chargesTable, /Creado/);
assert.match(chargesTable, /Liquidado/);
assert.match(chargesTable, /Credito aplicado/);
assert.match(chargesTable, /formatDateTimeMonterrey/);

assert.match(paymentsTable, />Folio</);
assert.match(paymentsTable, />Aplicado a</);
assert.match(paymentsTable, /row\.sourceCharges\.map/);
assert.match(paymentsTable, /Sin cargos aplicados/);

assert.match(playerPage, /<ChargesLedgerTable/);
assert.match(playerPage, /<PaymentsTable/);
assert.match(accountPage, /<ChargesLedgerTable/);
assert.match(accountPage, /<PaymentsTable/);

assert.doesNotMatch(billingQuery, /\.insert\(/);
assert.doesNotMatch(billingQuery, /\.update\(/);
assert.doesNotMatch(billingQuery, /\.delete\(/);

console.log("Ledger payment/charge cross-references verified.");
