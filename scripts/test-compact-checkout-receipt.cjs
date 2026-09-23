const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, modules = {}, globals = {}) {
  const m = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText, { module: m, exports: m.exports, Date, Intl, console, ...globals,
    require: name => { assert.ok(name in modules, name); return modules[name]; } });
  return m.exports;
}
const formatter = load('src/lib/finance/checkout-receipt.ts');
const base = {
  operationId: '11111111-1111-4111-8111-111111111111', enrollmentId: 'synthetic', actorId: 'synthetic',
  playerName: 'Jugador de ejemplo', birthYear: 2015, campusName: 'Contry', operatorCampusName: 'Contry',
  paidAt: '2026-09-22T23:00:00Z', occurredAt: '2026-09-22T23:00:15Z', currency: 'MXN',
  moneyReceived: 700, creditApplied: 0, creditRemaining: 0, pendingChargesTotal: 0, sessionWarning: false,
  lines: [{ key: 'x', chargeId: 'x', description: 'Mensualidad septiembre', pendingBefore: 700, moneyReceived: 700, creditApplied: 0, pendingAfter: 0 }],
  payments: [{ id: 'synthetic-payment', folio: 'EJEMPLO-001', method: 'card', amount: 700 }],
};
const copy = () => JSON.parse(JSON.stringify(base));
let checks = 0;
const check = (ok, name) => { assert.ok(ok, name); checks++; };
const body = value => formatter.checkoutReceiptLines(value).join('\n');
const cases = { ordinary: copy() };
const normal = body(base);
check(normal.includes('Categoria: 2015') && normal.includes('22/09/2026, 17:00'), 'Saved birth year and Monterrey time');
check(!/Credito|CREDITO|Pendiente|Operacion|Registrado/.test(normal), 'No irrelevant zero rows, duplicate date or operation UUID');
check(normal.includes('Tarjeta') && normal.includes('Folio: EJEMPLO-001'), 'Method and folio preserved');
check(!normal.includes(base.operationId) && normal.includes('700.00'), 'Compact ordinary payment');
const mixed = copy();
mixed.creditApplied = 300; mixed.creditRemaining = 50;
mixed.lines[0].description = 'J5: importe cubierto'; mixed.lines[0].pendingBefore = 1000; mixed.lines[0].creditApplied = 300;
cases.mixed = mixed;
check(body(mixed).includes('1,000.00') && /CREDITO UTILIZADO\s+\$300.00/.test(body(mixed)) && /DINERO RECIBIDO\s+\$700.00/.test(body(mixed)), 'Covered amount differs from money received');
check(/Credito disponible\s+\$50.00/.test(body(mixed)), 'Meaningful available credit retained');
const credit = copy(); credit.moneyReceived = 0; credit.creditApplied = 700; credit.payments = [];
credit.lines[0].moneyReceived = 0; credit.lines[0].creditApplied = 700; cases.creditOnly = credit;
check(/DINERO RECIBIDO\s+\$0.00/.test(body(credit)) && /CREDITO UTILIZADO\s+\$700.00/.test(body(credit)), 'Credit-only does not imply cash');
const split = copy(); split.payments = [{ id: 'a', folio: 'EFECTIVO-001', method: 'cash', amount: 200 }, { id: 'b', folio: 'TARJETA-002', method: 'card', amount: 500 }]; cases.split = split;
check(body(split).includes('EFECTIVO-001') && body(split).includes('TARJETA-002') && /Efectivo\s+\$200.00/.test(body(split)) && /Tarjeta\s+\$500.00/.test(body(split)), 'Both split folios, methods and amounts retained');
const copa = copy(); copa.moneyReceived = 600; copa.payments[0].amount = 600; copa.lines[0] = { ...copa.lines[0], description: 'Copa Tigres 2026', pendingBefore: 1250, moneyReceived: 600, pendingAfter: 650 }; copa.pendingChargesTotal = 650; cases.copa = copa;
check(/Pendiente del cargo\s+\$650.00/.test(body(copa)) && /Pendiente en cuenta\s+\$650.00/.test(body(copa)), 'Installment and gross account pending retained');
const legacy = copy(); delete legacy.birthYear; cases.legacy = legacy;
check(body(legacy).includes('Categoria: no registrada'), 'Missing historical category explicit');
check(body({ ...legacy, birthYear: null }).includes('Categoria: no registrada'), 'Explicitly absent category handled');
check(/Pendiente en cuenta\s+\$700.00/.test(body({ ...base, creditRemaining: 800, pendingChargesTotal: 700 })), 'Available credit never nets away outstanding charges');
const dated = copy(); dated.occurredAt = '2026-09-23T20:00:00Z'; dated.operatorCampusName = 'Linda Vista'; cases.backdated = dated;
check(body(dated).includes('Registrado: 23/09/2026, 14:00') && body(dated).includes('Campus alumno: Contry'), 'Backdating and cross-campus details retained');
const long = copy(); long.playerName = 'Nombre muy largo '.repeat(6); long.lines[0].description = 'Concepto largo '.repeat(8) + '\x1b\x1d'; long.payments[0].folio = 'F'.repeat(100); cases.long = long;
check(formatter.checkoutReceiptLines(long).every(line => line.length <= 42 && !/[\x00-\x1f\x7f]/.test(line)), 'Long labels wrap and control characters are stripped');
check(body(long).replace(/\n/g, '').includes('F'.repeat(100)), 'Long folio is not truncated');
const captured = [];
const printer = load('src/lib/printer.ts', {
  ...require('./fixtures/reliability-modules.cjs')(),
  '@/lib/perf/timing': { createPerfTimer: () => ({ mark() {}, end() {} }) },
  '@/lib/finance/checkout-receipt': formatter,
  '@/lib/finance/charge-operation-receipt': { operationReceiptLines: () => { throw Error('Unexpected operation receipt'); } },
}, { process: { env: {} }, btoa: value => Buffer.from(value, 'latin1').toString('base64'),
  window: { qz: { websocket: { isActive: () => true }, configs: { create: (name, config) => ({ name, config }) }, print: async (config, items) => captured.push({ config, items }) } },
  fetch: () => { throw Error('Network forbidden'); },
});
(async () => {
  for (const [name, receipt] of Object.entries(cases)) {
    const before = JSON.stringify(receipt);
    await printer.printExplicitCheckoutReceipt('ISOLATED_TEST_ONLY', receipt);
    const job = captured.at(-1);
    const raw = job.items.map(item => Buffer.from(item.data, 'base64').toString('latin1')).join('');
    const expected = body(receipt) + '\n';
    check(raw.split(expected).length === 3, `${name}: both copies have identical compact transaction data`);
    check(raw.includes('COPIA CLIENTE') && raw.includes('COPIA ACADEMIA') && raw.split('\x1dV\x00').length === 3, `${name}: both copy labels and cuts retained`);
    check(JSON.stringify(receipt) === before, `${name}: immutable snapshot untouched`);
    check(job.config.config.encoding === 'Cp1252', `${name}: transport encoding unchanged`);
    await printer.printReceipt('ISOLATED_TEST_ONLY', { explicitCheckout: receipt });
    check(JSON.stringify(captured.at(-1)) === JSON.stringify(job), `${name}: reprint dispatch produces identical bytes`);
  }
  console.log(`PASS ${checks} compact receipt checks; QZ is mocked, no network or physical printing.`);
  if (process.argv.includes('--samples')) for (const [name, receipt] of Object.entries(cases)) console.log(`\n${name}\nINVICTA - ${receipt.operatorCampusName}\n${body(receipt)}\nCOPIA CLIENTE / ACADEMIA`);
})().catch(error => { console.error(error); process.exitCode = 1; });
