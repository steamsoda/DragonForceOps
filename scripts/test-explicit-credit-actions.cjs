const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript');
function load(file, modules, globals = {}) {
  const m = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText, { module: m, exports: m.exports, console, ...globals, require: id => {
    if (!(id in modules)) throw Error(`Unexpected import ${id}`); return modules[id];
  } });
  return m.exports;
}
const domain = load('src/lib/finance/explicit-credit.ts', { zod: require('zod') });
const id = '11111111-1111-4111-8111-111111111111', request = '22222222-2222-4222-8222-222222222222';
const command = { enrollmentId: id, requestId: request, expectedAvailable: 200,
  selection: [{ chargeId: id, amount: 200, expectedPending: 700 }] };
let checks = 0;
function check(value, name) { assert.ok(value, name); checks++; }
for (const value of ['1e2', '-1', '1.001', 'abc', '', 'Infinity']) check(domain.parseCreditAmount(value) === null, `Reject ${value}`);
check(domain.parseCreditAmount('20,50') === 20.5, 'Decimal comma');
check(domain.creditCommandSchema.safeParse(command).success, 'Valid exact command');
for (const invalid of [{ ...command, actorId: id }, { ...command, selection: [] }, { ...command, expectedAvailable: 199 },
  { ...command, selection: [command.selection[0], command.selection[0]] },
  { ...command, selection: [{ ...command.selection[0], amount: 0.001 }] }]) {
  check(!domain.creditCommandSchema.safeParse(invalid).success, 'Invalid command denied');
}
let context = null, debug = false, calls = [], reads = 0, adminReads = 0, rpcError = null, network = false;
let pendingIntent=null;
let ledger = { enrollment: { id, playerName: 'Test Player', campusName: 'Contry', currency: 'MXN' },
  accountCredit: { explicitAvailableAmount: 200, legacyImplicitCreditAmount: 50 },
  charges: [{ id, description: 'Tuition', status: 'pending', pendingAmount: 700, copaTigresInstallments: false }] };
const receipt = { operationId: request, enrollmentId: id, actorId: id, occurredAt: '2026-09-22T01:00:00Z',
  playerName: 'Test Player', campusName: 'Contry', currency: 'MXN', moneyReceived: 0, creditApplied: 200,
  creditRemaining: 0, pendingChargesTotal: 500, lines: [{ chargeId: id, description: 'Tuition', creditApplied: 200, pendingBefore: 700, pendingAfter: 500 }] };
