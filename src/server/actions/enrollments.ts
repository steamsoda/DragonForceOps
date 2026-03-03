"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { parseEnrollmentFormData } from "@/lib/validations/enrollment";

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
    supabase.from("players").select("id").eq("id", playerId).maybeSingle(),
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

  revalidatePath(`/players/${playerId}`);
  redirect(`/enrollments/${enrollmentId}/charges`);
}
