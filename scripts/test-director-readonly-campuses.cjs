const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
let failure = false;
const campuses = [{ id: 'lv', code: 'LV', name: 'Linda Vista' }, { id: 'co', code: 'CO', name: 'Contry' }];
const query = { select(columns) { assert.equal(columns, 'id, code, name'); return this; }, eq() { return this; }, order() { return this; },
  async returns() { return { data: failure ? null : campuses, error: failure ? { message: 'private' } : null }; } };
const modules = {
  react: { cache: fn => fn },
  '@/lib/supabase/admin': { tryCreateAdminClient: () => { throw Error('No admin fallback allowed'); } },
  '@/lib/supabase/server': { createClient: async () => ({ from: table => {
    assert.equal(table, 'v_director_readonly_campuses'); return query;
  } }) },
  '@/lib/auth/debug-view': { getDebugViewContext: async () => ({ effective: { id: 'reader', roleCodes: ['director_readonly'],
    roleRows: [{ campus_id: null, campuses: null, app_roles: { code: 'director_readonly' } }] } }) },
};
const target = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/auth/campuses.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, { exports: target.exports, module: target, require: id => {
  assert.ok(id in modules, id); return modules[id];
} });
(async () => {
  for (const method of ['getOperationalCampusAccess', 'getAttendanceCampusAccess', 'getNutritionCampusAccess']) {
    const result = await target.exports[method]();
    assert.equal(result.campuses.length, 2);
    assert.equal(result.isDirector, false);
    assert.notEqual(result.canWrite, true);
    assert.equal(result.defaultCampusId, 'lv');
    failure = true;
    await assert.rejects(target.exports[method](), /director_readonly_campus_read_failed/);
    failure = false;
  }
  console.log('Authenticated campus projections passed; no raw/admin fallback or write scope.');
})().catch(error => { console.error(error); process.exitCode = 1; });
