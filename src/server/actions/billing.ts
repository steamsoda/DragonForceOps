"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
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

// ── Void payment ─────────────────────────────────────────────────────────────

export async function voidPaymentAction(
  enrollmentId: string,
  paymentId: string,
  formData: FormData
): Promise<void> {
  const BASE = `/enrollments/${enrollmentId}/charges`;

  const reason = formData.get("reason")?.toString().trim() ?? "";
  if (!reason) redirect(`${BASE}?err=void_reason_required`);

  const supabase = await createClient();
  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();
  if (userError || !user) redirect(`${BASE}?err=unauthenticated`);

  const { data: isDirector } = await supabase.rpc("is_director_admin");
  if (!isDirector) redirect(`${BASE}?err=unauthorized`);

  // Verify payment belongs to this enrollment and is posted
  const { data: payment } = await supabase
    .from("payments")
    .select("id, status, amount, method")
    .eq("id", paymentId)
    .eq("enrollment_id", enrollmentId)
    .eq("status", "posted")
    .maybeSingle<{ id: string; status: string; amount: number; method: string }>();

  if (!payment) redirect(`${BASE}?err=payment_not_found`);

  // Delete allocations first (frees the charges back to pending)
  const { error: allocError } = await supabase
    .from("payment_allocations")
    .delete()
    .eq("payment_id", paymentId);

  if (allocError) redirect(`${BASE}?err=void_failed`);

  // Mark payment void
  const { error: voidError } = await supabase
    .from("payments")
    .update({ status: "void" })
    .eq("id", paymentId);

  if (voidError) redirect(`${BASE}?err=void_failed`);

  await writeAuditLog(supabase, {
    actorUserId: user.id,
    actorEmail: user.email ?? null,
    action: "payment.voided",
    tableName: "payments",
    recordId: paymentId,
    afterData: { enrollment_id: enrollmentId, amount: payment.amount, method: payment.method, reason }
  });

  revalidatePath(BASE);
  redirect(`${BASE}?ok=payment_voided`);
}

// ── Void charge ───────────────────────────────────────────────────────────────

export async function voidChargeAction(
  enrollmentId: string,
  chargeId: string,
  formData: FormData
): Promise<void> {
  const BASE = `/enrollments/${enrollmentId}/charges`;

  const reason = formData.get("reason")?.toString().trim() ?? "";
  if (!reason) redirect(`${BASE}?err=void_reason_required`);

  const supabase = await createClient();
  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();
  if (userError || !user) redirect(`${BASE}?err=unauthenticated`);

  // Only director_admin may void charges
  const { data: isDirector } = await supabase.rpc("is_director_admin");
  if (!isDirector) redirect(`${BASE}?err=unauthorized`);

  // Verify charge belongs to this enrollment and is pending
  const { data: charge } = await supabase
    .from("charges")
    .select("id, status, amount, description")
    .eq("id", chargeId)
    .eq("enrollment_id", enrollmentId)
    .eq("status", "pending")
    .maybeSingle<{ id: string; status: string; amount: number; description: string }>();

  if (!charge) redirect(`${BASE}?err=charge_not_found`);

  const { error } = await supabase
    .from("charges")
    .update({ status: "void" })
    .eq("id", chargeId);

  if (error) redirect(`${BASE}?err=void_failed`);

  await writeAuditLog(supabase, {
    actorUserId: user.id,
    actorEmail: user.email ?? null,
    action: "charge.voided",
    tableName: "charges",
    recordId: chargeId,
    afterData: { enrollment_id: enrollmentId, description: charge.description, amount: charge.amount, reason }
  });

  revalidatePath(BASE);
  redirect(`${BASE}?ok=charge_voided`);
}

// ── Batch void charges for ended/cancelled enrollments ────────────────────────

export async function batchVoidBajaChargesAction(formData: FormData): Promise<void> {
  const BASE = "/pending/bajas";

  const reason = formData.get("reason")?.toString().trim() ?? "";
  if (!reason) redirect(`${BASE}?err=reason_required`);

  const enrollmentIds = formData.getAll("enrollment_ids").map((v) => v.toString().trim()).filter(Boolean);
  if (enrollmentIds.length === 0) redirect(`${BASE}?err=none_selected`);

  const supabase = await createClient();
  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();
  if (userError || !user) redirect(`${BASE}?err=unauthenticated`);

  const { data: isDirector } = await supabase.rpc("is_director_admin");
  if (!isDirector) redirect(`${BASE}?err=unauthorized`);

  // Only target ended/cancelled enrollments — safety check
  const { data: validEnrollments } = await supabase
    .from("enrollments")
    .select("id")
    .in("id", enrollmentIds)
    .in("status", ["ended", "cancelled"])
    .returns<{ id: string }[]>();

  const validIds = (validEnrollments ?? []).map((e) => e.id);
  if (validIds.length === 0) redirect(`${BASE}?err=no_valid_enrollments`);

  // Fetch all pending charges for these enrollments
  const { data: charges } = await supabase
    .from("charges")
    .select("id, enrollment_id, amount, description")
    .in("enrollment_id", validIds)
    .eq("status", "pending")
    .returns<{ id: string; enrollment_id: string; amount: number; description: string }[]>();

  const pendingCharges = charges ?? [];
  if (pendingCharges.length === 0) redirect(`${BASE}?err=no_pending_charges`);

  const chargeIds = pendingCharges.map((c) => c.id);

  const { error: voidError } = await supabase
    .from("charges")
    .update({ status: "void" })
    .in("id", chargeIds);

  if (voidError) redirect(`${BASE}?err=void_failed`);

  // Audit log per charge
  await Promise.all(
    pendingCharges.map((charge) =>
      writeAuditLog(supabase, {
        actorUserId: user.id,
        actorEmail: user.email ?? null,
        action: "charge.voided",
        tableName: "charges",
        recordId: charge.id,
        afterData: {
          enrollment_id: charge.enrollment_id,
          description: charge.description,
          amount: charge.amount,
          reason,
          batch: true
        }
      })
    )
  );

  revalidatePath(BASE);
  redirect(`${BASE}?ok=voided&count=${pendingCharges.length}`);
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
