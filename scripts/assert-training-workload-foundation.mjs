import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(
  "supabase/migrations/20260805210000_training_workload_report_foundation.sql",
  "utf8",
);

assert.match(migration, /add column if not exists coach_snapshot jsonb/);
assert.match(migration, /coach_snapshot_source in \('creation', 'completion', 'legacy_backfill_current_assignment'\)/);
assert.match(migration, /create trigger trg_attendance_sessions_coach_snapshot/);
assert.match(migration, /new\.status = 'completed' and old\.status is distinct from 'completed'/);
assert.match(migration, /coach_snapshot_source = 'legacy_backfill_current_assignment'/);

assert.match(migration, /create or replace function public\.get_training_workload_30d/);
assert.match(migration, /at time zone 'America\/Monterrey'/);
assert.match(migration, /sessions\.session_date between \(params\.local_date - 29\) and params\.local_date/);
assert.match(migration, /sessions\.status <> 'cancelled'/);
assert.match(migration, /records\.status = 'present'/);
assert.match(migration, /from public\.trial_visits visits/);
assert.match(migration, /counts\.official_attended_count \+ counts\.tryout_count/);
assert.match(migration, /filter \(where counts\.status = 'completed'\)/);
assert.match(migration, /unregistered_session_count/);
assert.match(migration, /security invoker/);
assert.match(migration, /revoke all on function public\.get_training_workload_30d\(uuid, timestamptz\) from anon/);
assert.match(migration, /grant execute on function public\.get_training_workload_30d\(uuid, timestamptz\) to authenticated/);

assert.doesNotMatch(
  migration,
  /from public\.(charges|payments|payment_allocations|account_credits)/,
  "Training workload reporting must not read finance tables.",
);

console.log("Training workload foundation assertions passed.");
