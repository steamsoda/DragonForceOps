const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
function imports(file) {
  const modules = {};
  for (const node of ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest).statements)
    if (ts.isImportDeclaration(node)) modules[node.moduleSpecifier.text] = {};
  return modules;
}
function load(file, modules = {}) {
  const m = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, { module: m, exports: m.exports, console,
    require: id => id in modules ? modules[id] : require(id) });
  return m.exports;
}
function elements(node) {
  if (!node || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap(elements);
  return [node, ...elements(node.props?.children)];
}
(async () => {
  let role = 'reader', enabled = true, verified = true;
  const context = () => ({ isDirectorReadOnly: role === 'reader', isDirector: role === 'director', supabase: { rpc: async () => ({ data: verified, error: null }) } });
  const gates = load('src/lib/auth/operational-page-reader.ts', {
    'server-only': {},
    'next/navigation': { redirect: () => { throw Error('denied'); } },
    './director-readonly-policy': { directorReadOnlyEnabled: () => enabled },
    './permissions': { getPermissionContext: async () => role === 'anonymous' ? null : context(), requireOperationalContext: async () => {
      if (role === 'anonymous') throw Error('denied'); return context();
    } },
  });
  assert.equal((await gates.requireDirectorPageReader()).isDirectorReadOnly, true);
  verified = false; await assert.rejects(gates.requireDirectorPageReader, /denied/); verified = true;
  enabled = false; await assert.rejects(gates.requireDirectorPageReader, /denied/); enabled = true;
  role = 'frontdesk'; await assert.rejects(gates.requireDirectorPageReader, /denied/);
  role = 'anonymous'; await assert.rejects(gates.requireDirectorPageReader, /denied/);
  role = 'director'; assert.equal((await gates.requireDirectorPageReader()).isDirector, true);
  let reader = true, admitted = true, failed = false, adminReads = 0;
  const enrollments = Array.from({ length: 501 }, (_, i) => ({ id: `e${i}`, player_id: `p${i}`, status: 'ended', end_date: '2026-09-01', players: { first_name: 'Test', last_name: String(i) }, campuses: { name: 'Contry' } }));
  const balances = enrollments.map(e => ({ enrollment_id: e.id, balance: 700 }));
  const charges = Array.from({ length: 501 }, () => ({ enrollment_id: 'e0', amount: 1 }));
  const client = { from: table => {
    let ids, scope, offset = 0, end = Infinity;
    const chain = {
      select: () => chain, order: () => chain, eq: () => chain,
      in: (field, values) => { if (field === 'campus_id') scope = values; if (field === 'enrollment_id') ids = values; return chain; },
      range: (a, b) => { offset = a; end = b; return chain; },
      returns: async () => {
        if (table === 'enrollments') assert.equal(JSON.stringify(scope), '["contry"]');
        else { assert.ok(ids.length <= 100); assert.ok(ids.every(id => enrollments.some(e => e.id === id))); }
        const rows = table === 'enrollments' ? enrollments : (table === 'charges' ? charges : balances).filter(r => ids.includes(r.enrollment_id));
        return { data: rows.slice(offset, end + 1), error: failed ? Error('query_failed') : null };
      },
    }; return chain;
  } };
  const file = 'src/lib/queries/enrollments.ts';
  const modules = imports(file);
  modules['@/lib/auth/operational-page-reader'] = { requireDirectorPageReader: async () => {
    if (!admitted) throw Error('denied');
    return { isDirectorReadOnly: reader, campusAccess: { campusIds: ['contry'] } };
  } };
  modules['@/lib/supabase/admin'] = { createAdminClient: () => { adminReads++; assert.ok(admitted); return client; } };
  modules['@/lib/supabase/server'] = { createClient: async () => client };
  const query = load(file, modules).listBajaEnrollmentsWithBalance;
  const readonlyRows = await query();
  assert.equal(readonlyRows.length, 501);
  assert.equal(readonlyRows[0].pendingChargeCount, 501);
  assert.equal(readonlyRows[0].pendingTotal, 501);
  reader = false; assert.equal(JSON.stringify(await query()), JSON.stringify(readonlyRows));
  reader = true; failed = true; await assert.rejects(query, /query_failed/); failed = false;
  const previousReads = adminReads; admitted = false; await assert.rejects(query, /denied/); assert.equal(adminReads, previousReads);

  const actionFile = 'src/server/actions/billing.ts';
  const am = imports(actionFile);
  am['@/lib/auth/permissions'] = { getPermissionContext: async () => ({ isDirectorReadOnly: true }) };
  am['next/navigation'] = { redirect: url => { throw Error(`REDIRECT:${url}`); } };
  am['@/lib/supabase/server'] = { createClient: () => assert.fail('Writer created') };
  await assert.rejects(() => load(actionFile, am).batchVoidBajaChargesAction({}), /err=unauthorized/);

  const controls = load('src/components/auth/read-only-controls.tsx');
  let isReader = true, writes = 0;
  const uiFile = 'src/components/pending/baja-writeoff-table.tsx';
  const um = imports(uiFile);
  um.react = { useState: initial => [typeof initial === 'object' ? new Set(['e1', 'e2']) : initial, () => {}] };
  um['next/link'] = { default: ({ children }) => React.createElement('a', {}, children) };
  um['@/components/auth/read-only-controls'] = { ...controls, useReadOnly: () => isReader, useDirectorReadOnly: () => isReader };
  um['@/server/actions/billing'] = { batchVoidBajaChargesAction: async () => { writes++; } };
  const Table = load(uiFile, um).BajaWriteoffTable;
  const rows = [700, 900].map((amount, i) => ({ enrollmentId: `e${i + 1}`, playerId: `p${i}`, playerName: 'Test', campusName: 'Contry', enrollmentStatus: 'ended', pendingTotal: amount, pendingChargeCount: 1 }));
  const tree = Table({ rows });
  await elements(tree).find(e => e.type === controls.ReadOnlyForm).props.action({});
  assert.equal(writes, 0);
  const html = renderToStaticMarkup(React.createElement(controls.ReadOnlyProvider, { readOnly: true, directorReadOnly: true }, tree));
  assert.match(html, /700/); assert.match(html, /900/); assert.doesNotMatch(html, /1,600/);
  assert.match(html, /disabled=""/); assert.match(html, /textarea/);
  isReader = false;
  const staffTree = Table({ rows });
  const staffHtml = renderToStaticMarkup(React.createElement(controls.ReadOnlyProvider, { readOnly: false }, staffTree));
  assert.match(staffHtml, /1,600/);
  await elements(staffTree).find(e => e.type === controls.ReadOnlyForm).props.action({});
  assert.equal(writes, 1);
  const policy = load('src/lib/auth/director-readonly-policy.ts');
  assert.equal(policy.directorReadOnlyRequestAllowed('GET', '/pending/bajas', true), true);
  assert.equal(policy.directorReadOnlyRequestAllowed('POST', '/pending/bajas', true), false);
  assert.equal(policy.directorReadOnlyRequestAllowed('GET', '/pending/bajas', false), false);
  console.log('PASS: scoped/paged bajas reads, staff parity, failure/denial, direct write veto, disabled saves and concealed selected totals.');
})().catch(error => { console.error(error); process.exitCode = 1; });
