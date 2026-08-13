import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const migration = read("supabase/migrations/20260813150000_close_stale_training_group_assignments.sql");
const query = read("src/lib/queries/training-groups.ts");

assert.match(migration, /create or replace function public\.close_training_group_assignment_on_enrollment_end/);
assert.match(migration, /after update of status, end_date on public\.enrollments/);
assert.match(migration, /enrollment\.status in \('ended', 'cancelled'\)/);
assert.match(migration, /assignment\.end_date is null/);
assert.match(migration, /greatest\(assignment\.start_date, v_end_date\)/);
assert.match(migration, /v_active_count <> 0/);
assert.match(migration, /set status = 'inactive'/);
assert.doesNotMatch(migration, /delete from public\.(?:training_group_assignments|attendance_records|attendance_sessions)/i);
assert.match(query, /enrollments!inner\(status\)/);
assert.match(query, /\.eq\("enrollments\.status", "active"\)/);

console.log("training group lifecycle regression assertions passed");
