const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
const campuses = [{ id: "lv", name: "Linda Vista" }];
let authorized = true;
let boards = [];
let boardError = null;
let queryError = null;
const tournament = { id: "archived", campus_id: "lv", name: "Archived tournament",
  start_date: null, end_date: "2026-07-26", signup_deadline: null, is_active: false };
const modules = {
  "server-only": {},
  "@/lib/auth/permissions": { getPermissionContext: async () => authorized
    ? { isDirectorReadOnly: true, hasSportsReadAccess: true, campusAccess: { campuses, campusIds: ["lv"] } } : null },
  "@/lib/supabase/admin": { createAdminClient: () => ({ from(table) {
    const query = { select() { return this; }, in() { return this; }, neq() { return this; },
      order() { return this; }, range() { return this; },
      async returns() { return { data: table === "tournaments" ? [tournament] : [], error: queryError }; } };
    return query;
  } }) },
  "@/lib/queries/weekly-callups": { getMonterreyWeekStart: () => "2026-09-14" },
  "@/lib/queries/sports-signups": { getCompetitionBoardReadProjection: async () => {
    if (boardError) throw boardError;
    return boards;
  } },
  "@/lib/training-groups/shared": {},
};
const target = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync("src/lib/queries/competition-readonly.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports: target.exports, module: target, require: id => {
  assert.ok(id in modules, id); return modules[id];
} });
(async () => {
  const read = () => target.exports.getCompetitionReadData({ competition: "archived" });
  let result = await read();
  assert.equal(result.tournament.id, "archived");
  assert.equal(result.registrationsAvailable, false);
  assert.equal(result.registrations.length, 0);
  boards = [{ tournamentId: "archived", players: [] }];
  result = await read();
  assert.equal(result.registrationsAvailable, true);
  assert.equal(result.registrations.length, 0);
  boards = [{ tournamentId: "archived", players: [{ id: "p", name: "Test Player", birthYear: 2015 }] }];
  assert.equal((await read()).registrations.length, 1);
  boardError = Error("board read failed");
  await assert.rejects(read(), /board read failed/);
  boardError = null;
  queryError = Error("catalog read failed");
  await assert.rejects(read(), /catalog read failed/);
  queryError = null;
  boards = null;
  assert.equal(await read(), null);
  authorized = false;
  assert.equal(await read(), null);
  console.log("PASS archived/missing board versus empty board; real errors and authorization remain fail-closed.");
})().catch(error => { console.error(error); process.exitCode = 1; });
