const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript');
const store = new Map(); let unavailable = false;
const sessionStorage = { getItem: key => store.get(key) ?? null,
  setItem: (key, value) => { if (unavailable) throw Error('storage unavailable'); store.set(key, value); }, removeItem: key => store.delete(key) };
function load(file, modules) {
  const m = { exports: {} }; vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText, { module: m, exports: m.exports, FormData, sessionStorage,
    require: name => { assert.ok(name in modules, name); return modules[name]; } }); return m.exports;
}
const domain = load('src/lib/finance/explicit-checkout.ts', { zod: require('zod') });
const recovery = load('src/lib/finance/explicit-cart-recovery.ts', { './explicit-checkout': domain });
const id = '11111111-1111-4111-8111-111111111111', request = '22222222-2222-4222-8222-222222222222';
const snapshot = { enrollmentId: id, currency: 'MXN', availableCredit: 200,
  lines: [{ key: id, chargeId: id, description: 'Tuition', pending: 700, due: 700, kind: 'ordinary', creditAllowed: true }] };
const command = domain.prepareExplicitCheckout(snapshot, { requestId: request, creditSelection: [{ key: id, amount: 200 }], payments: [{ method: 'cash', amount: 500 }] }).command;
const form = new FormData(); form.set('explicitCommand', JSON.stringify(command)); form.set('checkoutActorId', id);
let checks = 0; const check = (value, message) => { assert.ok(value, message); checks++; };
check(recovery.loadCartRecovery(id, id) === null, 'No pending attempt by default');
recovery.saveCartRecovery(id, id, form, snapshot);
check(recovery.loadCartRecovery(id, id).get('explicitCommand') === form.get('explicitCommand'), 'Exact request survives serialization');
check(recovery.loadCartRecovery(request, id) === null, 'Other actor cannot load attempt');
check(recovery.loadCartRecovery(id, request) === null, 'Other enrollment cannot load attempt');
unavailable = true; assert.throws(() => recovery.saveCartRecovery(id, id, form, snapshot), /storage unavailable/); checks++; unavailable = false;
const key = [...store.keys()][0]; const valid = store.get(key);
store.set(key, '{bad'); assert.throws(() => recovery.loadCartRecovery(id, id)); checks++;
const changed = JSON.parse(valid); changed.snapshot.enrollmentId = request; store.set(key, JSON.stringify(changed));
assert.throws(() => recovery.loadCartRecovery(id, id), /invalid_recovery/); checks++;
store.set(key, valid); recovery.clearCartRecovery(id, id);
check(recovery.loadCartRecovery(id, id) === null, 'Known resolved operation is cleared');
console.log(`PASS ${checks} tab recovery isolation and corruption checks.`);
