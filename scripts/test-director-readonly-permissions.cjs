const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function compile(file, dependencies) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, require: name => {
    assert.ok(name in dependencies, `Unexpected dependency ${name}`);
    return dependencies[name];
  } });
  return module.exports;
}

const roles = compile('src/lib/auth/roles.ts', {}).APP_ROLES;
let roleCodes = [];
const scope = async () => ({ isGlobal: true, campusIds: [] });
const permissions = compile('src/lib/auth/permissions.ts', {
  'next/navigation': { redirect: () => { throw Error('denied'); } },
  '@/lib/supabase/server': { createClient: async () => ({}) },
  '@/lib/auth/roles': { APP_ROLES: roles },
  '@/lib/auth/campuses': { getOperationalCampusAccess: scope, getNutritionCampusAccess: scope, getAttendanceCampusAccess: scope },
  '@/lib/auth/debug-view': { getDebugViewContext: async () => ({ effective: { id: 'test', roleCodes } }) },
});

(async () => {
  for (const extra of [[], [roles.DIRECTOR_ADMIN], [roles.SUPERADMIN], [roles.FRONT_DESK], [roles.NUTRITIONIST], [roles.COACH]]) {
    roleCodes = [roles.DIRECTOR_READONLY, ...extra];
    const context = await permissions.getPermissionContext();
    for (const flag of ['isDirector', 'isSuperAdmin', 'hasOperationalAccess', 'hasPlayerDataAccess', 'hasSportsAccess', 'hasNutritionAccess', 'hasAttendanceWriteAccess', 'canViewFinancials', 'hasTuitionStatusReportAccess', 'hasCoachScheduleAccess']) {
      assert.equal(context[flag], false, `${extra}: ${flag}`);
    }
    for (const flag of ['hasOperationalReadAccess', 'hasPlayerDataReadAccess', 'hasSportsReadAccess', 'hasNutritionReadAccess', 'hasAttendanceReadAccess']) assert.equal(context[flag], true, flag);
    for (const gate of ['requireOperationalContext', 'requirePlayerDataContext', 'requireDirectorContext', 'requireSportsDirectorContext', 'requireNutritionContext', 'requireAttendanceWriteContext', 'requireSuperAdminContext']) await assert.rejects(permissions[gate](), /denied/);
  }
  roleCodes = [roles.DIRECTOR_ADMIN];
  const director = await permissions.getPermissionContext();
  assert.equal(director.hasOperationalAccess, true);
  assert.equal(director.canViewFinancials, true);
  assert.equal(director.hasAttendanceWriteAccess, true);
  console.log('Read-only and mixed-role write vetoes passed; normal Director permissions retained.');
})().catch(error => { console.error(error); process.exitCode = 1; });
