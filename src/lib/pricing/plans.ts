import type { SupabaseClient } from "@supabase/supabase-js";
import { getMonterreyDateString, getMonterreyMonthString } from "@/lib/time";

const DEFAULT_INSCRIPTION_AMOUNT = 1800;
const DEFAULT_FIRST_MONTH_AMOUNT = 600;

export const ADVANCE_TUITION_MONTH_OFFSETS = [0, 1, 2, 3] as const;

type EffectivePricingPlanRow = {
  id: string;
  name: string;
  currency: string;
  plan_code: string;
  effective_start: string;
  effective_end: string | null;
  updated_at: string;
};

type PlanItemRow = {
  pricing_plan_id: string;
  amount: number;
  charge_types: { code: string } | null;
};

export type TuitionRuleRow = {
  id: string;
  pricing_plan_id: string;
  day_from: number;
  day_to: number | null;
  amount: number;
};

export type EnrollmentTuitionRuleRow = {
  pricing_plan_id: string;
  day_from: number;
  day_to: number | null;
  amount: number;
  charge_month_offset: number;
};

export type PricingPlanVersionSnapshot = {
  id: string;
  name: string;
  currency: string;
  planCode: string;
  effectiveStart: string;
  effectiveEnd: string | null;
  updatedAt: string;
  items: Array<{ chargeCode: string; amount: number }>;
  tuitionRules: TuitionRuleRow[];
  enrollmentTuitionRules: EnrollmentTuitionRuleRow[];
};

export type PricingDefaults = {
  inscriptionAmount: number;
  firstMonthAmount: number;
};

export type EnrollmentPricingQuote = {
  plan: {
    id: string;
    name: string;
    currency: string;
    planCode: string;
    effectiveStart: string;
    effectiveEnd: string | null;
  };
  inscriptionAmount: number;
  tuitionAmount: number;
  tuitionPeriodMonth: string;
  tuitionRuleLabel: string;
  chargeMonthOffset: number;
};

export type AdvanceTuitionQuote = {
  plan: {
    id: string;
    name: string;
    currency: string;
    planCode: string;
    effectiveStart: string;
    effectiveEnd: string | null;
  };
  amount: number;
  pricingRuleId: string;
  periodMonth: string;
};

export type TuitionQuoteForDay = AdvanceTuitionQuote;

export type AdvanceTuitionOption = {
  periodMonth: string;
  label: string;
  amount: number;
  pricingRuleId: string;
};

function compareDateStrings(a: string, b: string) {
  return a.localeCompare(b);
}

function dateFallsWithinWindow(date: string, start: string, end: string | null) {
  return compareDateStrings(date, start) >= 0 && (!end || compareDateStrings(date, end) <= 0);
}

function getDayOfMonth(date: string) {
  return Number(date.slice(8, 10));
}

export function formatPeriodMonthLabel(periodMonth: string) {
  const [year, month] = periodMonth.split("-");
  const monthNames = [
    "Enero",
    "Febrero",
    "Marzo",
    "Abril",
    "Mayo",
    "Junio",
    "Julio",
    "Agosto",
    "Septiembre",
    "Octubre",
    "Noviembre",
    "Diciembre",
  ];
  return `${monthNames[Number(month) - 1] ?? month} ${year}`;
}

function periodMonthToDate(periodMonth: string) {
  return periodMonth.length === 7 ? `${periodMonth}-01` : periodMonth;
}

export function normalizePeriodMonth(periodMonth: string) {
  return periodMonthToDate(periodMonth);
}

