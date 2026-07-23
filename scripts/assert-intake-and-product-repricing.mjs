import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [actionSource, migrationSource, tableSource, intakeSource, validationSource, chargesPageSource] = await Promise.all([
  readFile(new URL("../src/server/actions/billing.ts", import.meta.url), "utf8"),
  readFile(new URL("../supabase/migrations/20260722140000_superadmin_all_charge_repricing.sql", import.meta.url), "utf8"),
  readFile(new URL("../src/components/billing/charges-ledger-table.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/server/actions/intake.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/lib/validations/player.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/app/(protected)/enrollments/[enrollmentId]/charges/page.tsx", import.meta.url), "utf8"),
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
assert.match(tableSource, /Solo cambia este cargo\. El precio general del producto no se modifica\./);
assert.doesNotMatch(tableSource, /row\.productId/);
assert.match(chargesPageSource, /permissionContext\.isSuperAdmin[\s\S]*?repriceChargeAction/);
assert.match(intakeSource, /is_primary: false/);
assert.match(intakeSource, /secondary_guardian_created: Boolean\(secondaryGuardian\)/);

console.log("Secondary tutor intake and safe product charge repricing checks passed.");
