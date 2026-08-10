import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile("supabase/migrations/20260810210000_live_competition_roster_callup.sql", "utf8");
const board = await readFile("src/components/sports/sports-signups-board.tsx", "utf8");
const liveView = await readFile("src/components/sports/competition-roster-live-view.tsx", "utf8");
const panel = await readFile("src/components/sports/competition-roster-snapshot-panel.tsx", "utf8");
const actions = await readFile("src/server/actions/competition-rosters.ts", "utf8");
const query = await readFile("src/lib/queries/competition-rosters.ts", "utf8");
const exportRoute = await readFile("src/app/api/exports/competition-roster-live/route.ts", "utf8");

assert.match(board, /setViewMode\("teams"\)/);
assert.match(board, />\s*Equipos\s*</);
assert.match(board, /CompetitionRosterLiveView/);
assert.match(liveView, /api\/sports-signups\/teams/);
assert.match(liveView, /Exportar equipos/);
assert.match(liveView, /Pendientes por asignar/);
assert.match(query, /getCompetitionRosterLiveViewData/);
assert.match(query, /liveSquads/);
assert.match(exportRoute, /buildCompetitionRosterLiveWorkbook/);

assert.match(migration, /create or replace function public\.create_weekly_callup_from_live_competition_roster/);
assert.match(migration, /capture_competition_roster_snapshot/);
assert.match(migration, /create_weekly_callup_from_competition_snapshot/);
assert.match(migration, /security invoker/);
assert.doesNotMatch(migration, /\b(update|delete from|insert into)\s+public\.(payments|charges|payment_allocations|tournament_player_entries|enrollments|training_group_assignments|attendance_records)\b/i);
assert.match(actions, /context\.supabase\.rpc\("create_weekly_callup_from_live_competition_roster"/);
assert.match(panel, /Plantel actual/);
assert.match(panel, /Exportar equipos actuales/);
assert.doesNotMatch(panel, /Aprobar plantel|Aprobar y guardar copia|Nombre de la copia/);

console.log("Competition roster live workflow assertions passed.");