function addMonthsToPeriodMonth(periodMonth: string, monthOffset: number) {
  const [yearStr, monthStr] = periodMonthToDate(periodMonth).split("-");
  const base = new Date(Date.UTC(Number(yearStr), Number(monthStr) - 1 + monthOffset, 1, 12, 0, 0));
  return `${base.getUTCFullYear()}-${String(base.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

function pickTuitionRuleForDay<T extends { day_from: number; day_to: number | null }>(rules: T[], day: number) {
  return rules
    .filter((rule) => rule.day_from <= day && (rule.day_to === null || rule.day_to >= day))
    .sort((a, b) => b.day_from - a.day_from)[0] ?? null;
}

function buildPlanSnapshot(
  plan: EffectivePricingPlanRow,
  planItems: PlanItemRow[],
  tuitionRules: TuitionRuleRow[],
  enrollmentTuitionRules: EnrollmentTuitionRuleRow[]
): PricingPlanVersionSnapshot {
  return {
    id: plan.id,
    name: plan.name,
    currency: plan.currency,
    planCode: plan.plan_code,
    effectiveStart: plan.effective_start,
    effectiveEnd: plan.effective_end,
    updatedAt: plan.updated_at,
    items: planItems
      .filter((item) => item.pricing_plan_id === plan.id && item.charge_types?.code)
      .map((item) => ({
        chargeCode: item.charge_types!.code,
        amount: item.amount,
      })),
    tuitionRules: tuitionRules.filter((rule) => rule.pricing_plan_id === plan.id),
    enrollmentTuitionRules: enrollmentTuitionRules.filter((rule) => rule.pricing_plan_id === plan.id),
  };
}

export function resolvePricingPlanVersionForDate(
  versions: PricingPlanVersionSnapshot[],
  effectiveDate: string
) {
  return versions.find((version) =>
    dateFallsWithinWindow(effectiveDate, version.effectiveStart, version.effectiveEnd)
  ) ?? null;
}

export function getInscriptionAmountForPlan(version: PricingPlanVersionSnapshot) {
  return version.items.find((item) => item.chargeCode === "inscription")?.amount ?? DEFAULT_INSCRIPTION_AMOUNT;
}

export function quoteEnrollmentPricingFromVersions(
  versions: PricingPlanVersionSnapshot[],
  startDate: string
): EnrollmentPricingQuote | null {
  const version = resolvePricingPlanVersionForDate(versions, startDate);
  if (!version) return null;

  const day = getDayOfMonth(startDate);
  const enrollmentRule = pickTuitionRuleForDay(version.enrollmentTuitionRules, day);
  if (!enrollmentRule) return null;

  const tuitionPeriodMonth = addMonthsToPeriodMonth(`${startDate.slice(0, 7)}-01`, enrollmentRule.charge_month_offset);

  return {
    plan: {
      id: version.id,
      name: version.name,
      currency: version.currency,
      planCode: version.planCode,
      effectiveStart: version.effectiveStart,
      effectiveEnd: version.effectiveEnd,
    },
    inscriptionAmount: getInscriptionAmountForPlan(version),
    tuitionAmount: enrollmentRule.amount,
    tuitionPeriodMonth,
    tuitionRuleLabel:
      enrollmentRule.charge_month_offset > 0
        ? "Mensualidad siguiente mes"
        : "Primera mensualidad",
    chargeMonthOffset: enrollmentRule.charge_month_offset,
  };
}

export function quoteAdvanceTuitionFromVersions(
  versions: PricingPlanVersionSnapshot[],
  periodMonth: string
): AdvanceTuitionQuote | null {
  return quoteTuitionForDayFromVersions(versions, periodMonth, 1);
}

export function quoteTuitionForDayFromVersions(
  versions: PricingPlanVersionSnapshot[],
  periodMonth: string,
  day: number
): TuitionQuoteForDay | null {
  const periodDate = periodMonthToDate(periodMonth);
  const version = resolvePricingPlanVersionForDate(versions, periodDate);
  if (!version) return null;

  const tuitionRule = pickTuitionRuleForDay(version.tuitionRules, day);
  if (!tuitionRule) return null;

  return {
    plan: {
      id: version.id,
      name: version.name,
      currency: version.currency,
      planCode: version.planCode,
      effectiveStart: version.effectiveStart,
      effectiveEnd: version.effectiveEnd,
    },
    amount: tuitionRule.amount,
    pricingRuleId: tuitionRule.id,
    periodMonth: periodDate,
  };
}

export function buildAdvanceTuitionOptionsFromVersions(
  versions: PricingPlanVersionSnapshot[],
  {
    fromMonth = getMonterreyMonthString(),
    existingPeriodMonths = [],
  }: {
    fromMonth?: string;
    existingPeriodMonths?: string[];
  } = {}
): AdvanceTuitionOption[] {
  const blocked = new Set(existingPeriodMonths.map(periodMonthToDate));

  return ADVANCE_TUITION_MONTH_OFFSETS.map((offset) =>
    addMonthsToPeriodMonth(`${fromMonth}-01`, offset)
  )
    .filter((periodMonth) => !blocked.has(periodMonth))
    .map((periodMonth) => {
      const quote = quoteAdvanceTuitionFromVersions(versions, periodMonth);
      if (!quote) return null;
      return {
        periodMonth,
        label: formatPeriodMonthLabel(periodMonth),
        amount: quote.amount,
        pricingRuleId: quote.pricingRuleId,
      };
    })
    .filter((option): option is AdvanceTuitionOption => option !== null);
}

export async function resolvePricingPlanForDate(
  supabase: SupabaseClient,
  {
    planCode,
    effectiveDate,
  }: {
    planCode: string;
    effectiveDate: string;
  }
) {
  const { data } = await supabase
    .from("pricing_plans")
    .select("id, name, currency, plan_code, effective_start, effective_end, updated_at")
    .eq("is_active", true)
    .eq("plan_code", planCode)
    .lte("effective_start", effectiveDate)
    .or(`effective_end.is.null,effective_end.gte.${effectiveDate}`)
    .order("effective_start", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle()
    .returns<EffectivePricingPlanRow | null>();

  return data;
}

export async function fetchPricingPlanVersionsByCode(
  supabase: SupabaseClient,
  planCode: string
): Promise<PricingPlanVersionSnapshot[]> {
  const { data: plans } = await supabase
    .from("pricing_plans")
    .select("id, name, currency, plan_code, effective_start, effective_end, updated_at")
    .eq("is_active", true)
    .eq("plan_code", planCode)
    .order("effective_start", { ascending: false })
    .order("updated_at", { ascending: false })
    .returns<EffectivePricingPlanRow[]>();

  const planRows = plans ?? [];
  if (planRows.length === 0) return [];

  const planIds = planRows.map((plan) => plan.id);
  const [planItemsResult, tuitionRulesResult, enrollmentRulesResult] = await Promise.all([
    supabase
      .from("pricing_plan_items")
      .select("pricing_plan_id, amount, charge_types(code)")
      .eq("is_active", true)
      .in("pricing_plan_id", planIds)
      .returns<PlanItemRow[]>(),
    supabase
      .from("pricing_plan_tuition_rules")
      .select("id, pricing_plan_id, day_from, day_to, amount")
      .in("pricing_plan_id", planIds)
      .order("day_from", { ascending: true })
      .returns<TuitionRuleRow[]>(),
    supabase
      .from("pricing_plan_enrollment_tuition_rules")
      .select("pricing_plan_id, day_from, day_to, amount, charge_month_offset")
      .in("pricing_plan_id", planIds)
      .order("day_from", { ascending: true })
      .returns<EnrollmentTuitionRuleRow[]>(),
  ]);

  const planItems = planItemsResult.data ?? [];
  const tuitionRules = tuitionRulesResult.data ?? [];
  const enrollmentRules = enrollmentRulesResult.data ?? [];

  return planRows.map((plan) => buildPlanSnapshot(plan, planItems, tuitionRules, enrollmentRules));
}

export async function fetchActivePricingPlanVersions(
  supabase: SupabaseClient
): Promise<PricingPlanVersionSnapshot[]> {
  const { data: plans } = await supabase
    .from("pricing_plans")
    .select("id, name, currency, plan_code, effective_start, effective_end, updated_at")
    .eq("is_active", true)
    .order("effective_start", { ascending: false })
    .order("updated_at", { ascending: false })
    .returns<EffectivePricingPlanRow[]>();

  const planRows = plans ?? [];
  if (planRows.length === 0) return [];

  const planIds = planRows.map((plan) => plan.id);
  const [planItemsResult, tuitionRulesResult, enrollmentRulesResult] = await Promise.all([
    supabase
      .from("pricing_plan_items")
      .select("pricing_plan_id, amount, charge_types(code)")
      .eq("is_active", true)
      .in("pricing_plan_id", planIds)
      .returns<PlanItemRow[]>(),
    supabase
      .from("pricing_plan_tuition_rules")
      .select("id, pricing_plan_id, day_from, day_to, amount")
      .in("pricing_plan_id", planIds)
      .order("day_from", { ascending: true })
      .returns<TuitionRuleRow[]>(),
    supabase
      .from("pricing_plan_enrollment_tuition_rules")
      .select("pricing_plan_id, day_from, day_to, amount, charge_month_offset")
      .in("pricing_plan_id", planIds)
      .order("day_from", { ascending: true })
      .returns<EnrollmentTuitionRuleRow[]>(),
  ]);

  const planItems = planItemsResult.data ?? [];
  const tuitionRules = tuitionRulesResult.data ?? [];
  const enrollmentRules = enrollmentRulesResult.data ?? [];

  return planRows.map((plan) => buildPlanSnapshot(plan, planItems, tuitionRules, enrollmentRules));
}

export async function getPricingDefaultsForPlan(
  supabase: SupabaseClient,
  pricingPlanId: string
): Promise<PricingDefaults> {
  const [planItemsResult, tuitionRulesResult] = await Promise.all([
    supabase
      .from("pricing_plan_items")
      .select("pricing_plan_id, amount, charge_types(code)")
      .eq("pricing_plan_id", pricingPlanId)
      .eq("is_active", true)
      .returns<PlanItemRow[]>(),
    supabase
      .from("pricing_plan_tuition_rules")
      .select("id, pricing_plan_id, day_from, day_to, amount")
      .eq("pricing_plan_id", pricingPlanId)
      .returns<TuitionRuleRow[]>(),
  ]);

  const planItems = planItemsResult.data ?? [];
  const tuitionRules = tuitionRulesResult.data ?? [];

  const inscriptionItem = planItems.find((item) => item.charge_types?.code === "inscription");
  const firstMonthRule = tuitionRules.reduce<TuitionRuleRow | null>((selected, rule) => {
    if (!selected) return rule;
    return rule.amount < selected.amount ? rule : selected;
  }, null);

  return {
    inscriptionAmount: inscriptionItem?.amount ?? DEFAULT_INSCRIPTION_AMOUNT,
    firstMonthAmount: firstMonthRule?.amount ?? DEFAULT_FIRST_MONTH_AMOUNT,
  };
}

export async function getEnrollmentPricingQuote(
  supabase: SupabaseClient,
  {
    planCode,
    startDate,
  }: {
    planCode: string;
    startDate: string;
  }
) {
  const versions = await fetchPricingPlanVersionsByCode(supabase, planCode);
  return quoteEnrollmentPricingFromVersions(versions, startDate);
}

export async function getAdvanceTuitionOptions(
  supabase: SupabaseClient,
  {
    planCode,
    existingPeriodMonths = [],
    fromMonth = getMonterreyMonthString(),
  }: {
    planCode: string;
    existingPeriodMonths?: string[];
    fromMonth?: string;
  }
) {
  const versions = await fetchPricingPlanVersionsByCode(supabase, planCode);
  return buildAdvanceTuitionOptionsFromVersions(versions, { fromMonth, existingPeriodMonths });
}

export async function getAdvanceTuitionQuote(
  supabase: SupabaseClient,
  {
    planCode,
    periodMonth,
  }: {
    planCode: string;
    periodMonth: string;
  }
) {
  const versions = await fetchPricingPlanVersionsByCode(supabase, planCode);
  return quoteAdvanceTuitionFromVersions(versions, periodMonth);
}

export async function getAdvanceTuitionQuoteForHistoricalDateTime(
  supabase: SupabaseClient,
  {
    planCode,
    periodMonth,
    historicalDate,
  }: {
    planCode: string;
    periodMonth: string;
    historicalDate: string;
  }
) {
  const versions = await fetchPricingPlanVersionsByCode(supabase, planCode);
  const day = getDayOfMonth(historicalDate);
  const version = resolvePricingPlanVersionForDate(versions, historicalDate);
  if (!version) return null;

  const tuitionRule = pickTuitionRuleForDay(version.tuitionRules, day);
  if (!tuitionRule) return null;

  return {
    plan: {
      id: version.id,
      name: version.name,
      currency: version.currency,
      planCode: version.planCode,
      effectiveStart: version.effectiveStart,
      effectiveEnd: version.effectiveEnd,
    },
    amount: tuitionRule.amount,
    pricingRuleId: tuitionRule.id,
    periodMonth: normalizePeriodMonth(periodMonth),
  };
}

export function getDefaultEnrollmentStartDate() {
  return getMonterreyDateString();
}
