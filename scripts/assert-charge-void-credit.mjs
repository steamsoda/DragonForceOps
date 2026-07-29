import fs from "node:fs";
import assert from "node:assert/strict";

const migration = fs.readFileSync(
  "supabase/migrations/20260728143000_automatic_explicit_credit_fifo.sql",
  "utf8",
);
const billingAction = fs.readFileSync("src/server/actions/billing.ts", "utf8");
const cajaAction = fs.readFileSync("src/server/actions/caja.ts", "utf8");
const cajaClient = fs.readFileSync("src/components/caja/caja-client.tsx", "utf8");
const paymentsTable = fs.readFileSync(
  "src/components/billing/payments-table.tsx",
  "utf8",
);
const reassignPage = fs.readFileSync(
  "src/app/(protected)/enrollments/[enrollmentId]/payments/[paymentId]/reassign/page.tsx",
  "utf8",
);

assert.match(migration, /create or replace function public\.auto_apply_enrollment_credit_fifo/);
assert.match(migration, /security definer/);
assert.match(migration, /grant execute[\s\S]*to service_role/);
assert.match(migration, /revoke execute[\s\S]*from authenticated/);
assert.match(migration, /order by coalesce\(c\.due_date, c\.created_at::date\), c\.created_at, c\.id/);
assert.match(migration, /order by ec\.created_at, ec\.id/);
assert.match(migration, /insert into public\.enrollment_credit_applications/);
assert.doesNotMatch(
  migration.slice(
    migration.indexOf("create or replace function public.auto_apply_enrollment_credit_fifo"),
    migration.indexOf("create or replace function public.apply_explicit_credit_after_charge_insert"),
  ),
  /insert into public\.payments|update public\.payments|delete from public\.payments/,
);
assert.match(migration, /create trigger trg_apply_explicit_credit_after_charge_insert/);
assert.match(migration, /create or replace function public\.rollback_unpaid_caja_checkout_charges/);
assert.match(migration, /raise exception 'checkout_charge_has_payment'/);
assert.match(migration, /delete from public\.enrollment_credit_applications/);
assert.match(migration, /source_workflow,[\s\S]*'charge_void'/);
assert.match(migration, /v_charge\.charge_type_code in \('monthly_tuition', 'inscription'\)/);
assert.match(migration, /raise exception 'protected_paid_charge'/);
assert.match(migration, /delete from public\.payment_allocations[\s\S]*where charge_id = p_charge_id/);
assert.match(migration, /delete from public\.enrollment_credit_applications[\s\S]*where charge_id = p_charge_id/);
assert.match(migration, /set status = 'void'/);
assert.match(migration, /auto_applied_credit_amount/);

assert.match(billingAction, /permissionContext\?\.isSuperAdmin/);
assert.match(billingAction, /canAccessEnrollmentRecord\(enrollmentId, permissionContext\)/);
assert.match(billingAction, /\.rpc\("auto_apply_enrollment_credit_fifo"/);
assert.match(cajaAction, /export async function voidCajaChargeAction/);
assert.match(cajaAction, /\.rpc\("void_charge_to_explicit_credit"/);
assert.match(cajaAction, /requiredCheckoutTotal/);
assert.match(cajaAction, /creditOnly: true/);
assert.match(cajaAction, /normalizedFirstAmount/);
assert.match(cajaAction, /normalizedSecondAmount/);
assert.match(cajaAction, /rollbackCreatedCajaCheckoutCharges/);
assert.match(cajaAction, /\.rpc\("rollback_unpaid_caja_checkout_charges"/);

assert.match(cajaClient, /Ultimos cargos/);
assert.match(cajaClient, /Anular cargo/);
assert.match(cajaClient, /Saldo a favor aplicado autom[aá]ticamente/);
assert.match(cajaClient, /readOnly=\{!splitMode\}/);
assert.match(cajaClient, /El saldo a favor cubre este cobro/);
assert.doesNotMatch(cajaClient, /Aplicar credito al saldo pendiente/);

assert.match(paymentsTable, /allowReassignment = false/);
assert.match(paymentsTable, /superadmin_required/);
assert.match(reassignPage, /requireSuperAdminContext/);

console.log("Automatic explicit-credit FIFO and charge annulment safeguards verified.");
