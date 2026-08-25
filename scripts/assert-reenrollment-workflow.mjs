import assert from "node:assert/strict";
import fs from "node:fs";

const migration = fs.readFileSync(
  "supabase/migrations/20260818130000_reenrollment_credit_reconciliation.sql",
  "utf8",
);
const action = fs.readFileSync("src/server/actions/enrollments.ts", "utf8");
const validation = fs.readFileSync("src/lib/validations/enrollment.ts", "utf8");
const form = fs.readFileSync("src/components/enrollments/enrollment-form.tsx", "utf8");
const bajasPage = fs.readFileSync("src/app/(protected)/players/page.tsx", "utf8");
const playerPage = fs.readFileSync("src/app/(protected)/players/[playerId]/page.tsx", "utf8");
const intakePage = fs.readFileSync("src/app/(protected)/players/new/page.tsx", "utf8");
const intakeForm = fs.readFileSync("src/components/enrollments/enrollment-intake-form.tsx", "utf8");
const returningLookup = fs.readFileSync("src/components/enrollments/returning-player-lookup.tsx", "utf8");
const intakeAction = fs.readFileSync("src/server/actions/intake.ts", "utf8");

assert.match(migration, /reconcile_returning_enrollment_credit_fifo/);
assert.match(migration, /status not in \('ended', 'cancelled'\)/);
assert.match(migration, /p\.status = 'posted'/);
assert.match(migration, /payment_refunds/);
assert.match(migration, /charge_cash_refund_sources/);
assert.match(migration, /enrollment_credits ec where ec\.source_payment_id = p\.id/);
assert.match(migration, /order by coalesce\(c\.due_date, c\.created_at::date\), c\.created_at, c\.id/);
assert.match(migration, /on conflict \(payment_id, charge_id\)/);
assert.match(migration, /enrollment_credit_applications/);
assert.match(migration, /revoke execute[\s\S]*from authenticated/);
assert.match(migration, /grant execute[\s\S]*to service_role/);

assert.match(validation, /returningAccountConfirmed/);
assert.match(validation, /isReturning && !returningAccountConfirmed/);
assert.match(action, /validateEnrollmentTrainingGroupSelection/);
assert.match(action, /assignSelectedTrainingGroupForEnrollment/);
assert.match(action, /reconcileReturningEnrollmentAccounts/);
assert.match(action, /historicalEnrollment && !parsed\.isReturning/);
assert.match(action, /credit_reconciliation_failed/);
assert.match(action, /rollbackCreatedEnrollment\(admin, enrollmentId\)/);
assert.match(action, /redirect\(`\/caja\?enrollmentId=\$\{enrollmentId\}`\)/);

assert.match(form, /name="returningAccountConfirmed"/);
assert.match(form, /Reinscribir jugador/);
assert.match(form, /grupo obligatorio/);
assert.match(bajasPage, /enrollments\/new\?returning=1/);
assert.match(playerPage, /Reinscribir/);
assert.match(intakePage, /ReturningPlayerLookup/);
assert.match(intakePage, /query\.manual === "1"/);
assert.match(intakeForm, /window\.location\.assign\("\/players\/new\?returning=1"\)/);
assert.match(intakeForm, /Usar expediente existente/);
assert.match(returningLookup, /Buscar expediente anterior/);
assert.match(returningLookup, /No aparece en Invicta - Capturar manualmente/);
assert.match(returningLookup, /enrollments\/new\?returning=1/);
assert.match(returningLookup, /Ya tiene inscripcion activa/);
assert.match(intakeAction, /searchReturningPlayersForIntakeAction/);
assert.match(intakeAction, /context\?\.hasOperationalAccess/);
assert.match(intakeAction, /allowedCampusIds/);
assert.match(intakeAction, /params\.set\("manual", "1"\)/);

console.log("Re-enrollment workflow assertions passed.");
