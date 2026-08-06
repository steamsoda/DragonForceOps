import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [layout, exportButton, editorPage] = await Promise.all([
  readFile("src/lib/weekly-callups/png-layout.ts", "utf8"),
  readFile("src/components/weekly-callups/png-export-button.tsx", "utf8"),
  readFile("src/app/(protected)/convocatorias/[callupId]/page.tsx", "utf8"),
]);

assert.match(layout, /export function buildWeeklyCallupPngSvg/);
assert.match(layout, /BORRADOR/);
assert.match(layout, /DESCANSA/);
assert.match(layout, /PARTIDO PENDIENTE DE CAPTURAR/);
assert.match(layout, /category\.players\.length/);
assert.match(layout, /category\.games\.map\(renderGame\)/);

assert.match(exportButton, /canvas\.toBlob/);
assert.match(exportButton, /URL\.createObjectURL/);
assert.match(exportButton, /Descargar imagen/);
assert.match(exportButton, /data\.status === "draft"/);

assert.match(editorPage, /WeeklyCallupPngExportButton/);
assert.match(editorPage, /player\.rosterStatus === "included"/);
assert.match(editorPage, /tournamentName: callup\.tournamentName/);
assert.match(editorPage, /games: category\.games\.map/);

for (const source of [layout, exportButton, editorPage]) {
  assert.doesNotMatch(source, /from\("(?:charges|payments|payment_allocations|attendance_records)"\)/);
}

console.log("weekly callups PNG assertions passed");
