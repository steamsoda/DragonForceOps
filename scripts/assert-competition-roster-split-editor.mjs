import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [migration, action, query, page, editor] = await Promise.all([
  readFile("supabase/migrations/20260810110000_competition_roster_azul_blanco_split.sql", "utf8"),
  readFile("src/server/actions/competition-rosters.ts", "utf8"),
  readFile("src/lib/queries/competition-rosters.ts", "utf8"),
  readFile("src/app/(protected)/sports-signups/squads/page.tsx", "utf8"),
  readFile("src/components/sports/competition-roster-split-editor.tsx", "utf8"),
]);

assert.match(migration, /create or replace function public\.create_or_sync_split_competition_squads/);
assert.match(migration, /returns jsonb[\s\S]*security invoker/);
assert.match(migration, /public\.can_access_sports_campus/);
assert.match(migration, /from public\.tournament_player_entries entry/);
assert.match(migration, /entry\.entry_status = 'confirmed'/);
assert.match(migration, /assignment\.end_date is null/);
assert.match(migration, /competition_roster_exclusions exclusion/);
assert.match(migration, /competition_roster_split_requires_both_teams/);
assert.match(migration, /competition_roster_advanced_squad_requires_editor/);
assert.match(migration, /on conflict on constraint competition_roster_squad_members_squad_id_enrollment_id_key do nothing/i);
assert.match(migration, /'squad\.split_synced'/);
assert.match(migration, /grant execute on function[\s\S]*to authenticated/);
assert.doesNotMatch(
  migration,
  /(?:insert into|update|delete from) public\.(?:charges|payments|payment_allocations|tournament_player_entries|training_group_assignments|enrollments|attendance_records)/i,
);

assert.match(action, /createOrSyncSplitCompetitionSquadsAction/);
assert.match(action, /context\.supabase\.rpc\("create_or_sync_split_competition_squads"/);
assert.doesNotMatch(action, /admin\.rpc\("create_or_sync_split_competition_squads"/);
assert.match(action, /split_requires_both_teams/);
assert.match(action, /split_invalid_player/);

assert.match(query, /hasSplitStructure/);
assert.match(query, /canEditSplit/);
assert.match(query, /kind === "azul"/);
assert.match(query, /kind === "blanco"/);

assert.match(page, /CompetitionRosterSplitEditor/);
assert.match(page, /Azul \{group\.squads\.find/);
assert.match(page, /Blanco \{group\.squads\.find/);
assert.match(editor, /Repartir alternado/);
assert.match(editor, /window\.confirm/);
assert.match(editor, /name="blancoEnrollmentId"/);

console.log("Competition roster Azul/Blanco split assertions passed.");
