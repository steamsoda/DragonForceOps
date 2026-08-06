import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [permissions, layout, page, query, migration] = await Promise.all([
  readFile("src/lib/auth/permissions.ts", "utf8"),
  readFile("src/app/(protected)/layout.tsx", "utf8"),
  readFile("src/app/(protected)/reports/carga-entrenamiento/page.tsx", "utf8"),
  readFile("src/lib/queries/training-workload-report.ts", "utf8"),
  readFile("supabase/migrations/20260805210000_training_workload_report_foundation.sql", "utf8"),
]);

assert.match(
  permissions,
  /hasAttendanceReadAccess: isDirector \|\| isSportsDirector \|\| isAttendanceAdmin \|\| isFrontDesk \|\| isOfficeAdmin/,
);
assert.match(page, /requireAttendanceReadContext\("\/unauthorized"\)/);
assert.match(layout, /FRONT_DESK_REPORTES_SECTION[\s\S]*\/reports\/carga-entrenamiento/);
assert.match(layout, /DIRECTOR_REPORTES_SECTION[\s\S]*\/reports\/carga-entrenamiento/);
assert.match(layout, /ATTENDANCE_REPORTES_SECTION[\s\S]*\/reports\/carga-entrenamiento/);

assert.match(query, /getAttendanceCampusAccess\(\)/);
assert.match(query, /canAccessAttendanceCampus\(access, filters\.campusId\)/);
assert.match(query, /exactSnapshotSessions/);
assert.match(query, /missingSnapshotSessions/);
assert.doesNotMatch(page, /Historial legado|Calidad del historial de coaches|Sin snapshot|Exactas:/);

for (const source of [page, query, migration]) {
  assert.doesNotMatch(
    source,
    /(?:from|\.from)\s*\(?["']?(?:public\.)?(?:charges|payments|payment_allocations|account_credits)["']?/,
    "Training workload reporting must not read finance tables.",
  );
}

console.log("Training workload role and snapshot-monitoring assertions passed.");
