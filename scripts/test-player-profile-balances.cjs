const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript');
let allowed = true, readerAllowed = true, readOnly = false, financeCalls = [], ledgerCalls = 0;
let fault = null, enrollments = [], checks = 0;
const active = { id: 'active', status: 'active', start_date: '2026-08-01', campuses: { id: 'allowed' } };
const historical = { id: 'historical', status: 'ended', start_date: '2025-08-01', end_date: '2026-07-01', campuses: { id: 'allowed' } };
const balances = {
  active: { enrollment_id: 'active', total_charges: 1000, total_payments: 700, balance: 100 },
  historical: { enrollment_id: 'historical', total_charges: 1500, total_payments: 1700, balance: 0 },
};
const client = { from(table) {
  const filters = []; let single = false;
  const q = { select: () => q, eq: (key, value) => { filters.push([key, value]); return q; },
    in: () => { throw Error('Profile balance reads must not use IN'); },
    order: () => q, is: () => q, maybeSingle: () => { single = true; return q; }, returns: () => q,
    then(resolve, reject) {
      let data = single ? null : [], error = null;
      if (table === 'players') data = { id: 'player', first_name: 'Test', last_name: 'Player' };
      if (table === 'enrollments') data = enrollments;
      if (table === 'v_enrollment_collection_balances') {
        assert.equal(filters.length, 1); assert.equal(filters[0][0], 'enrollment_id'); assert.ok(single);
        const id = filters[0][1]; financeCalls.push(id); data = balances[id];
        if (fault === 'error') error = { code: '57014' };
        if (fault === 'missing') data = null;
        if (fault === 'wrong') data = { ...data, enrollment_id: 'someone-else' };
      }
      return Promise.resolve({ data, error }).then(resolve, reject);
    } };
  return q;
} };
const modules = {
  '@/lib/supabase/server': { createClient: async () => client },
  '@/lib/auth/permissions': { getPermissionContext: async () => ({ isDirectorReadOnly: readOnly }) },
  '@/lib/auth/director-player-reader': { directorPlayerReader: async () => readerAllowed ? client : null },
  '@/lib/auth/campuses': { getOperationalCampusAccess: async () => allowed ? { campusIds: ['allowed'] } : null, canAccessCampus: (_, id) => id === 'allowed' },
  '@/lib/incidents': { resolveActiveIncident: () => null },
  '@/lib/queries/billing': { getEnrollmentLedger: async () => { ledgerCalls++; return { marker: 'canonical ledger' }; } },
  '@/lib/enrollments/dropout-reasons': { DROPOUT_REASON_CATEGORIES: [] },
  '@/lib/training-groups/shared': {},
};
const m = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/queries/players.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { module: m, exports: m.exports, console, require: id => { assert.ok(id in modules, id); return modules[id]; } });
const detail = m.exports.getPlayerDetail;
const check = (ok, name) => { assert.ok(ok, name); checks++; };
function reset(rows = [active, historical]) { enrollments = rows; financeCalls = []; ledgerCalls = 0; fault = null; allowed = readerAllowed = true; readOnly = false; }
(async () => {
  reset(); let result = await detail('player');
  check(financeCalls.join(',') === 'active,historical', 'Both balances loaded using individual equality reads');
  check(result.activeEnrollment.balance === 100, 'Explicit-credit collection balance retained, not cash/accounting balance');
  check(result.historicalEnrollments[0].balance === 0 && result.historicalEnrollments[0].totalPayments === 1700, 'Historical funded balance retained');
  check(ledgerCalls === 1 && result.activeEnrollmentLedger.marker === 'canonical ledger', 'Full detail still loads canonical active ledger');
  reset([active]); check((await detail('player')).enrollments.length === 1 && financeCalls.length === 1, 'Single enrollment');
  for (const failure of ['error', 'missing', 'wrong']) {
    reset(); fault = failure; await assert.rejects(detail('player'), /profile_balance_unavailable/); checks++;
  }
  reset(); await detail('player', { includeFinance: false }); check(!financeCalls.length && !ledgerCalls, 'Finance disabled skips balance and ledger reads');
  reset([active, { ...historical, campuses: { id: 'denied' } }]); result = await detail('player');
  check(result.enrollments.length === 1 && financeCalls.join(',') === 'active', 'Unauthorized historical campus excluded before balance reads');
  reset(); allowed = false; check(await detail('player') === null && !financeCalls.length, 'No campus access denies profile');
  reset(); readOnly = true; check((await detail('player')).activeEnrollment.balance === 100, 'Read-only facade keeps collection semantics');
  reset(); readOnly = true; readerAllowed = false; check(await detail('player') === null && !financeCalls.length, 'Read-only facade denial preserved');
  console.log(`PASS ${checks} full player-detail balance regression checks.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
