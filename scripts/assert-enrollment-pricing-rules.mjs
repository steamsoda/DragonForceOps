import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");

const source = fs.readFileSync("src/lib/pricing/plans.ts", "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
});

const sandbox = {
  module: { exports: {} },
  exports: {},
  require(id) {
    if (id === "@/lib/time") {
      return {
        getMonterreyDateString: () => "2026-04-22",
        getMonterreyMonthString: () => "2026-04",
      };
    }
    return require(id);
  },
};
sandbox.exports = sandbox.module.exports;
vm.runInNewContext(outputText, sandbox, { filename: "src/lib/pricing/plans.ts" });

const { quoteEnrollmentPricingFromVersions } = sandbox.module.exports;

const versions = [
  {
    id: "base-standard",
    name: "Plan Mensual",
    currency: "MXN",
    planCode: "standard",
    effectiveStart: "2000-01-01",
    effectiveEnd: "2026-04-30",
    updatedAt: "2026-03-31T00:00:00.000Z",
    items: [{ chargeCode: "inscription", amount: 1800 }],
    tuitionRules: [
      { id: "base-early", pricing_plan_id: "base-standard", day_from: 1, day_to: 10, amount: 600 },
      { id: "base-regular", pricing_plan_id: "base-standard", day_from: 11, day_to: null, amount: 750 },
    ],
    enrollmentTuitionRules: [
      { pricing_plan_id: "base-standard", day_from: 1, day_to: 10, amount: 600, charge_month_offset: 0 },
      { pricing_plan_id: "base-standard", day_from: 11, day_to: 20, amount: 300, charge_month_offset: 0 },
      { pricing_plan_id: "base-standard", day_from: 21, day_to: 31, amount: 600, charge_month_offset: 1 },
    ],
  },
  {
    id: "may-standard",
    name: "Plan Mensual",
    currency: "MXN",
    planCode: "standard",
    effectiveStart: "2026-05-01",
    effectiveEnd: null,
    updatedAt: "2026-03-31T00:00:00.000Z",
    items: [{ chargeCode: "inscription", amount: 1800 }],
    tuitionRules: [
      { id: "may-early", pricing_plan_id: "may-standard", day_from: 1, day_to: 10, amount: 700 },
      { id: "may-regular", pricing_plan_id: "may-standard", day_from: 11, day_to: null, amount: 900 },
    ],
    enrollmentTuitionRules: [
      { pricing_plan_id: "may-standard", day_from: 1, day_to: 10, amount: 700, charge_month_offset: 0 },
      { pricing_plan_id: "may-standard", day_from: 11, day_to: 20, amount: 350, charge_month_offset: 0 },
      { pricing_plan_id: "may-standard", day_from: 21, day_to: 31, amount: 700, charge_month_offset: 1 },
    ],
  },
];

function assertEnrollmentQuote(startDate, expected) {
  const quote = quoteEnrollmentPricingFromVersions(versions, startDate);
  assert.ok(quote, `Expected quote for ${startDate}`);
  assert.equal(quote.tuitionPeriodMonth, expected.periodMonth, `${startDate} period`);
  assert.equal(quote.tuitionAmount, expected.amount, `${startDate} amount`);
  assert.equal(quote.tuitionPricingRuleId, expected.pricingRuleId ?? null, `${startDate} pricing rule`);
}

assertEnrollmentQuote("2026-04-20", { periodMonth: "2026-04-01", amount: 300, pricingRuleId: null });
assertEnrollmentQuote("2026-04-21", { periodMonth: "2026-05-01", amount: 700, pricingRuleId: "may-early" });
assertEnrollmentQuote("2026-05-01", { periodMonth: "2026-05-01", amount: 700, pricingRuleId: null });
assertEnrollmentQuote("2026-05-11", { periodMonth: "2026-05-01", amount: 350, pricingRuleId: null });
assertEnrollmentQuote("2026-05-21", { periodMonth: "2026-06-01", amount: 700, pricingRuleId: "may-early" });

console.log("Enrollment pricing assertions passed.");
