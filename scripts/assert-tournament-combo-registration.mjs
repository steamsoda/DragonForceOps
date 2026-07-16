import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(
  "supabase/migrations/20260714120000_tournament_combo_registration_hardening.sql",
  "utf8",
);
const settingsAction = await readFile("src/server/actions/sports-signups.ts", "utf8");
const backfill = await readFile("src/server/tournament-signup-backfill.ts", "utf8");
const boardQuery = await readFile("src/lib/queries/sports-signups.ts", "utf8");
const pricingMigration = await readFile(
  "supabase/migrations/20260715090000_combo_leyendas_paid_discount.sql",
  "utf8",
);
const signupSync = await readFile("src/server/actions/tournament-signup-sync.ts", "utf8");

for (const productName of [
  "Torneo de Leyendas",
  "Superliga Regia 17 Edicion",
  "Rosa Power Cup 13 Edicion",
]) {
  assert.ok(migration.includes(productName), `Missing target tournament configuration for ${productName}.`);
}

assert.match(migration, /code in \('LINDA_VISTA', 'CONTRY'\)/, "Both operating campuses must be configured.");
assert.match(
  migration,
  /on conflict \(tournament_id, enrollment_id\) do update/,
  "Persistent tournament-entry backfill must be idempotent.",
);
assert.doesNotMatch(migration, /insert into public\.(charges|payments|payment_allocations)/i);
assert.match(settingsAction, /backfillCompetitionSignupsForTournament\(admin, tournamentId\)/);
assert.match(backfill, /\.from\("tournament_player_entries"\)[\s\S]*?\.upsert/);
assert.match(boardQuery, /directConfirmedCount/);
assert.match(boardQuery, /bundleConfirmedCount/);
assert.match(pricingMigration, /required_paid_product_id/);
assert.match(pricingMigration, /300::numeric/);
assert.match(pricingMigration, /150::numeric/);
assert.match(pricingMigration, /Torneo de Leyendas/);
assert.doesNotMatch(pricingMigration, /insert into public\.(charges|payments|payment_allocations)/i);
assert.match(
  signupSync,
  /upsert\([\s\S]*?onConflict: "tournament_id,enrollment_id"/,
  "Tournament entry synchronization must remain idempotent for direct plus Combo qualification.",
);

console.log("Tournament Combo registration hardening assertions passed.");
