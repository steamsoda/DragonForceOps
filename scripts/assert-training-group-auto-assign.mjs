import assert from "node:assert/strict";

const {
  assignDefaultB1TrainingGroupForEnrollment,
  resolveDefaultB1TrainingGroup,
} = await import("../src/lib/training-groups/auto-assign.ts");

const baseGroup = {
  id: "group-mixed-2018",
  name: "Basico B1",
  campusId: "campus-lv",
  program: "futbol_para_todos",
  groupCode: "B1",
  gender: "mixed",
  birthYearMin: 2018,
  birthYearMax: 2018,
  status: "active",
};

assert.equal(
  resolveDefaultB1TrainingGroup({
    groups: [baseGroup],
    campusId: "campus-lv",
    birthYear: 2018,
    gender: "male",
  })?.id,
  "group-mixed-2018",
);

assert.equal(
  resolveDefaultB1TrainingGroup({
    groups: [
      baseGroup,
      {
        ...baseGroup,
        id: "group-female-2018",
        name: "Basico B1 Femenil",
        gender: "female",
      },
    ],
    campusId: "campus-lv",
    birthYear: 2018,
    gender: "female",
  })?.id,
  "group-female-2018",
);

assert.equal(
  resolveDefaultB1TrainingGroup({
    groups: [
      {
        ...baseGroup,
        id: "group-male-2015",
        campusId: "campus-lv",
        name: "Avanzado B1",
        gender: "male",
        birthYearMin: 2015,
        birthYearMax: 2015,
      },
      {
        ...baseGroup,
        id: "group-female-2014-2015",
        campusId: "campus-lv",
        name: "Avanzado B2 Femenil",
        groupCode: "B2",
        gender: "female",
        birthYearMin: 2014,
        birthYearMax: 2015,
      },
    ],
    campusId: "campus-lv",
    birthYear: 2015,
    gender: "female",
  })?.id,
  "group-female-2014-2015",
);

assert.equal(
  resolveDefaultB1TrainingGroup({
    groups: [
      baseGroup,
      {
        ...baseGroup,
        id: "group-mixed-2018-b",
        name: "Basico B1 Bis",
      },
    ],
    campusId: "campus-lv",
    birthYear: 2018,
    gender: "male",
  }),
  null,
);

assert.equal(
  resolveDefaultB1TrainingGroup({
    groups: [
      {
        ...baseGroup,
        id: "selectivo-2018",
        program: "selectivo",
        groupCode: "Selectivo",
      },
    ],
    campusId: "campus-lv",
    birthYear: 2018,
    gender: "male",
  }),
  null,
);

function createFakeAdmin({ groups, existingAssignment = null }) {
  const insertedAssignments = [];
  const auditLogs = [];

  function builder(table) {
    const state = { table, insertPayload: null };
    const api = {
      select() {
        return api;
      },
      eq() {
        return api;
      },
      is() {
        return api;
      },
      insert(payload) {
        state.insertPayload = payload;
        return api;
      },
      returns() {
        return api;
      },
      async maybeSingle() {
        if (state.table === "training_group_assignments" && state.insertPayload) {
          insertedAssignments.push(state.insertPayload);
          return { data: { id: "created-assignment" }, error: null };
        }
        if (state.table === "training_group_assignments") {
          return { data: existingAssignment, error: null };
        }
        return { data: null, error: null };
      },
      then(resolve) {
        if (state.table === "training_groups") {
          return Promise.resolve({ data: groups, error: null }).then(resolve);
        }
        if (state.table === "audit_logs") {
          auditLogs.push(state.insertPayload);
          return Promise.resolve({ data: null, error: null }).then(resolve);
        }
        return Promise.resolve({ data: null, error: null }).then(resolve);
      },
    };
    return api;
  }

  return {
    admin: { from: builder },
    insertedAssignments,
    auditLogs,
  };
}

const fake = createFakeAdmin({
  groups: [
    {
      id: "group-mixed-2018",
      campus_id: "campus-lv",
      name: "Basico B1",
      program: "futbol_para_todos",
      group_code: "B1",
      gender: "mixed",
      birth_year_min: 2018,
      birth_year_max: 2018,
      status: "active",
    },
  ],
});

const assigned = await assignDefaultB1TrainingGroupForEnrollment({
  admin: fake.admin,
  actorUserId: "user-1",
  actorEmail: "test@example.com",
  enrollmentId: "enrollment-1",
  playerId: "player-1",
  campusId: "campus-lv",
  birthYear: 2018,
  gender: "male",
  assignmentStart: "2026-06-24",
  async writeAuditLogFn(_admin, entry) {
    fake.auditLogs.push(entry);
  },
});

assert.equal(assigned.assigned, true);
assert.equal(fake.insertedAssignments.length, 1);
assert.deepEqual(fake.insertedAssignments[0], {
  training_group_id: "group-mixed-2018",
  enrollment_id: "enrollment-1",
  player_id: "player-1",
  start_date: "2026-06-24",
  assigned_by: "user-1",
});
assert.equal(fake.auditLogs.length, 1);

console.log("Training group auto-assign assertions passed.");
