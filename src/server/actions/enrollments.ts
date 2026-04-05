"use server";

import { canAccessCampus, getOperationalCampusAccess } from "@/lib/auth/campuses";
import { assertDebugWritesAllowed, isDebugWriteBlocked } from "@/lib/auth/debug-view";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getReturningInscriptionOption } from "@/lib/enrollments/returning";
import { formatPeriodMonthLabel, getEnrollmentPricingQuote } from "@/lib/pricing/plans";
import { parseEnrollmentFormData, parseEnrollmentEditData } from "@/lib/validations/enrollment";
import { writeAuditLog } from "@/lib/audit";
import { findB2TeamForAutoAssign } from "@/lib/queries/teams";
import { parseDateOnlyInput } from "@/lib/time";

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
  await assertDebugWritesAllowed(
    `/players/${playerId}/enrollments/new${isReturning ? "?returning=1" : ""}`
  );

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
  const campusAccess = await getOperationalCampusAccess();
  if (!campusAccess || !canAccessCampus(campusAccess, parsed.campusId)) {
    return redirectWithError(playerId, "invalid_form", {
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
  await assertDebugWritesAllowed(`/players/${playerId}/enrollments/${enrollmentId}/edit`);
  const parsed = parseEnrollmentEditData(formData);
  if (!parsed) return redirectWithEditError(enrollmentId, playerId, "invalid_form");

  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) return redirectWithEditError(enrollmentId, playerId, "unauthenticated");
  const campusAccess = await getOperationalCampusAccess();
  if (!campusAccess || !canAccessCampus(campusAccess, parsed.campusId)) {
    return redirectWithEditError(enrollmentId, playerId, "invalid_form");
  }

  const { data: enrollment } = await supabase
    .from("enrollments")
    .select("id, campus_id")
    .eq("id", enrollmentId)
    .eq("player_id", playerId)
    .maybeSingle<{ id: string; campus_id: string }>();

  if (!enrollment) return redirectWithEditError(enrollmentId, playerId, "not_found");
  if (!canAccessCampus(campusAccess, enrollment.campus_id)) {
    return redirectWithEditError(enrollmentId, playerId, "not_found");
  }

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

  if (parsed.status === "ended" || parsed.status === "cancelled") {
    await clearPendingFollowUpForEnrollment(supabase, enrollmentId);
  }

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

export type UpdatePendingFollowUpResult =
  | { ok: true }
  | { ok: false; error: string };

export type PendingFollowUpStatus =
  | "uncontacted"
  | "no_answer"
  | "contacted"
  | "promise_to_pay"
  | "will_not_return";

const PENDING_FOLLOW_UP_STATUSES = new Set<PendingFollowUpStatus>([
  "uncontacted",
  "no_answer",
  "contacted",
  "promise_to_pay",
  "will_not_return",
]);

export async function clearPendingFollowUpForEnrollment(
  supabase: Awaited<ReturnType<typeof createClient>>,
  enrollmentId: string,
) {
  await supabase
    .from("enrollments")
    .update({
      follow_up_status: null,
      follow_up_at: null,
      follow_up_by: null,
      follow_up_note: null,
      promise_date: null,
    })
    .eq("id", enrollmentId);
}

export async function updatePendingFollowUpAction(
  enrollmentId: string,
  status: string,
  note: string,
  promiseDateRaw: string,
): Promise<UpdatePendingFollowUpResult> {
  if (await isDebugWriteBlocked()) return { ok: false, error: "debug_read_only" };
  if (!PENDING_FOLLOW_UP_STATUSES.has(status as PendingFollowUpStatus)) {
    return { ok: false, error: "invalid_status" };
  }

  const promiseDate = promiseDateRaw.trim() ? parseDateOnlyInput(promiseDateRaw.trim()) : null;
  if (promiseDateRaw.trim() && !promiseDate) return { ok: false, error: "invalid_promise_date" };
  if (status === "promise_to_pay" && !promiseDate) return { ok: false, error: "promise_date_required" };

  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) return { ok: false, error: "unauthenticated" };
  const campusAccess = await getOperationalCampusAccess();
  if (!campusAccess) return { ok: false, error: "unauthenticated" };

  const { data: enrollment } = await supabase
    .from("enrollments")
    .select("campus_id")
    .eq("id", enrollmentId)
    .maybeSingle<{ campus_id: string }>();
  if (!enrollment || !canAccessCampus(campusAccess, enrollment.campus_id)) {
    return { ok: false, error: "update_failed" };
  }

  const followUpStatus = status as PendingFollowUpStatus;
  const followUpNote = note.trim() || null;

  const { data: current } = await supabase
    .from("enrollments")
    .select("follow_up_status, follow_up_note, promise_date")
    .eq("id", enrollmentId)
    .maybeSingle<{
      follow_up_status: string | null;
      follow_up_note: string | null;
      promise_date: string | null;
    }>();

  const { error } = await supabase
    .from("enrollments")
    .update(
      {
        follow_up_status: followUpStatus === "uncontacted" ? null : followUpStatus,
        follow_up_at: followUpStatus === "uncontacted" ? null : new Date().toISOString(),
        follow_up_by: followUpStatus === "uncontacted" ? null : user.id,
        follow_up_note: followUpStatus === "uncontacted" ? null : followUpNote,
        promise_date: followUpStatus === "promise_to_pay" ? promiseDate : null,
      }
    )
    .eq("id", enrollmentId);

  if (error) return { ok: false, error: "update_failed" };

  await writeAuditLog(supabase, {
    actorUserId: user.id,
    actorEmail: user.email ?? null,
    action: "pending_follow_up.updated",
    tableName: "enrollments",
    recordId: enrollmentId,
    beforeData: {
      follow_up_status: current?.follow_up_status ?? null,
      follow_up_note: current?.follow_up_note ?? null,
      promise_date: current?.promise_date ?? null,
    },
    afterData: {
      follow_up_status: followUpStatus === "uncontacted" ? null : followUpStatus,
      follow_up_note: followUpStatus === "uncontacted" ? null : followUpNote,
      promise_date: followUpStatus === "promise_to_pay" ? promiseDate : null,
    },
  });

  revalidatePath("/pending");
  return { ok: true };
}
