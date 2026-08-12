import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), "utf8");
}

const query = await source("src/lib/queries/sports-signups.ts");
const board = await source("src/components/sports/sports-signups-board.tsx");
const detail = await source("src/app/(protected)/sports-signups/detail/page.tsx");
const workbook = await source("src/lib/exports/sports-signups-workbook.ts");

assert.match(board, /Por categoria/);
assert.match(board, /Por grupo/);
assert.match(board, /selectedCompetition\.trainingGroups/);
assert.match(board, /Con inscritos/);
assert.match(board, /Todos los elegibles/);
assert.match(board, /group\.confirmedCount > 0/);
assert.match(board, /setTrainingGroupVisibility/);
assert.match(board, /trainingGroup=\$\{encodeURIComponent\(group\.key\)\}/);
assert.match(board, /window\.history\.replaceState/);
assert.match(board, /filterCompetitionByProgram/);
assert.doesNotMatch(board, /router\.push\(`\/sports-signups\?campus=/);

assert.match(query, /from\("training_group_assignments"\)/);
assert.match(query, /\.is\("end_date", null\)/);
assert.match(query, /loadActiveTrainingGroupAssignments/);
assert.match(query, /trainingGroups:/);
assert.match(query, /"sin_grupo"/);
assert.match(query, /activeCountByProgram/);
assert.match(query, /return yearB - yearA/);

assert.match(detail, /trainingGroupId: params\.trainingGroup/);
assert.match(detail, /trainingGroupLabel/);
assert.doesNotMatch(detail, /paidLevelGroups|unpaidLevelGroups/);
assert.doesNotMatch(board, /Ver por nivel/);
assert.doesNotMatch(query, /team_assignments/);
assert.doesNotMatch(workbook, /Equipo base|"Nivel"/);

console.log("Sports signups training-group view assertions passed.");
