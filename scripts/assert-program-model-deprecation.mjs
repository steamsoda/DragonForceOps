import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const {
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

assert.match(intake, /Programa:/, "Enrollment review must show the confirmed program");
assert.doesNotMatch(intake, /derivePlayerLevelFromTrainingProgram/, "Enrollment review must not derive a legacy level");
assert.doesNotMatch(playerEdit, /name="level"/, "Player editing must not expose the legacy level field");
assert.doesNotMatch(playerProfile, />Nivel operativo</, "Player profile must not show the legacy operational level");
assert.doesNotMatch(playerProfile, /label={`Nivel /, "Player profile must not show a legacy level chip");
assert.doesNotMatch(playerActions, /level:\s*level/, "Ordinary player edits must preserve the legacy level value");

assert.equal(
  formatTrainingGroupDisplayName({ name: "Avanzado B2 Femenil", program: "futbol_para_todos" }),
  "Avanzado Femenil - Futbol Para Todos",
);
assert.equal(
  formatTrainingGroupDisplayName({ name: "Selectivo 2015", program: "selectivo" }),
  "Selectivo 2015",
);
assert.equal(sanitizeTournamentTeamDisplayName("Intermedio B1 (-d08d)"), "Intermedio");
assert.equal(sanitizeTournamentTeamDisplayName("PreJuvenil B1 (2aa8)"), "PreJuvenil");
assert.deepEqual(
  formatTournamentGroupCardDisplay({
    name: "Avanzado B2 Femenil",
    program: "futbol_para_todos",
    birthYearMin: 2014,
    birthYearMax: 2015,
  }),
  { title: "2014/2015 Futbol Para Todos", subtitle: "Avanzado Femenil" },
);

console.log("Program model deprecation assertions passed.");
