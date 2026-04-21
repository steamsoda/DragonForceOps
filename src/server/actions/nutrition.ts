"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { canAccessNutritionCampus } from "@/lib/auth/campuses";
import { canAccessNutritionPlayerRecord, requireNutritionContext } from "@/lib/auth/permissions";
import { parseDateOnlyInput } from "@/lib/time";

function normalizeReturnTo(value: string | null | undefined, playerId: string) {
  const fallback = `/nutrition/players/${playerId}`;
  const raw = value?.trim() ?? "";
  if (!raw.startsWith("/nutrition")) return fallback;
  return raw;
}

function redirectWithError(playerId: string, returnTo: string, code: string): never {
  const params = new URLSearchParams({ err: code });
  redirect(`${returnTo}?${params.toString()}`);
}

export async function recordPlayerMeasurementAction(formData: FormData) {
  const playerId = formData.get("player_id")?.toString().trim() ?? "";
  const enrollmentId = formData.get("enrollment_id")?.toString().trim() ?? "";
  const returnTo = normalizeReturnTo(formData.get("return_to")?.toString(), playerId);
  const measurementDate = parseDateOnlyInput(formData.get("measurement_date")?.toString());
  const weightKg = Number(formData.get("weight_kg")?.toString().trim() ?? "");
  const heightCm = Number(formData.get("height_cm")?.toString().trim() ?? "");
  const notes = formData.get("notes")?.toString().trim() || null;

  if (!playerId || !enrollmentId || !measurementDate || !Number.isFinite(weightKg) || !Number.isFinite(heightCm) || weightKg <= 0 || heightCm <= 0) {
    redirectWithError(playerId || "missing", returnTo, "invalid_form");
  }

  const context = await requireNutritionContext("/unauthorized");
  if (!context.isNutritionist && !context.isSuperAdmin) {
    redirectWithError(playerId, returnTo, "unauthorized");
  }

  if (!(await canAccessNutritionPlayerRecord(playerId, context))) {
    redirectWithError(playerId, returnTo, "unauthorized");
  }

  const { data: enrollment } = await context.supabase
    .from("enrollments")
    .select("id, player_id, campus_id, status")
    .eq("id", enrollmentId)
    .eq("player_id", playerId)
    .maybeSingle<{ id: string; player_id: string; campus_id: string; status: string } | null>();

  if (!enrollment || enrollment.status !== "active" || !canAccessNutritionCampus(context.nutritionCampusAccess, enrollment.campus_id)) {
    redirectWithError(playerId, returnTo, "invalid_enrollment");
  }

  const { count } = await context.supabase
    .from("player_measurement_sessions")
    .select("id", { count: "exact", head: true })
    .eq("enrollment_id", enrollmentId);

  const measuredAt = new Date(`${measurementDate}T12:00:00.000Z`).toISOString();
  const source = (count ?? 0) > 0 ? "follow_up" : "initial_intake";

  const { error } = await context.supabase
    .from("player_measurement_sessions")
    .insert({
      player_id: playerId,
      enrollment_id: enrollmentId,
      campus_id: enrollment.campus_id,
      measured_at: measuredAt,
      recorded_by_user_id: context.user.id,
      source,
      weight_kg: weightKg,
      height_cm: heightCm,
      notes,
      updated_at: new Date().toISOString(),
    });

  if (error) {
    redirectWithError(playerId, returnTo, "save_failed");
  }

  revalidatePath("/nutrition");
  revalidatePath("/nutrition/measurements");
  revalidatePath(`/nutrition/players/${playerId}`);
  redirect(`${returnTo}?ok=saved`);
}
