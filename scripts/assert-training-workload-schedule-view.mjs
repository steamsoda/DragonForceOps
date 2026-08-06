import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [page, query, printButton] = await Promise.all([
  readFile("src/app/(protected)/reports/carga-entrenamiento/page.tsx", "utf8"),
  readFile("src/lib/queries/training-workload-report.ts", "utf8"),
  readFile("src/components/reports/training-workload-print-button.tsx", "utf8"),
]);

assert.match(query, /TrainingWorkloadScheduleSection/);
assert.match(query, /scheduleSections/);
assert.match(query, /Bloque previo/);
assert.match(query, /Bloque 16:00-17:10/);
assert.match(query, /Bloque 17:20-18:30/);
assert.match(query, /Bloque 18:40-19:50/);
assert.match(query, /Bloque 20:00-21:10/);
assert.match(query, /Horario especial/);
assert.match(query, /groupKey = `\$\{row\.training_group_id\}.*\$\{unit\.key\}`/s);

assert.match(page, /params\.mode === "schedule"/);
assert.match(page, /data\.scheduleSections\.map/);
assert.match(page, />Por coach</);
assert.match(page, />Por horario</);
assert.match(page, /params=\{\{ mode \}\}/);
assert.match(page, /mode === "coach" \? group\.scheduleLabel : group\.coachUnitName/);
assert.match(page, /@page \{ size: landscape; margin: 7mm; \}/);
assert.match(page, /TrainingWorkloadPrintButton/);
assert.match(printButton, /window\.print\(\)/);

console.log("Training workload schedule-view assertions passed.");
