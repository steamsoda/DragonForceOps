const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const ts = require('typescript'), React = require('react'), { renderToStaticMarkup } = require('react-dom/server');
function imports(file) {
  return Object.fromEntries(ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest).statements
    .filter(ts.isImportDeclaration).map(node => [node.moduleSpecifier.text, {}]));
}
function load(file, modules = {}, globals = {}) {
  const m = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText, { module: m, exports: m.exports, console, URL, FormData, ...globals,
    require: id => id in modules ? modules[id] : require(id) });
  return m.exports;
}
(async () => {
  for (const [file, names] of [
    ['intake', ['createEnrollmentIntakeAction']], ['enrollments', ['createEnrollmentAction']],
    ['cash-sessions', ['openCashSessionAction', 'closeCashSessionAction']],
    ['360player-posting', ['post360PlayerMonthlyBatchAction']],
  ]) {
    const path = `src/server/actions/${file}.ts`, modules = imports(path);
    modules['@/lib/auth/permissions'] = { getPermissionContext: async () => ({ isDirectorReadOnly: true }) };
    modules['next/navigation'] = { redirect: () => { throw Error('DENIED'); } };
    modules['@/lib/supabase/server'] = { createClient: () => assert.fail('writer') };
    modules['@/lib/supabase/admin'] = { createAdminClient: () => assert.fail('admin writer') };
    const actions = load(path, modules);
    for (const name of names) await assert.rejects(() => actions[name](null, null), /DENIED/);
  }
  const controls = load('src/components/auth/read-only-controls.tsx');
  const shared = {
    '@/components/auth/read-only-controls': controls,
    'next/link': { default: ({ children }) => React.createElement('a', {}, children) },
    '@/lib/enrollments/returning': load('src/lib/enrollments/returning.ts'),
    '@/lib/pricing/plans': { quoteEnrollmentPricingFromVersions: () => null },
    '@/lib/time': { formatDateOnlyDdMmYyyy: value => value, parseDateOnlyInput: value => value || null },
    '@/components/enrollments/enrollment-training-group-picker': { EnrollmentTrainingGroupPicker: () => React.createElement('select') },
    '@/lib/training-groups/shared': { TRAINING_GROUP_PROGRAM_LABELS: {} },
    '@/server/actions/intake': { createEnrollmentIntakeAction: async () => assert.fail('intake write') },
    './intake-reads': {},
  };
  const props = { campuses: [{ id: 'c', name: 'Contry', code: 'CO' }], planCode: 'standard', pricingVersions: [], defaultStartDate: '2026-09-15', trainingGroups: [], playerBirthDate: '2015-01-01', playerGender: 'male', action: async () => assert.fail('write') };
  for (const [path, name] of [['enrollment-intake-form', 'EnrollmentIntakeForm'], ['enrollment-form', 'EnrollmentCreateForm']]) {
    const Component = load(`src/components/enrollments/${path}.tsx`, shared)[name];
    for (const returning of [false, true]) {
      const html = renderToStaticMarkup(React.createElement(controls.ReadOnlyProvider, { readOnly: true, directorReadOnly: true }, React.createElement(Component, { ...props, initialIsReturning: returning, isReturning: returning })));
      assert.match(html, /title="Solo lectura"/); assert.match(html, /disabled=""/);
      assert.match(html, /<input/); assert.match(html, /<select/);
    }
  }
  let prints = 0;
  const fakeReact = { ...React, useState: initial => [initial, () => {}], useRef: value => ({ current: value }), useEffect: fn => fn() };
  const printer = load('src/components/caja/print-receipt-button.tsx', {
    react: fakeReact, '@/components/auth/read-only-controls': { ...controls, useReadOnly: () => true },
    '@/lib/printer': { printReceipt: async () => { prints++; } },
  });
  const printTree = printer.PrintReceiptButton({ data: {}, printerName: '', autoPrint: true });
  await printTree.props.onClick(); assert.equal(prints, 0);
  const html = renderToStaticMarkup(React.createElement(controls.ReadOnlyProvider, { readOnly: true }, printTree));
  assert.match(html, /Imprimir recibo/); assert.match(html, /disabled=""/);

  let admitted = true;
  const sessions = load('src/lib/queries/cash-sessions.ts', {
    '@/lib/auth/operational-page-reader': { requireDirectorPageReader: async () => {
      if (!admitted) throw Error('DENIED');
      return { isDirectorReadOnly: true, campusAccess: { campusIds: ['c'], campuses: [{ id: 'c', name: 'Contry' }] } };
    } }, '@/lib/auth/campuses': {}, '@/lib/supabase/server': {},
    '@/lib/supabase/admin': { createAdminClient: () => {
      assert.ok(admitted);
      return { from: () => ({ select: columns => {
        assert.equal(columns, 'id,campus_id,opened_at');
        return { eq: () => ({ in: async (field, ids) => {
          assert.equal(field, 'campus_id'); assert.equal(JSON.stringify(ids), '["c"]');
          return { data: [{ id: 's', campus_id: 'c', opened_at: '2026-09-15' }] };
        } }) };
      } }) };
    } },
  });
  const statuses = await sessions.getCampusSessionPageStatuses();
  assert.equal(statuses[0].session.openingCash, null); assert.equal(statuses[0].session.cashIn, null);
  admitted = false; await assert.rejects(sessions.getCampusSessionPageStatuses, /DENIED/);
  let actualRole = true, calls = 0;
  const api = load('src/app/api/director-readonly/intake/route.ts', {
    'next/server': { NextResponse: { json: (body, init) => ({ body, ...init }) } },
    '@/lib/auth/permissions': { getPermissionContext: async () => ({ isDirectorReadOnly: true, supabase: { rpc: async () => ({ data: actualRole }) } }) },
    '@/lib/auth/director-readonly-policy': { directorReadOnlyEnabled: () => true },
    '@/server/actions/intake': { searchReturningPlayersForIntakeAction: async () => { calls++; return [{ playerId: 'p' }]; }, searchLikelyPlayersForIntakeAction: async () => [] },
  });
  const response = await api.GET({ url: 'https://test/api?mode=returning&q=test' });
  assert.equal(response.body.length, 1); assert.match(response.headers['Cache-Control'], /no-store/);
  actualRole = false; assert.equal((await api.GET({ url: 'https://test/api?mode=returning&q=test' })).status, 403);
  assert.equal(calls, 1);
  console.log('PASS: enrollment/session/360 writes denied, normal forms retained, auto/manual printing blocked, session totals not fetched, intake GET role and cache boundary.');
})().catch(error => { console.error(error); process.exitCode = 1; });
