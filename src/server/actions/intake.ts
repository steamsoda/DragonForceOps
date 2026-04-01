"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getReturningInscriptionOption } from "@/lib/enrollments/returning";
import { formatPeriodMonthLabel, getEnrollmentPricingQuote } from "@/lib/pricing/plans";
import { parseEnrollmentFormData } from "@/lib/validations/enrollment";
import { parsePlayerFormData } from "@/lib/validations/player";
import { writeAuditLog } from "@/lib/audit";
import { findB2TeamForAutoAssign } from "@/lib/queries/teams";

type ChargeTypeRow = { id: string; code: string };

type IntakeMatchPlayerRow = {
  id: string;
  first_name: string;
  last_name: string;
  birth_date: string;
  status: string;
};

type IntakeMatchEnrollmentRow = {
  player_id: string;
  status: string;
  start_date: string;
  end_date: string | null;
  campuses: { name: string | null } | null;
};

export type IntakeMatch = {
  playerId: string;
  fullName: string;
  birthDate: string;
  status: string;
  hasActiveEnrollment: boolean;
  campusLabel: string | null;
  lastEnrollmentDate: string | null;
};

function redirectWithError(
  code: string,
  options?: { isReturning?: boolean; returnMode?: string | null }
): never {
  const params = new URLSearchParams({ err: code });
  if (options?.isReturning) params.set("returning", "1");
  if (options?.isReturning && options.returnMode) params.set("returnMode", options.returnMode);
  redirect(`/players/new?${params.toString()}`);
}

async function rollbackIntake(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ids: {
    teamAssignmentId?: string | null;
    enrollmentId?: string | null;
    playerGuardianId?: string | null;
    playerId?: string | null;
    guardianId?: string | null;
  }
) {
  if (ids.teamAssignmentId) {
    await supabase.from("team_assignments").delete().eq("id", ids.teamAssignmentId);
  }
  if (ids.enrollmentId) {
    await supabase.from("charges").delete().eq("enrollment_id", ids.enrollmentId);
    await supabase.from("enrollments").delete().eq("id", ids.enrollmentId);
  }
  if (ids.playerGuardianId) {
    await supabase.from("player_guardians").delete().eq("id", ids.playerGuardianId);
  }
  if (ids.playerId) {
    await supabase.from("players").delete().eq("id", ids.playerId);
  }
  if (ids.guardianId) {
    await supabase.from("guardians").delete().eq("id", ids.guardianId);
  }
}

export async function searchLikelyPlayersForIntakeAction(input: {
  firstName: string;
  lastName: string;
  birthDate: string | null;
}): Promise<IntakeMatch[]> {
  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  const birthDate = input.birthDate?.trim() ?? "";

  if (firstName.length < 2 || lastName.length < 2 || !birthDate) return [];

  const year = birthDate.slice(0, 4);
  if (!/^\d{4}$/.test(year)) return [];

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const fullNameNeedle = `${firstName} ${lastName}`.toLowerCase().replace(/\s+/g, " ").trim();

  const { data: players } = await supabase
    .from("players")
    .select("id, first_name, last_name, birth_date, status")
    .gte("birth_date", `${year}-01-01`)
    .lte("birth_date", `${year}-12-31`)
    .or(`first_name.ilike.%${firstName}%,last_name.ilike.%${lastName}%`)
    .order("first_name", { ascending: true })
    .order("last_name", { ascending: true })
    .limit(12)
    .returns<IntakeMatchPlayerRow[]>();

  const filteredPlayers = (players ?? []).filter((player) => {
    const haystack = `${player.first_name} ${player.last_name}`.toLowerCase().replace(/\s+/g, " ").trim();
    return haystack.includes(firstName.toLowerCase()) || haystack.includes(lastName.toLowerCase()) || haystack === fullNameNeedle;
  });

  if (filteredPlayers.length === 0) return [];

  const playerIds = filteredPlayers.map((player) => player.id);
  const { data: enrollments } = await supabase
    .from("enrollments")
    .select("player_id, status, start_date, end_date, campuses(name)")
    .in("player_id", playerIds)
    .order("start_date", { ascending: false })
    .returns<IntakeMatchEnrollmentRow[]>();

  const enrollmentsByPlayer = new Map<string, IntakeMatchEnrollmentRow[]>();
  for (const enrollment of enrollments ?? []) {
    const current = enrollmentsByPlayer.get(enrollment.player_id) ?? [];
    current.push(enrollment);
    enrollmentsByPlayer.set(enrollment.player_id, current);
  }

  return filteredPlayers.map((player) => {
    const playerEnrollments = enrollmentsByPlayer.get(player.id) ?? [];
    const activeEnrollment = playerEnrollments.find((enrollment) => enrollment.status === "active");
    const latestEnrollment = playerEnrollments[0] ?? null;

    return {
      playerId: player.id,
      fullName: `${player.first_name} ${player.last_name}`.trim(),
      birthDate: player.birth_date,
      status: player.status,
      hasActiveEnrollment: !!activeEnrollment,
      campusLabel: activeEnrollment?.campuses?.name ?? latestEnrollment?.campuses?.name ?? null,
      lastEnrollmentDate: activeEnrollment?.start_date ?? latestEnrollment?.start_date ?? null,
    };
  });
}

