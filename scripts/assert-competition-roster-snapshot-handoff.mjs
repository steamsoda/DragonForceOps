import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile("supabase/migrations/20260810170000_competition_roster_snapshot_handoff.sql", "utf8");
const actions = await readFile("src/server/actions/competition-rosters.ts", "utf8");
const query = await readFile("src/lib/queries/weekly-callups.ts", "utf8");
const page = await readFile("src/app/(protected)/sports-signups/squads/page.tsx", "utf8");

assert.match(migration, /create or replace function public\.capture_competition_roster_snapshot/);
assert.match(migration, /create or replace function public\.create_weekly_callup_from_competition_snapshot/);
assert.match(migration, /competition_roster_snapshot_pending_players/);
assert.match(migration, /competition_roster_snapshot_id/);
assert.match(migration, /competition_roster_snapshot_squad_id/);
assert.match(migration, /'snapshot\.captured'/);
assert.match(migration, /'snapshot\.callup_created'/);
assert.doesNotMatch(migration, /\b(update|delete from)\s+public\.(payments|charges|payment_allocations|tournament_player_entries|training_group_assignments)\b/i);

assert.match(actions, /context\.supabase\.rpc\("capture_competition_roster_snapshot"/);
assert.match(actions, /context\.supabase\.rpc\("create_weekly_callup_from_competition_snapshot"/);
assert.doesNotMatch(actions, /createAdminClient\(\)[\s\S]{0,300}capture_competition_roster_snapshot/);

assert.match(query, /!usesApprovedSquadSnapshot/);
assert.match(query, /canManageExceptions: context\.isSportsDirector && !hasMixedTournaments && !usesApprovedSquadSnapshot/);
assert.match(page, /CompetitionRosterSnapshotPanel/);

console.log("competition roster snapshot handoff assertions passed");
