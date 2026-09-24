const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript');
function load(file, modules) {
  const m = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { module: m, exports: m.exports, FormData, crypto: require('node:crypto').webcrypto, require: name => { assert.ok(name in modules, name); return modules[name]; } });
  return m.exports;
}
const domain = load('src/lib/finance/explicit-checkout.ts', { zod: require('zod') });
const credit = load('src/lib/finance/explicit-credit.ts', { zod: require('zod') });
const fast = load('src/lib/finance/fast-checkout.ts', { './explicit-checkout': domain, './explicit-credit': credit });
const actor = '11111111-1111-4111-8111-111111111111', request = '22222222-2222-4222-8222-222222222222', other = '33333333-3333-4333-8333-333333333333';
const snapshot = { enrollmentId: actor, currency: 'MXN', availableCredit: 900, lines: [
  { key: actor, chargeId: actor, description: 'Tuition', pending: 700, due: 700, kind: 'ordinary', creditAllowed: true },
] };
const base = new FormData(); base.set('method', 'card'); base.set('amount', '700'); base.set('targetChargeIds', actor);
let checks = 0;
function check(value, name) { assert.ok(value, name); checks++; }
const form = fast.prepareFastCheckoutForm(actor, snapshot, base, request), command = JSON.parse(form.get('explicitCommand'));
check(command.requestId === request && command.creditSelection.length === 0, 'One preassigned request with no implicit credit');
check(command.payments[0].amount === 700 && command.expectedAvailableCredit === 900, 'Full money despite available credit');
check(form.get('targetChargeIds') === actor && form.get('checkoutActorId') === actor, 'Displayed targets and actor frozen');
check(form.get('checkoutMode') === 'fast' && JSON.parse(form.get('displayedSnapshot')).lines[0].due === 700, 'Recovery snapshot stored before server request');
const plan = domain.validateExplicitCheckout(snapshot, command);
check(plan.quote.creditRemaining === 900 && plan.quote.creditApplied === 0, 'Server validation preserves unused credit');
for (const changed of [
  { ...snapshot, lines: [{ ...snapshot.lines[0], due: 710, pending: 710 }] },
  { ...snapshot, lines: [{ ...snapshot.lines[0], key: other, chargeId: other }] },
  { ...snapshot, currency: 'USD' },
]) { assert.throws(() => domain.validateExplicitCheckout(changed, command), /checkout_changed/); checks++; }
base.set('amount', '300'); base.set('amount2', '400'); base.set('method2', 'cash');
check(domain.validateExplicitCheckout(snapshot, JSON.parse(fast.prepareFastCheckoutForm(actor, snapshot, base, request).get('explicitCommand'))).command.payments.length === 2, 'Split tender stays intact');
base.set('amount2', '401'); assert.throws(() => fast.prepareFastCheckoutForm(actor, snapshot, base, request), /payment_total_mismatch/); checks++;
base.delete('amount2'); base.delete('method2'); base.set('amount', '600');
const copa = { ...snapshot, lines: [{ ...snapshot.lines[0], chargeId: null, pending: 1250, due: 600, kind: 'copa_tigres', creditAllowed: false }] };
check(domain.validateExplicitCheckout(copa, JSON.parse(fast.prepareFastCheckoutForm(actor, copa, base, request).get('explicitCommand'))).quote.moneyDue === 600, 'Copa deposit supported without credit');
base.set('amount', '599'); assert.throws(() => fast.prepareFastCheckoutForm(actor, { ...copa, lines: [{ ...copa.lines[0], due: 599 }] }, base, request), /invalid_copa_installment/); checks++;
console.log(`PASS ${checks} fast checkout price, credit, split and Copa checks.`);
