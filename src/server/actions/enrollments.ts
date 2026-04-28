"use server";

import { canAccessCampus, getOperationalCampusAccess } from "@/lib/auth/campuses";
import { assertDebugWritesAllowed, isDebugWriteBlocked } from "@/lib/auth/debug-view";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getReturningInscriptionOption } from "@/lib/enrollments/returning";
import { applyScholarshipToAmount, type ScholarshipStatus } from "@/lib/enrollments/scholarships";
import {
  fetchPricingPlanVersionsByCode,
  formatPeriodMonthLabel,
  getEnrollmentPricingQuote,
  quoteAdvanceTuitionFromVersions,
  quoteTuitionForDayFromVersions,
} from "@/lib/pricing/plans";
import { parseEnrollmentDropoutData, parseEnrollmentFormData, parseEnrollmentEditData } from "@/lib/validations/enrollment";
import { writeAuditLog } from "@/lib/audit";
import { findB2TeamForAutoAssign } from "@/lib/queries/teams";
import { getMonterreyDateString, getMonterreyMonthString, parseDateOnlyInput } from "@/lib/time";
import { getPermissionContext } from "@/lib/auth/permissions";

type ChargeTypeRow = { id: string; code: string };
type EnrollmentScholarshipChargeRow = {
  id: string;
  period_month: string | null;
  amount: number;
  pricing_rule_id: string | null;
};
type EnrollmentScholarshipAllocationRow = {
  charge_id: string;
  amount: number;
};
type EnrollmentScholarshipRow = {
  id: string;
  campus_id: string;
  status: string;
  scholarship_status: ScholarshipStatus;
  pricing_plan_id: string;
  pricing_plans: { plan_code: string; currency: string | null } | null;
};

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function lastDayOfMonth(periodMonth: string) {
  const [yearStr, monthStr] = periodMonth.split("-");
  const date = new Date(Date.UTC(Number(yearStr), Number(monthStr), 0, 12, 0, 0));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

async function syncPendingTuitionForScholarshipChange(
  supabase: Awaited<ReturnType<typeof createClient>>,
  {
    enrollment,
    chargeTypeId,
    nextScholarshipStatus,
    userId,
  }: {
    enrollment: EnrollmentScholarshipRow;
    chargeTypeId: string;
    nextScholarshipStatus: ScholarshipStatus;
    userId: string;
  },
) {
  const currentPeriodMonth = `${getMonterreyMonthString()}-01`;
  const currentDayOfMonth = Number(getMonterreyDateString().slice(8, 10));
  const { data: pendingCharges, error: pendingChargesError } = await supabase
    .from("charges")
    .select("id, period_month, amount, pricing_rule_id")
    .eq("enrollment_id", enrollment.id)
    .eq("charge_type_id", chargeTypeId)
    .eq("status", "pending")
    .gte("period_month", currentPeriodMonth)
    .returns<EnrollmentScholarshipChargeRow[]>();

  if (pendingChargesError) return { ok: false as const, error: "scholarship_sync_failed" };

  const candidateCharges = pendingCharges ?? [];
  const candidateChargeIds = candidateCharges.map((charge) => charge.id);
  const allocationTotals = new Map<string, number>();

  if (candidateChargeIds.length > 0) {
    const { data: allocations, error: allocationsError } = await supabase
      .from("payment_allocations")
      .select("charge_id, amount")
      .in("charge_id", candidateChargeIds)
      .returns<EnrollmentScholarshipAllocationRow[]>();

    if (allocationsError) return { ok: false as const, error: "scholarship_sync_failed" };

    for (const allocation of allocations ?? []) {
      allocationTotals.set(
        allocation.charge_id,
        roundMoney((allocationTotals.get(allocation.charge_id) ?? 0) + allocation.amount),
      );
    }
  }

  const outstandingCharges = candidateCharges.filter((charge) => {
    const allocatedAmount = allocationTotals.get(charge.id) ?? 0;
    return roundMoney(charge.amount - allocatedAmount) > 0.009;
  });
  const allocatedOutstandingCharge = outstandingCharges.some((charge) => (allocationTotals.get(charge.id) ?? 0) > 0.009);
  if (allocatedOutstandingCharge) {
    return { ok: false as const, error: "scholarship_allocated_pending_charges" };
  }

  const chargeIds = outstandingCharges.map((charge) => charge.id);

  if (nextScholarshipStatus === "full") {
    if (chargeIds.length === 0) {
      return { ok: true as const, affectedCount: 0 };
    }

    const { error: voidError } = await supabase
      .from("charges")
      .update({
        status: "void",
        updated_at: new Date().toISOString(),
      })
      .in("id", chargeIds);

    if (voidError) return { ok: false as const, error: "scholarship_sync_failed" };
    return { ok: true as const, affectedCount: chargeIds.length };
  }

  const planCode = enrollment.pricing_plans?.plan_code ?? null;
  if (!planCode) return { ok: false as const, error: "scholarship_rate_not_found" };

  const pricingVersions = await fetchPricingPlanVersionsByCode(supabase, planCode);
  if (pricingVersions.length === 0) {
    return { ok: false as const, error: "scholarship_rate_not_found" };
  }

  for (const charge of outstandingCharges) {
    if (!charge.period_month) continue;
    const quote =
      charge.period_month === currentPeriodMonth
        ? quoteTuitionForDayFromVersions(pricingVersions, charge.period_month, currentDayOfMonth)
        : quoteAdvanceTuitionFromVersions(pricingVersions, charge.period_month);
    if (!quote) return { ok: false as const, error: "scholarship_rate_not_found" };

    const nextAmount = applyScholarshipToAmount(quote.amount, nextScholarshipStatus);
    if (roundMoney(charge.amount) === nextAmount && charge.pricing_rule_id === quote.pricingRuleId) {
      continue;
    }

    const { error: updateChargeError } = await supabase
      .from("charges")
      .update({
        amount: nextAmount,
        pricing_rule_id: quote.pricingRuleId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", charge.id);

    if (updateChargeError) return { ok: false as const, error: "scholarship_sync_failed" };
  }

  const { data: currentMonthCharge, error: currentMonthChargeError } = await supabase
    .from("charges")
    .select("id")
    .eq("enrollment_id", enrollment.id)
    .eq("charge_type_id", chargeTypeId)
    .eq("period_month", currentPeriodMonth)
    .neq("status", "void")
    .maybeSingle<{ id: string } | null>();

  if (currentMonthChargeError) return { ok: false as const, error: "scholarship_sync_failed" };

  if (!currentMonthCharge) {
    const { count: omittedCount, error: incidentError } = await supabase
      .from("enrollment_incidents")
      .select("*", { count: "exact", head: true })
      .eq("enrollment_id", enrollment.id)
      .eq("omit_period_month", currentPeriodMonth)
      .is("cancelled_at", null);

    if (incidentError) return { ok: false as const, error: "scholarship_sync_failed" };

    if ((omittedCount ?? 0) === 0) {
      const currentMonthQuote = quoteTuitionForDayFromVersions(
        pricingVersions,
        currentPeriodMonth,
        currentDayOfMonth,
      );
      if (!currentMonthQuote) return { ok: false as const, error: "scholarship_rate_not_found" };

      const { error: insertChargeError } = await supabase
        .from("charges")
        .insert({
          enrollment_id: enrollment.id,
          charge_type_id: chargeTypeId,
          period_month: currentPeriodMonth,
          description: `Mensualidad ${formatPeriodMonthLabel(currentPeriodMonth)}`,
          amount: applyScholarshipToAmount(currentMonthQuote.amount, nextScholarshipStatus),
          currency: enrollment.pricing_plans?.currency ?? currentMonthQuote.plan.currency ?? "MXN",
          status: "pending",
          due_date: lastDayOfMonth(currentPeriodMonth),
          pricing_rule_id: currentMonthQuote.pricingRuleId,
          created_by: userId,
        });

      if (insertChargeError) return { ok: false as const, error: "scholarship_sync_failed" };
      return { ok: true as const, affectedCount: chargeIds.length + 1 };
    }
  }

  return { ok: true as const, affectedCount: chargeIds.length };
}

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

function logEnrollmentConfigError(details: Record<string, unknown>) {
  console.error("[enrollments] missing enrollment config", details);
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
  const admin = createAdminClient();
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
    getEnrollmentPricingQuote(admin, {
      planCode: parsed.pricingPlanCode || "standard",
      startDate: parsed.startDate,
    }),
    admin
      .from("charge_types")
      .select("id, code")
      .in("code", ["inscription", "monthly_tuition"])
      .returns<ChargeTypeRow[]>(),
  ]);

  const chargeTypes = chargeTypesResult.data;
  const inscriptionTypeId = (chargeTypes ?? []).find((ct) => ct.code === "inscription")?.id;
  const tuitionTypeId = (chargeTypes ?? []).find((ct) => ct.code === "monthly_tuition")?.id;
  if (!pricingQuote || !inscriptionTypeId || !tuitionTypeId) {
    logEnrollmentConfigError({
      action: "createEnrollmentAction",
      playerId,
      planCode: parsed.pricingPlanCode,
      startDate: parsed.startDate,
      hasPricingQuote: Boolean(pricingQuote),
      chargeTypesError: chargeTypesResult.error?.message ?? null,
      chargeTypeCodes: (chargeTypes ?? []).map((ct) => ct.code),
      hasInscriptionType: Boolean(inscriptionTypeId),
      hasTuitionType: Boolean(tuitionTypeId),
    });
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
      pricing_rule_id: pricingQuote.tuitionPricingRuleId,
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

function redirectWithDropoutError(enrollmentId: string, playerId: string, code: string): never {
  redirect(`/players/${playerId}/enrollments/${enrollmentId}/dropout?err=${code}`);
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
  const permissionContext = await getPermissionContext();
  const campusAccess = await getOperationalCampusAccess();
  if (!campusAccess || !canAccessCampus(campusAccess, parsed.campusId)) {
    return redirectWithEditError(enrollmentId, playerId, "invalid_form");
  }

  const { data: enrollment } = await supabase
    .from("enrollments")
    .select("id, campus_id, status, scholarship_status, pricing_plan_id, pricing_plans(plan_code, currency)")
    .eq("id", enrollmentId)
    .eq("player_id", playerId)
    .maybeSingle<EnrollmentScholarshipRow | null>();

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

  let nextScholarshipStatus = enrollment.scholarship_status;
  let scholarshipChanged = false;
  let scholarshipAffectedCount = 0;
  if (parsed.scholarshipStatusProvided) {
    if (!permissionContext?.isDirector) {
      return redirectWithEditError(enrollmentId, playerId, "scholarship_forbidden");
    }
    nextScholarshipStatus = parsed.scholarshipStatus ?? enrollment.scholarship_status;
    scholarshipChanged = nextScholarshipStatus !== enrollment.scholarship_status;
  }

  if (scholarshipChanged && parsed.status === "active") {
    const { data: chargeType, error: chargeTypeError } = await supabase
      .from("charge_types")
      .select("id")
      .eq("code", "monthly_tuition")
      .eq("is_active", true)
      .maybeSingle<{ id: string } | null>();

    if (chargeTypeError || !chargeType) {
      return redirectWithEditError(enrollmentId, playerId, "scholarship_rate_not_found");
    }

    const syncResult = await syncPendingTuitionForScholarshipChange(supabase, {
      enrollment,
      chargeTypeId: chargeType.id,
      nextScholarshipStatus,
      userId: user.id,
    });

    if (!syncResult.ok) {
      return redirectWithEditError(enrollmentId, playerId, syncResult.error);
    }

    scholarshipAffectedCount = syncResult.affectedCount;
  }

  const { error } = await supabase
    .from("enrollments")
    .update({
      status: parsed.status,
      end_date: endDate,
      campus_id: parsed.campusId,
      scholarship_status: nextScholarshipStatus,
      has_scholarship: nextScholarshipStatus === "full",
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
    afterData: {
      status: parsed.status,
      end_date: endDate,
      scholarship_status: nextScholarshipStatus,
      dropout_reason: parsed.dropoutReason,
    },
  });

  if (scholarshipChanged) {
    await writeAuditLog(supabase, {
      actorUserId: user.id,
      actorEmail: user.email ?? null,
      action: "enrollment.scholarship_updated",
      tableName: "enrollments",
      recordId: enrollmentId,
      beforeData: { scholarship_status: enrollment.scholarship_status },
      afterData: {
        scholarship_status: nextScholarshipStatus,
        affected_pending_tuition_rows: scholarshipAffectedCount,
      },
    });
  }

  revalidatePath(`/players/${playerId}`);
  revalidatePath("/players");
  revalidatePath("/pending");
  revalidatePath("/llamadas");
  revalidatePath("/admin/mensualidades");
  revalidatePath("/reports/porto-mensual");
  redirect(`/players/${playerId}`);
}

export async function dropoutEnrollmentAction(
  enrollmentId: string,
  playerId: string,
  formData: FormData,
) {
  await assertDebugWritesAllowed(`/players/${playerId}/enrollments/${enrollmentId}/dropout`);
  const parsed = parseEnrollmentDropoutData(formData);
  if (!parsed) return redirectWithDropoutError(enrollmentId, playerId, "invalid_form");

  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) return redirectWithDropoutError(enrollmentId, playerId, "unauthenticated");

  const campusAccess = await getOperationalCampusAccess();
  if (!campusAccess) return redirectWithDropoutError(enrollmentId, playerId, "unauthenticated");

  const { data: enrollment } = await supabase
    .from("enrollments")
    .select("id, campus_id, status")
    .eq("id", enrollmentId)
    .eq("player_id", playerId)
    .maybeSingle<{ id: string; campus_id: string; status: string }>();

  if (!enrollment) return redirectWithDropoutError(enrollmentId, playerId, "not_found");
  if (!canAccessCampus(campusAccess, enrollment.campus_id)) {
    return redirectWithDropoutError(enrollmentId, playerId, "not_found");
  }
  if (enrollment.status !== "active") {
    return redirectWithDropoutError(enrollmentId, playerId, "not_active");
  }

  const { error } = await supabase
    .from("enrollments")
    .update({
      status: "ended",
      end_date: parsed.endDate,
      dropout_reason: parsed.dropoutReason,
      dropout_notes: parsed.dropoutNotes,
      updated_at: new Date().toISOString(),
    })
    .eq("id", enrollmentId);

  if (error) return redirectWithDropoutError(enrollmentId, playerId, "update_failed");

  await clearPendingFollowUpForEnrollment(supabase, enrollmentId);

  await writeAuditLog(supabase, {
    actorUserId: user.id,
    actorEmail: user.email ?? null,
    action: "enrollment.ended",
    tableName: "enrollments",
    recordId: enrollmentId,
    afterData: {
      status: "ended",
      end_date: parsed.endDate,
      dropout_reason: parsed.dropoutReason,
      dropout_notes: parsed.dropoutNotes,
    },
  });

  revalidatePath(`/players/${playerId}`);
  revalidatePath("/players");
  revalidatePath("/pending");
  revalidatePath("/llamadas");
  revalidatePath("/pending/bajas");
  redirect(`/players/${playerId}?ok=dropped`);
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

  revalidatePath("/llamadas");
  return { ok: true };
}