export async function createEnrollmentIntakeAction(formData: FormData) {
  const isReturning = String(formData.get("isReturning") ?? "") === "1";
  const returnMode = String(formData.get("returnInscriptionMode") ?? "").trim() || null;

  const player = parsePlayerFormData(formData);
  const enrollment = parseEnrollmentFormData(formData);
  if (!player || !enrollment) {
    return redirectWithError("invalid_form", { isReturning, returnMode });
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return redirectWithError("unauthenticated", {
      isReturning: enrollment.isReturning,
      returnMode: enrollment.returnInscriptionMode,
    });
  }

  const [pricingQuote, chargeTypesResult] = await Promise.all([
    getEnrollmentPricingQuote(supabase, {
      planCode: enrollment.pricingPlanCode,
      startDate: enrollment.startDate,
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
    return redirectWithError("config_error", {
      isReturning: enrollment.isReturning,
      returnMode: enrollment.returnInscriptionMode,
    });
  }

  const createdIds: {
    teamAssignmentId?: string | null;
    enrollmentId?: string | null;
    playerGuardianId?: string | null;
    playerId?: string | null;
    guardianId?: string | null;
  } = {};

  const returnOption =
    enrollment.isReturning && enrollment.returnInscriptionMode
      ? getReturningInscriptionOption(enrollment.returnInscriptionMode)
      : null;
  const inscriptionAmount = returnOption?.amount ?? pricingQuote.inscriptionAmount;
  const inscriptionDescription = returnOption?.chargeDescription ?? "Inscripcion";

  const { data: guardian, error: guardianError } = await supabase
    .from("guardians")
    .insert({
      first_name: player.guardianFirstName,
      last_name: player.guardianLastName,
      phone_primary: player.guardianPhone,
      phone_secondary: player.guardianPhoneSecondary,
      email: player.guardianEmail,
      relationship_label: player.guardianRelationship,
    })
    .select("id")
    .maybeSingle()
    .returns<{ id: string } | null>();

  if (guardianError || !guardian) {
    return redirectWithError("guardian_failed", { isReturning: player.isReturning });
  }
  createdIds.guardianId = guardian.id;

  const { data: createdPlayer, error: playerError } = await supabase
    .from("players")
    .insert({
      first_name: player.firstName,
      last_name: player.lastName,
      birth_date: player.birthDate,
      gender: player.gender,
      medical_notes: player.medicalNotes,
      status: "active",
    })
    .select("id")
    .maybeSingle()
    .returns<{ id: string } | null>();

  if (playerError || !createdPlayer) {
    await rollbackIntake(supabase, createdIds);
    return redirectWithError("player_failed", { isReturning: player.isReturning });
  }
  createdIds.playerId = createdPlayer.id;

  const { data: link, error: linkError } = await supabase
    .from("player_guardians")
    .insert({
      player_id: createdPlayer.id,
      guardian_id: guardian.id,
      is_primary: true,
    })
    .select("id")
    .maybeSingle()
    .returns<{ id: string } | null>();

  if (linkError || !link) {
    await rollbackIntake(supabase, createdIds);
    return redirectWithError("link_failed", { isReturning: player.isReturning });
  }
  createdIds.playerGuardianId = link.id;

  const { data: createdEnrollment, error: enrollmentError } = await supabase
    .from("enrollments")
    .insert({
      player_id: createdPlayer.id,
      campus_id: enrollment.campusId,
      pricing_plan_id: pricingQuote.plan.id,
      status: "active",
      start_date: enrollment.startDate,
      inscription_date: enrollment.startDate,
      is_returning: enrollment.isReturning,
      return_inscription_mode: enrollment.isReturning ? enrollment.returnInscriptionMode : null,
      notes: enrollment.notes ?? null,
    })
    .select("id, pricing_plans(currency)")
    .maybeSingle()
    .returns<{ id: string; pricing_plans: { currency: string } | null } | null>();

  if (enrollmentError || !createdEnrollment) {
    await rollbackIntake(supabase, createdIds);
    return redirectWithError("enrollment_failed", {
      isReturning: enrollment.isReturning,
      returnMode: enrollment.returnInscriptionMode,
    });
  }
  createdIds.enrollmentId = createdEnrollment.id;

  const currency = createdEnrollment.pricing_plans?.currency ?? pricingQuote.plan.currency ?? "MXN";
  const tuitionDescription = `Mensualidad ${formatPeriodMonthLabel(pricingQuote.tuitionPeriodMonth)}`;

  const { error: chargesError } = await supabase.from("charges").insert([
    {
      enrollment_id: createdEnrollment.id,
      charge_type_id: inscriptionTypeId,
      description: inscriptionDescription,
      amount: inscriptionAmount,
      currency,
      status: "pending",
      created_by: user.id,
    },
    {
      enrollment_id: createdEnrollment.id,
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
    await rollbackIntake(supabase, createdIds);
    return redirectWithError("charges_failed", {
      isReturning: enrollment.isReturning,
      returnMode: enrollment.returnInscriptionMode,
    });
  }

  const birthYear = Number(player.birthDate.slice(0, 4));
  const b2Team = await findB2TeamForAutoAssign(enrollment.campusId, birthYear, player.gender ?? null);
  if (b2Team) {
    const today = new Date().toISOString().split("T")[0];
    const { data: teamAssignment, error: teamAssignmentError } = await supabase
      .from("team_assignments")
      .insert({
        enrollment_id: createdEnrollment.id,
        team_id: b2Team.id,
        start_date: today,
        is_primary: true,
        role: "regular",
        is_new_arrival: true,
      })
      .select("id")
      .maybeSingle()
      .returns<{ id: string } | null>();

    if (teamAssignmentError) {
      await rollbackIntake(supabase, createdIds);
      return redirectWithError("enrollment_failed", {
        isReturning: enrollment.isReturning,
        returnMode: enrollment.returnInscriptionMode,
      });
    }

    createdIds.teamAssignmentId = teamAssignment?.id ?? null;
    await supabase.from("players").update({ level: "B2" }).eq("id", createdPlayer.id);
  }

  await writeAuditLog(supabase, {
    actorUserId: user.id,
    actorEmail: user.email ?? null,
    action: "enrollment.created",
    tableName: "enrollments",
    recordId: createdEnrollment.id,
    afterData: {
      player_id: createdPlayer.id,
      campus_id: enrollment.campusId,
      start_date: enrollment.startDate,
      is_returning: enrollment.isReturning,
      return_inscription_mode: enrollment.isReturning ? enrollment.returnInscriptionMode : null,
      intake_mode: "single_page",
    },
  });

  revalidatePath("/players");
  revalidatePath(`/players/${createdPlayer.id}`);
  redirect(`/caja?enrollmentId=${createdEnrollment.id}`);
}
