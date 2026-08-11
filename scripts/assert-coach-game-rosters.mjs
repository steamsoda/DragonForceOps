import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [migration, squadScheduleMigration, coachQuery, coachForm, coachAction, callupAction, callupQuery, png, dashboard, page] = await Promise.all([
  readFile("supabase/migrations/20260811120000_coach_game_roster_snapshots.sql", "utf8"),
  readFile("supabase/migrations/20260811190000_squad_aware_coach_schedules.sql", "utf8"),
  readFile("src/lib/queries/coach-schedules.ts", "utf8"),
  readFile("src/components/weekly-callups/coach-schedule-form.tsx", "utf8"),
  readFile("src/server/actions/coach-schedules.ts", "utf8"),
  readFile("src/server/actions/weekly-callups.ts", "utf8"),
  readFile("src/lib/queries/weekly-callups.ts", "utf8"),
  readFile("src/lib/weekly-callups/png-layout.ts", "utf8"),
  readFile("src/components/weekly-callups/current-week-dashboard.tsx", "utf8"),
  readFile("src/app/(protected)/convocatorias/page.tsx", "utf8"),
]);

assert.match(migration, /coach_weekly_schedule_game_players/);
assert.match(migration, /weekly_callup_game_players/);
assert.match(migration, /save_coach_weekly_schedule_report_v2/);
assert.match(migration, /game_roster_changed/);
assert.doesNotMatch(migration, /payment_allocations|attendance_records/);
assert.match(coachQuery, /competition_roster_squad_members/);
assert.match(coachQuery, /\.range\(offset, offset \+ pageSize - 1\)/);
assert.match(coachForm, /Convocados \(\{included\.length\}\)/);
assert.match(coachForm, /No convocados \(\{excluded\.length\}\)/);
assert.match(coachAction, /save_coach_weekly_schedule_report_v3/);
assert.match(squadScheduleMigration, /competition_roster_squad_id/);
assert.match(coachForm, /name="squadId"/);
assert.match(callupAction, /source_coach_schedule_game_id/);
assert.match(callupAction, /weekly_callup_game_players/);
assert.match(callupQuery, /playersByGame/);
assert.match(png, /game\.players/);
assert.match(dashboard, /`\/convocatorias\/\$\{callup\.id\}`/);
assert.doesNotMatch(page, /Convocatoria de la semana/);

console.log("coach game roster assertions passed");
