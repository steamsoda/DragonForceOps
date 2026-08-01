import fs from "node:fs";
import assert from "node:assert/strict";

const migration = fs.readFileSync(
  "supabase/migrations/20260731100000_charge_cash_refunds.sql",
  "utf8",
);
const cajaAction = fs.readFileSync("src/server/actions/caja.ts", "utf8");
const cajaClient = fs.readFileSync("src/components/caja/caja-client.tsx", "utf8");
const billing = fs.readFileSync("src/lib/queries/billing.ts", "utf8");
const billingActions = fs.readFileSync("src/server/actions/billing.ts", "utf8");
const diagnostics = fs.readFileSync(
  "src/lib/queries/enrollment-finance-diagnostics.ts",
  "utf8",
);
const reports = fs.readFileSync("src/lib/queries/reports.ts", "utf8");

assert.match(migration, /create table if not exists public\.charge_cash_refunds/);
assert.match(migration, /create table if not exists public\.charge_cash_refund_sources/);
assert.match(migration, /create or replace function public\.record_charge_cash_refund/);
assert.match(migration, /v_charge\.charge_type_code in \('monthly_tuition', 'inscription'\)/);
assert.match(migration, /raise exception 'charge_not_fully_paid'/);
assert.match(migration, /delete from public\.payment_allocations where charge_id = p_charge_id/);
assert.match(migration, /insert into public\.cash_session_entries[\s\S]*'manual_out'[\s\S]*-v_payment_total/);
assert.match(migration, /update public\.charges set status = 'void'/);
assert.match(migration, /auto_apply_enrollment_credit_fifo/);
assert.match(migration, /grant execute[\s\S]*record_charge_cash_refund[\s\S]*to service_role/);
assert.doesNotMatch(
  migration.slice(
    migration.indexOf("create or replace function public.record_charge_cash_refund"),
    migration.indexOf("create or replace view public.v_enrollment_balances"),
  ),
  /update public\.payments|delete from public\.payments|insert into public\.payments/,
);

assert.match(cajaAction, /export async function cashRefundCajaChargeAction/);
assert.match(cajaAction, /\.rpc\("record_charge_cash_refund"/);
assert.match(cajaAction, /charge\.cash_refunded/);
assert.match(cajaClient, /Reembolso en efectivo/);
assert.match(cajaClient, /Efectivo a entregar/);
assert.match(cajaClient, /Registrando salida de efectivo/);
assert.match(billing, /chargeCashRefundedAmount/);
assert.match(billing, /payment_has_charge_cash_refund/);
assert.match(billingActions, /charge_cash_refund_sources/);
assert.match(billingActions, /payment_has_charge_cash_refund/);
assert.match(diagnostics, /charge_cash_refund_sources/);
assert.match(reports, /charge_cash_refunds/);

console.log("Charge-level cash refund safeguards verified.");
