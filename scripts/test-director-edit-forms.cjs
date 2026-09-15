const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
function load(file, modules = {}) {
  const m = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, { module: m, exports: m.exports, console, require: id => {
    if (id in modules) return modules[id];
    if (['react', 'react/jsx-runtime'].includes(id)) return require(id);
    throw Error(`Unexpected dependency ${id}`);
  }});
  return m.exports;
}
const controls = load('src/components/auth/read-only-controls.tsx');
const common = { '@/components/auth/read-only-controls': controls };
const Guardian = load('src/components/players/guardian-form.tsx', common).GuardianForm;
const Enrollment = load('src/components/enrollments/enrollment-edit-form.tsx', {
  ...common, '@/lib/enrollments/scholarships': { getScholarshipStatusLabel: () => 'Sin beca' },
}).EnrollmentEditForm;
const Dropout = load('src/components/enrollments/enrollment-dropout-form.tsx', {
  ...common, '@/lib/enrollments/dropout-reasons': { DROPOUT_REASON_OPTIONS: [] },
  '@/lib/time': { getMonterreyDateString: () => '2026-09-15' },
}).EnrollmentDropoutForm;
const action = async () => assert.fail('write');
const fixtures = [
  React.createElement(Guardian, { action, defaultValues: { firstName: 'Tutor', lastName: 'Prueba' } }),
  React.createElement(Enrollment, { action, enrollment: { status: 'active', campusId: 'campus', scholarshipStatus: 'none' }, campuses: [{ id: 'campus', name: 'Contry' }], canManageScholarship: true }),
  React.createElement(Dropout, { action, enrollment: { campusName: 'Contry', startDate: '2026-01-01', pendingBalance: 700 } }),
];
for (const child of fixtures) {
  const render = readOnly => renderToStaticMarkup(React.createElement(controls.ReadOnlyProvider, { readOnly }, child));
  assert.match(render(true), /disabled=""/);
  assert.match(render(true), /<input|<select/);
  assert.doesNotMatch(render(false), /title="Solo lectura"/);
}
let readOnly = true, prevented = false, submitted = false;
const direct = load('src/components/auth/read-only-controls.tsx', {
  react: { createContext: () => ({}), useContext: () => readOnly },
});
function submit() { direct.ReadOnlyForm({ onSubmit: () => { submitted = true; } }).props.onSubmit({ preventDefault: () => { prevented = true; } }); }
submit(); assert.equal(prevented, true); assert.equal(submitted, false);
readOnly = false; prevented = false; submit(); assert.equal(prevented, false); assert.equal(submitted, true);

(async () => {
  let readonly = true, fail = false, admitted = true;
  const enrollment = { id: 'enrollment', player_id: 'player', campus_id: 'campus', players: { first_name: 'Alumno', last_name: 'Prueba' }, campuses: { name: 'Contry' }, status: 'active' };
  const client = { from: table => {
    const chain = new Proxy({}, { get: (_, key) => key === 'then' ? (yes, no) => Promise.resolve({
      data: table === 'enrollments' ? enrollment : table === 'campuses' ? [{ id: 'campus', name: 'Contry' }] : { balance: 700 },
      error: fail ? Error('failure') : null,
    }).then(yes, no) : () => chain }); return chain;
  }};
  const queries = load('src/lib/queries/enrollments.ts', {
    '@/lib/auth/operational-page-reader': {},
    '@/lib/auth/director-player-reader': {},
    '@/lib/auth/director-account-reader': { directorAccountReader: async () => admitted ? client : null },
    '@/lib/supabase/server': { createClient: async () => client }, '@/lib/supabase/admin': {},
    '@/lib/auth/campuses': { canAccessCampus: () => true, getOperationalCampusAccess: async () => ({}) },
    '@/lib/auth/permissions': { getPermissionContext: async () => ({ isDirectorReadOnly: readonly, hasOperationalAccess: !readonly, campusAccess: {} }) },
    '@/lib/pricing/plans': {}, '@/lib/training-groups/shared': {}, '@/lib/queries/billing': {},
  });
  for (const name of ['getEnrollmentEditContext', 'getEnrollmentDropoutContext']) {
    const reader = await queries[name]('enrollment', 'player');
    readonly = false; const staff = await queries[name]('enrollment', 'player'); readonly = true;
    assert.equal(JSON.stringify(reader), JSON.stringify(staff));
    assert.equal(await queries[name]('enrollment', 'other-player'), null);
    admitted = false; assert.equal(await queries[name]('enrollment', 'player'), null); admitted = true;
    fail = true; await assert.rejects(() => queries[name]('enrollment', 'player'), /enrollment_read_failed/); fail = false;
  }
  console.log('PASS: editable read-only form fields, disabled saves, Enter-submit interception, staff behavior, enrollment scope and failed reads.');
  for (const [file, names] of [
    ['src/server/actions/players.ts', ['updatePlayerAction', 'updateGuardianAction']],
    ['src/server/actions/enrollments.ts', ['updateEnrollmentAction', 'dropoutEnrollmentAction']],
  ]) {
    const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest);
    const modules = {};
    for (const node of source.statements) if (ts.isImportDeclaration(node)) modules[node.moduleSpecifier.text] = {};
    modules['next/navigation'] = { redirect: url => { throw Error(`REDIRECT:${url}`); } };
    modules['@/lib/auth/permissions'] = { getPermissionContext: async () => ({ isDirectorReadOnly: true }) };
    modules['@/lib/auth/debug-view'] = { assertDebugWritesAllowed: async () => {} };
    modules['@/lib/supabase/server'] = { createClient: () => assert.fail('Writer created') };
    modules['@/lib/supabase/admin'] = { createAdminClient: () => assert.fail('Admin writer created') };
    const actions = load(file, modules);
    for (const name of names) await assert.rejects(() => name === 'updatePlayerAction'
      ? actions[name]('player', {}) : actions[name]('one', 'two', {}), /REDIRECT:/);
  }
  console.log('PASS: direct player, guardian, enrollment and dropout mutations deny the reader before accessing a writer.');
})().catch(error => { console.error(error); process.exitCode = 1; });
