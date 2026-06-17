"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { writeAuditLog } from "@/lib/audit";
import { assertDebugWritesAllowed } from "@/lib/auth/debug-view";
import { canAccessGuardianRecord, canAccessPlayerRecord, getPermissionContext } from "@/lib/auth/permissions";

function textValue(formData: FormData, key: string) {
  return formData.get(key)?.toString().trim() ?? "";
}

function nullableText(formData: FormData, key: string) {
  const value = textValue(formData, key);
  return value || null;
}

function safeReturnTo(value: string) {
  return value.startsWith("/datos-faltantes") ? value : "/datos-faltantes";
}

export async function saveContactCleanupGuardianAction(formData: FormData): Promise<void> {
  const returnTo = safeReturnTo(textValue(formData, "returnTo"));
  await assertDebugWritesAllowed(returnTo);

  const playerId = textValue(formData, "playerId");
  const guardianId = textValue(formData, "guardianId");
  const firstName = nullableText(formData, "firstName");
  const lastName = nullableText(formData, "lastName");
  const phonePrimary = nullableText(formData, "phonePrimary");
  const phoneSecondary = nullableText(formData, "phoneSecondary");
  const email = nullableText(formData, "email");
  const relationshipLabel = nullableText(formData, "relationshipLabel");

  if (!playerId) redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}err=missing_player`);
  if (!firstName && !lastName && !phonePrimary && !phoneSecondary && !email && !relationshipLabel) {
    redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}err=empty_contact`);
  }

  const context = await getPermissionContext();
  if (!context?.hasPlayerDataAccess) redirect("/unauthorized");

  const { supabase, user } = context;
  const canAccessPlayer = await canAccessPlayerRecord(playerId, context);
  if (!canAccessPlayer) redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}err=unauthorized`);

  if (guardianId) {
    const canAccessGuardian = await canAccessGuardianRecord(playerId, guardianId, context);
    if (!canAccessGuardian) redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}err=unauthorized`);

    const { data: current } = await supabase
      .from("guardians")
      .select("first_name, last_name, phone_primary, phone_secondary, email, relationship_label")
      .eq("id", guardianId)
      .maybeSingle<{
        first_name: string | null;
        last_name: string | null;
        phone_primary: string | null;
        phone_secondary: string | null;
        email: string | null;
        relationship_label: string | null;
      }>();

    const { error } = await supabase
      .from("guardians")
      .update({
        first_name: firstName,
        last_name: lastName,
        phone_primary: phonePrimary,
        phone_secondary: phoneSecondary,
        email,
        relationship_label: relationshipLabel,
      })
      .eq("id", guardianId);

    if (error) redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}err=update_failed`);

    await writeAuditLog(supabase, {
      actorUserId: user.id,
      actorEmail: user.email,
      action: "contact_cleanup.guardian_updated",
      tableName: "guardians",
      recordId: guardianId,
      beforeData: current ?? null,
      afterData: {
        first_name: firstName,
        last_name: lastName,
        phone_primary: phonePrimary,
        phone_secondary: phoneSecondary,
        email,
        relationship_label: relationshipLabel,
        player_id: playerId,
      },
    });
  } else {
    const { data: guardian, error: guardianError } = await supabase
      .from("guardians")
      .insert({
        first_name: firstName,
        last_name: lastName,
        phone_primary: phonePrimary,
        phone_secondary: phoneSecondary,
        email,
        relationship_label: relationshipLabel,
      })
      .select("id")
      .maybeSingle<{ id: string } | null>();

    if (guardianError || !guardian) redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}err=create_failed`);

    const { error: linkError } = await supabase.from("player_guardians").insert({
      player_id: playerId,
      guardian_id: guardian.id,
      is_primary: true,
    });

    if (linkError) redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}err=link_failed`);

    await writeAuditLog(supabase, {
      actorUserId: user.id,
      actorEmail: user.email,
      action: "contact_cleanup.guardian_created",
      tableName: "guardians",
      recordId: guardian.id,
      beforeData: null,
      afterData: {
        first_name: firstName,
        last_name: lastName,
        phone_primary: phonePrimary,
        phone_secondary: phoneSecondary,
        email,
        relationship_label: relationshipLabel,
        player_id: playerId,
      },
    });
  }

  revalidatePath("/datos-faltantes");
  revalidatePath(`/players/${playerId}`);
  redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}ok=contact_saved`);
}
