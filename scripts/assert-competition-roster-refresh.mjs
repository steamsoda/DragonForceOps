import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const migration = read("supabase/migrations/20260812170000_refresh_competition_roster_teams.sql");
const action = read("src/server/actions/competition-rosters.ts");
const view = read("src/components/sports/competition-roster-live-view.tsx");

assert.match(migration, /create or replace function public\.reconcile_competition_roster_entry/);
assert.match(migration, /cardinality\(v_existing_ids\) <> 1 or cardinality\(v_destination_ids\) <> 1/);
assert.match(migration, /v_latest_manual_move_at >= v_assignment_created_at/);
assert.match(migration, /manual_assignment_preserved/);
assert.match(migration, /cardinality\(v_existing_ids\) = 1 and cardinality\(v_destination_ids\) = 0/);
assert.match(migration, /squad\.member_training_group_reassigned/);
assert.match(migration, /create or replace function public\.refresh_competition_roster_teams/);
assert.match(migration, /public\.reconcile_competition_roster_entry\(p_tournament_id, v_entry\.enrollment_id\)/);
assert.match(migration, /perform public\.reconcile_competition_roster_entry\(v_item\.tournament_id, v_item\.enrollment_id\)/);
assert.doesNotMatch(
  migration,
  /(?:insert into|update|delete from) public\.(?:charges|payments|payment_allocations|tournament_player_entries|enrollments|training_group_assignments|attendance_records)/i,
);
assert.match(action, /refreshCompetitionRosterTeamsInlineAction/);
assert.match(action, /rpc\("refresh_competition_roster_teams"/);
assert.match(view, /Actualizar todos los equipos/);
assert.match(view, /competition-rosters-refreshed/);

console.log("competition roster refresh regression assertions passed");
