import assert from "node:assert/strict";

const { getAttendanceRiskTier } = await import("../src/lib/attendance/risk.ts");

function tier(input) {
  return getAttendanceRiskTier(input, "2026-06-24");
}

assert.equal(tier({ absenceStreak: 3, daysSinceLastAttendance: 7 }), "three_absences");
assert.equal(tier({ absenceStreak: 4, daysSinceLastAttendance: 10 }), "four_plus_absences");
assert.equal(tier({ absenceStreak: 2, daysSinceLastAttendance: 31 }), "inactive_30_days");
assert.equal(tier({ absenceStreak: 3, daysSinceLastAttendance: 61 }), "inactive_60_days");
assert.equal(tier({ absenceStreak: 2, daysSinceLastAttendance: 10 }), null);
assert.equal(tier({ absenceStreak: 6, daysSinceLastAttendance: null }), "four_plus_absences");

console.log("Attendance risk tier assertions passed.");
