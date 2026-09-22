const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript');
const id = '11111111-1111-4111-8111-111111111111', request = '22222222-2222-4222-8222-222222222222';
let user = { id }, readOnly = false, payment, saved, privateReads = 0, checks = 0;
const filters = [];
const check = (condition, name) => { assert.ok(condition, name); checks++; };
const modules = {
  '@/lib/auth/permissions': { getPermissionContext: async () => ({ isDirectorReadOnly: readOnly }) },
  '@/lib/perf/timing': { createPerfTimer: () => ({ mark() {}, end() {} }) },
  '@/lib/time': { formatDateMonterrey: () => '21/09/2026', formatTimeMonterrey: () => '12:00' },
  '@/lib/supabase/server': { createClient: async () => ({ auth: { getUser: async () => ({ data: { user } }) }, from: table => {
    assert.equal(table, 'payments'); const q = { select: () => q, eq: (key, value) => { filters.push([key, value]); return q; },
      maybeSingle: () => q, returns: async () => ({ data: payment }) }; return q;
  } }) },
  '@/lib/supabase/admin': { createAdminClient: () => { privateReads++; return { from: table => {
    assert.equal(table, 'explicit_cart_checkouts'); const q = { select: () => q, eq: (key, value) => { filters.push([key, value]); return q; },
      maybeSingle: async () => ({ data: { receipt: saved }, error: null }) }; return q;
  } }; } },
};
const m = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/server/actions/receipts.ts', 'utf8'), { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
} }).outputText, { module: m, exports: m.exports, Date, console, require: name => { assert.ok(name in modules, name); return modules[name]; } });
const get = () => m.exports.getReceiptForPrintAction(id);
(async () => {
  readOnly = true; check(!(await get()).ok && privateReads === 0, 'Read-only print denied'); readOnly = false;
  user = null; check(!(await get()).ok && privateReads === 0, 'Anonymous denied'); user = { id };
  payment = null; check(!(await get()).ok && privateReads === 0, 'RLS-hidden payment never triggers private snapshot read');
  payment = { id, enrollment_id: id, provider_ref: `explicit-cart-${request}-1`, enrollments: { players: { first_name: 'Changed', last_name: 'Name' } } };
  saved = { operationId: request, enrollmentId: id, playerName: 'Original name', operatorCampusName: 'Contry', paidAt: '2026-09-21T18:00:00Z',
    moneyReceived: 500, creditApplied: 200, pendingChargesTotal: 0, currency: 'MXN', lines: [{ description: 'Uniforme', moneyReceived: 500 }],
    payments: [{ id: request, folio: 'FIRST', method: 'cash', amount: 200 }, { id, folio: 'SECOND', method: 'card', amount: 300 }] };
  const result = await get();
  check(result.ok && result.receipt.explicitCheckout.playerName === 'Original name', 'Receipt uses saved identity not changed account');
  check(result.receipt.amount === 500 && result.receipt.creditAppliedAmount === 200, 'Money and credit remain distinct');
  check(result.receipt.splitPayment.amount === 300 && result.receipt.folio === 'FIRST', 'Either tender retrieves complete saved checkout');
  check(filters.some(([key, value]) => key === 'status' && value === 'posted') && filters.some(([key, value]) => key === 'enrollment_id' && value === id), 'Posted payment and enrollment scope enforced');
  saved.enrollmentId = request; check(!(await get()).ok, 'Wrong enrollment snapshot denied'); saved.enrollmentId = id;
  saved.operationId = id; check(!(await get()).ok, 'Wrong operation snapshot denied'); saved.operationId = request;
  saved.payments = []; check(!(await get()).ok, 'Unrelated payment denied');
  console.log(`PASS ${checks} explicit receipt access checks.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
