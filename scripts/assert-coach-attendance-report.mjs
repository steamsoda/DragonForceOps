import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const query = await readFile("src/lib/queries/coach-attendance-report.ts", "utf8");
const page = await readFile("src/app/(protected)/reports/asistencia-coaches/page.tsx", "utf8");
const layout = await readFile("src/app/(protected)/layout.tsx", "utf8");
const charts = await readFile("src/components/reports/coach-attendance-charts.tsx", "utf8");

assert.match(query, /\.from\("training_group_assignments"\)[\s\S]*?\.is\("end_date", null\)/, "Report must use the current active roster.");
assert.match(query, /\.eq\("training_groups\.status", "active"\)/);
assert.match(query, /\.eq\("enrollments\.status", "active"\)/);
assert.match(query, /\.from\("attendance_sessions"\)[\s\S]*?\.eq\("status", "completed"\)/, "Only completed sessions may evaluate players.");
assert.match(query, /\.from\("attendance_records"\)[\s\S]*?\.eq\("status", "present"\)/, "Only confirmed attendance counts as participation.");
assert.match(query, /evaluated: completedSessions > 0/);
assert.match(query, /row\.is_primary \? "Principal" : "Auxiliar"/);
assert.match(query, /campusSections/);
assert.match(query, /birthYears/);
assert.match(query, /\.range\(from, from \+ PAGE_SIZE - 1\)/, "Large report reads must be paginated.");

for (const forbidden of [/\.insert\(/, /\.update\(/, /\.upsert\(/, /\.delete\(/]) {
  assert.doesNotMatch(query, forbidden, "Coach attendance report must remain read-only.");
}
assert.doesNotMatch(query, /finance|charge|payment|allocation/i, "Coach report must not load finance data.");

assert.match(page, /requireAttendanceReadContext/);
assert.match(page, /CoachAttendanceCharts/);
assert.match(page, /CoachAttendancePrintButton/);
assert.match(page, /Los grupos sin sesiones completadas quedan fuera del porcentaje/);
assert.doesNotMatch(page, />Evaluados<\/th>/, "The coach summary table should not expose the internal denominator column.");
assert.match(page, /Plantel asignado/);
assert.match(page, /Total general/);
assert.match(page, /Jugadores unicos, sin duplicar coaches compartidos/);
assert.match(page, /data\.totals\.participationRate/);
assert.match(charts, /Con asistencia \{coach\.participation\}%/);
assert.match(charts, /Sin asistencia \{coach\.nonParticipation\}%/);
assert.match(charts, /100 - participation/);
assert.match(layout, /\/reports\/asistencia-coaches/);

console.log("Coach attendance report assertions passed.");
