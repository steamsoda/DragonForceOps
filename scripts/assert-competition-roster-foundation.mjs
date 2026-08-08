import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { summarizeCompetitionRosterState } from "../src/lib/competition-rosters/foundation.ts";

const migration = await readFile(
  "supabase/migrations/20260807120000_competition_roster_squad_foundation.sql",
  "utf8",
);
const query = await readFile("src/lib/queries/competition-rosters.ts", "utf8");

for (const table of [
  "competition_roster_squads",
  "competition_roster_squad_groups",
  "competition_roster_squad_members",
  "competition_roster_exclusions",
  "competition_roster_snapshots",
  "competition_roster_snapshot_squads",
  "competition_roster_snapshot_members",
  "competition_roster_events",
]) {
  assert.match(migration, new RegExp(`create table if not exists public\\.${table}`));
  assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`));
  assert.match(migration, new RegExp(`revoke all on public\\.${table} from public, anon`));
}

assert.match(migration, /squad_kind in \('single', 'azul', 'blanco', 'custom'\)/);
assert.match(migration, /references public\.training_groups\(id\)/);
assert.match(migration, /references public\.enrollments\(id\)/);
assert.doesNotMatch(migration, /references public\.teams\(id\)/);
assert.match(migration, /competition_roster_member_is_excluded/);
assert.match(migration, /competition_roster_campus_mismatch/);
assert.match(migration, /for select to authenticated[\s\S]*public\.can_access_campus/);
assert.match(migration, /for all to authenticated[\s\S]*public\.can_access_sports_campus/);
assert.match(query, /from\("tournament_player_entries"\)/);
assert.match(query, /\.eq\("entry_status", "confirmed"\)/);
assert.doesNotMatch(query, /from\("(?:charges|payments|payment_allocations|teams|team_assignments)"\)/);

assert.deepEqual(
  summarizeCompetitionRosterState({
    candidateEnrollmentIds: ["paid-assigned", "paid-pending", "paid-excluded"],
    memberRows: [
      { enrollmentId: "paid-assigned", source: "paid" },
      { enrollmentId: "manual-helper", source: "manual" },
      { enrollmentId: "paid-assigned", source: "paid" },
    ],
    excludedEnrollmentIds: ["paid-excluded"],
  }),
  {
    assignedCandidateEnrollmentIds: ["paid-assigned"],
    pendingCandidateEnrollmentIds: ["paid-pending"],
    manualMemberEnrollmentIds: ["manual-helper"],
  },
);

console.log("Competition roster foundation assertions passed.");
