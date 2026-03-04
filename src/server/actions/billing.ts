"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const MONTH_NAMES_ES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
];

function lastDayOfMonth(year: number, month: number): string {
  const d = new Date(year, month, 0); // day 0 of next month = last day of this month
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

type ActiveEnrollmentRow = {
  id: string;
  pricing_plan_id: string;
  pricing_plans: { currency: string } | null;
};

type TuitionRuleRow = {
  pricing_plan_id: string;
  amount: number;
  day_to: number | null;
};

type ExistingChargeRow = {
  enrollment_id: string;
};

type ChargeInsert = {
  enrollment_id: string;
  charge_type_id: string;
  period_month: string;
  description: string;
  amount: number;
  currency: string;
  status: "pending";
  due_date: string;
  created_by: string;
};

export async function generateMonthlyTuitionAction(formData: FormData) {
  const periodMonthRaw = String(formData.get("period_month") ?? "").trim();

  // Expect YYYY-MM from <input type="month">
  if (!/^\d{4}-\d{2}$/.test(periodMonthRaw)) {
    redirect("/admin/mensualidades?err=invalid_month");
  }

  const [yearStr, monthStr] = periodMonthRaw.split("-");
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const periodMonth = `${yearStr}-${monthStr}-01`;
  const dueDate = lastDayOfMonth(year, month);
  const description = `Mensualidad ${MONTH_NAMES_ES[month - 1]} ${year}`;

  const supabase = await createClient();
  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();
  if (userError || !user) redirect("/admin/mensualidades?err=unauthenticated");

  // Get monthly_tuition charge type
  const { data: chargeType } = await supabase
    .from("charge_types")
    .select("id")
    .eq("code", "monthly_tuition")
    .eq("is_active", true)
    .maybeSingle()
    .returns<{ id: string } | null>();

  if (!chargeType) redirect("/admin/mensualidades?err=charge_type_missing");

  // All active enrollments with their pricing plan
  const { data: enrollments } = await supabase
    .from("enrollments")
    .select("id, pricing_plan_id, pricing_plans(currency)")
    .eq("status", "active")
    .returns<ActiveEnrollmentRow[]>();

  const activeEnrollments = enrollments ?? [];
  if (activeEnrollments.length === 0) {
    redirect("/admin/mensualidades?ok=1&created=0&skipped=0");
  }

  // Enrollments that already have a non-void monthly_tuition charge for this period
  const enrollmentIds = activeEnrollments.map((e) => e.id);
  const { data: existingCharges } = await supabase
    .from("charges")
    .select("enrollment_id")
    .eq("charge_type_id", chargeType.id)
    .eq("period_month", periodMonth)
    .neq("status", "void")
    .in("enrollment_id", enrollmentIds)
    .returns<ExistingChargeRow[]>();

  const alreadyCharged = new Set((existingCharges ?? []).map((c) => c.enrollment_id));
  const toCharge = activeEnrollments.filter((e) => !alreadyCharged.has(e.id));
  const skipped = activeEnrollments.length - toCharge.length;

  if (toCharge.length === 0) {
    redirect(`/admin/mensualidades?ok=1&created=0&skipped=${skipped}`);
  }

  // Fetch tuition rules for all unique pricing plans
  const uniquePlanIds = [...new Set(toCharge.map((e) => e.pricing_plan_id))];
  const { data: tuitionRules } = await supabase
    .from("pricing_plan_tuition_rules")
    .select("pricing_plan_id, amount, day_to")
    .in("pricing_plan_id", uniquePlanIds)
    .returns<TuitionRuleRow[]>();

  // Regular rate = the rule with day_to IS NULL (open-ended / highest tier)
  const regularRateByPlan = new Map<string, number>();
  (tuitionRules ?? []).forEach((rule) => {
    if (rule.day_to === null) {
      regularRateByPlan.set(rule.pricing_plan_id, rule.amount);
    }
  });

  const charges: ChargeInsert[] = toCharge
    .map((enrollment) => {
      const amount = regularRateByPlan.get(enrollment.pricing_plan_id);
      if (!amount) return null;
      return {
        enrollment_id: enrollment.id,
        charge_type_id: chargeType.id,
        period_month: periodMonth,
        description,
        amount,
        currency: enrollment.pricing_plans?.currency ?? "MXN",
        status: "pending" as const,
        due_date: dueDate,
        created_by: user!.id
      };
    })
    .filter((c): c is ChargeInsert => c !== null);

  if (charges.length === 0) {
    redirect(`/admin/mensualidades?err=no_rate_found`);
  }

  const { error: insertError } = await supabase.from("charges").insert(charges);
  if (insertError) redirect("/admin/mensualidades?err=insert_failed");

  redirect(`/admin/mensualidades?ok=1&created=${charges.length}&skipped=${skipped}`);
}
