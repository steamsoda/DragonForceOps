import type { SupabaseClient } from "@supabase/supabase-js";

export const MONTH_NAMES_ES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
];

export function lastDayOfMonth(year: number, month: number): string {
  const d = new Date(year, month, 0);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export type GenerateResult = {
  created: number;
  skipped: number;
  skippedExistingCharge?: number;
  skippedScholarship?: number;
  skippedByIncident?: number;
  skippedOther?: number;
  error?: string;
};

type ActiveEnrollmentRow = {
  id: string;
  pricing_plan_id: string;
  pricing_plans: { currency: string } | null;
};

type TuitionRuleRow = {
  id: string;
  pricing_plan_id: string;
  amount: number;
  day_to: number | null;
};

type ExistingChargeRow = {
  enrollment_id: string;
};

type IncidentRow = {
  enrollment_id: string;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function generateMonthlyChargesCore(
  supabase: SupabaseClient,
  periodMonth: string, // YYYY-MM-01
  userId: string
): Promise<GenerateResult> {
  const [yearStr, monthStr] = periodMonth.split("-");
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const dueDate = lastDayOfMonth(year, month);
  const description = `Mensualidad ${MONTH_NAMES_ES[month - 1]} ${year}`;

  const { data: chargeType } = await supabase
    .from("charge_types")
    .select("id")
    .eq("code", "monthly_tuition")
    .eq("is_active", true)
    .maybeSingle();

  if (!chargeType) return { created: 0, skipped: 0, error: "charge_type_missing" };

  const { data: enrollments } = await supabase
    .from("enrollments")
    .select("id, pricing_plan_id, pricing_plans(currency)")
    .eq("status", "active")
    .eq("has_scholarship", false);

  const activeEnrollments = (enrollments ?? []) as unknown as ActiveEnrollmentRow[];
  const { count: scholarshipCount } = await supabase
    .from("enrollments")
    .select("*", { count: "exact", head: true })
    .eq("status", "active")
    .eq("has_scholarship", true);

  if (activeEnrollments.length === 0) {
    return {
      created: 0,
      skipped: scholarshipCount ?? 0,
      skippedExistingCharge: 0,
      skippedScholarship: scholarshipCount ?? 0,
      skippedByIncident: 0,
      skippedOther: 0,
    };
  }

  const enrollmentIds = activeEnrollments.map((e) => e.id);

  const { data: existingCharges } = await supabase
    .from("charges")
    .select("enrollment_id")
    .eq("charge_type_id", chargeType.id)
    .eq("period_month", periodMonth)
    .neq("status", "void")
    .in("enrollment_id", enrollmentIds);

  const alreadyCharged = new Set(((existingCharges ?? []) as ExistingChargeRow[]).map((c) => c.enrollment_id));
  const eligibleAfterExistingCharge = activeEnrollments.filter((e) => !alreadyCharged.has(e.id));

  const { data: incidents } = await supabase
    .from("enrollment_incidents")
    .select("enrollment_id")
    .eq("omit_period_month", periodMonth)
    .is("cancelled_at", null)
    .in("enrollment_id", eligibleAfterExistingCharge.map((e) => e.id));

  const skippedByIncidentSet = new Set(((incidents ?? []) as IncidentRow[]).map((row) => row.enrollment_id));
  const toCharge = eligibleAfterExistingCharge.filter((e) => !skippedByIncidentSet.has(e.id));
  const skippedExistingCharge = activeEnrollments.length - eligibleAfterExistingCharge.length;
  const skippedByIncident = eligibleAfterExistingCharge.length - toCharge.length;
  const skippedScholarship = scholarshipCount ?? 0;
  const skipped = skippedScholarship + skippedExistingCharge + skippedByIncident;

  if (toCharge.length === 0) {
    return {
      created: 0,
      skipped,
      skippedExistingCharge,
      skippedScholarship,
      skippedByIncident,
      skippedOther: 0,
    };
  }

  const uniquePlanIds = [...new Set(toCharge.map((e) => e.pricing_plan_id))];
  const { data: tuitionRules } = await supabase
    .from("pricing_plan_tuition_rules")
    .select("id, pricing_plan_id, amount, day_to")
    .in("pricing_plan_id", uniquePlanIds);

  // Regular rate = open-ended rule (day_to IS NULL). Fallback: highest amount rule.
  const regularRuleByPlan = new Map<string, TuitionRuleRow>();
  const rulesByPlan = new Map<string, TuitionRuleRow[]>();
  ((tuitionRules ?? []) as TuitionRuleRow[]).forEach((rule) => {
    const arr = rulesByPlan.get(rule.pricing_plan_id) ?? [];
    arr.push(rule);
    rulesByPlan.set(rule.pricing_plan_id, arr);
  });
  rulesByPlan.forEach((rules, planId) => {
    const openEnded = rules.find((r) => r.day_to === null);
    const fallback = rules.reduce((a, b) => (a.amount > b.amount ? a : b), rules[0]);
    const selectedRule = openEnded ?? fallback;
    if (selectedRule) {
      regularRuleByPlan.set(planId, selectedRule);
    }
  });

  const charges = toCharge
    .map((enrollment) => {
      const selectedRule = regularRuleByPlan.get(enrollment.pricing_plan_id);
      if (!selectedRule) return null;
      return {
        enrollment_id: enrollment.id,
        charge_type_id: chargeType.id,
        period_month: periodMonth,
        description,
        amount: selectedRule.amount,
        currency: enrollment.pricing_plans?.currency ?? "MXN",
        status: "pending",
        due_date: dueDate,
        pricing_rule_id: selectedRule.id,
        created_by: userId
      };
    })
    .filter((c) => c !== null);

  if (charges.length === 0) {
    return {
      created: 0,
      skipped,
      skippedExistingCharge,
      skippedScholarship,
      skippedByIncident,
      skippedOther: 0,
      error: "no_rate_found",
    };
  }

  const { error: insertError } = await supabase.from("charges").insert(charges);
  if (insertError) {
    return {
      created: 0,
      skipped,
      skippedExistingCharge,
      skippedScholarship,
      skippedByIncident,
      skippedOther: 0,
      error: "insert_failed",
    };
  }

  if (skippedByIncident > 0) {
    await supabase
      .from("enrollment_incidents")
      .update({ consumed_at: new Date().toISOString() })
      .eq("omit_period_month", periodMonth)
      .is("cancelled_at", null)
      .is("consumed_at", null)
      .in("enrollment_id", Array.from(skippedByIncidentSet));
  }

  return {
    created: charges.length,
    skipped,
    skippedExistingCharge,
    skippedScholarship,
    skippedByIncident,
    skippedOther: Math.max(activeEnrollments.length + skippedScholarship - charges.length - skipped, 0),
  };
}