const actions = load('src/server/actions/explicit-credit.ts', {
  zod: require('zod'), 'next/cache': { revalidatePath: () => {} },
  '@/lib/auth/permissions': { getPermissionContext: async () => context, canAccessEnrollmentRecord: async () => true },
  '@/lib/auth/debug-view': { isDebugWriteBlocked: async () => debug },
  '@/lib/queries/billing': { getEnrollmentLedger: async () => { reads++; return ledger; } },
  '@/lib/finance/explicit-credit': domain,
  '@/lib/supabase/admin': { createAdminClient: () => ({ from: table => {
    if(table==='explicit_credit_intents') { const query={select:()=>query,eq:()=>query,maybeSingle:async()=>({data:pendingIntent,error:null})};return query; }
    adminReads++; const query = { select: () => query, eq: (key, value) => { check((key === 'enrollment_id' && value === id) || (key === 'receipt->>moneyReceived' && value === '0'), 'Receipt history scoped or credit-only filtered'); return query; },
      order: () => query, limit: async () => ({ data: [{ receipt }], error: null }) }; return query;
  } }) },
});
const confirm = input => actions.confirmExplicitCredit(input, id);
function setRole(flags) { context = { user: { id }, roleCodes: [], ...flags, supabase: { rpc: async (...args) => {
  calls.push(args); if (network) throw Error('network secret'); return { data: receipt, error: rpcError };
} } }; }
(async () => {
  check(!(await confirm(command)).ok, 'Anonymous denied');
  check(!(await actions.loadExplicitCredit(id)).ok && reads === 0, 'Anonymous read denied');
  for (const flags of [{ isDirectorReadOnly: true, isDirector: true }, { isFrontDesk: true, roleCodes: ['porto_viewer'] }, {}]) {
    setRole(flags); check(!(await confirm(command)).ok, 'Reader/unprivileged write denied');
  }
  check(calls.length === 0, 'Denied writes never call RPC');
  setRole({ isFrontDesk: true }); debug = true;
  check(!(await confirm(command)).ok && calls.length === 0, 'Debug mode blocked'); debug = false;
  check(!(await confirm({ ...command, expectedAvailable: 0 })).ok && calls.length === 0, 'Validation before RPC');
  check(!(await actions.confirmExplicitCredit(command,request)).ok && calls.length===0,'Changed operator cannot submit a reviewed command');
  check((await confirm(command)).ok, 'Staff command succeeds');
  check(calls[0][0]==='stage_explicit_credit','Durable stage precedes spending');
  check(calls[1][0] === 'apply_explicit_credit_selection' && !('p_actor' in calls[1][1]), 'Verified session RPC; no supplied actor');
  const snapshot = JSON.stringify(calls[1]);
  network = true;
  check((await confirm(command)).uncertain, 'Network uncertainty retained'); network = false;
  await confirm(command);
  check(JSON.stringify(calls.at(-1)) === snapshot, 'Retry carries identical command');
  rpcError = { message: 'credit_selection_changed' };
  check((await confirm(command)).code === 'credit_selection_changed', 'Stale balance classified');
  rpcError = { message: 'database host secret' };
  const opaque = await confirm(command);
  check(opaque.code === 'uncertain' && !JSON.stringify(opaque).includes('secret'), 'No internal error disclosure'); rpcError = null;
  const writeCount = calls.length;
  setRole({ isDirectorReadOnly: true });
  const loaded = await actions.loadExplicitCredit(id);
  check(loaded.ok && loaded.workspace.readOnly && calls.length === writeCount, 'Reader can explore without writes');
  setRole({isFrontDesk:true});pendingIntent={actor_id:id,command};
  const recovered=await actions.loadExplicitCredit(id);
  check(recovered.ok&&recovered.workspace.recovery.requestId===request,'Original operator recovers exact command');
  pendingIntent={actor_id:request,command};
  const blocked=await actions.loadExplicitCredit(id);
  check(blocked.ok&&blocked.workspace.recoveryBlocked&&!blocked.workspace.recovery,'Another operator sees blocked state without command');
  pendingIntent=null;
  const before = adminReads; ledger = null;
  check(!(await actions.loadExplicitCredit(id)).ok && adminReads === before, 'No private receipt access without ledger authorization');

  let printed, failPrinting = false;
  const printer = load('src/lib/printer.ts', {
    ...require('./fixtures/reliability-modules.cjs')(),
    '@/lib/perf/timing': { createPerfTimer: () => ({ mark() {}, end() {} }) },
    '@/lib/finance/checkout-receipt': load('src/lib/finance/checkout-receipt.ts', {}),
    '@/lib/finance/charge-operation-receipt': load('src/lib/finance/charge-operation-receipt.ts', { zod: require('zod') }),
  }, {
    process: { env: {} }, btoa: text => Buffer.from(text, 'binary').toString('base64'),
    window: { qz: { websocket: { isActive: () => true }, configs: { create: () => ({}) }, print: async (_, items) => { if (failPrinting) throw Error('printer unavailable'); printed = items; } } },
  });
  await printer.printCreditReceipt('test', receipt);
  const text = printed.map(item => item.format === 'base64' ? Buffer.from(item.data, 'base64').toString('latin1') : item.data).join('');
  check(text.includes('APLICACION DE CREDITO') && text.includes('DINERO RECIBIDO'), 'Dedicated noncash receipt');
  check(!text.includes('TOTAL PAGADO') && text.includes('CREDITO UTILIZADO'), 'Not mislabeled as money collected');
  check(text.includes(request) && text.includes('COPIA CLIENTE') && text.includes('COPIA ACADEMIA'), 'Operation identity and both copies');
  const first = JSON.stringify(printed); await printer.printCreditReceipt('test', receipt);
  check(JSON.stringify(printed) === first, 'Reprint uses exact saved snapshot');
  const checkoutReceipt = { ...receipt, operatorCampusName: 'Linda Vista', paidAt: '2026-09-20T23:00:00Z',
    moneyReceived: 500, creditApplied: 200, creditRemaining: 100, pendingChargesTotal: 650, sessionWarning: false,
    lines: [{ key: id, chargeId: id, description: 'Uniforme', moneyReceived: 500, creditApplied: 200, pendingBefore: 700, pendingAfter: 0 }],
    payments: [{ id, folio: 'TEST-001', method: 'cash', amount: 200 }, { id: request, folio: 'TEST-002', method: 'card', amount: 300 }] };
  const beforePrintCalls = calls.length;
  await printer.printExplicitCheckoutReceipt('test', checkoutReceipt);
  const checkoutText = printed.map(item => item.format === 'base64' ? Buffer.from(item.data, 'base64').toString('latin1') : item.data).join('');
  check(/Uniforme[^\n]*700\.00/.test(checkoutText) && /Credito aplicado[^\n]*200\.00/.test(checkoutText), 'Mixed receipt prints covered amount and credit funding');
  check(checkoutText.includes('Efectivo') && checkoutText.includes('Tarjeta') && checkoutText.includes('TEST-001') && checkoutText.includes('TEST-002'), 'Both tender methods and folios printed');
  check(/DINERO RECIBIDO[^\n]*500\.00/.test(checkoutText) && /CREDITO UTILIZADO[^\n]*200\.00/.test(checkoutText), 'Money and credit totals not conflated');
  check(/Credito disponible[^\n]*100\.00/.test(checkoutText) && /Pendiente en cuenta[^\n]*650\.00/.test(checkoutText), 'Snapshot debt and available credit printed separately');
  check(checkoutText.includes('Linda Vista') && checkoutText.includes('Contry') && checkoutText.includes('Fecha de pago:') && checkoutText.includes('17:00'), 'Receiving/student campuses and Monterrey payment time');
  const mixedPrint = JSON.stringify(printed), savedReceipt = JSON.stringify(checkoutReceipt);
  failPrinting = true;
  await assert.rejects(() => printer.printExplicitCheckoutReceipt('test', checkoutReceipt), /print_failed/);
  failPrinting = false; await printer.printExplicitCheckoutReceipt('test', checkoutReceipt);
  check(JSON.stringify(printed) === mixedPrint && JSON.stringify(checkoutReceipt) === savedReceipt && calls.length === beforePrintCalls, 'Print failure and retry do not rewrite receipt or repeat finance actions');
  await printer.printExplicitCheckoutReceipt('test', { ...checkoutReceipt, moneyReceived: 0, payments: [],
    lines: [{ ...checkoutReceipt.lines[0], moneyReceived: 0, pendingAfter: 500 }] });
  const creditOnlyText = printed.map(item => item.format === 'base64' ? Buffer.from(item.data, 'base64').toString('latin1') : item.data).join('');
  check(/DINERO RECIBIDO[^\n]*0\.00/.test(creditOnlyText) && !creditOnlyText.includes('Folio:') && !creditOnlyText.includes('Fecha de pago:'), 'Credit-only receipt invents no money, payment folio or payment date');
  console.log(`PASS ${checks} explicit-credit action/validation/receipt checks.`);
})().catch(e => { console.error(e); process.exitCode = 1; });
