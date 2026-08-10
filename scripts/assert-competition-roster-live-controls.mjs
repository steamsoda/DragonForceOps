import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const migration = read("supabase/migrations/20260810230000_competition_roster_pending_split_assignment.sql");
const actions = read("src/server/actions/competition-rosters.ts");
const query = read("src/lib/queries/competition-rosters.ts");
const controls = read("src/components/sports/competition-roster-live-controls.tsx");
const liveView = read("src/components/sports/competition-roster-live-view.tsx");

assert.match(migration, /security invoker/i);
assert.match(migration, /set search_path = public/i);
assert.match(migration, /count\(distinct sibling\.squad_kind\)/i);
assert.match(migration, /entry\.entry_status = 'confirmed'/i);
assert.match(migration, /assignment\.end_date is null/i);
assert.match(migration, /competition_roster_exclusions/i);
assert.match(migration, /competition_roster_player_already_assigned/i);
assert.match(migration, /'member\.split_assigned'/i);
assert.match(migration, /revoke all[\s\S]*from public, anon/i);
assert.match(migration, /grant execute[\s\S]*to authenticated/i);

for (const forbidden of [
  "insert into public.payments",
  "update public.payments",
  "insert into public.charges",
  "update public.charges",
  "update public.tournament_player_entries",
  "insert into public.tournament_player_entries",
  "update public.enrollments",
  "insert into public.training_group_assignments",
  "update public.training_group_assignments",
  "insert into public.attendance_records",
  "update public.attendance_records",
]) {
  assert.doesNotMatch(migration.toLowerCase(), new RegExp(forbidden.replaceAll(" ", "\\s+")));
}

assert.match(actions, /assignPendingCompetitionRosterSplitMemberAction/);
assert.match(actions, /setCompetitionRosterExclusionInlineAction/);
assert.match(actions, /setCompetitionRosterManualMemberInlineAction/);
assert.match(actions, /isSportsDirector/);
assert.match(actions, /canAccessCampus/);

assert.match(query, /eligibleSquads/);
assert.match(query, /exceptionCandidates/);
assert.match(query, /excludedPlayers/);
assert.match(query, /manualHelpers/);
assert.match(controls, /Asignar a \$\{player\.playerName\}/);
assert.match(controls, /Excluir confirmado/);
assert.match(controls, /Reintegrar excluido/);
assert.match(controls, /Agregar refuerzo/);
assert.match(controls, /Retirar refuerzo/);
assert.match(liveView, /CompetitionRosterLiveControls/);
assert.match(liveView, /data\.canManage/);

console.log("competition roster live controls regression assertions passed");
