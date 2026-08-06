import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [action, query, editorPage, listPage] = await Promise.all([
  readFile("src/server/actions/weekly-callups.ts", "utf8"),
  readFile("src/lib/queries/weekly-callups.ts", "utf8"),
  readFile("src/app/(protected)/convocatorias/[callupId]/page.tsx", "utf8"),
  readFile("src/app/(protected)/convocatorias/page.tsx", "utf8"),
]);

assert.match(query, /export async function getWeeklyCallupDetail/);
assert.match(query, /for \(let offset = 0; ; offset \+= pageSize\)/);
assert.match(query, /\.range\(offset, offset \+ pageSize - 1\)/);
assert.match(query, /campusAccess\.campusIds\.includes\(callup\.campus_id\)/);

for (const actionName of [
  "saveWeeklyCallupGameAction",
  "deleteWeeklyCallupGameAction",
  "toggleWeeklyCallupRestAction",
  "toggleWeeklyCallupPlayerAction",
  "moveWeeklyCallupCategoryAction",
  "moveWeeklyCallupGameAction",
  "deleteWeeklyCallupAction",
]) {
  assert.match(action, new RegExp(`export async function ${actionName}`));
}

assert.match(action, /context\.campusAccess\?\.campusIds/);
assert.match(action, /dateWithinWeek\(matchDate, editable\.callup\.week_start\)/);
assert.match(action, /remove_games_before_rest/);
assert.match(action, /roster_status: rosterStatus/);
assert.match(action, /keepCallupReady/);
assert.match(action, /weekly_callups\.deleted/);
assert.match(action, /context\.isSportsDirector/);
assert.doesNotMatch(action, /from\("(?:charges|payments|payment_allocations|attendance_records)"\)/);
assert.doesNotMatch(query, /from\("(?:charges|payments|payment_allocations|attendance_records)"\)/);

assert.doesNotMatch(editorPage, /Borrador|borrador|Reabrir/);
assert.match(editorPage, /Plantel congelado/);
assert.match(editorPage, /Agregar partido/);
assert.match(editorPage, /Marcar Descansa/);
assert.match(editorPage, /Excluir/);
assert.match(listPage, /Abrir convocatoria/);
assert.match(listPage, /WeeklyCallupDeleteButton/);

console.log("weekly callups editor assertions passed");
