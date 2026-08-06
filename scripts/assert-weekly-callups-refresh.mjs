import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [action, query, editorPage, liveRoster, migration] = await Promise.all([
  readFile("src/server/actions/weekly-callups.ts", "utf8"),
  readFile("src/lib/queries/weekly-callups.ts", "utf8"),
  readFile("src/app/(protected)/convocatorias/[callupId]/page.tsx", "utf8"),
  readFile("src/lib/weekly-callups/live-roster.ts", "utf8"),
  readFile("supabase/migrations/20260806040000_weekly_callup_manual_exception_reason.sql", "utf8"),
]);

assert.match(action, /export async function addWeeklyCallupManualExceptionAction/);
assert.match(action, /if \(!editable\.context\.isSportsDirector\) redirect\("\/unauthorized"\)/);
assert.match(action, /player_now_paid_refresh_roster/);
assert.match(action, /eligibility_source: "manual_unpaid"/);
assert.match(action, /weekly_callups\.manual_unpaid_added/);
assert.match(action, /export async function refreshWeeklyCallupRosterAction/);
assert.match(action, /refresh_weekly_callup_paid_roster/);
assert.match(action, /confirmRefresh/);
assert.match(action, /weekly_callups\.roster_refreshed/);
assert.match(action, /export async function moveWeeklyCallupGameAction/);
assert.match(action, /weekly_callups\.game_reordered/);

assert.match(query, /includeComparison/);
assert.match(query, /includeCandidates/);
assert.match(query, /eligibility_source !== "manual_unpaid"/);
assert.match(query, /context\.isSportsDirector/);
assert.match(liveRoster, /getCompetitionPaidCallupPlayers/);
assert.match(liveRoster, /chunkSize = 300/);
assert.match(liveRoster, /weekly_callup_multiple_active_assignments/);

assert.match(migration, /add column if not exists manual_reason text/);
assert.match(migration, /eligibility_source <> 'manual_unpaid'/);
assert.match(migration, /create or replace function public\.refresh_weekly_callup_paid_roster/);
assert.match(migration, /for update/);
assert.match(migration, /weekly_callup_duplicate_roster_player/);
assert.match(migration, /player\.eligibility_source <> 'manual_unpaid'/);
assert.match(migration, /grant execute on function public\.refresh_weekly_callup_paid_roster[\s\S]*to service_role/);
assert.doesNotMatch(migration, /(?:insert into|update|delete from) public\.(?:charges|payments|payment_allocations|attendance_records)/);

assert.match(editorPage, /Comparar plantel actual/);
assert.match(editorPage, /Actualizar plantel congelado/);
assert.match(editorPage, /Excepcion sin pago/);
assert.match(editorPage, /Motivo obligatorio/);
assert.match(editorPage, /Subir partido/);
assert.match(editorPage, /Bajar partido/);

assert.doesNotMatch(action, /from\("(?:charges|payments|payment_allocations|attendance_records)"\)/);

console.log("weekly callups refresh assertions passed");
