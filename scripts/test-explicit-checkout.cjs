const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const moduleUnderTest = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/finance/explicit-checkout.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { module: moduleUnderTest, exports: moduleUnderTest.exports, require: (name) => {
  assert.equal(name, 'zod'); return require('zod');
} });
const { quoteExplicitCheckout: quote, prepareExplicitCheckout: prepare, validateExplicitCheckout: validate } = moduleUnderTest.exports;
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const copy = (value) => JSON.parse(JSON.stringify(value));
const line = (n, pending = 700, due = pending) => ({ key: id(n), chargeId: id(n + 100),
  description: `Charge ${n}`, pending, due, kind: 'ordinary', creditAllowed: true });
const base = { enrollmentId: id(900), currency: 'MXN', availableCredit: 300, lines: [line(1), line(2, 600)] };
const options = (payments, creditSelection = []) => ({ requestId: id(901), payments, creditSelection });
let checks = 0;
function check(name, run) { run(); checks++; }
function rejected(name, run, code) { check(name, () => assert.throws(run, (error) => error.code === code)); }
const mixed = options([{ method: 'cash', amount: 400 }, { method: 'card', amount: 600 }], [{ key: id(1), amount: 300 }]);

check('Credit defaults to zero even when available', () => {
  const result = quote(base);
  assert.equal(result.moneyDue, 1300); assert.equal(result.creditApplied, 0); assert.equal(result.creditRemaining, 300);
});
check('Chosen credit affects only its line', () => {
  const result = prepare(base, mixed);
  assert.equal(result.quote.lines[0].moneyDue, 400); assert.equal(result.quote.lines[1].moneyDue, 600);
  assert.equal(result.quote.creditApplied, 300); assert.equal(result.quote.moneyDue, 1000);
  assert.deepEqual(copy(result.paymentAllocations), [
    { paymentIndex: 0, key: id(1), amount: 400 }, { paymentIndex: 1, key: id(2), amount: 600 },
  ]);
});
check('Tender can cross charges without altering its amount or method', () => {
  const input = options([{ method: 'card', amount: 500 }, { method: 'cash', amount: 500 }], mixed.creditSelection);
  const result = prepare(base, input);
  assert.deepEqual(copy(result.command.payments), input.payments);
  assert.deepEqual(copy(result.paymentAllocations), [
    { paymentIndex: 0, key: id(1), amount: 400 }, { paymentIndex: 0, key: id(2), amount: 100 },
    { paymentIndex: 1, key: id(2), amount: 500 },
  ]);
});
check('Credit-only checkout creates no tender allocations', () => {
  const result = prepare({ ...base, availableCredit: 1500 }, options([], [
    { key: id(1), amount: 700 }, { key: id(2), amount: 600 },
  ]));
  assert.equal(result.quote.moneyDue, 0); assert.equal(result.quote.creditRemaining, 200);
  assert.equal(result.command.payments.length, 0); assert.equal(result.paymentAllocations.length, 0);
});
check('Explicit partial ordinary collection preserves remaining debt', () => {
  const result = prepare({ ...base, lines: [line(1, 700, 500)] }, options([{ method: 'card', amount: 300 }], [{ key: id(1), amount: 200 }]));
  assert.equal(result.quote.selectedPendingAfter, 200); assert.equal(result.quote.creditRemaining, 100);
});
for (const total of [999.99, 1000.01, 1300]) {
  rejected(`Exact tender required: ${total}`, () => prepare(base, options([{ method: 'cash', amount: total }], mixed.creditSelection)), 'payment_total_mismatch');
}
for (const value of [0, -1, 0.001, 0.00000001, 1.000000001, NaN, Infinity, '400', 10000000000]) {
  rejected(`Invalid payment amount ${value}`, () => prepare(base, options([{ method: 'cash', amount: value }])), 'invalid_checkout');
}
rejected('Missing tender never becomes credit', () => prepare(base, options([])), 'payment_total_mismatch');
rejected('Third tender rejected', () => prepare(base, options(Array(3).fill({ method: 'cash', amount: 100 }))), 'invalid_checkout');
rejected('Invalid second tender not discarded', () => prepare(base, options([{ method: 'cash', amount: 1300 }, { method: 'invalid', amount: 1 }])), 'invalid_checkout');
rejected('Credit exceeds available', () => quote(base, [{ key: id(1), amount: 301 }]), 'invalid_credit_selection');
rejected('Credit exceeds selected amount', () => quote({ ...base, availableCredit: 900 }, [{ key: id(1), amount: 701 }]), 'invalid_credit_selection');
rejected('Duplicate selection', () => quote(base, [mixed.creditSelection[0], mixed.creditSelection[0]]), 'invalid_credit_selection');
rejected('Unselected charge credit', () => quote(base, [{ key: id(99), amount: 100 }]), 'invalid_credit_selection');
rejected('Ineligible line', () => quote({ ...base, lines: [{ ...line(1), creditAllowed: false }] }, mixed.creditSelection), 'invalid_credit_selection');
rejected('Duplicate cart key', () => quote({ ...base, lines: [line(1), line(1)] }), 'invalid_checkout');
rejected('Same charge under different keys', () => quote({ ...base, lines: [line(1), { ...line(1), key: id(2) }] }), 'invalid_checkout');
const letterId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
rejected('UUID case cannot disguise duplicate charge', () => quote({ ...base, lines: [
  { ...line(1), chargeId: letterId }, { ...line(2), chargeId: letterId.toUpperCase() },
] }), 'invalid_checkout');
check('UUID case is canonical in reviewed requests', () => {
  const lower = { ...base, enrollmentId: letterId };
  const upper = { ...base, enrollmentId: letterId.toUpperCase() };
  assert.deepEqual(copy(prepare(lower, mixed).command), copy(prepare(upper, mixed).command));
});
rejected('Amount above pending', () => quote({ ...base, lines: [line(1, 700, 701)] }), 'invalid_checkout');
rejected('Empty cart', () => quote({ ...base, lines: [] }), 'invalid_checkout');
rejected('Excessive cart', () => quote({ ...base, lines: Array.from({ length: 101 }, (_, n) => line(n + 1)) }), 'invalid_checkout');

