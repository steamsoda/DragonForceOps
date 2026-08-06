import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [migration, readyMigration, action, query, page, editor, png] = await Promise.all([
  readFile("supabase/migrations/20260806120000_weekly_callup_group_tournaments.sql", "utf8"),
  readFile("supabase/migrations/20260806130000_weekly_callups_ready_coach_snapshots.sql", "utf8"),
  readFile("src/server/actions/weekly-callups.ts", "utf8"),
  readFile("src/lib/queries/weekly-callups.ts", "utf8"),
  readFile("src/app/(protected)/convocatorias/page.tsx", "utf8"),
  readFile("src/app/(protected)/convocatorias/[callupId]/page.tsx", "utf8"),
  readFile("src/lib/weekly-callups/png-layout.ts", "utf8"),
]);

assert.match(migration, /add column if not exists tournament_id/);
assert.match(migration, /tournament_name_snapshot/);
assert.match(migration, /update public\.weekly_callup_categories/);
assert.match(readyMigration, /coach_names_snapshot/);
assert.match(readyMigration, /set status = 'ready'/);

assert.match(query, /groups: Array</);
assert.match(query, /training_group_coaches/);
assert.match(query, /primaryCoachName/);
assert.match(query, /tournamentName: category\.tournament_name_snapshot/);

assert.match(action, /export async function createWeeklyCallupComposerAction/);
assert.match(action, /competitionId: `product:\$\{tournament\.product_id\}`/);
assert.match(action, /assignmentByEnrollment/);
assert.match(action, /weekly_callups\.composer_created/);
assert.match(action, /status: "ready"/);
assert.match(action, /loadCoachSnapshots/);
assert.doesNotMatch(action, /from\("(?:charges|payments|payment_allocations)"\)/);

assert.match(page, /Campus/);
assert.match(page, /Coach principal/);
assert.match(page, /tournamentId:\$\{group\.id\}/);
assert.match(page, /Preparar convocatoria/);
assert.match(editor, /category\.tournamentName/);
assert.match(png, /category\.tournamentName/);
assert.match(png, /category\.coachNames/);

console.log("weekly callups composer assertions passed");
