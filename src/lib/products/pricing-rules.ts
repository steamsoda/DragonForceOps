export type ProductPricingRuleInput = {
  amount: number;
  startsOn: string | null;
  endsOn: string | null;
  gender: string | null;
  birthYearMin: number | null;
  birthYearMax: number | null;
  priority: number;
};

export function isRuleActiveOnDate(rule: ProductPricingRuleInput, businessDate: string) {
  if (rule.startsOn && businessDate < rule.startsOn) return false;
  if (rule.endsOn && businessDate > rule.endsOn) return false;
  return true;
}

function normalizeGender(value: string | null | undefined) {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === "femenino") return "female";
  if (normalized === "varonil" || normalized === "masculino") return "male";
  return normalized;
}

function ruleMatchesPlayer(
  rule: ProductPricingRuleInput,
  gender: string | null,
  birthYear: number | null,
) {
  const ruleGender = normalizeGender(rule.gender);
  const playerGender = normalizeGender(gender);
  if (ruleGender && ruleGender !== playerGender) return false;
  if (rule.birthYearMin !== null && (birthYear === null || birthYear < rule.birthYearMin)) return false;
  if (rule.birthYearMax !== null && (birthYear === null || birthYear > rule.birthYearMax)) return false;
  return true;
}

export function resolveProductPricingRuleAmount({
  rules,
  businessDate,
  gender,
  birthYear,
  fallbackAmount,
}: {
  rules: ProductPricingRuleInput[];
  businessDate: string;
  gender: string | null;
  birthYear: number | null;
  fallbackAmount: number | null;
}) {
  const matchingRule = rules
    .filter((rule) => isRuleActiveOnDate(rule, businessDate))
    .filter((rule) => ruleMatchesPlayer(rule, gender, birthYear))
    .sort((a, b) => b.priority - a.priority || a.amount - b.amount)[0];

  return matchingRule ? Math.round(Number(matchingRule.amount) * 100) / 100 : fallbackAmount;
}

export function hasActiveProductPricingRules(rules: ProductPricingRuleInput[], businessDate: string) {
  return rules.some((rule) => isRuleActiveOnDate(rule, businessDate));
}

export function shouldHideProductForDate({
  inactiveAfter,
  businessDate,
}: {
  inactiveAfter: string | null;
  businessDate: string;
}) {
  return Boolean(inactiveAfter && businessDate > inactiveAfter);
}
