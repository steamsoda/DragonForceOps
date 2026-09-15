const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

function load(file, overrides = {}) {
  const source = fs.readFileSync(file, 'utf8'), modules = {};
  const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest);
  for (const n of parsed.statements) if (ts.isImportDeclaration(n)) modules[n.moduleSpecifier.text] = {};
  Object.assign(modules, { react: React, 'react/jsx-runtime': require('react/jsx-runtime'), 'react-dom': require('react-dom') }, overrides);
  const m = { exports: {} };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText, { exports: m.exports, module: m, console, process, FormData, URLSearchParams,
    require: id => { assert.ok(id in modules, id); return modules[id]; },
  });
  return m.exports;
}
const id = '10000000-0000-4000-8000-000000000001';
const plain = value => JSON.parse(JSON.stringify(value));
(async () => {
  let reader = true, revoked = false, fail = false, rpcCalls = 0;
  const context = () => ({ isDirectorReadOnly: reader, isDirector: !reader, isSportsDirector: true,
    campusAccess: { campusIds: [id], campuses: [{ id, name: 'Campus' }] },
    supabase: { rpc: async () => { rpcCalls++; return { data: counts, error: fail ? Error('offline') : null }; } },
  });
  const gate = async () => { if (revoked) throw Error('revoked'); return context(); };
  const counts = { month: '2026-09', activeEnrollments: 5, enrollmentsWithBalance: 2, paymentCount: 3, player360Count: 1,
    historicalCatchupCount: 0, amount: 998877, chargesByType: [{ typeCode: 'monthly', typeName: 'Tuition', count: 2, secret: 998877 }],
    paymentsByMethod: [{ method: 'cash', count: 2, secret: 998877 }],
    weeks: [{ weekNum: 1, startDay: 1, endDay: 7, paymentCount: 3, secret: 998877, byMethod: [{ method: 'cash' }] }],
  };
  const canonical = { staff: true, totalCobrado: 998877 };
  const report = load('src/lib/queries/director-report-presentation.ts', {
    '@/lib/auth/operational-page-reader': { requireDirectorPageReader: gate },
    './reports': { PAYMENT_METHOD_LABELS: { cash: 'Efectivo' }, getResumenMensualData: async () => canonical, getCorteSemanallData: async () => canonical },
  });
  for (const fn of ['getMonthlyReportPresentation','getWeeklyReportPresentation']) {
    reader = true;
    const data = await report[fn]({ month: '2026-09' });
    assert.equal(data.totalCobrado, null);
    assert.equal(data.paymentCount, 3);
    assert.doesNotMatch(JSON.stringify(data), /998877|secret/);
    fail = true; await assert.rejects(() => report[fn]({}), /unavailable/); fail = false;
    revoked = true; const before = rpcCalls;
    await assert.rejects(() => report[fn]({}), /revoked/); assert.equal(rpcCalls, before); revoked = false;
    reader = false; assert.equal(await report[fn]({}), canonical);
  }
  reader = true;
  assert.deepEqual(plain(await report.getDashboardPaymentCounts({})), {
    enrollmentsWithBalance: 2, player360Count: 1, historicalCatchupCount: 0, paymentCountThisMonth: 3,
  });
  const deniedReads = {
    '@/lib/auth/permissions': { getPermissionContext: async () => context() },
    '@/lib/auth/operational-page-reader': { requireDirectorPageReader: async () => { throw Error('revoked'); }, requireOperationalPageReader: async () => { throw Error('revoked'); } },
    '@/lib/supabase/admin': { createAdminClient: () => { throw Error('admin reached'); } },
  };
  for (const [file, fn, args] of [
    ['products','getProductCatalog',[]], ['products','getProductKpis',[id,'MXN']],
    ['products','getProductRecentSalesPage',[id]], ['uniforms','getUniformDashboardData',[]],
    ['teams','listTeams',[]], ['competition-rosters','getCompetitionRosterFoundation',[id]],
    ['weekly-callups','getWeeklyCallupsFoundationData',[]], ['porto-report','getPortoDatosGenerales',['2026-09']],
  ]) await assert.rejects(() => load(`src/lib/queries/${file}.ts`,deniedReads)[fn](...args), /revoked/);

  const cuts = load('src/lib/queries/corte-page-reader.ts', {
    '@/lib/auth/operational-page-reader': { requireOperationalPageReader: gate },
    './reports': { getCorteDiarioData: async () => ({ ...canonical, campusId:id, campusName:'Campus', openedAt:'2026-09-15',
      byMethod:[{ method:'cash', methodLabel:'Efectivo', count:1, total:998877 }],
      byChargeType:[{ typeCode:'monthly', typeName:'Tuition', total:998877 }], productDetails:[{ description:'Tuition',total:998877 }],
      payments:[{ amount:700, playerName:'Individual' }], excludedPaymentsTotal:998877 }) },
    '@/lib/supabase/admin': { createAdminClient: () => { throw Error('unexpected checkpoint write/read'); } },
  });
  const cut = await cuts.getCortePresentation({ campusId:id });
  assert.doesNotMatch(JSON.stringify(cut), /998877/);
  assert.equal(cut.payments[0].amount,700);
  assert.equal(await cuts.getOrCreateCurrentCorteCheckpoint('outside'),null);

  const actions = load('src/server/actions/competition-rosters.ts', {
    '@/lib/auth/permissions': { getPermissionContext: async () => context() },
    '@/lib/auth/debug-view': { assertDebugWritesAllowed: async () => {} },
  });
  await assert.rejects(() => actions.refreshCompetitionRosterTeamsInlineAction({ tournamentId:id,campusId:id }), /read_only/);
  const trials = load('src/server/actions/trial-classes.ts', {
    '@/lib/auth/permissions': { getPermissionContext: async () => context() },
    '@/lib/auth/debug-view': { isDebugWriteBlocked: async () => false },
    'next/navigation': { redirect: () => { throw Error('denied'); } },
    '@/lib/supabase/admin': { createAdminClient: () => { throw Error('admin reached'); } },
  });
  await assert.rejects(() => trials.addTrialProspectNoteAction(new FormData()), /denied/);
  assert.equal((await trials.recordTrialVisitAction({ prospectId:id,attendanceSessionId:id })).ok,false);

  const controls = load('src/components/auth/read-only-controls.tsx');
  const { TeamRosterClient } = load('src/components/teams/team-roster-client.tsx', { '@/components/auth/read-only-controls': controls });
  const roster = [{ assignmentId:id,playerId:id,playerName:'Example Player',birthDate:'2015-01-01',startDate:'2026-09-01',daysOnTeam:14,isNewArrival:true,role:'primary' }];
  const render = readOnly => renderToStaticMarkup(React.createElement(controls.ReadOnlyProvider,{ readOnly },React.createElement(TeamRosterClient,{ teamId:id,roster,allTeams:[],isDirector:true })));
  const readerHtml = render(true), staffHtml = render(false);
  assert.match(readerHtml, /Acciones/);
  assert.match(readerHtml, /<button[^>]*disabled=""[^>]*>Confirmar<\/button>/);
  assert.match(readerHtml, /<button(?![^>]*disabled)[^>]*>Transferir<\/button>/);
  assert.doesNotMatch(staffHtml, /title="Solo lectura"/);
  assert.doesNotMatch(fs.readFileSync('src/lib/queries/corte-page-reader.ts','utf8'), /\.insert\(|\.update\(|\.delete\(/);
  console.log('PASS: final report projections, staff parity, revocation before admin reads, mutation veto and normal roster controls.');
})().catch(error => { console.error(error); process.exitCode=1; });
