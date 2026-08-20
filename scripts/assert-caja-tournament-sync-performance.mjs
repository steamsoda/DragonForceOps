import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(
  "supabase/migrations/20260819120000_credit_aware_tournament_signup.sql",
  "utf8",
);
const signupSync = await readFile("src/server/actions/tournament-signup-sync.ts", "utf8");
const cajaActions = await readFile("src/server/actions/caja.ts", "utf8");
const cajaClient = await readFile("src/components/caja/caja-client.tsx", "utf8");

assert.match(migration, /create or replace function public\.sync_paid_tournament_entries_for_charges/i);
assert.match(migration, /charge\.id = any\(coalesce\(p_charge_ids/i);
assert.match(migration, /payment_allocations allocation/i);
assert.match(migration, /enrollment_credit_applications application/i);
assert.match(migration, /paid\.funded_amount \+ 0\.009 >= charge\.amount/i);
assert.match(migration, /tournament\.product_id = charge\.product_id/i);
assert.match(migration, /product_bundle_entitlements entitlement/i);
assert.match(migration, /on conflict \(tournament_id, enrollment_id\) do update/i);
assert.match(migration, /entry_status = 'confirmed'/i);
assert.match(migration, /grant execute[\s\S]*to service_role/i);
assert.doesNotMatch(
  migration,
  /(?:insert into|update|delete from) public\.(?:charges|payments|payment_allocations|enrollments|training_group_assignments|attendance_records)/i,
);

assert.match(signupSync, /export async function syncPaidCompetitionSignupsForCharges/i);
assert.match(signupSync, /admin\.rpc\("sync_paid_tournament_entries_for_charges"/i);
assert.match(signupSync, /\.from\("enrollment_credit_applications"\)/i);
const targetedFunction = signupSync.match(
  /export async function syncPaidCompetitionSignupsForCharges[\s\S]*?\r?\n}\r?\n\r?\nexport async function syncCompetitionSignupsForEnrollment/,
)?.[0] ?? "";
assert.doesNotMatch(targetedFunction, /process_competition_roster_sync_queue/i);
assert.match(targetedFunction, /falling back to full reconciliation/i);

assert.match(cajaActions, /syncPaidCompetitionSignupsForCharges\([\s\S]*allAllocatedCharges/i);
assert.match(cajaActions, /competitionRosterSyncPending: affectedTournamentIds\.length > 0/i);
assert.match(cajaClient, /El equipo se actualizara automaticamente en segundo plano/i);

console.log("Caja tournament synchronization performance assertions passed.");
