import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const board = read("src/components/sports/sports-signups-board.tsx");
const liveView = read("src/components/sports/competition-roster-live-view.tsx");
const route = read("src/app/api/sports-signups/teams/route.ts");

assert.match(board, /availablePrograms=\{selectedCompetition\.availablePrograms\}/);
assert.match(liveView, /const PROGRAM_ORDER = \["futbol_para_todos", "selectivo", "little_dragons"\]/);
assert.match(liveView, /orderedPrograms\(availablePrograms\)/);
assert.match(liveView, /programs\.map\(\(currentProgram\) =>/);
assert.match(liveView, /<CompetitionRosterProgramView[\s\S]*program=\{currentProgram\}/);
assert.match(liveView, /new URLSearchParams\(\{ tournament: tournamentId, campus: campusId, program \}\)/);
assert.match(liveView, /La edicion y las excepciones permanecen separadas por programa/);
assert.doesNotMatch(liveView, /Selecciona Futbol Para Todos, Selectivos o Little Dragons para ver sus equipos/);

// The all-program wrapper must not weaken the existing program requirement at the API boundary.
assert.match(route, /if \(!tournamentId \|\| !campusId \|\| !program\)/);

console.log("competition roster all-program view regression assertions passed");
