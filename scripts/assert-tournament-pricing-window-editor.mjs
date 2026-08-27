import assert from "node:assert/strict";
import fs from "node:fs";

const {
  getTerminalTournamentPricingRules,
  summarizeTournamentPricingWindow,
} = await import("../src/lib/products/tournament-pricing-windows.ts");

const rules = [
  {
    id: "linda-early",
    campusId: "linda",
    trainingProgram: "selectivo",
    gender: null,
    birthYearMin: 2015,
    birthYearMax: 2015,
    requiredPaidProductId: null,
    priority: 100,
    startsOn: "2026-07-01",
    endsOn: "2026-07-25",
  },
  {
    id: "linda-final",
    campusId: "linda",
    trainingProgram: "selectivo",
    gender: null,
    birthYearMin: 2015,
    birthYearMax: 2015,
    requiredPaidProductId: null,
    priority: 100,
    startsOn: "2026-07-26",
    endsOn: "2026-09-03",
  },
  {
    id: "linda-discount-final",
    campusId: "linda",
    trainingProgram: "selectivo",
    gender: null,
    birthYearMin: 2015,
    birthYearMax: 2015,
    requiredPaidProductId: "prior-product",
    priority: 200,
    startsOn: "2026-07-26",
    endsOn: "2026-09-03",
  },
  {
    id: "contry-final",
    campusId: "contry",
    trainingProgram: "selectivo",
    gender: null,
    birthYearMin: 2015,
    birthYearMax: 2015,
    requiredPaidProductId: null,
    priority: 100,
    startsOn: "2026-07-26",
    endsOn: "2026-08-20",
  },
];

assert.deepEqual(
  getTerminalTournamentPricingRules(rules).map((rule) => rule.id).sort(),
  ["contry-final", "linda-discount-final", "linda-final"],
);

assert.deepEqual(summarizeTournamentPricingWindow(rules, "linda"), {
  hasRules: true,
  availableUntil: "2026-09-03",
  hasMixedEndDates: false,
  terminalRuleCount: 2,
});

assert.deepEqual(summarizeTournamentPricingWindow(rules, "contry"), {
  hasRules: true,
  availableUntil: "2026-08-20",
  hasMixedEndDates: false,
  terminalRuleCount: 1,
});

const mixedRules = rules.map((rule) =>
  rule.id === "linda-discount-final" ? { ...rule, endsOn: "2026-09-05" } : rule,
);
assert.equal(summarizeTournamentPricingWindow(mixedRules, "linda").hasMixedEndDates, true);
assert.equal(summarizeTournamentPricingWindow(mixedRules, "linda").availableUntil, null);

const migration = fs.readFileSync(
  new URL("../supabase/migrations/20260826110000_tournament_pricing_window_editor.sql", import.meta.url),
  "utf8",
);
const action = fs.readFileSync(new URL("../src/server/actions/sports-signups.ts", import.meta.url), "utf8");
const form = fs.readFileSync(
  new URL("../src/components/products/tournament-settings-form.tsx", import.meta.url),
  "utf8",
);

assert.match(migration, /auth\.role\(\) <> 'service_role'/);
assert.match(migration, /ar\.code = 'superadmin'/);
assert.match(migration, /row_number\(\) over/);
assert.match(migration, /set ends_on = p_caja_available_until/);
assert.doesNotMatch(migration, /set\s+amount\s*=/);
assert.match(migration, /caja_before_final_pricing_tier/);
assert.match(migration, /global_pricing_requires_all_campuses/);
assert.match(migration, /pricing_rules_missing_for_campus/);
assert.match(action, /rpc\("save_sports_signup_tournament_settings"/);
assert.match(action, /sports_signups\.tournament_and_caja_settings_updated/);
assert.match(form, /Disponible en Caja hasta/);
assert.match(form, /Caja no puede cerrar antes del cierre de inscripcion/);
assert.match(form, /disabled=\{!hasPricingRules\}/);

console.log("Tournament pricing-window editor assertions passed.");
