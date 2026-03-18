"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { parseEnrollmentFormData, parseEnrollmentEditData } from "@/lib/validations/enrollment";
import { writeAuditLog } from "@/lib/audit";
import { findB2TeamForAutoAssign } from "@/lib/queries/teams";

type ChargeTypeRow = { id: string; code: string };

function redirectWithError(playerId: string, code: string): never {
  redirect(`/players/${playerId}/enrollments/new?err=${code}`);
}

export async function createEnrollmentAction(playerId: string, formData: FormData) {
  const parsed = parseEnrollmentFormData(formData);
  if (!parsed) return redirectWithError(playerId, "invalid_form");

  const supabase = await createClient();
  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();
  if (userError || !user) return redirectWithError(playerId, "unauthenticated");

  // Verify player exists and has no active enrollment
  const [{ data: player }, { data: existingEnrollment }] = await Promise.all([
    supabase.from("players").select("id, birth_date, gender").eq("id", playerId).maybeSingle(),
    supabase
      .from("enrollments")
      .select("id")
      .eq("player_id", playerId)
      .eq("status", "active")
      .maybeSingle()
  ]);

  if (!player) return redirectWithError(playerId, "player_not_found");
  if (existingEnrollment) return redirectWithError(playerId, "already_enrolled");

  // Resolve charge type IDs
  const { data: chargeTypes } = await supabase
    .from("charge_types")
    .select("id, code")
    .in("code", ["inscription", "monthly_tuition"])
    .returns<ChargeTypeRow[]>();

  const inscriptionTypeId = (chargeTypes ?? []).find((ct) => ct.code === "inscription")?.id;
  const tuitionTypeId = (chargeTypes ?? []).find((ct) => ct.code === "monthly_tuition")?.id;
  if (!inscriptionTypeId || !tuitionTypeId) return redirectWithError(playerId, "config_error");

  // Create enrollment
  const { data: enrollment, error: enrollmentError } = await supabase
    .from("enrollments")
    .insert({
      player_id: playerId,
      campus_id: parsed.campusId,
      pricing_plan_id: parsed.pricingPlanId,
      status: "active",
      start_date: parsed.startDate,
      inscription_date: parsed.startDate,
      notes: parsed.notes ?? null
    })
    .select("id, pricing_plans(currency)")
    .maybeSingle()
    .returns<{ id: string; pricing_plans: { currency: string } | null } | null>();

  if (enrollmentError || !enrollment) return redirectWithError(playerId, "enrollment_failed");

  const enrollmentId = enrollment.id;
  const currency = enrollment.pricing_plans?.currency ?? "MXN";

  // period_month = first day of the start_date's month
  const [year, month] = parsed.startDate.split("-");
  const periodMonth = `${year}-${month}-01`;

  // Create 2 initial charges atomically
  const { error: chargesError } = await supabase.from("charges").insert([
    {
      enrollment_id: enrollmentId,
      charge_type_id: inscriptionTypeId,
      description: "Inscripción",
      amount: parsed.inscriptionAmount,
      currency,
      status: "pending",
      created_by: user.id
    },
    {
      enrollment_id: enrollmentId,
      charge_type_id: tuitionTypeId,
      description: `Mensualidad ${month}/${year}`,
      amount: parsed.firstMonthAmount,
      currency,
      status: "pending",
      period_month: periodMonth,
      created_by: user.id
    }
  ]);

  if (chargesError) return redirectWithError(playerId, "charges_failed");

  // Auto-assign to B2 team if one exists for this campus + birth year + gender
  const birthYear = player.birth_date ? new Date(player.birth_date).getFullYear() : null;
  if (birthYear) {
    const b2Team = await findB2TeamForAutoAssign(parsed.campusId, birthYear, player.gender ?? null);
    if (b2Team) {
      const today = new Date().toISOString().split("T")[0];
      await supabase.from("team_assignments").insert({
        enrollment_id: enrollmentId,
        team_id: b2Team.id,
        start_date: today,
        is_primary: true,
        role: "regular",
        is_new_arrival: true,
      });
      await supabase.from("players").update({ level: "B2" }).eq("id", playerId);
    }
  }

  await writeAuditLog(supabase, {
    actorUserId: user.id,
    actorEmail: user.email ?? null,
    action: "enrollment.created",
    tableName: "enrollments",
    recordId: enrollmentId,
    afterData: { player_id: playerId, campus_id: parsed.campusId, start_date: parsed.startDate }
  });

  revalidatePath(`/players/${playerId}`);
  redirect(`/enrollments/${enrollmentId}/charges`);
}

// ── Update enrollment (edit + baja) ──────────────────────────────────────────

function redirectWithEditError(enrollmentId: string, playerId: string, code: string): never {
  redirect(`/players/${playerId}/enrollments/${enrollmentId}/edit?err=${code}`);
}

export async function updateEnrollmentAction(
  enrollmentId: string,
  playerId: string,
  formData: FormData
) {
  const parsed = parseEnrollmentEditData(formData);
  if (!parsed) return redirectWithEditError(enrollmentId, playerId, "invalid_form");

  const supabase = await createClient();
  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();
  if (userError || !user) return redirectWithEditError(enrollmentId, playerId, "unauthenticated");

  // Verify enrollment exists and belongs to this player
  const { data: enrollment } = await supabase
    .from("enrollments")
    .select("id")
    .eq("id", enrollmentId)
    .eq("player_id", playerId)
    .maybeSingle();

  if (!enrollment) return redirectWithEditError(enrollmentId, playerId, "not_found");

  // Auto-set end_date when ending/cancelling without an explicit date
  let endDate: string | null = parsed.endDate;
  if ((parsed.status === "ended" || parsed.status === "cancelled") && !endDate) {
    endDate = new Date().toISOString().split("T")[0];
  }
  // Reactivating clears end_date
  if (parsed.status === "active") {
    endDate = null;
  }

  const { error } = await supabase
    .from("enrollments")
    .update({
      status: parsed.status,
      end_date: endDate,
      campus_id: parsed.campusId,
      notes: parsed.notes,
      dropout_reason: parsed.dropoutReason,
      dropout_notes: parsed.dropoutNotes,
      updated_at: new Date().toISOString()
    })
    .eq("id", enrollmentId);

  if (error) return redirectWithEditError(enrollmentId, playerId, "update_failed");

  const action =
    parsed.status === "ended" || parsed.status === "cancelled"
      ? "enrollment.ended"
      : parsed.status === "active"
        ? "enrollment.reactivated"
        : "enrollment.updated";

  await writeAuditLog(supabase, {
    actorUserId: user.id,
    actorEmail: user.email ?? null,
    action,
    tableName: "enrollments",
    recordId: enrollmentId,
    afterData: { status: parsed.status, end_date: endDate, dropout_reason: parsed.dropoutReason }
  });

  revalidatePath(`/players/${playerId}`);
  redirect(`/players/${playerId}`);
}
