import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  formatCampusCompetitionTeamName,
  formatCampusTeamPrefix,
} from "../src/lib/training-groups/shared.ts";

assert.equal(formatCampusTeamPrefix("Contry"), "CO");
assert.equal(formatCampusTeamPrefix("Linda Vista"), "LV");
assert.equal(formatCampusTeamPrefix("LINDA_VISTA"), "LV");
assert.equal(formatCampusCompetitionTeamName("Contry", "2016 Azul"), "CO · 2016 Azul");
assert.equal(formatCampusCompetitionTeamName("Linda Vista", "Selectivo 2015"), "LV · Selectivo 2015");
assert.equal(formatCampusCompetitionTeamName("Linda Vista", ""), "");

const [query, liveView, weeklyCallups, coachSchedules, liveWorkbook] = await Promise.all([
  readFile("src/lib/queries/competition-rosters.ts", "utf8"),
  readFile("src/components/sports/competition-roster-live-view.tsx", "utf8"),
  readFile("src/lib/queries/weekly-callups.ts", "utf8"),
  readFile("src/lib/queries/coach-schedules.ts", "utf8"),
  readFile("src/lib/exports/competition-roster-live-workbook.ts", "utf8"),
]);

assert.match(query, /professorNamesBySquadId/);
assert.match(query, /professorNames:/);
assert.match(liveView, /formatCampusCompetitionTeamName\(data\.campusName, display\.title\)/);
assert.match(liveView, /Profesor: \{squad\.professorNames\.join/);
assert.match(weeklyCallups, /formatCampusCompetitionTeamName\([\s\S]*campusNameById\.get\(anchorGroup\.campus_id\)/);
assert.match(coachSchedules, /formatCampusCompetitionTeamName\(anchorGroup\.campuses\?\.name, display\.title\)/);
assert.match(liveWorkbook, /formatCampusCompetitionTeamName\(data\.campusName, display\.title\)/);
assert.match(liveWorkbook, /Profesor: \$\{squad\.professorNames\.join/);

console.log("Tournament team campus identity assertions passed.");
