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

function booleanValue(formData: FormData, key: string) {
  return textValue(formData, key) === "true";
}

function safeReturnTo(value: string) {
  return value.startsWith("/datos-faltantes") ? value : "/datos-faltantes";
}

type GuardianContactInput = {
  firstName: string | null;
  lastName: string | null;
  phonePrimary: string | null;
  phoneSecondary: string | null;
  email: string | null;
  relationshipLabel: string | null;
};

function hasContactData(input: GuardianContactInput) {
  return Boolean(
    input.firstName ||
      input.lastName ||
      input.phonePrimary ||
      input.phoneSecondary ||
      input.email ||
      input.relationshipLabel,
  );
}

async function createGuardianLink(params: {
  supabase: NonNullable<Awaited<ReturnType<typeof getPermissionContext>>>["supabase"];
  user: NonNullable<Awaited<ReturnType<typeof getPermissionContext>>>["user"];
  playerId: string;
  input: GuardianContactInput;
  isPrimary: boolean;
}) {
  const { supabase, user, playerId, input, isPrimary } = params;
  const { data: guardian, error: guardianError } = await supabase
    .from("guardians")
    .insert({
      first_name: input.firstName,
      last_name: input.lastName,
      phone_primary: input.phonePrimary,
      phone_secondary: input.phoneSecondary,
      email: input.email,
      relationship_label: input.relationshipLabel,
    })
    .select("id")
    .maybeSingle<{ id: string } | null>();

  if (guardianError || !guardian) return { ok: false as const, error: "create_failed" };

  const { error: linkError } = await supabase.from("player_guardians").insert({
    player_id: playerId,
    guardian_id: guardian.id,
    is_primary: isPrimary,
  });

  if (linkError) return { ok: false as const, error: "link_failed" };

  await writeAuditLog(supabase, {
    actorUserId: user.id,
    actorEmail: user.email,
    action: "contact_cleanup.guardian_created",
    tableName: "guardians",
    recordId: guardian.id,
    beforeData: null,
    afterData: {
      first_name: input.firstName,
      last_name: input.lastName,
      phone_primary: input.phonePrimary,
      phone_secondary: input.phoneSecondary,
      email: input.email,
      relationship_label: input.relationshipLabel,
      player_id: playerId,
      is_primary: isPrimary,
    },
  });

  return { ok: true as const, guardianId: guardian.id };
}

export async function saveContactCleanupGuardianAction(formData: FormData): Promise<void> {
  const returnTo = safeReturnTo(textValue(formData, "returnTo"));
  await assertDebugWritesAllowed(returnTo);

  const playerId = textValue(formData, "playerId");
  const guardianId = textValue(formData, "guardianId");
  const createAsPrimary = booleanValue(formData, "createAsPrimary");
  const primaryInput: GuardianContactInput = {
    firstName: nullableText(formData, "firstName"),
    lastName: nullableText(formData, "lastName"),
    phonePrimary: nullableText(formData, "phonePrimary"),
    phoneSecondary: nullableText(formData, "phoneSecondary"),
    email: nullableText(formData, "email"),
    relationshipLabel: nullableText(formData, "relationshipLabel"),
  };
  const additionalInput: GuardianContactInput = {
    firstName: nullableText(formData, "additionalFirstName"),
    lastName: nullableText(formData, "additionalLastName"),
    phonePrimary: nullableText(formData, "additionalPhonePrimary"),
    phoneSecondary: nullableText(formData, "additionalPhoneSecondary"),
    email: nullableText(formData, "additionalEmail"),
    relationshipLabel: nullableText(formData, "additionalRelationshipLabel"),
  };

  if (!playerId) redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}err=missing_player`);
  if (!hasContactData(primaryInput) && !hasContactData(additionalInput)) {
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
        first_name: primaryInput.firstName,
        last_name: primaryInput.lastName,
        phone_primary: primaryInput.phonePrimary,
        phone_secondary: primaryInput.phoneSecondary,
        email: primaryInput.email,
        relationship_label: primaryInput.relationshipLabel,
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
        first_name: primaryInput.firstName,
        last_name: primaryInput.lastName,
        phone_primary: primaryInput.phonePrimary,
        phone_secondary: primaryInput.phoneSecondary,
        email: primaryInput.email,
        relationship_label: primaryInput.relationshipLabel,
        player_id: playerId,
      },
    });
  } else {
    if (hasContactData(primaryInput)) {
      const result = await createGuardianLink({ supabase, user, playerId, input: primaryInput, isPrimary: createAsPrimary });
      if (!result.ok) redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}err=${result.error}`);
    }

    if (hasContactData(additionalInput)) {
      const result = await createGuardianLink({ supabase, user, playerId, input: additionalInput, isPrimary: false });
      if (!result.ok) redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}err=${result.error}`);
    }
  }

  revalidatePath("/datos-faltantes");
  revalidatePath(`/players/${playerId}`);
  redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}ok=contact_saved`);
}
