import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const attendance = await readFile("src/lib/queries/attendance.ts", "utf8");
const dashboard = await readFile("src/lib/queries/dashboard.ts", "utf8");
const page = await readFile("src/app/(protected)/dashboard/page.tsx", "utf8");

assert.match(attendance, /export async function getMonthlyAttendanceParticipation/);
assert.match(attendance, /\.from\("enrollments"\)[\s\S]*?\.eq\("status", "active"\)/);
assert.match(attendance, /\.from\("attendance_sessions"\)[\s\S]*?\.eq\("status", "completed"\)[\s\S]*?monthBounds\.periodMonth/);
assert.match(attendance, /\.from\("attendance_records"\)[\s\S]*?\.eq\("status", "present"\)/);
assert.match(attendance, /new Set<string>\(\)/, "Player counts must be deduplicated.");
assert.match(attendance, /\.range\(from, from \+ ATTENDANCE_RECORD_PAGE_SIZE - 1\)/, "Large result sets must be paginated.");
assert.match(attendance, /\.order\("id", \{ ascending: true \}\)/, "Pagination must use a stable unique order.");
assert.match(dashboard, /getMonthlyAttendanceParticipation\(\{ campusId: filters\.campusId, month: data\.selected_month \}\)/);
assert.match(page, /<AttendanceParticipationPie[\s\S]*?selectedMonth=\{dashboard\.selectedMonth\}/);

console.log("Dashboard attendance participation assertions passed.");
