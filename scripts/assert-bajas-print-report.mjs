import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync("src/app/(protected)/players/page.tsx", "utf8");
const query = readFileSync("src/lib/queries/players.ts", "utf8");
const button = readFileSync("src/components/players/baja-print-button.tsx", "utf8");

assert.match(page, /function BajaPrintReport/, "Players page should define the Bajas print report.");
assert.match(page, /<BajaPrintButton \/>/, "Bajas view should expose a direct print action.");
assert.match(page, /hidden print:block/, "Bajas print report should be print-only.");
assert.match(page, /print:hidden/, "Normal players UI should be hidden while printing.");
assert.match(page, /Campus/, "Bajas print list should include campus.");
assert.match(page, /Cat\./, "Bajas print list should include YOB/category.");
assert.match(page, /Fecha baja/, "Bajas print list should include dropout date.");
assert.match(page, /includeAllRows: true/, "Bajas print list should request all filtered rows.");
assert.match(button, /Imprimir lista/, "Bajas print button should be clearly labeled.");
assert.match(button, /window\.print\(\)/, "Bajas print button should trigger browser print.");

assert.match(query, /includeAllRows\?: boolean/, "Bajas query should support a complete print result.");
assert.match(query, /birth_date/, "Bajas query should include birth date for YOB sorting.");
assert.match(query, /campusCompare/, "Bajas query should sort by campus first.");
assert.match(query, /yearCompare/, "Bajas query should sort by YOB second.");
assert.match(query, /nameCompare/, "Bajas query should sort alphabetically third.");
assert.match(query, /end_date/, "Bajas query should retain dropout date for final sort and display.");

console.log("Bajas print report assertions passed.");
