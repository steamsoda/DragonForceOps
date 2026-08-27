export type TournamentPricingWindowRule = {
  id: string;
  campusId: string | null;
  trainingProgram: string | null;
  gender: string | null;
  birthYearMin: number | null;
  birthYearMax: number | null;
  requiredPaidProductId: string | null;
  priority: number;
  startsOn: string;
  endsOn: string | null;
};

function cohortKey(rule: TournamentPricingWindowRule) {
  return [
    rule.campusId ?? "*",
    rule.trainingProgram ?? "*",
    rule.gender ?? "*",
    rule.birthYearMin ?? "*",
    rule.birthYearMax ?? "*",
    rule.requiredPaidProductId ?? "*",
    rule.priority,
  ].join("|");
}

function compareTerminalRules(a: TournamentPricingWindowRule, b: TournamentPricingWindowRule) {
  if (a.endsOn === null && b.endsOn !== null) return -1;
  if (a.endsOn !== null && b.endsOn === null) return 1;
  if (a.endsOn !== b.endsOn) return (b.endsOn ?? "").localeCompare(a.endsOn ?? "");
  if (a.startsOn !== b.startsOn) return b.startsOn.localeCompare(a.startsOn);
  return a.id.localeCompare(b.id);
}

export function getTerminalTournamentPricingRules(rules: TournamentPricingWindowRule[]) {
  const cohorts = new Map<string, TournamentPricingWindowRule[]>();
  for (const rule of rules) {
    const key = cohortKey(rule);
    const rows = cohorts.get(key) ?? [];
    rows.push(rule);
    cohorts.set(key, rows);
  }

  return Array.from(cohorts.values()).map((rows) => [...rows].sort(compareTerminalRules)[0]);
}

export function summarizeTournamentPricingWindow(
  rules: TournamentPricingWindowRule[],
  campusId: string,
) {
  const applicable = rules.filter((rule) => rule.campusId === null || rule.campusId === campusId);
  const terminalRules = getTerminalTournamentPricingRules(applicable);
  const endDates = Array.from(new Set(terminalRules.map((rule) => rule.endsOn)));

  return {
    hasRules: applicable.length > 0,
    availableUntil: endDates.length === 1 ? endDates[0] : null,
    hasMixedEndDates: endDates.length > 1,
    terminalRuleCount: terminalRules.length,
  };
}
