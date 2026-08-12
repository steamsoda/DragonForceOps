import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const migration = read("supabase/migrations/20260812110000_finalize_tournament_lifecycle.sql");
const action = read("src/server/actions/sports-signups.ts");
const query = read("src/lib/queries/coach-schedules.ts");
const foundation = read("src/lib/queries/weekly-callups.ts");
const form = read("src/components/weekly-callups/coach-schedule-form.tsx");
const page = read("src/app/(protected)/sports-signups/page.tsx");

assert.match(migration, /finalize_sports_signup_tournament/);
assert.match(migration, /ar\.code = 'superadmin'/);
assert.match(migration, /update public\.tournaments[\s\S]*is_active = false/);
assert.match(migration, /update public\.competition_roster_squads[\s\S]*status = 'archived'/);
assert.match(migration, /event_type[\s\S]*'tournament_finalized'/);
assert.doesNotMatch(migration, /delete\s+from\s+public\.(charges|payments|tournament_player_entries|competition_roster_squad_members|coach_weekly_schedule_reports)/i);
assert.match(migration, /tournament_not_active/);

assert.match(action, /rpc\("finalize_sports_signup_tournament"/);
assert.match(action, /revalidatePath\("\/convocatorias"\)/);
assert.match(query, /\.in\("tournament_id", \[\.\.\.activeTournamentIds\]\)/);
assert.match(query, /end_date\.is\.null,end_date\.gte\.\$\{today\}/);
assert.match(foundation, /end_date\.is\.null,end_date\.gte\.\$\{today\}/);
assert.match(form, /groupTournamentIds\.has\(tournament\.id\)/);
assert.match(page, /Torneos finalizados/);
assert.match(page, /FinalizeTournamentForm/);

console.log("Tournament finalization assertions passed.");
