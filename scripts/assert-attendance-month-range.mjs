import assert from "node:assert/strict";

const { resolveAttendanceMonthRange } = await import("../src/lib/attendance/month-range.ts");

assert.deepEqual(
  resolveAttendanceMonthRange({ currentMonth: "2026-07" }),
  { monthFrom: "2026-07", monthTo: "2026-07", error: null },
  "The current month must remain the default single-month view.",
);
assert.deepEqual(
  resolveAttendanceMonthRange({ month: "2026-06", currentMonth: "2026-07" }),
  { monthFrom: "2026-06", monthTo: "2026-06", error: null },
  "Legacy month links must remain compatible.",
);
assert.deepEqual(
  resolveAttendanceMonthRange({ monthFrom: "2026-05", monthTo: "2026-07", currentMonth: "2026-07" }),
  { monthFrom: "2026-05", monthTo: "2026-07", error: null },
  "Three consecutive months must be accepted.",
);
assert.match(
  resolveAttendanceMonthRange({ monthFrom: "2026-04", monthTo: "2026-07", currentMonth: "2026-07" }).error ?? "",
  /máximo es de 3 meses/,
  "Four months must be rejected.",
);
assert.match(
  resolveAttendanceMonthRange({ monthFrom: "2026-07", monthTo: "2026-06", currentMonth: "2026-07" }).error ?? "",
  /no puede ser anterior/,
  "A reversed month range must be rejected.",
);
assert.deepEqual(
  resolveAttendanceMonthRange({ monthFrom: "2026-11", monthTo: "2027-01", currentMonth: "2026-07" }),
  { monthFrom: "2026-11", monthTo: "2027-01", error: null },
  "Three-month ranges must work across year boundaries.",
);

console.log("Attendance month range assertions passed.");
