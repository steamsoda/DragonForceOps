import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync("src/lib/queries/attendance.ts", "utf8");

assert.match(
  source,
  /async function fetchAttendanceRecordsBySessionIds/,
  "attendance group monthly report should use a dedicated paginated record fetcher",
);
assert.match(
  source,
  /ATTENDANCE_RECORD_PAGE_SIZE = 1000/,
  "attendance record fetcher should document the PostgREST page size boundary",
);
assert.match(
  source,
  /\.range\(from, to\)/,
  "attendance record fetcher should page through records with range(from, to)",
);
assert.match(
  source,
  /fetchAttendanceRecordsBySessionIds\(admin, sessionIds\)/,
  "group monthly report should call the paginated attendance record fetcher",
);

console.log("Attendance group monthly pagination assertions passed.");
