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

assert.match(cajaActions, /attendanceRisk: PlayerAttendanceRisk \| null/, "Caja enrollment payload should expose attendance risk.");
assert.match(cajaActions, /getCajaAttendanceRisk/, "Caja should load attendance risk through a local helper.");
assert.match(cajaActions, /console\.warn\("Caja attendance risk lookup failed"/, "Caja attendance risk lookup should be non-blocking.");
assert.match(cajaClient, /AttendanceRiskBadge/, "Caja should render the shared attendance risk badge.");
assert.match(cajaClient, /function CajaAttendanceSignals/, "Caja should centralize attendance signals for payment panels.");

console.log("Attendance risk tier assertions passed.");
