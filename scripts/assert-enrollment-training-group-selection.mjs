import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const {
  rankEnrollmentTrainingGroups,
  trainingGroupMatchesBirthYear,
  trainingGroupMatchesGender,
} = await import("../src/lib/training-groups/enrollment-selection-ranking.ts");
const { derivePlayerLevelFromTrainingProgram } = await import("../src/lib/training-groups/shared.ts");

const baseGroup = {
  id: "fpt-2015",
  campusId: "campus-lv",
  campusCode: "LINDA_VISTA",
  name: "Basico B1 2015",
  program: "futbol_para_todos",
  levelLabel: "B1",
  groupCode: "B1",
  gender: "mixed",
  birthYearMin: 2015,
  birthYearMax: 2015,
  startTime: "17:20:00",
  endTime: "18:30:00",
  status: "active",
};

const femaleCombined = {
  ...baseGroup,
  id: "female-2014-2015",
  name: "Avanzado B1 Femenil 2014/2015",
  gender: "female",
  birthYearMin: 2014,
  birthYearMax: 2015,
};

const nearby2016 = {
  ...baseGroup,
  id: "fpt-2016",
  name: "Basico B1 2016",
  birthYearMin: 2016,
  birthYearMax: 2016,
};

const selectivo2015 = {
  ...baseGroup,
  id: "selectivo-2015",
  name: "Selectivo 2015",
  program: "selectivo",
  groupCode: "Selectivo",
};

assert.equal(trainingGroupMatchesGender("mixed", "female"), true);
assert.equal(trainingGroupMatchesGender("male", "female"), false);
assert.equal(trainingGroupMatchesBirthYear(femaleCombined, 2015), true);
assert.equal(trainingGroupMatchesBirthYear(femaleCombined, 2016), false);
assert.equal(derivePlayerLevelFromTrainingProgram("futbol_para_todos"), "B1");
assert.equal(derivePlayerLevelFromTrainingProgram("selectivo"), "Selectivo");
assert.equal(derivePlayerLevelFromTrainingProgram("little_dragons"), "Little Dragons");

assert.deepEqual(
  rankEnrollmentTrainingGroups({
    groups: [nearby2016, femaleCombined, baseGroup, selectivo2015],
    campusId: "campus-lv",
    program: "futbol_para_todos",
    birthYear: 2015,
    gender: "female",
  }).map((group) => group.id),
  ["female-2014-2015", "fpt-2015", "fpt-2016"],
);

assert.deepEqual(
  rankEnrollmentTrainingGroups({
    groups: [nearby2016, baseGroup, selectivo2015],
    campusId: "campus-lv",
    program: "selectivo",
    birthYear: 2015,
    gender: "male",
  }).map((group) => group.id),
  ["selectivo-2015"],
);

assert.deepEqual(
  rankEnrollmentTrainingGroups({
    groups: [nearby2016],
    campusId: "campus-lv",
    program: "futbol_para_todos",
    birthYear: 2015,
    gender: "male",
  }).map((group) => group.id),
  ["fpt-2016"],
);

const [enrollmentAction, intakeAction, existingForm, intakeForm] = await Promise.all([
  readFile(new URL("../src/server/actions/enrollments.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/server/actions/intake.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/components/enrollments/enrollment-form.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/components/enrollments/enrollment-intake-form.tsx", import.meta.url), "utf8"),
]);

for (const source of [enrollmentAction, intakeAction]) {
  assert.match(source, /validateEnrollmentTrainingGroupSelection/);
  assert.match(source, /assignSelectedTrainingGroupForEnrollment/);
  assert.doesNotMatch(source, /findB2TeamForAutoAssign/);
  assert.doesNotMatch(source, /assignDefaultB1TrainingGroupForEnrollment/);
}

for (const source of [existingForm, intakeForm]) {
  assert.match(source, /EnrollmentTrainingGroupPicker/);
  assert.match(source, /trainingGroupValid/);
}

assert.match(intakeForm, /onSelectionChange=\{setTrainingGroupSelection\}/);
assert.match(intakeForm, /Grupo de entrenamiento/);
assert.match(intakeForm, /derivePlayerLevelFromTrainingProgram/);

console.log("Enrollment training-group selection assertions passed.");
