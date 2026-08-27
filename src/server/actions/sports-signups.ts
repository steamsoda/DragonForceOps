"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { writeAuditLog } from "@/lib/audit";
import { assertDebugWritesAllowed } from "@/lib/auth/debug-view";
import { requireSuperAdminContext } from "@/lib/auth/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import { backfillCompetitionSignupsForTournament } from "@/server/tournament-signup-backfill";

const ALL_CAMPUSES_VALUE = "__all__";

function normalizeDateInput(raw: FormDataEntryValue | null) {
  const value = String(raw ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function normalizeTextInput(raw: FormDataEntryValue | null) {
  return String(raw ?? "").trim();
}

function normalizeRedirectTarget(raw: FormDataEntryValue | null) {
  const value = String(raw ?? "").trim();
  if (value.startsWith("/sports-signups")) return value;
  if (/^\/products\/[0-9a-f-]+(?:\?.*)?$/i.test(value)) return value;
  return "/sports-signups";
}

async function validateCompetitionProduct(admin: ReturnType<typeof createAdminClient>, productId: string) {
  const { data } = await admin
    .from("products")
    .select("id, name, is_active, charge_types(code)")
    .eq("id", productId)
    .maybeSingle<{ id: string; name: string; is_active: boolean; charge_types: { code: string | null } | null } | null>();

  if (!data?.is_active) return null;
  const code = data.charge_types?.code;
  return code === "tournament" || code === "cup" || code === "league" ? data : null;
}

export async function saveSportsSignupTournamentSettingsAction(formData: FormData) {
  const returnTo = normalizeRedirectTarget(formData.get("returnTo"));
  await assertDebugWritesAllowed(returnTo);

  const context = await requireSuperAdminContext("/unauthorized");
  const admin = createAdminClient();
  const campusIds = context.campusAccess?.campusIds ?? [];
  const campusId = normalizeTextInput(formData.get("campusId"));
  const productId = normalizeTextInput(formData.get("productId"));
  const name = normalizeTextInput(formData.get("name"));
  const startDate = normalizeDateInput(formData.get("startDate"));
  const endDate = normalizeDateInput(formData.get("endDate"));
  const signupDeadline = normalizeDateInput(formData.get("signupDeadline"));
  const cajaAvailableUntil = normalizeDateInput(formData.get("cajaAvailableUntil"));

  const targetCampusIds = campusId === ALL_CAMPUSES_VALUE ? campusIds : [campusId];

  if (targetCampusIds.length === 0 || !productId || targetCampusIds.some((id) => !campusIds.includes(id))) {
    redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}err=invalid_tournament_settings`);
  }

  if (startDate && endDate && endDate < startDate) {
    redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}err=invalid_tournament_dates`);
  }

  if (signupDeadline && cajaAvailableUntil && cajaAvailableUntil < signupDeadline) {
    redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}err=caja_before_signup_deadline`);
  }

  const product = await validateCompetitionProduct(admin, productId);
  if (!product) {
    redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}err=invalid_tournament_product`);
  }

  const [{ data: beforeTournaments }, { data: beforePricingRules }] = await Promise.all([
    admin
      .from("tournaments")
      .select("id, campus_id, start_date, end_date, signup_deadline")
      .eq("product_id", productId)
      .eq("is_active", true)
      .in("campus_id", targetCampusIds),
    admin
      .from("product_pricing_rules")
      .select("id, campus_id, starts_on, ends_on, amount, priority")
      .eq("product_id", productId),
  ]);

  const { data: saveResult, error: saveError } = await admin.rpc("save_sports_signup_tournament_settings", {
    p_actor_user_id: context.user.id,
    p_product_id: productId,
    p_campus_ids: targetCampusIds,
    p_all_campuses: campusId === ALL_CAMPUSES_VALUE,
    p_name: name || product.name,
    p_start_date: startDate,
    p_end_date: endDate,
    p_signup_deadline: signupDeadline,
    p_caja_available_until: cajaAvailableUntil,
  });

  if (saveError) {
    const message = saveError.message.toLowerCase();
    const errorCode = message.includes("caja_availability_required")
      ? "caja_availability_required"
      : message.includes("caja_before_signup_deadline")
        ? "caja_before_signup_deadline"
        : message.includes("caja_before_final_pricing_tier")
          ? "caja_before_final_pricing_tier"
          : message.includes("global_pricing_requires_all_campuses")
            ? "global_pricing_requires_all_campuses"
            : message.includes("pricing_rules_missing_for_campus")
              ? "pricing_rules_missing_for_campus"
              : "tournament_settings_failed";
    redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}err=${errorCode}`);
  }

  const normalizedSaveResult = saveResult && typeof saveResult === "object"
    ? saveResult as {
        tournament_ids?: unknown;
        pricing_rule_count?: unknown;
        pricing_rules_updated?: unknown;
        caja_available_until?: unknown;
      }
    : {};
  const savedTournamentIds = Array.isArray(normalizedSaveResult.tournament_ids)
    ? normalizedSaveResult.tournament_ids.filter((value): value is string => typeof value === "string")
    : [];

  await writeAuditLog(admin, {
    actorUserId: context.user.id,
    actorEmail: context.user.email ?? null,
    action: "sports_signups.tournament_and_caja_settings_updated",
    tableName: "products",
    recordId: productId,
    beforeData: {
      tournaments: beforeTournaments ?? [],
      pricing_rules: beforePricingRules ?? [],
    },
    afterData: {
      campus_ids: targetCampusIds,
      start_date: startDate,
      end_date: endDate,
      signup_deadline: signupDeadline,
      caja_available_until: cajaAvailableUntil,
      pricing_rule_count: normalizedSaveResult.pricing_rule_count ?? null,
      pricing_rules_updated: normalizedSaveResult.pricing_rules_updated ?? null,
      tournament_ids: savedTournamentIds,
    },
  });

  try {
    for (const tournamentId of savedTournamentIds) {
      await backfillCompetitionSignupsForTournament(admin, tournamentId);
    }
  } catch (error) {
    console.error("sports signup tournament backfill failed", error);
    redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}err=tournament_signup_backfill_failed`);
  }

  revalidatePath("/sports-signups");
  revalidatePath("/tournaments");
  revalidatePath(`/products/${productId}`);
  redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}ok=tournament_settings_saved`);
}

export async function archiveSportsSignupTournamentAction(formData: FormData) {
  const returnTo = normalizeRedirectTarget(formData.get("returnTo"));
  await assertDebugWritesAllowed(returnTo);

  const context = await requireSuperAdminContext("/unauthorized");
  const admin = createAdminClient();
  const campusIds = context.campusAccess?.campusIds ?? [];
  const tournamentId = normalizeTextInput(formData.get("tournamentId"));

  const existing = await admin
    .from("tournaments")
    .select("id, campus_id")
    .eq("id", tournamentId)
    .maybeSingle<{ id: string; campus_id: string | null } | null>();

  if (!existing.data?.campus_id || !campusIds.includes(existing.data.campus_id)) {
    redirect("/unauthorized");
  }

  const { data: lifecycleResult, error } = await admin.rpc("finalize_sports_signup_tournament", {
    p_actor_user_id: context.user.id,
    p_tournament_id: tournamentId,
  });

  if (error) redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}err=tournament_archive_failed`);

  await writeAuditLog(admin, {
    actorUserId: context.user.id,
    actorEmail: context.user.email ?? null,
    action: "sports_signups.tournament_archived",
    tableName: "tournaments",
    recordId: tournamentId,
    afterData: {
      is_active: false,
      lifecycle: lifecycleResult,
      preserved_history: true,
    },
  });

  revalidatePath("/sports-signups");
  revalidatePath("/tournaments");
  revalidatePath("/convocatorias");
  redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}ok=tournament_archived`);
}
