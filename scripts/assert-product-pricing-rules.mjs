import assert from "node:assert/strict";

const {
  resolveProductPricingRuleAmount,
  shouldHideProductForDate,
} = await import("../src/lib/products/pricing-rules.ts");

const baseRules = [
  {
    amount: 300,
    startsOn: "2026-07-01",
    endsOn: "2026-07-25",
    gender: null,
    birthYearMin: null,
    birthYearMax: null,
    priority: 0,
  },
  {
    amount: 500,
    startsOn: "2026-07-26",
    endsOn: null,
    gender: null,
    birthYearMin: null,
    birthYearMax: null,
    priority: 0,
  },
];

assert.equal(
  resolveProductPricingRuleAmount({
    rules: baseRules,
    businessDate: "2026-07-25",
    gender: "male",
    birthYear: 2014,
    fallbackAmount: null,
  }),
  300,
);

assert.equal(
  resolveProductPricingRuleAmount({
    rules: baseRules,
    businessDate: "2026-07-26",
    gender: "male",
    birthYear: 2014,
    fallbackAmount: null,
  }),
  500,
);

const copaRules = [
  {
    amount: 500,
    startsOn: "2026-07-01",
    endsOn: "2026-07-18",
    gender: "female",
    birthYearMin: null,
    birthYearMax: null,
    priority: 100,
  },
  {
    amount: 700,
    startsOn: "2026-07-01",
    endsOn: "2026-07-18",
    gender: null,
    birthYearMin: 2009,
    birthYearMax: 2013,
    priority: 10,
  },
  {
    amount: 600,
    startsOn: "2026-07-01",
    endsOn: "2026-07-18",
    gender: null,
    birthYearMin: 2014,
    birthYearMax: 2017,
    priority: 10,
  },
  {
    amount: 500,
    startsOn: "2026-07-01",
    endsOn: "2026-07-18",
    gender: null,
    birthYearMin: 2018,
    birthYearMax: 2020,
    priority: 10,
  },
];

assert.equal(
  resolveProductPricingRuleAmount({
    rules: copaRules,
    businessDate: "2026-07-10",
    gender: "female",
    birthYear: 2012,
    fallbackAmount: null,
  }),
  500,
);

assert.equal(
  resolveProductPricingRuleAmount({
    rules: copaRules,
    businessDate: "2026-07-10",
    gender: "male",
    birthYear: 2012,
    fallbackAmount: null,
  }),
  700,
);

assert.equal(
  resolveProductPricingRuleAmount({
    rules: copaRules,
    businessDate: "2026-07-10",
    gender: null,
    birthYear: null,
    fallbackAmount: null,
  }),
  null,
);

assert.equal(
  shouldHideProductForDate({
    inactiveAfter: "2026-07-18",
    businessDate: "2026-07-18",
  }),
  false,
);

assert.equal(
  shouldHideProductForDate({
    inactiveAfter: "2026-07-18",
    businessDate: "2026-07-19",
  }),
  true,
);

console.log("Product pricing rule assertions passed.");
