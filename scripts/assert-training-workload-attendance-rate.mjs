import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [migration, query, page] = await Promise.all([
  readFile("supabase/migrations/20260806010000_training_workload_attendance_rate.sql", "utf8"),
  readFile("src/lib/queries/training-workload-report.ts", "utf8"),
  readFile("src/app/(protected)/reports/carga-entrenamiento/page.tsx", "utf8"),
]);

assert.match(migration, /count\(\*\) filter \(where records\.status = 'present'\)/);
assert.match(migration, /count\(\*\)::bigint as official_roster_count/);
assert.match(migration, /when sessions\.status = 'completed' then coalesce\(official\.official_roster_count, 0\)/);
assert.match(migration, /security invoker/);
assert.match(migration, /revoke all on function public\.get_training_workload_30d\(uuid, timestamptz\) from authenticated/);
assert.match(migration, /grant execute on function public\.get_training_workload_30d\(uuid, timestamptz\) to service_role/);

assert.match(query, /official_roster_count/);
assert.match(query, /attendanceRate: rosterTotal > 0/);
assert.match(query, /Record<string, TrainingWorkloadSessionCell\[\]>/);
assert.match(query, /cells\[key\] = \[\.\.\.\(cells\[key\] \?\? \[\]\), cell\]/);

assert.match(page, /href=\{`\/attendance\/sessions\/\$\{cell\.sessionId\}`\}/);
assert.match(page, /title="Promedios de asistencia por coach"/);
assert.match(page, /%<br \/>asistencia/);
assert.doesNotMatch(page, /Historial legado|Sin snapshot|Exactas:/);

console.log("Training workload attendance-rate assertions passed.");
