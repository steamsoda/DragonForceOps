const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript');
const load = (file, modules = {}, globals = {}) => {
  const m = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { module: m, exports: m.exports, console, Date, ...globals, require: name => { assert.ok(name in modules, name); return modules[name]; } });
  return m.exports;
};
let checks = 0, nextTimer = 0;
const check = (ok, name) => { assert.ok(ok, name); checks++; };
const timers = new Map(), logs = [];
const modules = require('./fixtures/reliability-modules.cjs')({ logs, setTimeout: fn => { const id = ++nextTimer; timers.set(id, fn); return id; }, clearTimeout: id => timers.delete(id) });
const attempts = modules['@/lib/printer-attempts'];
const flush = () => new Promise(resolve => setImmediate(resolve));
const expire = () => { const current = [...timers.values()]; timers.clear(); for (const fn of current) fn(); };
(async () => {
  let resolveJob, rejectJob, jobs = 0, notifications = 0;
  const unsubscribe = attempts.subscribePrintStatus(() => notifications++);
  const pending = attempts.runPrintAttempt('one', 'TEST', () => { jobs++; return new Promise((resolve, reject) => { resolveJob = resolve; rejectJob = reject; }); });
  await flush();
  check(attempts.getPrintStatus('one') === 'printing' && jobs === 1, 'One pending dispatch');
  await assert.rejects(() => attempts.runPrintAttempt('two', 'TEST', async () => jobs++), /print_in_progress/); checks++;
  const timeout = assert.rejects(pending, /print_delivery_unknown/); expire(); await timeout;
  check(attempts.getPrintStatus('one') === 'unknown' && attempts.isPrintPending('one'), 'Timeout leaves delivery unknown and transport locked');
  await assert.rejects(() => attempts.runPrintAttempt('one', 'TEST', async () => jobs++), /print_in_progress/); checks++;
  unsubscribe(); const before = notifications;
  resolveJob(); await flush();
  check(attempts.getPrintStatus('one') === 'sent' && !attempts.isPrintPending('one') && jobs === 1 && notifications === before, 'Late completion settles original attempt without duplicate or unmounted notification');
  const lateFailure = attempts.runPrintAttempt('three', 'TEST', () => new Promise((resolve, reject) => { rejectJob = reject; }));
  await flush(); const rejected = assert.rejects(lateFailure, /print_delivery_unknown/); expire(); await rejected;
  rejectJob(Error('socket closed')); await flush();
  check(attempts.getPrintStatus('three') === 'unknown' && !attempts.isPrintPending('three'), 'Late error cannot claim paper was not delivered');
  await attempts.runPrintAttempt('three', 'TEST', async () => jobs++);
  check(jobs === 2 && attempts.getPrintStatus('three') === 'sent', 'Only a new explicit request dispatches after prior attempt settled');

  const scripts = []; let connects = 0, active = false, resolveConnect;
  const window = {};
  const qz = { websocket: { isActive: () => active, connect: () => { connects++; return new Promise(resolve => { resolveConnect = () => { active = true; resolve(); }; }); } },
    security: { setCertificatePromise() {}, setSignatureAlgorithm() {}, setSignaturePromise() {} } };
  const printer = load('src/lib/printer.ts', { ...modules,
    '@/lib/perf/timing': { createPerfTimer: () => ({ mark() {}, end() {} }) },
    '@/lib/finance/checkout-receipt': { checkoutReceiptLines: () => [] },
    '@/lib/finance/charge-operation-receipt': { operationReceiptLines: () => [] },
  }, { process: { env: {} }, window, document: { createElement: () => ({ remove() { this.removed = true; } }), head: { appendChild: script => scripts.push(script) } } });
  const failed = printer.connectQZ(); const failedCheck = assert.rejects(failed, /Could not load/); scripts[0].onerror(); await failedCheck;
  check(scripts[0].removed, 'Failed script removed');
  const retry = printer.connectQZ(), simultaneous = printer.connectQZ();
  check(scripts.length === 2, 'Retry starts one new load and concurrent callers share it');
  window.qz = qz; scripts[1].onload(); await flush();
  check(connects === 1, 'Concurrent callers share one QZ connection');
  resolveConnect(); await Promise.all([retry, simultaneous]);
  await printer.connectQZ(); check(scripts.length === 2 && connects === 1, 'Active connection reuses successfully loaded QZ');

  let signaturePromise, signingReply, signedJobs = 0, signingCalls = 0;
  const signedQz = { websocket: { isActive: () => false, connect: async () => {} },
    security: { setCertificatePromise() {}, setSignatureAlgorithm() {}, setSignaturePromise(value) { signaturePromise = value; } },
    configs: { create: () => ({}) }, print: () => { signedJobs++; return new Promise((resolve,reject) => signaturePromise('synthetic-command')(resolve,reject)); } };
  const signedPrinter = load('src/lib/printer.ts', { ...modules,
    '@/lib/perf/timing': { createPerfTimer: () => ({ mark() {}, end() {} }) },
    '@/lib/finance/checkout-receipt': { checkoutReceiptLines: () => [] },
    '@/lib/finance/charge-operation-receipt': { operationReceiptLines: () => [] },
  }, { process: { env: { NEXT_PUBLIC_QZ_CERTIFICATE: 'TEST-CERTIFICATE' } }, window: { qz: signedQz },
    btoa: value => Buffer.from(value,'latin1').toString('base64'),
    fetch: () => { signingCalls++; return new Promise(resolve => { signingReply = resolve; }); } });
  const signing = signedPrinter.printExplicitCheckoutReceipt('SIGNED-TEST', { operationId: 'signed', operatorCampusName: 'Synthetic' });
  await flush(); const signingTimeout = assert.rejects(signing,/print_delivery_unknown/); expire(); await signingTimeout;
  check(attempts.getPrintStatus('signed') === 'unknown' && signedJobs === 1 && signingCalls === 1, 'Stalled signing becomes unknown without a second dispatch');
  signingReply({ ok: true, text: async () => 'synthetic-signature' }); await flush();
  check(attempts.getPrintStatus('signed') === 'sent' && signedJobs === 1, 'Late signing completion belongs to original job');
  let printReply;
  signedQz.print = () => { signedJobs++; return new Promise(resolve => { printReply = resolve; }); };
  const socket = signedPrinter.printExplicitCheckoutReceipt('SIGNED-TEST', { operationId: 'socket', operatorCampusName: 'Synthetic' });
  await flush(); const socketTimeout = assert.rejects(socket,/print_delivery_unknown/); expire(); await socketTimeout;
  check(attempts.getPrintStatus('socket') === 'unknown' && signedJobs === 2, 'Open socket without job reply remains unknown');
  printReply(); await flush(); check(attempts.getPrintStatus('socket') === 'sent' && signedJobs === 2, 'Late socket reply does not send another job');

  let context = null, signatures = 0;
  const route = load('src/app/api/sign-qz/route.ts', { ...modules,
    crypto: { createSign: () => ({ update() {}, end() {}, sign: () => { signatures++; return 'synthetic-signature'; } }) },
    '@/lib/auth/permissions': { getPermissionContext: async () => context },
  }, { Response, process: { env: { QZ_PRIVATE_KEY: 'synthetic-key' } } });
  const request = { headers: new Headers(), json: async () => ({ message: 'synthetic-command' }) };
  check((await route.POST(request)).status === 401 && signatures === 0, 'Signing rechecks current authentication');
  context = { hasOperationalAccess: false };
  check((await route.POST(request)).status === 403 && signatures === 0, 'Signing denies revoked operational access');
  context = { hasOperationalAccess: true };
  check((await route.POST(request)).status === 200 && signatures === 1, 'Authorized signing retains successful behavior');
  check(!JSON.stringify(logs).includes('synthetic-command') && !JSON.stringify(logs).includes('synthetic-key'), 'Signing logs exclude commands and secrets');

  logs.length = 0;
  const trace = modules['@/lib/perf/checkout-timing'].createCheckoutTrace('not a valid private email');
  for (let i = 0; i < 70; i++) await trace.run('checkout', async () => ({ private: 'never log this', amount: 700 }));
  check(logs.length === 128 && logs.every(row => !JSON.stringify(row).includes('never log') && !JSON.stringify(row).includes('email')), 'Bounded stage traces contain no action payload or unvalidated correlation value');

  const storage = new Map();
  const recovery = load('src/lib/finance/explicit-cart-recovery.ts', { './explicit-checkout': {} }, { FormData,
    sessionStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) } });
  const form = new FormData(); form.set('explicitCommand', JSON.stringify({ requestId: 'new' }));
  recovery.saveCartRecovery('actor', 'enrollment', form, {});
  recovery.clearCartRecovery('actor', 'enrollment', 'old'); check(storage.size === 1, 'Late old acknowledgement cannot delete newer recovery');
  recovery.clearCartRecovery('actor', 'enrollment', 'new'); check(storage.size === 0, 'Matching acknowledgement clears its own recovery');
  console.log(`PASS ${checks} reliability, script retry, tracing and recovery checks. No network or printer access.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
