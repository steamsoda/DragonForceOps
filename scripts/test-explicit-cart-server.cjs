const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript');
function load(file, modules) {
  const m = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText, { module: m, exports: m.exports, console, require: id => {
    assert.ok(id in modules, id); return modules[id];
  } });
  return m.exports;
}
const domain = load('src/lib/finance/explicit-checkout.ts', { zod: require('zod') });
const id = '11111111-1111-4111-8111-111111111111';
const request = '22222222-2222-4222-8222-222222222222';
const snapshot = { enrollmentId: id, currency: 'MXN', availableCredit: 200,
  lines: [{ key: id, chargeId: id, description: 'Tuition', pending: 700, due: 700, kind: 'ordinary', creditAllowed: true }] };
let context = null, access = true, debug = false, prior = null, intent = null, rpcError = null, network = false;
let lookupError = null, ackError = null;
let reads = 0, resolves = 0, calls = [], checks = 0;
const check = (value, message) => { assert.ok(value, message); checks++; };
const adapter = load('src/lib/payments/explicit-cart-server.ts', {
  ...require('./fixtures/reliability-modules.cjs')(),
  'server-only': {}, 'node:crypto': require('node:crypto'), zod: require('zod'),
  'next/cache': { revalidatePath() { throw Error('cache offline'); } },
  '@/lib/auth/permissions': { getPermissionContext: async () => context, canAccessEnrollmentRecord: async () => access },
  '@/lib/auth/debug-view': { isDebugWriteBlocked: async () => debug },
  '@/lib/time': { parseMonterreyDateTimeInput: value => value === 'valid' ? '2026-09-21T18:00:00Z' : null },
  '@/lib/finance/explicit-checkout': domain,
  '@/lib/supabase/admin': { createAdminClient: () => ({ from: table => {
    reads++; const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: table === 'explicit_cart_intents' ? intent : prior, error: lookupError }) }; return q;
  }, rpc: async (name, args) => {
    calls.push({ name, args }); if (network) throw Error('private network detail');
    if (name === 'acknowledge_explicit_cart') {
      if (!ackError && intent) intent.state = 'completed';
      return { data: null, error: ackError };
    }
    return { data: { operationId: request }, error: name === 'checkout_explicit_cart' ? rpcError : null };
  } }) },
});
const resolve = async () => { resolves++; return { snapshot, charges: [] }; };
const command = domain.prepareExplicitCheckout(snapshot, { requestId: request, creditSelection: [], payments: [{ method: 'cash', amount: 700 }] }).command;
const form = new FormData();
form.set('explicitCommand', JSON.stringify(command)); form.set('operatorCampusId', id);
form.set('checkoutActorId', id);
(async () => {
  check(!(await adapter.saveExplicitCart(id, form, resolve)).ok && reads === 0, 'Anonymous denied before private reads');
  context = { user: { id }, roleCodes: [], isDirector: true, isDirectorReadOnly: true };
  check(!(await adapter.saveExplicitCart(id, form, resolve)).ok && reads === 0, 'Read-only director denied');
  context.isDirectorReadOnly = false; access = false;
  check(!(await adapter.reviewExplicitCart(id, form, resolve)).ok && resolves === 0, 'Campus authorization before resolving');
  access = true; debug = true;
  check(!(await adapter.saveExplicitCart(id, form, resolve)).ok && reads === 0, 'Debug writes denied'); debug = false;
  const review = await adapter.reviewExplicitCart(id, form, resolve);
  check(review.ok && !('charges' in review) && calls.length === 0, 'Review returns snapshot only and no transaction');
  check((await adapter.saveExplicitCart(id, form, resolve)).ok, 'Save survives cache invalidation failure');
  const saved = calls.at(-1).args;
  check(saved.p_actor === id && saved.p_payload.command.creditSelection.length === 0, 'Verified actor and zero-default credit');
  prior = { actor_id: id, enrollment_id: id, campus_id: id, payload: saved.p_payload };
  const count = resolves;
  check((await adapter.saveExplicitCart(id, form, resolve)).ok && resolves === count, 'Replay does not regenerate plans');
  check(JSON.stringify(calls.at(-1).args) === JSON.stringify(saved), 'Replay submits identical saved payload');
  form.set('notes', 'changed'); const writes = calls.length;
  check((await adapter.saveExplicitCart(id, form, resolve)).error === 'checkout_request_conflict' && calls.length === writes, 'Changed retry rejected before write');
  form.delete('notes'); access = false;
  check(!(await adapter.saveExplicitCart(id, form, resolve)).ok && calls.length === writes, 'Replay rechecks authorization'); access = true;
  network = true;
  const uncertain = await adapter.saveExplicitCart(id, form, resolve);
  check(uncertain.uncertain && !JSON.stringify(uncertain).includes('private'), 'Network outcome frozen without secret disclosure'); network = false;
  rpcError = { message: 'checkout_changed' };
  check((await adapter.saveExplicitCart(id, form, resolve)).error === 'checkout_changed', 'Stale state classified'); rpcError = null;
  form.set('paidAt', 'invalid');
  check((await adapter.saveExplicitCart(id, form, resolve)).error === 'invalid_checkout', 'Invalid date denied');
  form.delete('paidAt'); context.user = { id: request };
  const before = calls.length;
  check((await adapter.saveExplicitCart(id, form, resolve)).error === 'forbidden' && calls.length === before, 'Operator change cannot submit recovered attempt');
  context.user = { id }; prior = null;
  const staged = calls.find(call => call.name === 'stage_explicit_cart').args;
  intent = { actor_id: id, enrollment_id: id, campus_id: id, payload: staged.p_payload, recovery: staged.p_recovery, state: 'pending' };
  const resolveCount = resolves;
  check((await adapter.saveExplicitCart(id, form, resolve)).ok && resolves === resolveCount, 'Durable pending retry never regenerates prices');
  const recovered = await adapter.getExplicitCartRecoveryState(id);
  check(recovered.actorId === id && recovered.recovery.fields.some(([key]) => key === 'explicitCommand'), 'Original operator can recover without browser storage');
  intent.actor_id = request;
  const other = await adapter.getExplicitCartRecoveryState(id);
  check(other.blocked && other.recovery === null, 'Other operator blocked without exposing pending payload');
  intent.actor_id = id;
  check((await adapter.acknowledgeExplicitCart(id, request)).ok && intent.state === 'completed', 'Checked acknowledgement verifies completed state');
  check((await adapter.acknowledgeExplicitCart(id, request)).ok, 'Repeated acknowledgement idempotent');
  intent.state = 'pending'; ackError = { message: 'private failure' };
  check(!(await adapter.acknowledgeExplicitCart(id, request)).ok && intent.state === 'pending', 'Returned RPC error cannot masquerade as success'); ackError = null;
  lookupError = { message: 'private lookup failure' }; const beforeAck = calls.length;
  check(!(await adapter.acknowledgeExplicitCart(id, request)).ok && calls.length === beforeAck, 'Lookup error does not acknowledge'); lookupError = null;
  network = true;
  check(!(await adapter.acknowledgeExplicitCart(id, request)).ok, 'Lost acknowledgement response remains unconfirmed'); network = false;
  access = false;
  check((await adapter.acknowledgeExplicitCart(id, request)).error === 'forbidden', 'Acknowledgement rechecks revoked campus access'); access = true;
  context.isDirectorReadOnly = true;
  check((await adapter.acknowledgeExplicitCart(id, request)).error === 'forbidden', 'Acknowledgement denies downgraded reader'); context.isDirectorReadOnly = false;
  intent = null;
  check(!(await adapter.acknowledgeExplicitCart(id, request)).ok, 'Missing intent cannot be silently acknowledged');
  console.log(`PASS ${checks} explicit cart adapter checks.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
