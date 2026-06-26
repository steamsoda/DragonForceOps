import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const files = [
  "src/lib/queries/attendance.ts",
  "src/components/attendance/attendance-recorder.tsx",
  "src/components/attendance/player-attendance-summary.tsx",
  "src/components/attendance/recent-attendance-chips.tsx",
  "src/app/(protected)/attendance/reports/page.tsx",
  "src/app/(protected)/attendance/groups/page.tsx",
];

for (const file of files) {
  const source = readFileSync(file, "utf8");
  assert.match(source, /A Asistió/, `${file} should use A Asistió`);
  assert.match(source, /F Falta/, `${file} should use F Falta`);
  assert.match(source, /Lesión/, `${file} should use Lesión with accent`);
  assert.doesNotMatch(source, /A Asistio/, `${file} should not use unaccented A Asistio`);
  assert.doesNotMatch(source, /Lesion(?!ado)/, `${file} should not use unaccented Lesion`);
}

const reports = readFileSync("src/app/(protected)/attendance/reports/page.tsx", "utf8");
const groups = readFileSync("src/app/(protected)/attendance/groups/page.tsx", "utf8");

assert.doesNotMatch(reports, /Ausencias/, "reports page should use Faltas instead of Ausencias");
assert.doesNotMatch(groups, /Aus\./, "groups page should not abbreviate absences as Aus.");
assert.doesNotMatch(groups, /Ausencias/, "groups page should use Faltas instead of Ausencias");

console.log("Attendance nomenclature assertions passed.");
