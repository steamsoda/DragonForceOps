import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [migration, action, query, page, board] = await Promise.all([
  readFile("supabase/migrations/20260808120000_competition_roster_default_squad_rpc.sql", "utf8"),
  readFile("src/server/actions/competition-rosters.ts", "utf8"),
  readFile("src/lib/queries/competition-rosters.ts", "utf8"),
  readFile("src/app/(protected)/sports-signups/squads/page.tsx", "utf8"),
  readFile("src/components/sports/sports-signups-board.tsx", "utf8"),
]);

assert.match(migration, /create or replace function public\.create_or_sync_default_competition_squad/);
assert.match(migration, /security invoker/);
assert.match(migration, /public\.can_access_sports_campus/);
assert.match(migration, /from public\.tournament_player_entries entry/);
assert.match(migration, /entry\.entry_status = 'confirmed'/);
assert.match(migration, /assignment\.end_date is null/);
assert.match(migration, /v_linked_squad_count > 1 or v_non_single_squad_count > 0/);
assert.match(migration, /delete from public\.competition_roster_squad_members member[\s\S]*assignment\.training_group_id = p_training_group_id/);
assert.match(migration, /delete from public\.competition_roster_squad_members member[\s\S]*competition_roster_exclusions exclusion/);
assert.match(migration, /competition_roster_squad_members/);
assert.match(migration, /squad\.members_synced/);
assert.match(migration, /grant execute on function[\s\S]*to authenticated/);
assert.doesNotMatch(migration, /(?:insert into|update|delete from) public\.(?:charges|payments|payment_allocations|training_group_assignments|tournament_player_entries)/i);

assert.match(action, /context\?\.isSportsDirector/);
assert.match(action, /context\.supabase\.rpc\("create_or_sync_default_competition_squad"/);
assert.doesNotMatch(action, /admin\.rpc\("create_or_sync_default_competition_squad"/);

assert.match(query, /\.range\(offset, offset \+ pageSize - 1\)/);
assert.match(query, /const chunkSize = 200/);
assert.match(query, /foundation\.excludedEnrollmentIds/);
assert.match(page, /Organizar equipos/);
assert.match(page, /Vista de consulta/);
assert.match(page, /CompetitionRosterSubmitButton/);
assert.match(board, /\/sports-signups\/squads\?tournament=/);

console.log("Competition roster organizer assertions passed.");
