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
  return value.startsWith("/sports-signups") ? value : "/sports-signups";
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

  const targetCampusIds = campusId === ALL_CAMPUSES_VALUE ? campusIds : [campusId];

  if (targetCampusIds.length === 0 || !productId || targetCampusIds.some((id) => !campusIds.includes(id))) {
    redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}err=invalid_tournament_settings`);
  }

  if (startDate && endDate && endDate < startDate) {
    redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}err=invalid_tournament_dates`);
  }

  const product = await validateCompetitionProduct(admin, productId);
  if (!product) {
    redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}err=invalid_tournament_product`);
  }

  const savedTournamentIds: string[] = [];
  for (const targetCampusId of targetCampusIds) {
    const existing = await admin
      .from("tournaments")
      .select("id")
      .eq("campus_id", targetCampusId)
      .eq("product_id", productId)
      .eq("is_active", true)
      .maybeSingle<{ id: string } | null>();

    const payload = {
      name: name || product.name,
      campus_id: targetCampusId,
      product_id: productId,
      gender: "mixed",
      start_date: startDate,
      end_date: endDate,
      signup_deadline: signupDeadline,
      is_active: true,
      is_mandatory: false,
      updated_at: new Date().toISOString(),
    };

    const result = existing.data?.id
      ? await admin.from("tournaments").update(payload).eq("id", existing.data.id).select("id").single<{ id: string }>()
      : await admin
          .from("tournaments")
          .insert({ ...payload, created_by: context.user.id })
          .select("id")
          .single<{ id: string }>();

    if (result.error || !result.data) {
      redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}err=tournament_settings_failed`);
    }
    savedTournamentIds.push(result.data.id);

    await writeAuditLog(admin, {
      actorUserId: context.user.id,
      actorEmail: context.user.email ?? null,
      action: existing.data?.id ? "sports_signups.tournament_settings_updated" : "sports_signups.tournament_settings_created",
      tableName: "tournaments",
      recordId: result.data.id,
      afterData: payload,
    });
  }

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

  const { error } = await admin
    .from("tournaments")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("id", tournamentId);

  if (error) redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}err=tournament_archive_failed`);

  await writeAuditLog(admin, {
    actorUserId: context.user.id,
    actorEmail: context.user.email ?? null,
    action: "sports_signups.tournament_archived",
    tableName: "tournaments",
    recordId: tournamentId,
    afterData: { is_active: false },
  });

  revalidatePath("/sports-signups");
  revalidatePath("/tournaments");
  redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}ok=tournament_archived`);
}
