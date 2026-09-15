const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, modules, extra = '') {
  const m = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8') + extra, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, { module: m, exports: m.exports, console, Date, FormData,
    require: id => {
      if (id in modules) return modules[id];
      if (id === 'react/jsx-runtime') return require(id);
      throw Error(`Unexpected dependency ${id}`);
    } });
  return m.exports;
}
function imports(file) {
  const modules = {};
  for (const node of ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest).statements)
    if (ts.isImportDeclaration(node)) modules[node.moduleSpecifier.text] = {};
  return modules;
}
function elements(node) {
  if (!node || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap(elements);
  return [node, ...elements(node.props?.children)];
}
(async () => {
  const actionFile = 'src/server/actions/enrollments.ts';
  const modules = imports(actionFile);
  modules['@/lib/auth/permissions'] = { getPermissionContext: async () => ({ isDirectorReadOnly: true }) };
  modules['@/lib/supabase/server'] = { createClient: () => assert.fail('Writer created') };
  modules['@/lib/supabase/admin'] = { createAdminClient: () => assert.fail('Admin writer created') };
  const actions = load(actionFile, modules);
  for (const name of ['updatePendingFollowUpAction', 'dropoutEnrollmentFromCallsAction', 'createInjuryIncidentFromCallsAction']) {
    const result = await actions[name]('enrollment', 'player', new FormData(), '');
    assert.equal(result.ok, false);
    assert.equal(result.error, 'unauthenticated');
  }

  let readonly = true, writes = 0, transitions = 0;
  const file = 'src/components/pending/pending-table.tsx';
  const ui = imports(file);
  const WriteButton = () => null;
  ui.react = { useState: value => [value, () => {}], useTransition: () => [false, fn => { transitions++; fn(); }], useEffect: () => {} };
  ui['@/components/auth/read-only-controls'] = { useReadOnly: () => readonly, WriteButton };
  ui['next/navigation'] = { usePathname: () => '/llamadas/detail', useSearchParams: () => new URLSearchParams() };
  ui['@/lib/time'] = { getMonterreyDateString: () => '2026-09-15' };
  ui['@/lib/enrollments/dropout-reasons'] = { DROPOUT_REASON_OPTIONS: [] };
  ui['@/server/actions/enrollments'] = Object.fromEntries(
    ['updatePendingFollowUpAction', 'dropoutEnrollmentFromCallsAction', 'createInjuryIncidentFromCallsAction'].map(name => [name, async () => { writes++; return { ok: true, omittedMonths: [] }; }])
  );
  const components = load(file, ui, '\nexport { FollowUpCell, InlineDropoutPanel, InlineInjuryPanel };');
  const props = { row: { enrollmentId: 'e', playerId: 'p', followUpStatus: 'uncontacted' }, defaultNotes: '', onSaved() {}, onDropped() {}, onRequestDropout() {}, onRequestInjury() {} };
  for (const Component of Object.values(components).filter(value => ['FollowUpCell', 'InlineDropoutPanel', 'InlineInjuryPanel'].includes(value.name))) {
    const nodes = elements(Component(props));
    const save = nodes.find(node => node.type === WriteButton);
    assert.ok(save, 'Visible shared disabled write control');
    save.props.onClick();
    if (Component.name === 'FollowUpCell') nodes.find(node => node.type === 'select').props.onChange({ target: { value: 'contacted' } });
  }
  assert.equal(writes, 0); assert.equal(transitions, 0);
  readonly = false;
  elements(components.FollowUpCell(props)).find(node => node.type === 'select').props.onChange({ target: { value: 'contacted' } });
  assert.equal(writes, 1, 'Staff autosave retained');

  const queueFile = 'src/lib/queries/tuition-pending.ts';
  for (const file of [queueFile, 'src/lib/queries/calls.ts']) {
    const sizes = [...fs.readFileSync(file, 'utf8').matchAll(/const chunkSize = (\d+);/g)];
    assert.ok(sizes.length > 0);
    assert.ok(sizes.every(match => Number(match[1]) <= 100), 'UUID batches must stay below header limits');
  }
  const qm = imports(queueFile);
  let admitted = false, reads = 0;
  const campusAccess = { campuses: [{ id: 'allowed', name: 'Contry', code: 'CO' }], campusIds: ['allowed'] };
  qm['@/lib/auth/operational-page-reader'] = { requireOperationalPageReader: async () => {
    if (!admitted) throw Error('denied');
    return { isDirectorReadOnly: true, campusAccess };
  } };
  qm['@/lib/auth/campuses'] = { canAccessCampus: (scope, id) => scope.campusIds.includes(id) };
  qm['@/lib/supabase/admin'] = { createAdminClient: () => {
    assert.equal(admitted, true); reads++;
    const chain = { select: () => chain, eq: () => chain, in: (field, ids) => { assert.equal(field, 'campus_id'); assert.equal(JSON.stringify(ids), '["allowed"]'); return chain; }, returns: async () => ({ data: [], error: null }) };
    return { from: () => chain };
  } };
  const queue = load(queueFile, qm);
  await assert.rejects(() => queue.getPendingTuitionDashboardData({}), /denied/);
  assert.equal(reads, 0);
  admitted = true;
  const result = await queue.getPendingTuitionDashboardData({ campusId: 'other' });
  assert.equal(result.totals.players, 0);
  assert.equal(reads, 1);
  const policy = load('src/lib/auth/director-readonly-policy.ts', {});
  for (const path of ['/pending', '/pending/detail', '/llamadas', '/llamadas/detail', '/api/exports/pending-detail']) {
    assert.equal(policy.directorReadOnlyRequestAllowed('GET', path, true), true);
    assert.equal(policy.directorReadOnlyRequestAllowed('POST', path, true), false);
    assert.equal(policy.directorReadOnlyRequestAllowed('GET', path, false), false);
  }
  assert.equal(policy.directorReadOnlyRequestAllowed('POST', '/pending/bajas', true), false);
  console.log('PASS: calls direct mutations, local exploration without autosave, staff autosave, queue gate/scope and GET-only routes.');
})().catch(error => { console.error(error); process.exitCode = 1; });
