import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [migration, action, query, page, editor] = await Promise.all([
  readFile("supabase/migrations/20260810130000_competition_roster_combined_source_squad.sql", "utf8"),
  readFile("src/server/actions/competition-rosters.ts", "utf8"),
  readFile("src/lib/queries/competition-rosters.ts", "utf8"),
  readFile("src/app/(protected)/sports-signups/squads/page.tsx", "utf8"),
  readFile("src/components/sports/competition-roster-combined-editor.tsx", "utf8"),
]);

assert.match(migration, /create or replace function public\.create_or_sync_combined_competition_squad/);
assert.match(migration, /returns jsonb[\s\S]*security invoker/);
assert.match(migration, /public\.can_access_sports_campus/);
assert.match(migration, /cardinality\(v_group_ids\) < 2/);
assert.match(migration, /entry\.entry_status = 'confirmed'/);
assert.match(migration, /assignment\.training_group_id = any\(v_group_ids\)/);
assert.match(migration, /assignment\.end_date is null/);
assert.match(migration, /competition_roster_exclusions exclusion/);
assert.match(migration, /member\.source = 'manual'/);
assert.match(migration, /competition_roster_advanced_squad_requires_editor/);
assert.match(migration, /set status = 'archived'/);
assert.match(migration, /on conflict on constraint competition_roster_squad_members_squad_id_enrollment_id_key do nothing/i);
assert.match(migration, /'squad\.groups_combined'/);
assert.match(migration, /grant execute on function[\s\S]*to authenticated/);
assert.doesNotMatch(
  migration,
  /(?:insert into|update|delete from) public\.(?:charges|payments|payment_allocations|tournament_player_entries|training_group_assignments|enrollments|attendance_records)/i,
);

assert.match(action, /createOrSyncCombinedCompetitionSquadAction/);
assert.match(action, /context\.supabase\.rpc\("create_or_sync_combined_competition_squad"/);
assert.doesNotMatch(action, /admin\.rpc\("create_or_sync_combined_competition_squad"/);
assert.match(action, /validateCombinedOrganizerScope/);
assert.match(action, /combined_player_conflict/);
assert.match(action, /error\.code === "23505"/);

assert.match(query, /hasCombinedStructure/);
assert.match(query, /combinedSquadId/);
assert.match(query, /combinedSquads/);
assert.match(query, /squad\.sourceGroups\.length > 1/);

assert.match(page, /CompetitionRosterCombinedEditor/);
assert.match(page, /combined_synced/);
assert.match(page, /Combinar varios grupos/);
assert.match(editor, /Nuevo equipo combinado/);
assert.match(editor, /name="trainingGroupId"/);
assert.match(editor, /window\.confirm/);
assert.match(editor, /group\.combinedSquadId === mode/);

console.log("Competition roster combined-source editor assertions passed.");
