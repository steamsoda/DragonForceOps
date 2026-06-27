import assert from "node:assert/strict";

const { getAttendanceRiskTier } = await import("../src/lib/attendance/risk.ts");
const fs = await import("node:fs/promises");

function tier(input) {
  return getAttendanceRiskTier(input, "2026-06-24");
}

assert.equal(tier({ absenceStreak: 3, daysSinceLastAttendance: 7 }), "three_absences");
assert.equal(tier({ absenceStreak: 4, daysSinceLastAttendance: 10 }), "four_plus_absences");
assert.equal(tier({ absenceStreak: 2, daysSinceLastAttendance: 31 }), "inactive_30_days");
assert.equal(tier({ absenceStreak: 3, daysSinceLastAttendance: 61 }), "inactive_60_days");
assert.equal(tier({ absenceStreak: 2, daysSinceLastAttendance: 10 }), null);
assert.equal(tier({ absenceStreak: 6, daysSinceLastAttendance: null }), "four_plus_absences");

const cajaActions = await fs.readFile("src/server/actions/caja.ts", "utf8");
const cajaClient = await fs.readFile("src/components/caja/caja-client.tsx", "utf8");
const attendanceReportsPage = await fs.readFile("src/app/(protected)/attendance/reports/page.tsx", "utf8");
const collectionsRiskQuery = await fs.readFile("src/lib/queries/attendance-collections-risk.ts", "utf8");

assert.match(cajaActions, /attendanceRisk: PlayerAttendanceRisk \| null/, "Caja enrollment payload should expose attendance risk.");
assert.match(cajaActions, /getCajaAttendanceRisk/, "Caja should load attendance risk through a local helper.");
assert.match(cajaActions, /console\.warn\("Caja attendance risk lookup failed"/, "Caja attendance risk lookup should be non-blocking.");
assert.match(cajaClient, /AttendanceRiskBadge/, "Caja should render the shared attendance risk badge.");
assert.match(cajaClient, /function CajaAttendanceSignals/, "Caja should centralize attendance signals for payment panels.");
assert.match(attendanceReportsPage, /context\.hasOperationalAccess/, "Attendance reports collections risk section should be operational-role gated.");
assert.match(attendanceReportsPage, /getAttendanceCollectionsRiskReport/, "Attendance reports should load the collections risk relation report.");
assert.match(attendanceReportsPage, /RecentAttendanceChips/, "Attendance reports relation rows should reuse recent attendance chips.");
assert.match(attendanceReportsPage, /AttendanceRiskBadge/, "Attendance reports relation rows should reuse the shared risk badge.");
assert.match(collectionsRiskQuery, /getPendingTuitionDashboardData/, "Collections risk report should reuse the existing pending-tuition source.");
assert.match(collectionsRiskQuery, /getOperationalCampusAccess/, "Collections risk query should enforce operational campus scope.");
assert.doesNotMatch(collectionsRiskQuery, /amount/i, "Collections risk report should avoid exposing money amounts.");

console.log("Attendance risk tier assertions passed.");
