import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile("supabase/migrations/20260827100000_weekly_attendance_frequency_report.sql", "utf8");
const query = await readFile("src/lib/queries/weekly-attendance-frequency-report.ts", "utf8");
const page = await readFile("src/app/(protected)/reports/frecuencia-semanal/page.tsx", "utf8");
const chart = await readFile("src/components/reports/weekly-attendance-frequency-chart.tsx", "utf8");
const layout = await readFile("src/app/(protected)/layout.tsx", "utf8");

assert.match(migration, /create or replace function public\.get_weekly_attendance_frequency_v1/);
assert.match(migration, /at time zone 'America\/Monterrey'/);
assert.match(migration, /extract\(isodow from local_date\)/);
assert.match(migration, /sessions\.status = 'completed'/);
assert.match(migration, /sessions\.session_type = 'training'/);
assert.match(migration, /sessions\.session_date < bounds\.current_week_start/);
assert.match(migration, /records\.status = 'present'/);
assert.match(migration, /count\(\*\) filter \(where counts\.attended_count = 0\)/);
assert.match(migration, /count\(\*\) filter \(where counts\.attended_count >= 4\)/);
assert.match(migration, /security invoker/);
assert.match(migration, /revoke all on function public\.get_weekly_attendance_frequency_v1\(uuid, integer, timestamptz\) from anon/);
assert.match(migration, /grant execute on function public\.get_weekly_attendance_frequency_v1\(uuid, integer, timestamptz\) to authenticated/);
assert.doesNotMatch(migration, /from public\.(charges|payments|payment_allocations|trial_visits)/, "Frequency reporting must not read finance or tryout data.");
assert.doesNotMatch(migration, /\b(insert|update|delete)\b\s+(into|public\.)/i, "Frequency reporting must remain read-only.");

assert.match(query, /WEEK_COUNT = 8/);
assert.match(query, /getAttendanceCampusAccess/);
assert.match(query, /canAccessAttendanceCampus/);
assert.match(query, /createAdminClient/);
assert.doesNotMatch(query, /createClient/);
assert.match(query, /get_weekly_attendance_frequency_v1/);
assert.match(query, /getMonterreyWeekBounds/);
assert.match(query, /Array\.from\(\{ length: WEEK_COUNT \}/);
assert.match(query, /averageSessionsAttended/);
assert.match(query, /attendanceRate/);

assert.match(page, /requireAttendanceReadContext/);
assert.match(page, /WeeklyAttendanceFrequencyChart/);
assert.match(page, /Frecuencia semanal de asistencia/);
assert.match(page, /0<\/th>/);
assert.match(page, /4\+<\/th>/);
assert.match(page, /sesiones canceladas, sesiones sin registrar y clases de prueba no alteran este reporte/);
assert.match(chart, /stackId="frequency"/);
assert.match(chart, /domain=\{\[0, 100\]\}/);
assert.match(layout, /\/reports\/frecuencia-semanal/);

console.log("Weekly attendance frequency report assertions passed.");
