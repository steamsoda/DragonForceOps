import fs from "node:fs";
import assert from "node:assert/strict";

const migration = fs.readFileSync(
  "supabase/migrations/20260727203000_void_charge_to_explicit_credit.sql",
  "utf8",
);
const billingAction = fs.readFileSync("src/server/actions/billing.ts", "utf8");
const ledgerTable = fs.readFileSync("src/components/billing/charges-ledger-table.tsx", "utf8");
const cajaClient = fs.readFileSync("src/components/caja/caja-client.tsx", "utf8");
const allocationNormalizer = fs.readFileSync(
  "src/server/actions/payment-allocation-normalization.ts",
  "utf8",
);
const chargesPage = fs.readFileSync(
  "src/app/(protected)/enrollments/[enrollmentId]/charges/page.tsx",
  "utf8",
);

assert.match(migration, /source_workflow[\s\S]*'charge_void'/);
assert.match(migration, /security definer/);
assert.match(migration, /grant execute[\s\S]*to service_role/);
assert.match(migration, /revoke execute[\s\S]*from authenticated/);
assert.match(migration, /v_charge\.charge_type_code in \('monthly_tuition', 'inscription'\)/);
assert.match(migration, /raise exception 'protected_paid_charge'/);
assert.match(migration, /insert into public\.enrollment_credits/);
assert.match(migration, /delete from public\.payment_allocations/);
assert.match(migration, /delete from public\.enrollment_credit_applications/);
assert.match(migration, /set status = 'void'/);

assert.match(billingAction, /permissionContext\.isDirector && !permissionContext\.isFrontDesk/);
assert.match(billingAction, /canAccessEnrollmentRecord\(enrollmentId, permissionContext\)/);
assert.match(billingAction, /\.rpc\("void_charge_to_explicit_credit"/);
assert.doesNotMatch(
  billingAction.slice(
    billingAction.indexOf("export async function voidChargeAction"),
    billingAction.indexOf("export async function repriceChargeAction"),
  ),
  /\.from\("payment_allocations"\)[\s\S]*\.delete\(\)/,
);
assert.match(chargesPage, /isDirector \|\| permissionContext\.isFrontDesk/);
assert.match(ledgerTable, /isProtectedPaidCharge/);
assert.match(ledgerTable, /el monto aplicado quedara como credito visible/);
assert.match(cajaClient, /Aplicar credito al saldo pendiente/);
assert.match(cajaClient, /recommendedCreditCharge/);
assert.match(cajaClient, /charge\.typeCode === "monthly_tuition"/);
assert.match(cajaClient, /Nunca se mueve automaticamente al abrir Caja/);
assert.match(allocationNormalizer, /\.from\("enrollment_credits"\)/);
assert.match(allocationNormalizer, /\.neq\("status", "void"\)/);
assert.match(
  allocationNormalizer,
  /payment\.amount - payment\.allocatedAmount - explicitCreditAmount/,
);

console.log("Charge void-to-credit safeguards verified.");
