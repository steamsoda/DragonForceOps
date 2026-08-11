import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [migration, query, action, page, editor] = await Promise.all([
  readFile("supabase/migrations/20260811160000_competition_squad_professor_assignments.sql", "utf8"),
  readFile("src/lib/queries/competition-rosters.ts", "utf8"),
  readFile("src/server/actions/competition-rosters.ts", "utf8"),
  readFile("src/app/(protected)/sports-signups/squads/page.tsx", "utf8"),
  readFile("src/components/sports/competition-roster-professor-editor.tsx", "utf8"),
]);

assert.match(migration, /coach_assignment_mode text not null default 'inherited'/);
assert.match(migration, /create table if not exists public\.competition_roster_squad_coaches/);
assert.match(migration, /keep_combined_squad_professors_manual/);
assert.match(migration, /combined_squad_requires_manual_professor/);
assert.match(migration, /security invoker[\s\S]*set search_path = public/i);
assert.match(migration, /public\.can_access_sports_campus/);
assert.match(migration, /competition_roster_events/);
assert.match(migration, /squad_professors_inherited/);
assert.match(migration, /squad_professors_assigned/);
assert.match(migration, /revoke all[\s\S]*from public, anon/i);
assert.match(migration, /grant execute[\s\S]*to authenticated/i);

for (const forbidden of [
  "insert into public.payments",
  "update public.payments",
  "insert into public.charges",
  "update public.charges",
  "update public.tournament_player_entries",
  "update public.training_group_assignments",
  "update public.enrollments",
]) {
  assert.doesNotMatch(migration.toLowerCase(), new RegExp(forbidden.replaceAll(" ", "\\s+")));
}

assert.match(query, /competition_roster_squad_coaches/);
assert.match(query, /training_group_coaches/);
assert.match(query, /professorAssignmentMode/);
assert.match(query, /requiresManualAssignment/);
assert.match(action, /setCompetitionRosterSquadProfessorsInlineAction/);
assert.match(action, /set_competition_roster_squad_coaches/);
assert.match(page, /CompetitionRosterProfessorEditor/);
assert.match(editor, /Hereda del grupo/);
assert.match(editor, /Volver a heredar del grupo/);
assert.match(editor, /Profesor principal/);

console.log("competition roster professor assignment assertions passed");
