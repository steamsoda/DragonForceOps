import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const migration = read("supabase/migrations/20260812143000_move_competition_roster_member.sql");
const actions = read("src/server/actions/competition-rosters.ts");
const liveView = read("src/components/sports/competition-roster-live-view.tsx");

assert.match(migration, /create or replace function public\.move_competition_roster_member/i);
assert.match(migration, /security invoker/i);
assert.match(migration, /set search_path = public/i);
assert.match(migration, /can_access_sports_campus\(v_tournament\.campus_id\)/i);
assert.match(migration, /v_source_squad\.tournament_id <> p_tournament_id/i);
assert.match(migration, /v_destination_squad\.tournament_id <> p_tournament_id/i);
assert.match(migration, /v_source_squad\.program is distinct from p_program/i);
assert.match(migration, /v_destination_squad\.program is distinct from p_program/i);
assert.match(migration, /competition_roster_move_destination_duplicate/i);
assert.match(migration, /delete from public\.competition_roster_squad_members[\s\S]*where id = v_member\.id/i);
assert.match(migration, /insert into public\.competition_roster_squad_members[\s\S]*v_member\.source[\s\S]*v_member\.reason/i);
assert.match(migration, /'squad\.member_moved'/i);
assert.match(migration, /'source_squad_id'[\s\S]*'destination_squad_id'/i);
assert.match(migration, /revoke all[\s\S]*from public, anon/i);
assert.match(migration, /grant execute[\s\S]*to authenticated/i);

for (const forbidden of [
  "insert into public.payments",
  "update public.payments",
  "delete from public.payments",
  "insert into public.charges",
  "update public.charges",
  "delete from public.charges",
  "insert into public.payment_allocations",
  "update public.payment_allocations",
  "delete from public.payment_allocations",
  "insert into public.tournament_player_entries",
  "update public.tournament_player_entries",
  "delete from public.tournament_player_entries",
  "update public.enrollments",
  "insert into public.training_group_assignments",
  "update public.training_group_assignments",
  "delete from public.training_group_assignments",
  "insert into public.attendance_records",
  "update public.attendance_records",
  "delete from public.attendance_records",
  "insert into public.competition_roster_snapshots",
  "update public.competition_roster_snapshots",
  "delete from public.competition_roster_snapshots",
]) {
  assert.doesNotMatch(migration.toLowerCase(), new RegExp(forbidden.replaceAll(" ", "\\s+")));
}

assert.match(actions, /moveCompetitionRosterMemberInlineAction/);
assert.match(actions, /inlineManagerContext\(\{ tournamentId, campusId, program \}\)/);
assert.match(actions, /rpc\("move_competition_roster_member"/);
assert.match(actions, /p_source_squad_id: sourceSquadId/);
assert.match(actions, /p_destination_squad_id: destinationSquadId/);

assert.match(liveView, /Editar jugadores/);
assert.match(liveView, /draggable=\{editMode && movingEnrollmentId === null\}/);
assert.match(liveView, /onDrop=/);
assert.match(liveView, /Mover a\.\.\./);
assert.match(liveView, /const previousData = data/);
assert.match(liveView, /setData\(previousData\)/);
assert.match(liveView, /data\.canManage && data\.squads\.length > 1/);
assert.match(liveView, /members: \[\.\.\.squad\.members, member\]\.sort/);

console.log("competition roster member move regression assertions passed");
