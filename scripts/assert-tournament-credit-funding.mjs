import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";

const source = await readFile("src/lib/queries/sports-signups.ts", "utf8");
const parsed = ts.createSourceFile("sports-signups.ts", source, ts.ScriptTarget.Latest, true);
const functions = parsed.statements.filter((node) => ts.isFunctionDeclaration(node)
  && ["loadAllocationSummaries", "roundMoney"].includes(node.name?.text));
assert.equal(functions.length, 2);
const code = ts.transpileModule(functions.map((node) => node.getText(parsed)).join("\n"), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
const load = vm.runInNewContext(`${code}\nloadAllocationSummaries`);
const thresholdSource = await readFile("src/lib/payments/copa-tigres.ts", "utf8");
const thresholdModule = { exports: {} };
vm.runInNewContext(ts.transpileModule(thresholdSource, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText, { exports: thresholdModule.exports });
const threshold = thresholdModule.exports.competitionReservationThreshold;

function client(payments = [], credits = [], failTable = null) {
  const requests = [];
  return {
    requests,
    from(table) {
      assert.ok(["payment_allocations", "enrollment_credit_applications"].includes(table));
      let ids, from, to;
      return {
        select() { return this; },
        in(column, values) { assert.equal(column, "charge_id"); ids = values; return this; },
        order(column) { assert.equal(column, "id"); return this; },
        range(start, end) { from = start; to = end; return this; },
        async returns() {
          requests.push({ table, ids, from, to });
          if (table === failTable) return { data: null, error: new Error("funding unavailable") };
          const rows = table === "payment_allocations" ? payments : credits;
          return { data: rows.filter((row) => ids.includes(row.charge_id)).slice(from, to + 1), error: null };
        },
      };
    },
  };
}
const paidAt = "2026-10-20T12:00:00+00:00";
const appliedAt = "2026-10-23T12:00:00+00:00";
const payment = (id, amount) => ({ charge_id: id, amount, created_at: paidAt, payments: { paid_at: paidAt } });
const credit = (id, amount) => ({ charge_id: id, amount, applied_at: appliedAt });
const payments = [payment("cash", 300), payment("mixed", 250), payment("partial", 100), payment("deposit", 600)];
const credits = [credit("credit", 300), credit("mixed", 50), credit("partial", 50)];
const ids = ["cash", "credit", "mixed", "partial", "unpaid", "deposit"];
const result = await load(client(payments, credits), [...ids, ...ids]);
for (const id of ["cash", "credit", "mixed"]) {
  assert.equal(result.get(id).total, 300);
  assert.ok(result.get(id).total >= threshold({ amount: 300 }));
}
assert.equal(result.get("cash").paidAt, paidAt);
assert.equal(result.get("credit").paidAt, appliedAt);
assert.equal(result.get("mixed").paidAt, appliedAt);
assert.equal(result.get("partial").total, 150);
assert.equal(result.has("unpaid"), false);
assert.ok(result.get("deposit").total >= threshold({ amount: 1250, copa_tigres_installments: true }));
assert.ok(result.get("deposit").total < threshold({ amount: 1250 }));
// A reversed application is absent from the ledger, not available funding.
assert.equal((await load(client(payments, []), ids)).has("credit"), false);
assert.equal((await load(client(payments, []), ids)).get("mixed").total, 250);
for (const table of ["payment_allocations", "enrollment_credit_applications"]) {
  await assert.rejects(load(client(payments, credits, table), ids), /funding unavailable/);
}
const empty = client();
assert.equal((await load(empty, [])).size, 0);
assert.equal(empty.requests.length, 0);
const manyIds = Array.from({ length: 101 }, (_, i) => `charge-${i}`);
const paged = client(
  Array.from({ length: 501 }, () => payment(manyIds[0], 1)),
  [...Array.from({ length: 501 }, () => credit(manyIds[0], 1)), credit(manyIds[100], 300)],
);
const many = await load(paged, manyIds);
assert.equal(many.get(manyIds[0]).total, 1002);
assert.equal(many.get(manyIds[100]).total, 300);
assert.ok(paged.requests.every((request) => request.ids.length <= 100));
for (const table of ["payment_allocations", "enrollment_credit_applications"]) {
  assert.ok(paged.requests.some((request) => request.table === table && request.from === 500));
}
// Both paid/unpaid detail paths and callups must keep using the shared reader.
assert.equal((source.match(/await loadAllocationSummaries\(/g) ?? []).length, 2);
assert.ok((source.match(/\.neq\("status", "void"\)/g) ?? []).length >= 4);
for (const file of [
  "supabase/migrations/20260922010000_explicit_credit_selection_foundation.sql",
  "supabase/migrations/20260922020000_explicit_cart_checkout.sql",
]) {
  assert.match(await readFile(file, "utf8"), /perform public\.sync_paid_tournament_entries_for_charges\(e\.id,ids\)/);
}
const repair = await readFile("supabase/migrations/20261029034752_reconcile_credit_funded_tournament_entries.sql", "utf8");
assert.match(repair, /on conflict \(tournament_id, enrollment_id\) do nothing/);
assert.match(repair, /reconcile_competition_roster_entry/);
assert.doesNotMatch(repair, /(?:insert into|update|delete from) public\.(?:charges|payments|payment_allocations|enrollment_credits|enrollment_credit_applications)\b/i);
console.log("Tournament credit funding: payment, credit, mixed, dates, reversals, pagination, errors, and installments passed.");
