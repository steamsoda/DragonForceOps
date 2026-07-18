import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const route = await readFile("src/app/api/exports/sports-signups/route.ts", "utf8");
const workbook = await readFile("src/lib/exports/sports-signups-workbook.ts", "utf8");
const board = await readFile("src/components/sports/sports-signups-board.tsx", "utf8");
const page = await readFile("src/app/(protected)/sports-signups/page.tsx", "utf8");
const query = await readFile("src/lib/queries/sports-signups.ts", "utf8");

assert.match(route, /buildSportsSignupsWorkbook/);
assert.match(route, /application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet/);
assert.match(route, /\.xlsx`/);
assert.match(route, /hasOperationalAccess && !permissionContext\.hasSportsAccess/);
assert.match(workbook, /paidDateFilter/);
assert.match(workbook, /Equipo base/);
assert.match(board, /Exportar Excel/);
assert.match(board, /paidFilterQuery/);
assert.match(page, /hasOperationalAccess \|\| permissionContext\.hasSportsAccess/);
assert.match(query, /confirmedChargeByEnrollment = new Map/);
assert.match(query, /getCompetitionBucketIds\(charge, productBucketIds, bundleEntitlements\)/);

console.log("Sports signups Excel export assertions passed.");
