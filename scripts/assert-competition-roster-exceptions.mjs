import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [migration, splitFix, action, query, page, editor] = await Promise.all([
  readFile("supabase/migrations/20260810150000_competition_roster_manual_exceptions.sql", "utf8"),
  readFile("supabase/migrations/20260810153000_competition_roster_split_uuid_aggregate_fix.sql", "utf8"),
  readFile("src/server/actions/competition-rosters.ts", "utf8"),
  readFile("src/lib/queries/competition-rosters.ts", "utf8"),
  readFile("src/app/(protected)/sports-signups/squads/page.tsx", "utf8"),
  readFile("src/components/sports/competition-roster-exceptions-editor.tsx", "utf8"),
]);

assert.match(migration, /create or replace function public\.set_competition_roster_exclusion/);
assert.match(migration, /create or replace function public\.set_competition_roster_manual_member/);
assert.match(migration, /returns jsonb[\s\S]*security invoker/);
assert.match(migration, /public\.can_access_sports_campus/);
assert.match(migration, /entry\.entry_status = 'confirmed'/);
assert.match(migration, /squad\.status <> 'archived'/);
assert.match(migration, /'member\.excluded'/);
assert.match(migration, /'member\.reinstated'/);
assert.match(migration, /'member\.manual_added'/);
assert.match(migration, /'member\.manual_removed'/);
assert.match(migration, /competition_roster_member_already_paid/);
assert.match(migration, /grant execute on function public\.set_competition_roster_exclusion[\s\S]*to authenticated/);
assert.match(migration, /grant execute on function public\.set_competition_roster_manual_member[\s\S]*to authenticated/);
assert.doesNotMatch(
  migration,
  /(?:insert into|update|delete from) public\.(?:charges|payments|payment_allocations|tournament_player_entries|training_group_assignments|enrollments|attendance_records)/i,
);
assert.match(splitFix, /pg_get_functiondef/);
assert.match(splitFix, /array_agg\(squad\.id order by squad\.id\)/);
assert.match(splitFix, /competition_roster_split_uuid_selector_replacement_failed/);
assert.doesNotMatch(
  splitFix,
  /(?:insert into|update|delete from) public\.(?:charges|payments|payment_allocations|tournament_player_entries|training_group_assignments|enrollments|attendance_records)/i,
);

assert.match(action, /setCompetitionRosterExclusionAction/);
assert.match(action, /setCompetitionRosterManualMemberAction/);
assert.match(action, /context\.supabase\.rpc\("set_competition_roster_exclusion"/);
assert.match(action, /context\.supabase\.rpc\("set_competition_roster_manual_member"/);
assert.doesNotMatch(action, /admin\.rpc\("set_competition_roster_/);

assert.match(query, /loadActiveCampusEnrollments/);
assert.match(query, /\.range\(offset, offset \+ pageSize - 1\)/);
assert.match(query, /excludedPlayers/);
assert.match(query, /manualHelpers/);
assert.match(query, /helperCandidates/);

assert.match(page, /CompetitionRosterExceptionsEditor/);
assert.match(page, /player_excluded/);
assert.match(page, /helper_added/);
assert.match(editor, /Conserva su pago e inscripcion al torneo/);
assert.match(editor, /sin crear un pago ni cambiar su grupo de entrenamiento/);
assert.match(editor, /window\.confirm/);

console.log("Competition roster manual exception assertions passed.");
