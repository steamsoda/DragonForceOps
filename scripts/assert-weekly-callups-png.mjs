import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [layout, exportButton, editorPage, pngData, pngRoute, dashboard] = await Promise.all([
  readFile("src/lib/weekly-callups/png-layout.ts", "utf8"),
  readFile("src/components/weekly-callups/png-export-button.tsx", "utf8"),
  readFile("src/app/(protected)/convocatorias/[callupId]/page.tsx", "utf8"),
  readFile("src/lib/weekly-callups/png-data.ts", "utf8"),
  readFile("src/app/api/weekly-callups/[callupId]/png-data/route.ts", "utf8"),
  readFile("src/components/weekly-callups/current-week-dashboard.tsx", "utf8"),
]);

assert.match(layout, /export function buildWeeklyCallupPngSvg/);
assert.doesNotMatch(layout, /BORRADOR|Lista generada desde INVICTA/);
assert.match(layout, /DESCANSA/);
assert.match(layout, /PARTIDO PENDIENTE DE CAPTURAR/);
assert.match(layout, /category\.players\.length/);
assert.match(layout, /category\.games\.map\(\(game\) => renderGame\(game, density\.compact\)\)/);
assert.match(layout, /distributeCategoriesInReadingOrder/);
assert.match(layout, /partitionStarts/);
assert.match(layout, /categories\.slice\(range\.start, range\.end\)/);
assert.match(layout, /categoryCount >= 11 \? 5/);
assert.match(layout, /estimateLineCount/);
assert.match(layout, /totalPlayers > 180/);

assert.match(exportButton, /canvas\.toBlob/);
assert.match(exportButton, /URL\.createObjectURL/);
assert.match(exportButton, /maxCanvasPixels = 32_000_000/);
assert.match(exportButton, /maxCanvasDimension = 16_000/);
assert.match(exportButton, /Descargar imagen/);
assert.doesNotMatch(exportButton, /data\.status|borrador/i);

assert.match(editorPage, /WeeklyCallupPngExportButton/);
assert.match(editorPage, /buildWeeklyCallupPngData\(callup\)/);
assert.match(pngData, /player\.rosterStatus === "included"/);
assert.match(pngData, /tournamentName: packetTitle/);
assert.match(pngData, /tournamentName: category\.tournamentName/);
assert.match(pngData, /coachNames: category\.coachNames/);
assert.match(pngData, /games: category\.games\.map/);
assert.match(pngRoute, /getWeeklyCallupDetail/);
assert.match(pngRoute, /buildWeeklyCallupPngData/);
assert.match(pngRoute, /private, no-store/);
assert.match(dashboard, /downloadWeeklyCallupPng/);
assert.match(dashboard, /\/api\/weekly-callups\/\$\{encodeURIComponent\(callupId\)\}\/png-data/);

for (const source of [layout, exportButton, editorPage, pngData, pngRoute, dashboard]) {
  assert.doesNotMatch(source, /from\("(?:charges|payments|payment_allocations|attendance_records)"\)/);
}

console.log("weekly callups PNG assertions passed");