const copa = { ...line(3, 1250, 600), kind: 'copa_tigres', creditAllowed: false };
const copaCart = { ...base, lines: [...base.lines, copa] };
check('Mixed Copa cart credit stays on ordinary line', () => {
  const result = prepare(copaCart, options([{ method: 'card', amount: 1000 }, { method: 'cash', amount: 600 }], mixed.creditSelection));
  assert.equal(result.quote.moneyDue, 1600); assert.equal(result.quote.selectedPendingAfter, 650);
  assert.deepEqual(copy(result.paymentAllocations[0]), { paymentIndex: 0, key: id(3), amount: 600 });
  assert.equal(result.quote.lines.find((entry) => entry.key === id(3)).creditApplied, 0);
});
for (const [pending, due] of [[1250, 600], [1250, 1250], [650, 650]]) {
  check(`Allowed Copa installment ${pending}/${due}`, () => {
    const result = prepare({ ...base, lines: [{ ...copa, pending, due }] }, options([{ method: 'card', amount: due }]));
    assert.equal(result.quote.selectedPendingAfter, pending - due);
  });
}
for (const [pending, due] of [[1250, 599], [1250, 650], [650, 600], [1000, 600]]) {
  rejected(`Disallowed Copa installment ${pending}/${due}`, () => quote({ ...base, lines: [{ ...copa, pending, due }] }), 'invalid_copa_installment');
}
rejected('Copa cannot opt itself into credit', () => quote({ ...base, lines: [{ ...copa, creditAllowed: true }] }, [{ key: id(3), amount: 100 }]), 'copa_tigres_no_credit');
rejected('Copa requires MXN', () => quote({ ...base, currency: 'USD', lines: [copa] }), 'invalid_copa_installment');
rejected('Two Copa installments in one cart', () => quote({ ...base, lines: [copa, { ...copa, key: id(4), chargeId: id(104) }] }), 'invalid_checkout');
check('New staged charge needs no persisted charge ID for review', () => {
  assert.equal(quote({ ...base, lines: [{ ...line(1), chargeId: null }] }).moneyDue, 700);
});

const saved = prepare(base, mixed).command;
check('Unchanged snapshot validates identically', () => assert.deepEqual(copy(validate(base, saved).command), copy(saved)));
check('Display order does not alter the command', () => assert.deepEqual(copy(validate({ ...base, lines: [...base.lines].reverse() }, saved).command), copy(saved)));
check('Returned command does not alias mutable input', () => {
  const input = copy(mixed); const result = prepare(base, input); input.payments[0].amount = 1;
  assert.equal(result.command.payments[0].amount, 400);
});
for (const [name, changed] of [
  ['enrollment', { ...base, enrollmentId: id(999) }], ['currency', { ...base, currency: 'USD' }],
  ['available', { ...base, availableCredit: 301 }], ['pending', { ...base, lines: [line(1, 701), line(2, 600)] }],
  ['due', { ...base, lines: [line(1, 700, 600), line(2, 600)] }],
  ['target', { ...base, lines: [{ ...line(1), chargeId: id(888) }, line(2, 600)] }],
  ['eligibility', { ...base, lines: [{ ...line(1), creditAllowed: false }, line(2, 600)] }],
  ['removed line', { ...base, lines: [line(1)] }],
]) rejected(`Changed ${name} requires review`, () => validate(changed, saved), 'checkout_changed');
for (const [name, changed] of [['actor', { ...saved, actorId: id(999) }], ['invalid request', { ...saved, requestId: '' }],
  ['extra payment property', { ...saved, payments: [{ method: 'cash', amount: 1000, ignored: true }] }]]) {
  rejected(`Reject command ${name}`, () => validate(base, changed), 'invalid_checkout');
}
check('Descriptions come from the trusted current snapshot', () => {
  const result = validate({ ...base, lines: [{ ...line(1), description: 'Current description' }, line(2, 600)] }, saved);
  assert.equal(result.quote.lines[0].description, 'Current description');
});

check('Cent arithmetic and tender conservation across 500 carts', () => {
  for (let n = 1; n <= 500; n++) {
    const first = n * 137 + 1, second = n * 71 + 3, credit = n * 31;
    const snapshot = { ...base, availableCredit: credit / 100, lines: [line(1, first / 100), line(2, second / 100)] };
    const money = first + second - credit, split = Math.floor(money / 3);
    const result = prepare(snapshot, options([{ method: 'cash', amount: split / 100 }, { method: 'card', amount: (money - split) / 100 }], [{ key: id(1), amount: credit / 100 }]));
    assert.equal(Math.round(result.quote.moneyDue * 100), money);
    assert.equal(Math.round(result.quote.creditApplied * 100) + money, first + second);
    result.command.payments.forEach((payment, index) => assert.equal(
      result.paymentAllocations.filter((allocation) => allocation.paymentIndex === index).reduce((sum, allocation) => sum + Math.round(allocation.amount * 100), 0),
      Math.round(payment.amount * 100)));
    result.quote.lines.forEach((entry) => assert.equal(
      result.paymentAllocations.filter((allocation) => allocation.key === entry.key).reduce((sum, allocation) => sum + Math.round(allocation.amount * 100), 0),
      Math.round(entry.moneyDue * 100)));
  }
});
console.log(`${checks} explicit-checkout checks passed (including 500 cent-conservation cases). No database or network access.`);
