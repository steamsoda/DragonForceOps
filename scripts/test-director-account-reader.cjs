const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
const zod = require("zod");
function load(file, modules) {
  const m = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { module: m, exports: m.exports, URL, Request, require: id => {
    if (!(id in modules)) throw Error(`Unexpected import ${id}`);
    return modules[id];
  } });
  return m.exports;
}

const enrollmentId = "11111111-1111-4111-8111-111111111111";
const campusId = "22222222-2222-4222-8222-222222222222";
let enabled = true, authorized = true, roleError = null, campusAllowed = true, missing = false;
let adminCreated = 0, calls = [];
const context = { isDirectorReadOnly: true, campusAccess: {}, supabase: {
  rpc: async name => { calls.push(name); return { data: authorized, error: roleError }; },
  from: table => {
    assert.equal(table, "v_director_readonly_enrollments");
    return { select: columns => {
      assert.equal(columns, "id,campus_id");
      return { eq: (field, value) => {
        assert.equal(field, "id"); assert.equal(value, enrollmentId);
        return { maybeSingle: async () => ({ data: missing ? null : { id: enrollmentId, campus_id: campusId }, error: null }) };
      } };
    } };
  },
} };
const admin = { from: table => ({ select: columns => ({ table, columns }) }) };
const reader = load("src/lib/auth/director-account-reader.ts", {
  "server-only": {}, zod,
  "./campuses": { canAccessCampus: (_scope, id) => { assert.equal(id, campusId); return campusAllowed; } },
  "./director-readonly-policy": { directorReadOnlyEnabled: () => enabled },
  "@/lib/supabase/admin": { createAdminClient: () => { adminCreated++; return admin; } },
});

(async () => {
  assert.equal(await reader.directorAccountReader(context, "bad-id"), null);
  assert.equal(await reader.directorAccountReader({ ...context, isDirectorReadOnly: false }, enrollmentId), null);
  assert.equal(calls.length, 0); assert.equal(adminCreated, 0);
  enabled = false; assert.equal(await reader.directorAccountReader(context, enrollmentId), null); enabled = true;
  authorized = false; assert.equal(await reader.directorAccountReader(context, enrollmentId), null); authorized = true;
  roleError = { message: "offline" }; assert.equal(await reader.directorAccountReader(context, enrollmentId), null); roleError = null;
  missing = true; assert.equal(await reader.directorAccountReader(context, enrollmentId), null); missing = false;
  campusAllowed = false; assert.equal(await reader.directorAccountReader(context, enrollmentId), null); campusAllowed = true;
  assert.equal(adminCreated, 0, "No privileged client before all checks pass");
  const client = await reader.directorAccountReader(context, enrollmentId);
  assert.equal(adminCreated, 1);
  assert.equal(typeof client.from("charges").select, "function");
  for (const method of ["insert", "update", "delete", "upsert"]) assert.equal(client.from("charges")[method], undefined);
  assert.equal(client.rpc, undefined);
  assert.throws(() => client.from("user_roles"), /unsupported_account_relation/);
  assert.throws(() => client.from("cash_sessions"), /unsupported_account_relation/);
  authorized = false;
  assert.equal(await reader.directorAccountReader(context, enrollmentId), null, "Revocation is checked again");
  assert.equal(adminCreated, 1); authorized = true;

  let routeContext = null, reads = 0, fail = false;
  const ledger = { enrollment: { id: enrollmentId }, totals: { balance: 700 }, charges: [], payments: [] };
  const route = load("src/app/api/director-readonly/account/route.ts", {
    "next/server": { NextResponse: { json: (body, options = {}) => ({ body, status: options.status ?? 200, headers: options.headers }) } },
    zod,
    "@/lib/auth/permissions": { getPermissionContext: async () => routeContext },
    "@/lib/auth/director-readonly-policy": { directorReadOnlyEnabled: () => enabled },
    "@/lib/queries/billing": { getEnrollmentLedger: async (id, options) => {
      reads++; assert.equal(id, enrollmentId); assert.equal(options.strictReadErrors, true);
      if (fail) throw Error("secret database diagnostic");
      return ledger;
    } },
  });
  const request = suffix => new Request(`https://example.test/api/director-readonly/account?${suffix}`);
  assert.equal((await route.GET(request(`enrollmentId=${enrollmentId}`))).status, 401);
  routeContext = { isDirectorReadOnly: false };
  assert.equal((await route.GET(request(`enrollmentId=${enrollmentId}`))).status, 403);
  routeContext = context;
  enabled = false; assert.equal((await route.GET(request(`enrollmentId=${enrollmentId}`))).status, 403); enabled = true;
  for (const query of ["", "enrollmentId=bad", `enrollmentId=${enrollmentId}&enrollmentId=${enrollmentId}`, `enrollmentId=${enrollmentId}&table=payments`]) {
    assert.equal((await route.GET(request(query))).status, 400);
  }
  assert.equal(reads, 0);
  const response = await route.GET(request(`enrollmentId=${enrollmentId}`));
  assert.equal(response.status, 200); assert.equal(response.body.totals.balance, 700);
  assert.equal(response.headers["Cache-Control"], "private, no-store");
  assert.match(response.headers.Vary, /Cookie/);
  assert.equal(route.POST, undefined);
  fail = true;
  const failed = await route.GET(request(`enrollmentId=${enrollmentId}`));
  assert.equal(failed.status, 503); assert.doesNotMatch(JSON.stringify(failed), /secret database diagnostic/);
  console.log("PASS: account reader identity/revocation/campus/feature checks, SELECT-only facade, GET validation, no-store responses and safe errors.");
})().catch(error => { console.error(error); process.exitCode = 1; });
