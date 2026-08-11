import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [migration, readyMigration, squadCategoryMigration, action, query, page, composer, dashboard, editor, png] = await Promise.all([
  readFile("supabase/migrations/20260806120000_weekly_callup_group_tournaments.sql", "utf8"),
  readFile("supabase/migrations/20260806130000_weekly_callups_ready_coach_snapshots.sql", "utf8"),
  readFile("supabase/migrations/20260811210000_squad_aware_weekly_callup_categories.sql", "utf8"),
  readFile("src/server/actions/weekly-callups.ts", "utf8"),
  readFile("src/lib/queries/weekly-callups.ts", "utf8"),
  readFile("src/app/(protected)/convocatorias/page.tsx", "utf8"),
  readFile("src/components/weekly-callups/composer-form.tsx", "utf8"),
  readFile("src/components/weekly-callups/current-week-dashboard.tsx", "utf8"),
  readFile("src/app/(protected)/convocatorias/[callupId]/page.tsx", "utf8"),
  readFile("src/lib/weekly-callups/png-layout.ts", "utf8"),
]);

assert.match(migration, /add column if not exists tournament_id/);
assert.match(migration, /tournament_name_snapshot/);
assert.match(migration, /update public\.weekly_callup_categories/);
assert.match(readyMigration, /coach_names_snapshot/);
assert.match(readyMigration, /set status = 'ready'/);
assert.match(squadCategoryMigration, /uq_weekly_callup_category_live_squad/);
assert.match(squadCategoryMigration, /competition_roster_squad_id is not null/);

assert.match(query, /groups: Array</);
assert.match(query, /training_group_coaches/);
assert.match(query, /primaryCoachName/);
assert.match(query, /tournamentName: category\.tournament_name_snapshot/);

assert.match(action, /export async function createWeeklyCallupComposerAction/);
assert.match(action, /submittedSquadIds/);
assert.match(action, /expectedSquads/);
assert.match(action, /competition_roster_squad_members/);
assert.match(action, /weekly_callups\.squad_packet_created/);
assert.match(action, /status: "ready"/);
assert.match(action, /WeeklyCallupComposerState/);
assert.match(action, /Todos los equipos deben reportar sus partidos o marcar Descansa/);
assert.match(action, /source_coach_schedule_game_id: game\.id/);
assert.match(action, /competition_roster_squad_id: squad\.id/);
assert.doesNotMatch(action, /redirectResult\("(?:empty_composer|invalid_composer_game|composer_already_exists|invalid_composer_source|ambiguous_composer_roster|composer_create_failed)"\)/);
assert.doesNotMatch(action, /from\("(?:charges|payments|payment_allocations)"\)/);

assert.match(page, /Campus/);
assert.match(page, /WeeklyCallupComposerForm/);
assert.match(page, /Preparar convocatoria/);
assert.match(composer, /name="squadId"/);
assert.match(composer, /equipos pendientes/);
assert.match(composer, /Falta reportar partido o marcar Descansa/);
assert.match(composer, /disabled=\{!complete \|\| pending\}/);
assert.match(composer, /useActionState/);
assert.doesNotMatch(composer, /Omitir grupo/);
assert.doesNotMatch(page, /Convocatoria de la semana/);
assert.match(dashboard, /\/convocatorias\/\$\{callup\.id\}/);
assert.match(dashboard, /Abrir convocatoria/);
assert.match(page, /<details/);
assert.match(page, /Convocatorias anteriores/);
assert.match(editor, /category\.tournamentName/);
assert.match(png, /category\.tournamentName/);
assert.match(png, /category\.coachNames/);

console.log("weekly callups composer assertions passed");
