const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
function load(file, modules) {
  const m = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, { module: m, exports: m.exports, console, require: id => {
    if (id === 'react' || id === 'react/jsx-runtime') return require(id);
    assert.ok(id in modules, `Unexpected import ${id}`); return modules[id];
  }});
  return m.exports;
}
const playerId = '11111111-1111-4111-8111-111111111111';
let enabled = true, authorized = true, rows = [{ id: 'enrollment', campus_id: 'allowed' }], adminCount = 0;
const calls = [];
const query = new Proxy({}, { get: (_, key) => (...args) => { calls.push([key, ...args]); return query; } });
const context = { isDirectorReadOnly: true, campusAccess: {}, supabase: {
  rpc: async () => ({ data: authorized }),
  from: table => { assert.equal(table, 'v_director_readonly_enrollments'); return {
    select: () => ({ eq: (key, id) => {
      assert.equal(key, 'player_id'); assert.equal(id, playerId);
      return { limit: async () => ({ data: rows }) };
    }}),
  }; },
}};
const { directorPlayerReader } = load('src/lib/auth/director-player-reader.ts', {
  'server-only': {}, zod: require('zod'),
  './campuses': { canAccessCampus: (_, id) => id === 'allowed' },
  './director-readonly-policy': { directorReadOnlyEnabled: () => enabled },
  '@/lib/supabase/admin': { createAdminClient: () => { adminCount++; return { from: () => ({ select: () => query }) }; } },
});
(async () => {
  assert.equal(await directorPlayerReader(context, 'bad'), null);
  enabled = false; assert.equal(await directorPlayerReader(context, playerId), null); enabled = true;
  authorized = false; assert.equal(await directorPlayerReader(context, playerId), null); authorized = true;
  rows = [{ id: 'foreign', campus_id: 'denied' }]; assert.equal(await directorPlayerReader(context, playerId), null);
  assert.equal(adminCount, 0);
  rows = [{ id: 'enrollment', campus_id: 'allowed' }, { id: 'foreign', campus_id: 'denied' }];
  const reader = await directorPlayerReader(context, playerId);
  assert.equal(reader.rpc, undefined);
  assert.equal(reader.from('players').update, undefined);
  assert.throws(() => reader.from('user_roles'), /unsupported/);
  reader.from('players').select('id');
  reader.from('enrollments').select('id');
  reader.from('v_enrollment_balances').select('balance');
  assert.ok(calls.some(c => c[0] === 'eq' && c[1] === 'id' && c[2] === playerId));
  assert.ok(calls.some(c => c[0] === 'in' && c[1] === 'enrollment_id' && c[2].join() === 'enrollment'));
  assert.equal(calls.filter(c => c[0] === 'throwOnError').length, 3);
  authorized = false; assert.equal(await directorPlayerReader(context, playerId), null);

  // Invoke the real note action directly: no proxy or UI is needed for denial.
  const notes = load('src/server/actions/player-notes.ts', {
    'next/cache': { revalidatePath: () => assert.fail('revalidated') },
    '@/lib/auth/debug-view': { isDebugWriteBlocked: async () => false },
    '@/lib/auth/permissions': { getPermissionContext: async () => context },
    '@/lib/queries/player-notes': { canUsePlayerNotes: () => true, resolvePlayerNoteTarget: () => assert.fail('resolved write target') },
    '@/lib/supabase/admin': { createAdminClient: () => assert.fail('created writer') },
  });
  assert.equal((await notes.createPlayerNoteAction({ playerId, body: 'test', sourceSurface: 'player_profile' })).error, 'unauthorized');
  const profile = fs.readFileSync('src/app/(protected)/players/[playerId]/page.tsx', 'utf8');
  assert.doesNotMatch(profile, /readDirectorPlayer\(/);
  assert.match(profile, /getPlayerDetail\(playerId/);
  assert.match(profile, /const isSuperAdmin = !readOnly/);
  assert.match(profile, /canViewFinanceDetails = readOnly \|\|/);
  for (const path of ['billing/charges-ledger-table', 'billing/payments-table', 'billing/enrollment-incidents-section', 'player-notes/player-notes-panel', 'players/uniform-orders-section']) {
    const source = fs.readFileSync(`src/components/${path}.tsx`, 'utf8');
    assert.match(source, /WriteButton/); assert.doesNotMatch(source, /<button/);
  }
  // The normal loader and reader must map the same individual-account fixture.
  let readOnly = false, failedBalance = false, allowProfile = true;
  const fixture = {
    players: { id: playerId, first_name: 'Alumno', last_name: 'Prueba', birth_date: '2015-01-01', status: 'active', medical_notes: 'Nota', jersey_number: 10 },
    player_guardians: [{ is_primary: true, guardians: { id: 'guardian', first_name: 'Tutor', last_name: 'Prueba' } }],
    enrollments: [{ id: 'enrollment', status: 'active', start_date: '2026-01-01', campuses: { id: 'allowed', name: 'Contry' }, pricing_plans: { name: 'Mensualidad', currency: 'MXN' } }],
    v_enrollment_balances: [{ enrollment_id: 'enrollment', total_charges: 1400, total_payments: 700, balance: 700 }],
    team_assignments: [], training_group_assignments: null, enrollment_incidents: [],
  };
  const client = { from: table => {
    let single = false;
    const chain = new Proxy({}, { get: (_, key) => {
      if (key === 'then') return (yes, no) => {
        if (failedBalance && table === 'v_enrollment_balances') return Promise.reject(Error('balance unavailable')).then(yes, no);
        const data = fixture[table];
        return Promise.resolve({ data: single && Array.isArray(data) ? data[0] ?? null : data }).then(yes, no);
      };
      return () => { if (key === 'maybeSingle') single = true; return chain; };
    }});
    return chain;
  }};
  const detail = load('src/lib/queries/players.ts', {
    '@/lib/supabase/server': { createClient: async () => client },
    '@/lib/auth/permissions': { getPermissionContext: async () => ({ isDirectorReadOnly: readOnly }) },
    '@/lib/auth/director-player-reader': { directorPlayerReader: async () => allowProfile ? client : null },
    '@/lib/auth/campuses': { getOperationalCampusAccess: async () => ({}), canAccessCampus: () => true },
    '@/lib/incidents': { resolveActiveIncident: () => null },
    '@/lib/queries/billing': { getEnrollmentLedger: async () => ({ totals: { balance: 700 }, charges: [], payments: [] }) },
    '@/lib/enrollments/dropout-reasons': {}, '@/lib/training-groups/shared': {},
  });
  const staffProfile = await detail.getPlayerDetail(playerId);
  readOnly = true;
  const readerProfile = await detail.getPlayerDetail(playerId);
  assert.equal(JSON.stringify(readerProfile), JSON.stringify(staffProfile));
  assert.equal(readerProfile.activeEnrollment.balance, 700);
  assert.equal(readerProfile.medicalNotes, 'Nota');
  failedBalance = true; await assert.rejects(() => detail.getPlayerDetail(playerId), /balance unavailable/);
  failedBalance = false; allowProfile = false; assert.equal(await detail.getPlayerDetail(playerId), null);
  const controls = load('src/components/auth/read-only-controls.tsx', {});
  const components = { '@/components/auth/read-only-controls': controls };
  const incidents = load('src/components/billing/enrollment-incidents-section.tsx', components);
  const notePanel = load('src/components/player-notes/player-notes-panel.tsx', {
    ...components, '@/server/actions/player-notes': { createPlayerNoteAction: () => assert.fail('write') },
  });
  const uniforms = load('src/components/players/uniform-orders-section.tsx', {
    ...components, 'next/link': { default: ({ children, href }) => React.createElement('a', { href }, children) },
    '@/server/actions/uniforms': {},
  });
  const noWrite = async () => assert.fail('write');
  const children = [
    React.createElement(incidents.EnrollmentIncidentsSection, { key: 'incidents', rows: [], createAction: noWrite, cancelAction: noWrite, replaceAction: noWrite, canManage: true, defaultMonth: '2026-09' }),
    React.createElement(notePanel.PlayerNotesPanel, { key: 'notes', playerId, enrollmentId: 'enrollment', notes: [] }),
    React.createElement(uniforms.UniformOrdersSection, { key: 'uniforms', enrollmentId: 'enrollment', initialOrders: [{ id: 'uniform', uniformType: 'training', status: 'pending_order', size: 'M' }] }),
  ];
  const render = readOnly => renderToStaticMarkup(React.createElement(controls.ReadOnlyProvider, { readOnly }, children));
  const readerHtml = render(true), staffHtml = render(false);
  const buttons = [...readerHtml.matchAll(/<button\b[^>]*>/g)];
  assert.ok(buttons.length >= 4);
  assert.ok(buttons.every(match => match[0].includes('disabled=""')));
  assert.ok([...staffHtml.matchAll(/<button\b[^>]*>/g)].some(match => !match[0].includes('disabled=""')));
  assert.match(readerHtml, /<textarea/); assert.match(readerHtml, /<select/);
  console.log('PASS: canonical profile parity, failed-read denial, scope, identity, revocation, strict SELECT facade, direct note-write denial and read-only controls.');
})().catch(e => { console.error(e); process.exitCode = 1; });
