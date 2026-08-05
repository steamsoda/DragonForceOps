import assert from "node:assert/strict";
import fs from "node:fs";

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
    endsOn: "2026-07-26",
    gender: null,
    birthYearMin: null,
    birthYearMax: null,
    priority: 0,
  },
  {
    amount: 300,
    startsOn: "2026-07-27",
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

assert.equal(
  resolveProductPricingRuleAmount({
    rules: baseRules,
    businessDate: "2026-07-27",
    gender: "male",
    birthYear: 2014,
    fallbackAmount: null,
  }),
  300,
);

assert.equal(
  resolveProductPricingRuleAmount({
    rules: baseRules,
    businessDate: "2027-01-01",
    gender: "female",
    birthYear: 2018,
    fallbackAmount: null,
  }),
  300,
);

const comboRules = [
  {
    amount: 300,
    startsOn: "2026-07-15",
    endsOn: null,
    gender: "male",
    birthYearMin: null,
    birthYearMax: null,
    requiredPaidProductId: null,
    priority: 100,
  },
  {
    amount: 150,
    startsOn: "2026-07-15",
    endsOn: null,
    gender: "male",
    birthYearMin: null,
    birthYearMax: null,
    requiredPaidProductId: "leyendas",
    priority: 200,
  },
];

assert.equal(
  resolveProductPricingRuleAmount({
    rules: comboRules,
    businessDate: "2026-07-15",
    gender: "male",
    birthYear: 2014,
    paidProductIds: new Set(),
    fallbackAmount: null,
  }),
  300,
);

assert.equal(
  resolveProductPricingRuleAmount({
    rules: comboRules,
    businessDate: "2026-07-15",
    gender: "male",
    birthYear: 2014,
    paidProductIds: new Set(["leyendas"]),
    fallbackAmount: null,
  }),
  150,
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

const j5Rules = [
  { amount: 1000, startsOn: "2026-08-05", endsOn: "2026-08-20", campusId: "linda", trainingProgram: "selectivo", gender: null, birthYearMin: 2014, birthYearMax: 2014, priority: 100 },
  { amount: 1000, startsOn: "2026-08-05", endsOn: "2026-08-20", campusId: "linda", trainingProgram: "selectivo", gender: null, birthYearMin: 2015, birthYearMax: 2015, priority: 100 },
  { amount: 1200, startsOn: "2026-08-05", endsOn: "2026-08-20", campusId: "linda", trainingProgram: "selectivo", gender: null, birthYearMin: 2016, birthYearMax: 2016, priority: 100 },
  { amount: 1000, startsOn: "2026-08-05", endsOn: "2026-08-20", campusId: "linda", trainingProgram: "futbol_para_todos", gender: null, birthYearMin: 2020, birthYearMax: 2020, priority: 100 },
  { amount: 1200, startsOn: "2026-08-05", endsOn: "2026-08-20", campusId: "contry", trainingProgram: "selectivo", gender: null, birthYearMin: 2014, birthYearMax: 2015, priority: 100 },
  { amount: 1000, startsOn: "2026-08-05", endsOn: "2026-08-20", campusId: "contry", trainingProgram: "selectivo", gender: null, birthYearMin: 2016, birthYearMax: 2016, priority: 100 },
  { amount: 1000, startsOn: "2026-08-05", endsOn: "2026-08-20", campusId: "contry", trainingProgram: "futbol_para_todos", gender: "female", birthYearMin: 2011, birthYearMax: 2013, priority: 100 },
  { amount: 500, startsOn: "2026-08-05", endsOn: "2026-08-20", campusId: "contry", trainingProgram: "futbol_para_todos", gender: "female", birthYearMin: 2011, birthYearMax: 2013, requiredPaidProductId: "polideportivo", priority: 200 },
];

const resolveJ5 = ({ campusId, program, gender, birthYear, paid = [] }) =>
  resolveProductPricingRuleAmount({
    rules: j5Rules,
    businessDate: "2026-08-10",
    campusId,
    activeTrainingPrograms: new Set([program]),
    gender,
    birthYear,
    paidProductIds: new Set(paid),
    fallbackAmount: null,
  });

assert.equal(resolveJ5({ campusId: "linda", program: "selectivo", gender: "male", birthYear: 2014 }), 1000);
assert.equal(resolveJ5({ campusId: "linda", program: "selectivo", gender: "male", birthYear: 2015 }), 1000);
assert.equal(resolveJ5({ campusId: "linda", program: "selectivo", gender: "male", birthYear: 2016 }), 1200);
assert.equal(resolveJ5({ campusId: "linda", program: "futbol_para_todos", gender: "male", birthYear: 2020 }), 1000);
assert.equal(resolveJ5({ campusId: "linda", program: "little_dragons", gender: "male", birthYear: 2020 }), null);
assert.equal(resolveJ5({ campusId: "contry", program: "futbol_para_todos", gender: "female", birthYear: 2012 }), 1000);
assert.equal(resolveJ5({ campusId: "contry", program: "futbol_para_todos", gender: "female", birthYear: 2012, paid: ["polideportivo"] }), 500);
assert.equal(resolveJ5({ campusId: "contry", program: "futbol_para_todos", gender: "male", birthYear: 2012 }), null);
assert.equal(resolveJ5({ campusId: "contry", program: "selectivo", gender: "male", birthYear: 2014 }), 1200);
assert.equal(resolveJ5({ campusId: "contry", program: "selectivo", gender: "male", birthYear: 2016 }), 1000);
assert.equal(resolveJ5({ campusId: "linda", program: "selectivo", gender: "male", birthYear: 2013 }), null);

const cajaSource = fs.readFileSync(new URL("../src/server/actions/caja.ts", import.meta.url), "utf8");
assert.match(cajaSource, /product\.requires_pricing_rule_match && ruleAmount === null/);
assert.match(cajaSource, /row\.requires_pricing_rule_match && defaultAmount === null/);

console.log("Product pricing rule assertions passed.");
