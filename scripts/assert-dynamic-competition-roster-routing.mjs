import assert from "node:assert/strict";
import fs from "node:fs";

const migration = fs.readFileSync(
  "supabase/migrations/20260810190000_dynamic_competition_roster_routing.sql",
  "utf8",
);
const signupSync = fs.readFileSync("src/server/actions/tournament-signup-sync.ts", "utf8");

assert.match(migration, /create table if not exists public\.competition_roster_sync_queue/i);
assert.match(migration, /create or replace function public\.sync_competition_roster_entry/i);
assert.match(migration, /create or replace function public\.process_competition_roster_sync_queue/i);
assert.match(migration, /after insert or update of tournament_id, enrollment_id, entry_status or delete[\s\S]*tournament_player_entries/i);
assert.match(migration, /cardinality\(v_destination_ids\) = 0[\s\S]*'single'[\s\S]*'ready'/i);
assert.match(migration, /cardinality\(v_destination_ids\) > 1[\s\S]*pending_split_assignment/i);
assert.match(migration, /competition_roster_squad_groups[\s\S]*cardinality\(v_destination_ids\)/i);
assert.match(migration, /member\.source = 'paid'/i);
assert.match(migration, /member_group_review_required/i);
assert.match(migration, /cron\.schedule\([\s\S]*sync-competition-rosters/i);
assert.doesNotMatch(
  migration,
  /(?:insert into|update|delete from) public\.(?:charges|payments|payment_allocations|tournament_player_entries|enrollments|training_group_assignments|attendance_records)/i,
);
assert.match(signupSync, /admin\.rpc\("process_competition_roster_sync_queue"/i);
assert.match(signupSync, /deferred to queue/i);

console.log("Dynamic competition roster routing assertions passed.");
