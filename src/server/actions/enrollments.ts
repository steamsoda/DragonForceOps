"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getReturningInscriptionOption } from "@/lib/enrollments/returning";
import { formatPeriodMonthLabel, getEnrollmentPricingQuote } from "@/lib/pricing/plans";
import { parseEnrollmentFormData, parseEnrollmentEditData } from "@/lib/validations/enrollment";
import { writeAuditLog } from "@/lib/audit";
import { findB2TeamForAutoAssign } from "@/lib/queries/teams";

type ChargeTypeRow = { id: string; code: string };

function redirectWithError(
  playerId: string,
  code: string,
  options?: { isReturning?: boolean; returnMode?: string | null }
): never {
  const params = new URLSearchParams({ err: code });
  if (options?.isReturning) params.set("returning", "1");
  if (options?.isReturning && options.returnMode) params.set("returnMode", options.returnMode);
  redirect(`/players/${playerId}/enrollments/new?${params.toString()}`);
}

export async function createEnrollmentAction(playerId: string, formData: FormData) {
  const isReturning = String(formData.get("isReturning") ?? "") === "1";
  const returnMode = String(formData.get("returnInscriptionMode") ?? "").trim() || null;
  const parsed = parseEnrollmentFormData(formData);
  if (!parsed) {
    return redirectWithError(playerId, "invalid_form", { isReturning, returnMode });
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return redirectWithError(playerId, "unauthenticated", {
      isReturning: parsed.isReturning,
      returnMode: parsed.returnInscriptionMode,
    });
  }

  const [{ data: player }, { data: existingEnrollment }] = await Promise.all([
    supabase.from("players").select("id, birth_date, gender").eq("id", playerId).maybeSingle(),
    supabase
      .from("enrollments")
      .select("id")
      .eq("player_id", playerId)
      .eq("status", "active")
      .maybeSingle(),
  ]);

  if (!player) {
    return redirectWithError(playerId, "player_not_found", {
      isReturning: parsed.isReturning,
      returnMode: parsed.returnInscriptionMode,
    });
  }
  if (existingEnrollment) {
    return redirectWithError(playerId, "already_enrolled", {
      isReturning: parsed.isReturning,
      returnMode: parsed.returnInscriptionMode,
    });
  }

  const [pricingQuote, chargeTypesResult] = await Promise.all([
    getEnrollmentPricingQuote(supabase, {
      planCode: parsed.pricingPlanCode,
      startDate: parsed.startDate,
    }),
    supabase
      .from("charge_types")
      .select("id, code")
      .in("code", ["inscription", "monthly_tuition"])
      .returns<ChargeTypeRow[]>(),
  ]);

  const chargeTypes = chargeTypesResult.data;
  const inscriptionTypeId = (chargeTypes ?? []).find((ct) => ct.code === "inscription")?.id;
  const tuitionTypeId = (chargeTypes ?? []).find((ct) => ct.code === "monthly_tuition")?.id;
  if (!pricingQuote || !inscriptionTypeId || !tuitionTypeId) {
    return redirectWithError(playerId, "config_error", {
      isReturning: parsed.isReturning,
      returnMode: parsed.returnInscriptionMode,
    });
  }

  const returnOption =
    parsed.isReturning && parsed.returnInscriptionMode
      ? getReturningInscriptionOption(parsed.returnInscriptionMode)
      : null;
  const inscriptionAmount = returnOption?.amount ?? pricingQuote.inscriptionAmount;
  const inscriptionDescription = returnOption?.chargeDescription ?? "Inscripcion";

  const { data: enrollment, error: enrollmentError } = await supabase
    .from("enrollments")
    .insert({
      player_id: playerId,
      campus_id: parsed.campusId,
      pricing_plan_id: pricingQuote.plan.id,
      status: "active",
      start_date: parsed.startDate,
      inscription_date: parsed.startDate,
      is_returning: parsed.isReturning,
      return_inscription_mode: parsed.isReturning ? parsed.returnInscriptionMode : null,
      notes: parsed.notes ?? null,
    })
    .select("id, pricing_plans(currency)")
    .maybeSingle()
    .returns<{ id: string; pricing_plans: { currency: string } | null } | null>();

  if (enrollmentError || !enrollment) {
    return redirectWithError(playerId, "enrollment_failed", {
      isReturning: parsed.isReturning,
      returnMode: parsed.returnInscriptionMode,
    });
  }

  const enrollmentId = enrollment.id;
  const currency = enrollment.pricing_plans?.currency ?? pricingQuote.plan.currency ?? "MXN";
  const tuitionDescription = `Mensualidad ${formatPeriodMonthLabel(pricingQuote.tuitionPeriodMonth)}`;

  const { error: chargesError } = await supabase.from("charges").insert([
    {
      enrollment_id: enrollmentId,
      charge_type_id: inscriptionTypeId,
      description: inscriptionDescription,
      amount: inscriptionAmount,
      currency,
      status: "pending",
      created_by: user.id,
    },
    {
      enrollment_id: enrollmentId,
      charge_type_id: tuitionTypeId,
      description: tuitionDescription,
      amount: pricingQuote.tuitionAmount,
      currency,
      status: "pending",
      period_month: pricingQuote.tuitionPeriodMonth,
      created_by: user.id,
    },
  ]);

  if (chargesError) {
    return redirectWithError(playerId, "charges_failed", {
      isReturning: parsed.isReturning,
      returnMode: parsed.returnInscriptionMode,
    });
  }

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
    afterData: {
      player_id: playerId,
      campus_id: parsed.campusId,
      start_date: parsed.startDate,
      is_returning: parsed.isReturning,
      return_inscription_mode: parsed.isReturning ? parsed.returnInscriptionMode : null,
    },
  });

  revalidatePath(`/players/${playerId}`);
  redirect(`/caja?enrollmentId=${enrollmentId}`);
}

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
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) return redirectWithEditError(enrollmentId, playerId, "unauthenticated");

  const { data: enrollment } = await supabase
    .from("enrollments")
    .select("id")
    .eq("id", enrollmentId)
    .eq("player_id", playerId)
    .maybeSingle();

  if (!enrollment) return redirectWithEditError(enrollmentId, playerId, "not_found");

  let endDate: string | null = parsed.endDate;
  if ((parsed.status === "ended" || parsed.status === "cancelled") && !endDate) {
    endDate = new Date().toISOString().split("T")[0];
  }
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
      updated_at: new Date().toISOString(),
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
    afterData: { status: parsed.status, end_date: endDate, dropout_reason: parsed.dropoutReason },
  });

  revalidatePath(`/players/${playerId}`);
  redirect(`/players/${playerId}`);
}

export type UpdateContactadoResult =
  | { ok: true }
  | { ok: false; error: string };

export async function updateContactadoAction(
  enrollmentId: string,
  contacted: boolean,
  notes: string
): Promise<UpdateContactadoResult> {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) return { ok: false, error: "unauthenticated" };

  const { error } = await supabase
    .from("enrollments")
    .update(
      contacted
        ? { contactado_at: new Date().toISOString(), contactado_by: user.id, contactado_notes: notes || null }
        : { contactado_at: null, contactado_by: null, contactado_notes: null }
    )
    .eq("id", enrollmentId);

  if (error) return { ok: false, error: "update_failed" };

  revalidatePath("/pending");
  return { ok: true };
}
