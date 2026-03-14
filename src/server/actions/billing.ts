"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { generateMonthlyChargesCore } from "@/lib/billing/generate-monthly-charges";
import { writeAuditLog } from "@/lib/audit";

type TeamAssignmentRow = {
  enrollment_id: string;
  enrollments: { status: string; pricing_plans: { currency: string | null } | null } | null;
};

export async function generateMonthlyTuitionAction(formData: FormData) {
  const periodMonthRaw = String(formData.get("period_month") ?? "").trim();

  if (!/^\d{4}-\d{2}$/.test(periodMonthRaw)) {
    redirect("/admin/mensualidades?err=invalid_month");
  }

  const [yearStr, monthStr] = periodMonthRaw.split("-");
  const periodMonth = `${yearStr}-${monthStr}-01`;

  const supabase = await createClient();
  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();
  if (userError || !user) redirect("/admin/mensualidades?err=unauthenticated");

  const result = await generateMonthlyChargesCore(supabase, periodMonth, user!.id);

  if (result.error) redirect(`/admin/mensualidades?err=${result.error}`);
  redirect(`/admin/mensualidades?ok=1&created=${result.created}&skipped=${result.skipped}`);
}

export async function bulkChargeTeamAction(formData: FormData) {
  const BASE = "/admin/cargos-equipo";

  const teamId = String(formData.get("team_id") ?? "").trim();
  const chargeTypeId = String(formData.get("charge_type_id") ?? "").trim();
  const amountRaw = String(formData.get("amount") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();

  if (!teamId || !chargeTypeId || !description) redirect(`${BASE}?err=invalid_form`);

  const amount = parseFloat(amountRaw);
  if (isNaN(amount) || amount === 0) redirect(`${BASE}?err=invalid_amount`);

  const supabase = await createClient();
  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();
  if (userError || !user) redirect(`${BASE}?err=unauthenticated`);

  // Get active enrollments on this team (open assignment + active enrollment)
  const { data: assignments } = await supabase
    .from("team_assignments")
    .select("enrollment_id, enrollments(status, pricing_plans(currency))")
    .eq("team_id", teamId)
    .is("end_date", null)
    .returns<TeamAssignmentRow[]>();

  const activeAssignments = (assignments ?? []).filter((a) => a.enrollments?.status === "active");

  if (activeAssignments.length === 0) {
    redirect(`${BASE}?err=no_active_enrollments`);
  }

  const charges = activeAssignments.map((a) => ({
    enrollment_id: a.enrollment_id,
    charge_type_id: chargeTypeId,
    description,
    amount,
    currency: a.enrollments?.pricing_plans?.currency ?? "MXN",
    status: "pending",
    created_by: user!.id
  }));

  const { error: insertError } = await supabase.from("charges").insert(charges);
  if (insertError) redirect(`${BASE}?err=insert_failed`);

  await writeAuditLog(supabase, {
    actorUserId: user!.id,
    actorEmail: user?.email ?? null,
    action: "charges.bulk_created",
    tableName: "charges",
    afterData: { team_id: teamId, charge_type_id: chargeTypeId, amount, description, count: charges.length }
  });

  redirect(`${BASE}?ok=1&created=${charges.length}`);
}
