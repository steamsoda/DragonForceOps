const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, modules = {}) {
  const m = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText, { module: m, exports: m.exports, console, require: id => {
    if (id in modules) return modules[id];
    throw Error(`Unexpected dependency: ${id}`);
  } });
  return m.exports;
}
const shared = load('src/lib/exports/product-sales.ts');
const time = load('src/lib/time.ts');
const { buildProductSalesWorkbook } = load('src/lib/exports/product-sales-workbook.ts', {
  exceljs: require('exceljs'), './product-sales': shared, '@/lib/time': time,
});
let allowed = true, readOnly = false, fault = null, calls = [];
const campus = { id: 'campus-a', name: 'Contry' };
const base = { playerName: '=SUM(1,2)', campusName: 'Contry', birthYear: 2015, trainingGroupName: '2015 Azul' };
const ledger = { productName: 'Sudadera', rows: Array.from({ length: 7 }, (_, i) => ({ ...base, chargeId: String(i) })) };
const metadata = ledger.rows.map((r, i) => ({ id: r.chargeId, product_id: 'product', status: i === 5 ? 'void' : 'pending',
  amount: 300, size: i === 2 ? null : 'M JR', enrollments: { campus_id: i === 4 ? 'campus-b' : 'campus-a', players: { public_player_id: 'DF-0001' } } }));
const db = { from(table) {
  let start = 0, end = 499; const filters = [];
  const q = { select: () => q, returns: () => q, order: () => q,
    eq: (key, value) => { filters.push(['eq', key, value]); return q; },
    neq: (key, value) => { filters.push(['neq', key, value]); return q; },
    in: (key, value) => { filters.push(['in', key, value]); return q; },
    range: (a, b) => { start = a; end = b; return q; },
    then(resolve, reject) {
      calls.push({ table, filters, start });
      let data = [];
      if (table === 'charges') data = metadata;
      if (table === 'v_charge_collection_balances') data = metadata.filter(r => r.status !== 'void').map(r => ({ charge_id: r.id, balance: r.id === '3' ? 100 : 0 }));
      if (table === 'payment_allocations') data = [
        { id: 'a', charge_id: '0', amount: 100, payments: { status: 'posted', paid_at: '2026-10-01T18:00:00Z' } },
        { id: 'b', charge_id: '0', amount: 200, payments: { status: 'posted', paid_at: '2026-10-02T06:00:00+00:00' } },
        { id: 'c', charge_id: '1', amount: 200, payments: { status: 'posted', paid_at: '2026-10-02T12:00:00Z' } },
        { id: 'd', charge_id: '3', amount: 200, payments: { status: 'posted', paid_at: '2026-10-02T12:00:00Z' } },
        { id: 'e', charge_id: '6', amount: 300, payments: { status: 'posted', paid_at: '2026-10-03T06:00:00Z' } },
        { id: 'void-payment', charge_id: '3', amount: 100, payments: { status: 'void', paid_at: '2026-10-02T12:00:00Z' } },
      ];
      if (table === 'enrollment_credit_applications') data = [
        { charge_id: '1', amount: 100, applied_at: '2026-10-02T13:00:00Z' },
        ...Array.from({ length: 501 }, (_, i) => ({ charge_id: '2', amount: i === 500 ? 295 : 0.01, applied_at: '2026-10-02T14:00:00Z' })),
      ];
      for (const [op, key, value] of filters) {
        const get = row => key.split('.').reduce((obj, part) => obj?.[part], row);
        data = data.filter(row => op === 'in' ? value.includes(get(row)) : op === 'eq' ? get(row) === value : get(row) !== value);
      }
      if (fault === 'missing' && table === 'v_charge_collection_balances') data = [];
      return Promise.resolve({ data: data.slice(start, end + 1), error: fault === table ? new Error('database_failure') : null }).then(resolve, reject);
    } };
  return q;
} };
const query = load('src/lib/queries/product-sales.ts', {
  'server-only': {}, '@/lib/exports/product-sales': shared, '@/lib/time': time,
  '@/lib/auth/operational-page-reader': { requireDirectorPageReader: async () => {
    if (!allowed) throw Error('unauthorized');
    return { isDirectorReadOnly: readOnly, supabase: db, campusAccess: { campuses: [campus] } };
  } },
  '@/lib/supabase/admin': { createAdminClient: () => db },
  './products': { getProductChargeLedgerExportData: async () => ledger },
}).getProductSalesExportData;
(async () => {
  let result = await query('product', '', null, null);
  assert.equal(result.rows.length, 4); // two partial cash payments remain one purchase
  assert.equal(result.rows.reduce((n, r) => n + r.quantity, 0), 4);
  assert.equal(result.rows.find(r => r.chargeId === '2').size, null);
  assert.ok(calls.some(c => c.table === 'enrollment_credit_applications' && c.start === 500));
  result = await query('product', campus.id, '2026-10-02', '2026-10-02');
  assert.equal(result.rows.length, 3); // Monterrey midnight inclusive / next midnight exclusive
  assert.equal(result.rows.find(r => r.chargeId === '1').paidAt, '2026-10-02T13:00:00Z');
  assert.equal(await query('product', 'unauthorized-campus', null, null), null);
  readOnly = true;
  assert.equal((await query('product', '', null, null)).rows.length, 4);
  allowed = false; await assert.rejects(query('product', '', null, null), /unauthorized/); allowed = true;
  for (const f of ['charges', 'v_charge_collection_balances', 'payment_allocations', 'enrollment_credit_applications', 'missing']) {
    fault = f; await assert.rejects(query('product', '', null, null));
  }
  fault = null;
  assert.equal(shared.paymentCompletionDate(300, [{ amount: 299.99, at: '2026-10-02T13:00:00Z' }]), null);
  assert.equal(shared.paymentCompletionDate(300, []), null);
  const book = buildProductSalesWorkbook(result);
  const restored = new (require('exceljs').Workbook)();
  await restored.xlsx.load(await book.xlsx.writeBuffer());
  const detail = restored.getWorksheet('Detalle'), summary = restored.getWorksheet('Resumen por talla');
  assert.equal(detail.rowCount, 6);
  assert.equal(detail.getCell('B4').value, '=SUM(1,2)');
  assert.equal(detail.getCell('B4').type, require('exceljs').ValueType.String);
  assert.equal(summary.lastRow.getCell(3).value, 3);
  assert.equal(detail.getCell('H6').value, time.formatDateTimeMonterrey('2026-10-02T06:00:00+00:00'));
  const empty = buildProductSalesWorkbook({ ...result, rows: [] });
  assert.equal(empty.getWorksheet('Resumen por talla').lastRow.getCell(3).value, 0);
  console.log('PASS product sales: paid/partial/void, credit-only/mixed, pagination, campus/role denial, dates, workbook totals, missing sizes and formula-safe strings.');
})().catch(e => { console.error(e); process.exitCode = 1; });
