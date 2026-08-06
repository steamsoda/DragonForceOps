import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [migration, writeBoundary, action, query, page, nav, sportsQuery] = await Promise.all([
  readFile("supabase/migrations/20260806030000_weekly_callups_foundation.sql", "utf8"),
  readFile("supabase/migrations/20260806031000_weekly_callups_write_boundary.sql", "utf8"),
  readFile("src/server/actions/weekly-callups.ts", "utf8"),
  readFile("src/lib/queries/weekly-callups.ts", "utf8"),
  readFile("src/app/(protected)/convocatorias/page.tsx", "utf8"),
  readFile("src/app/(protected)/layout.tsx", "utf8"),
  readFile("src/lib/queries/sports-signups.ts", "utf8"),
]);

for (const table of [
  "weekly_callups",
  "weekly_callup_categories",
  "weekly_callup_players",
  "weekly_callup_games",
]) {
  assert.match(migration, new RegExp(`create table if not exists public\\.${table}`));
  assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`));
}

assert.match(migration, /unique \(campus_id, tournament_id, program, week_start\)/);
assert.match(migration, /extract\(isodow from week_start\) = 1/);
assert.match(migration, /eligibility_source in \('direct', 'bundle', 'manual_unpaid'\)/);
assert.match(migration, /eligibility_source <> 'manual_unpaid'[\s\S]*can_access_sports_campus/);
assert.match(migration, /create table if not exists public\.weekly_callup_games[\s\S]*match_date date not null/);
assert.match(writeBoundary, /revoke insert, update, delete on public\.weekly_callups from authenticated/);
assert.match(writeBoundary, /revoke insert, update, delete on public\.weekly_callup_players from authenticated/);

assert.match(sportsQuery, /export async function getCompetitionPaidCallupPlayers/);
assert.match(action, /getCompetitionPaidCallupPlayers/);
assert.match(action, /training_group_assignments/);
assert.match(action, /\.is\("end_date", null\)/);
assert.match(action, /roster_snapshot_at: snapshotAt/);
assert.match(action, /weekly_callups\.snapshot_created/);
assert.doesNotMatch(action, /from\("(?:charges|payments|payment_allocations)"\)/);
assert.doesNotMatch(query, /from\("(?:charges|payments|payment_allocations)"\)/);

assert.match(page, /title="Convocatorias"/);
assert.match(page, /Crear borrador/);
assert.match(page, /plantel pagado congelado/);
assert.match(nav, /href: "\/convocatorias", label: "Convocatorias"/);

console.log("weekly callups foundation assertions passed");
