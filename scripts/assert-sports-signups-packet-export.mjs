import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const layout = await readFile("src/lib/sports-signups/png-layout.ts", "utf8");
const exportControl = await readFile("src/components/sports/sports-signups-packet-export.tsx", "utf8");
const board = await readFile("src/components/sports/sports-signups-board.tsx", "utf8");
const workbook = await readFile("src/lib/exports/sports-signups-workbook.ts", "utf8");
const query = await readFile("src/lib/queries/sports-signups.ts", "utf8");

assert.match(layout, /buildSportsSignupPacketPngSvg/);
assert.match(layout, /group\.players\.length > 0/);
assert.match(layout, /No hay jugadores confirmados con estos filtros/);
assert.match(layout, /Jugadores confirmados/);
assert.match(layout, /compactPlayerName/);
assert.match(layout, /Math\.abs\(Math\.log\(width \/ height\)\)/);
assert.match(layout, /estimateGroupHeight/);
assert.match(layout, /bottom reserve/);
assert.match(exportControl, /competition\.trainingGroups/);
assert.match(exportControl, /player\.enrollmentId/);
assert.match(exportControl, /canvas\.toBlob/);
assert.match(exportControl, /Exportar PNG completo/);
assert.match(board, /SportsSignupsPacketExport/);
assert.match(board, /paidFilterLabel \?\? "Todos los pagos confirmados"/);
assert.match(workbook, /groupRowsByCampusProgramAndTrainingGroup/);
assert.match(workbook, /programGroup\.trainingGroups/);
assert.match(workbook, /data\.selectedProgramLabel/);
assert.match(query, /selectedProgramLabel/);
assert.doesNotMatch(exportControl, /from\("charges"\)|from\("payments"\)|insert\(|update\(|delete\(/);

console.log("Sports signups packet export assertions passed.");
