import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const {
  formatCompetitionSquadDisplay,
  formatTournamentGroupCardDisplay,
  formatTrainingGroupDisplayName,
  sanitizeTournamentTeamDisplayName,
} = await import("../src/lib/training-groups/shared.ts");

const root = new URL("../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), "utf8");
}

const intake = await source("src/components/enrollments/enrollment-intake-form.tsx");
const playerEdit = await source("src/app/(protected)/players/[playerId]/edit/page.tsx");
const playerProfile = await source("src/app/(protected)/players/[playerId]/page.tsx");
const playerActions = await source("src/server/actions/players.ts");
const sportsSignupsBoard = await source("src/components/sports/sports-signups-board.tsx");
const currentWeekDashboard = await source("src/components/weekly-callups/current-week-dashboard.tsx");

assert.match(intake, /Programa:/, "Enrollment review must show the confirmed program");
assert.doesNotMatch(intake, /derivePlayerLevelFromTrainingProgram/, "Enrollment review must not derive a legacy level");
assert.doesNotMatch(playerEdit, /name="level"/, "Player editing must not expose the legacy level field");
assert.doesNotMatch(playerProfile, />Nivel operativo</, "Player profile must not show the legacy operational level");
assert.doesNotMatch(playerProfile, /label={`Nivel /, "Player profile must not show a legacy level chip");
assert.doesNotMatch(playerActions, /level:\s*level/, "Ordinary player edits must preserve the legacy level value");
assert.match(sportsSignupsBoard, /label: "Futbol Para Todos"/, "Tournament program filter must keep the academy program name");
assert.match(currentWeekDashboard, /label: "Futbol Para Todos"/, "Convocatorias program card must keep the academy program name");

assert.equal(
  formatTrainingGroupDisplayName({ name: "Avanzado B2 Femenil", program: "futbol_para_todos" }),
  "Avanzado Femenil",
);
assert.equal(
  formatTrainingGroupDisplayName({ name: "Selectivo 2015", program: "selectivo" }),
  "Selectivo 2015",
);
assert.equal(sanitizeTournamentTeamDisplayName("Intermedio B1 (-d08d)"), "Intermedio");
assert.equal(sanitizeTournamentTeamDisplayName("PreJuvenil B1 (2aa8)"), "PreJuvenil");
assert.equal(sanitizeTournamentTeamDisplayName("Intermedio B1 - d08d"), "Intermedio");
assert.equal(sanitizeTournamentTeamDisplayName("Basico B1 - 805d"), "Basico");
assert.equal(sanitizeTournamentTeamDisplayName("Selectivo 2015"), "Selectivo 2015");
assert.deepEqual(
  formatCompetitionSquadDisplay({
    name: "Avanzado B1 - d08d",
    program: "futbol_para_todos",
    categoryLabel: "2014",
    kind: "single",
  }),
  { title: "2014 Azul", categoryLabel: "2014", teamLabel: "Azul" },
);
assert.deepEqual(
  formatCompetitionSquadDisplay({
    name: "Avanzado B1 - d08d",
    program: "futbol_para_todos",
    categoryLabel: "2014",
    kind: "single",
    sourceGroupCount: 1,
  }),
  { title: "2014 Azul", categoryLabel: "2014", teamLabel: "Azul" },
);
assert.deepEqual(
  formatCompetitionSquadDisplay({
    name: "Expert B3 Femenil (2aa8) Blanco",
    program: "futbol_para_todos",
    categoryLabel: "2012/2013",
    kind: "blanco",
  }),
  { title: "2012/2013 Femenil Blanco", categoryLabel: "2012/2013", teamLabel: "Femenil Blanco" },
);
assert.deepEqual(
  formatCompetitionSquadDisplay({
    name: "Expert B3 Femenil 2011/2012/2013 - 2aa8",
    program: "futbol_para_todos",
    categoryLabel: "2011/2012/2013",
    kind: "single",
    sourceGroupCount: 3,
  }),
  { title: "Femenil 2011/2012/2013", categoryLabel: "2011/2012/2013", teamLabel: "Femenil 2011/2012/2013" },
);
assert.deepEqual(
  formatTournamentGroupCardDisplay({
    name: "Avanzado B2 Femenil",
    program: "futbol_para_todos",
    birthYearMin: 2014,
    birthYearMax: 2015,
  }),
  { title: "2014/2015", subtitle: "Avanzado Femenil" },
);
assert.deepEqual(
  formatCompetitionSquadDisplay({
    name: "Selectivo 2016",
    program: "selectivo",
    categoryLabel: "2016",
    kind: "single",
    sourceGroupCount: 1,
  }),
  { title: "Selectivo 2016", categoryLabel: "2016", teamLabel: "Selectivo" },
);
assert.deepEqual(
  formatCompetitionSquadDisplay({
    name: "Selectivo 2016 Azul",
    program: "selectivo",
    categoryLabel: "2016",
    kind: "azul",
    sourceGroupCount: 1,
  }),
  { title: "Selectivo 2016 Azul", categoryLabel: "2016", teamLabel: "Selectivo Azul" },
);
assert.deepEqual(
  formatCompetitionSquadDisplay({
    name: "Selectivo 2016 Blanco",
    program: "selectivo",
    categoryLabel: "2016",
    kind: "blanco",
    sourceGroupCount: 1,
  }),
  { title: "Selectivo 2016 Blanco", categoryLabel: "2016", teamLabel: "Selectivo Blanco" },
);

console.log("Program model deprecation assertions passed.");
