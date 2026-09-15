const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
function load(file, modules = {}) {
  const m = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { module: m, exports: m.exports, console, require: id => {
    if (!(id in modules)) throw Error(id);
    return modules[id];
  } });
  return m.exports;
}
const id = "11111111-1111-4111-8111-111111111111";
const campus = "22222222-2222-4222-8222-222222222222";
const charge = "33333333-3333-4333-8333-333333333333";
const payment = "44444444-4444-4444-8444-444444444444";
const when = "2026-09-01T18:00:00Z";
const rows = {
  enrollments: [{ id, campus_id: campus, status: "active", start_date: "2026-09-01", end_date: null,
    campuses: { id: campus, name: "Contry", code: "CO" }, players: { id: "player", first_name: "Test", last_name: "Player", birth_date: "2015-01-01" },
    pricing_plans: { name: "Mensual", currency: "MXN" } }],
  v_enrollment_balances: [{ enrollment_id: id, total_charges: 700, total_payments: 700, balance: 0 }],
  v_enrollment_credit_balances: [{ enrollment_id: id, original_credit_total: 300, applied_credit_total: 300, available_credit_total: 0, open_credit_count: 0 }],
  charges: [{ id: charge, enrollment_id: id, description: "Mensualidad", amount: 700, currency: "MXN", status: "pending",
    due_date: "2026-09-10", period_month: "2026-09-01", created_at: when, charge_types: { code: "monthly_tuition", name: "Mensualidad" } }],
  payments: [{ id: payment, enrollment_id: id, folio: "TEST", paid_at: when, method: "cash", amount: 400, currency: "MXN", status: "posted", created_at: when, operator_campus_id: campus }],
  campuses: [{ id: campus, name: "Contry", code: "CO" }],
  payment_allocations: [{ payment_id: payment, charge_id: charge, amount: 400, created_at: when }],
  enrollment_credit_applications: [{ id: "credit-use", charge_id: charge, amount: 300, applied_at: when }],
};
let failRelation = null, queries = [], readerCalls = 0;
function query(table) {
  let data = [...(rows[table] ?? [])], single = false;
  const q = {
    select: () => q,
    eq: (key, value) => { data = data.filter(row => row[key] === value); return q; },
    neq: (key, value) => { data = data.filter(row => row[key] !== value); return q; },
    in: (key, values) => { data = data.filter(row => values.includes(row[key])); return q; },
    order: () => q,
    maybeSingle: () => { single = true; return q; },
    returns: () => q,
    then: (resolve, reject) => {
      queries.push(table);
      return Promise.resolve({ data: single ? data[0] ?? null : data, error: table === failRelation ? { message: "failed" } : null }).then(resolve, reject);
    },
  };
  return q;
}
const client = { from: query };
let context = { hasOperationalAccess: true, isDirectorReadOnly: false, campusAccess: {} };
const billing = load("src/lib/queries/billing.ts", {
  "@/lib/supabase/server": { createClient: async () => client },
  "@/lib/auth/campuses": { canAccessCampus: (_scope, candidate) => candidate === campus, getOperationalCampusAccess: async () => ({}) },
  "@/lib/auth/permissions": { getPermissionContext: async () => context },
  "@/lib/auth/director-account-reader": { directorAccountReader: async (_context, candidate) => { readerCalls++; assert.equal(candidate, id); return client; } },
  "@/lib/finance/account-credit": load("src/lib/finance/account-credit.ts"),
  "@/lib/perf/timing": { createPerfTimer: () => ({}) },
});
(async () => {
  const director = await billing.getEnrollmentLedger(id);
  assert.equal(readerCalls, 0);
  context = { ...context, hasOperationalAccess: false, isDirectorReadOnly: true };
  const readonly = await billing.getEnrollmentLedger(id);
  assert.equal(readerCalls, 1);
  assert.equal(JSON.stringify(readonly), JSON.stringify(director), "Same canonical calculations for Director and read-only");
  assert.equal(readonly.charges[0].pendingAmount, 0);
  assert.equal(readonly.charges[0].creditAppliedAmount, 300);
  assert.equal(readonly.payments[0].allocatedAmount, 400);
  assert.equal(readonly.accountCredit.explicitAvailableAmount, 0);
  failRelation = "v_enrollment_balances";
  await assert.rejects(() => billing.getEnrollmentLedger(id), /canonical_balance/);
  failRelation = null;
  context = null; queries = [];
  assert.equal(await billing.getEnrollmentLedger(id), null);
  assert.equal(queries.length, 0);
  console.log("PASS: canonical Director/read-only ledger parity, credit-funded tuition, allocation detail, unauthenticated denial and fail-closed balances.");
})().catch(error => { console.error(error); process.exitCode = 1; });
