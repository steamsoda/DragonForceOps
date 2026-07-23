import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [
  actionSource,
  migrationSource,
  hardeningMigrationSource,
  tableSource,
  intakeSource,
  validationSource,
  chargesPageSource,
  cajaSource,
  posting360Source,
  enrollmentSource,
] = await Promise.all([
  readFile(new URL("../src/server/actions/billing.ts", import.meta.url), "utf8"),
  readFile(new URL("../supabase/migrations/20260722140000_superadmin_all_charge_repricing.sql", import.meta.url), "utf8"),
  readFile(new URL("../supabase/migrations/20260722150000_manual_charge_override_hardening.sql", import.meta.url), "utf8"),
  readFile(new URL("../src/components/billing/charges-ledger-table.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/server/actions/intake.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/lib/validations/player.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/app/(protected)/enrollments/[enrollmentId]/charges/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/server/actions/caja.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/server/actions/360player-posting.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/server/actions/enrollments.ts", import.meta.url), "utf8"),
]);

assert.match(validationSource, /formData\.get\("addSecondaryGuardian"\)[\s\S]*?return null/);
assert.match(validationSource, /if \(!firstName \|\| !lastName \|\| !phone\) return "invalid"/);
assert.match(validationSource, /return \{ firstName, lastName, phone, phoneSecondary, email, relationship \}/);
assert.match(actionSource, /requireSuperAdminContext\(`\$\{BASE\}\?err=unauthorized`\)/);
assert.match(actionSource, /canAccessEnrollmentRecord\(enrollmentId, permissionContext\)/);
assert.match(actionSource, /action: "charge\.repriced\.manual_override"/);
assert.match(actionSource, /triggerAction: "charge\.repriced\.manual_override"/);
assert.match(migrationSource, /v_charge\.status <> 'pending'/);
assert.match(migrationSource, /from public\.payment_allocations where charge_id = p_charge_id/);
assert.match(migrationSource, /from public\.enrollment_credit_applications where charge_id = p_charge_id/);
assert.match(migrationSource, /revoke all on function public\.reprice_unallocated_charge\(uuid, numeric\) from authenticated/);
assert.match(migrationSource, /grant execute on function public\.reprice_unallocated_charge\(uuid, numeric\) to service_role/);
assert.match(migrationSource, /drop function if exists public\.reprice_unallocated_product_charge/);
assert.match(tableSource, /Solo cambia este cargo\. Las reglas generales de precios no se modifican\./);
assert.doesNotMatch(tableSource, /row\.productId/);
assert.match(chargesPageSource, /permissionContext\.isSuperAdmin[\s\S]*?repriceChargeAction/);
assert.match(intakeSource, /is_primary: false/);
assert.match(intakeSource, /secondary_guardian_created: Boolean\(secondaryGuardian\)/);

assert.match(hardeningMigrationSource, /manual_price_override boolean not null default false/);
assert.match(hardeningMigrationSource, /manual_price_original_amount numeric\(12, 2\)/);
assert.match(hardeningMigrationSource, /reprice_unallocated_charge\([\s\S]*?p_actor_user_id uuid,[\s\S]*?p_reason text/);
assert.match(hardeningMigrationSource, /restore_unallocated_charge_price\([\s\S]*?p_actor_user_id uuid/);
assert.match(hardeningMigrationSource, /c\.manual_price_override = false/);
assert.match(hardeningMigrationSource, /grant execute on function public\.reprice_unallocated_charge\(uuid, numeric, uuid, text\) to service_role/);
assert.match(hardeningMigrationSource, /grant execute on function public\.restore_unallocated_charge_price\(uuid, uuid\) to service_role/);
assert.doesNotMatch(hardeningMigrationSource, /create or replace function public\.generate_monthly_charges/);
assert.match(actionSource, /action: "charge\.price_override\.restored"/);
assert.match(tableSource, /Precio manual/);
assert.match(tableSource, /Confirmar restauracion/);
assert.match(cajaSource, /mode: "created" \| "repriced" \| "manual_override"/);
assert.match(cajaSource, /const checkoutChargeIds: string\[\] = \[\]/);
assert.match(cajaSource, /if \(tuitionResult\.mode === "created"\) createdChargeIds\.push/);
assert.match(posting360Source, /if \(charge\.manual_price_override\) \{[\s\S]*?skipped \+= 1;[\s\S]*?continue;/);
assert.match(enrollmentSource, /scholarship_manual_price_override/);

console.log("Secondary tutor intake and durable manual charge repricing checks passed.");
