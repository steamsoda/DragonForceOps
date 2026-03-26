"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { parsePlayerFormData } from "@/lib/validations/player";

function redirectWithError(code: string): never {
  redirect(`/players/new?err=${code}`);
}

export async function createPlayerAction(formData: FormData) {
  const parsed = parsePlayerFormData(formData);
  if (!parsed) return redirectWithError("invalid_form");

  const supabase = await createClient();
  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();
  if (userError || !user) return redirectWithError("unauthenticated");

  // Create guardian first
  const { data: guardian, error: guardianError } = await supabase
    .from("guardians")
    .insert({
      first_name: parsed.guardianFirstName,
      last_name: parsed.guardianLastName,
      phone_primary: parsed.guardianPhone,
      phone_secondary: parsed.guardianPhoneSecondary,
      email: parsed.guardianEmail,
      relationship_label: parsed.guardianRelationship
    })
    .select("id")
    .maybeSingle()
    .returns<{ id: string } | null>();

  if (guardianError || !guardian) return redirectWithError("guardian_failed");

  // Create player
  const { data: player, error: playerError } = await supabase
    .from("players")
    .insert({
      first_name: parsed.firstName,
      last_name: parsed.lastName,
      birth_date: parsed.birthDate,
      gender: parsed.gender,
      medical_notes: parsed.medicalNotes,
      status: "active"
    })
    .select("id")
    .maybeSingle()
    .returns<{ id: string } | null>();

  if (playerError || !player) return redirectWithError("player_failed");

  // Link guardian to player as primary contact
  const { error: linkError } = await supabase.from("player_guardians").insert({
    player_id: player.id,
    guardian_id: guardian.id,
    is_primary: true
  });

  if (linkError) return redirectWithError("link_failed");

  redirect(`/players/${player.id}/enrollments/new`);
}

// ── Update player profile ──────────────────────────────────────────────────────

export async function updatePlayerAction(playerId: string, formData: FormData): Promise<void> {
  const BASE = `/players/${playerId}`;

  const firstName = formData.get("firstName")?.toString().trim();
  const lastName = formData.get("lastName")?.toString().trim();
  const birthDate = formData.get("birthDate")?.toString().trim();
  const uniformSize = formData.get("uniformSize")?.toString().trim() || null;
  const medicalNotes = formData.get("medicalNotes")?.toString().trim() || null;
  const gender = formData.get("gender")?.toString().trim() || null;
  const isGoalkeeper = formData.get("isGoalkeeper") === "1";
  const jerseyNumberRaw = formData.get("jerseyNumber")?.toString().trim();
  const jerseyNumber = jerseyNumberRaw ? parseInt(jerseyNumberRaw, 10) : null;

  if (!firstName || !lastName || !birthDate) redirect(`${BASE}/edit?err=missing_fields`);

  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) redirect(`${BASE}?err=unauthenticated`);

  const { data: hasAccess } = await supabase.rpc("has_operational_access");
  if (!hasAccess) redirect(`${BASE}?err=unauthorized`);

  const { error } = await supabase
    .from("players")
    .update({
      first_name: firstName,
      last_name: lastName,
      birth_date: birthDate,
      uniform_size: uniformSize,
      medical_notes: medicalNotes,
      gender: gender || null,
      is_goalkeeper: isGoalkeeper,
      jersey_number: jerseyNumber
    })
    .eq("id", playerId);

  if (error) redirect(`${BASE}/edit?err=update_failed`);

  revalidatePath(BASE);
  redirect(`${BASE}?ok=updated`);
}

// ── Update guardian ────────────────────────────────────────────────────────────

export async function updateGuardianAction(
  playerId: string,
  guardianId: string,
  formData: FormData
): Promise<void> {
  const BASE = `/players/${playerId}`;

  const firstName = formData.get("firstName")?.toString().trim();
  const lastName = formData.get("lastName")?.toString().trim();
  const phonePrimary = formData.get("phonePrimary")?.toString().trim();
  const phoneSecondary = formData.get("phoneSecondary")?.toString().trim() || null;
  const email = formData.get("email")?.toString().trim() || null;
  const relationshipLabel = formData.get("relationshipLabel")?.toString().trim() || null;

  if (!firstName || !lastName || !phonePrimary) {
    redirect(`${BASE}/guardians/${guardianId}/edit?err=missing_fields`);
  }

  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) redirect(`${BASE}?err=unauthenticated`);

  // Verify this guardian belongs to this player
  const { data: link } = await supabase
    .from("player_guardians")
    .select("id")
    .eq("player_id", playerId)
    .eq("guardian_id", guardianId)
    .maybeSingle();

  if (!link) redirect(`${BASE}?err=unauthorized`);

  const { error } = await supabase
    .from("guardians")
    .update({
      first_name: firstName,
      last_name: lastName,
      phone_primary: phonePrimary,
      phone_secondary: phoneSecondary,
      email,
      relationship_label: relationshipLabel
    })
    .eq("id", guardianId);

  if (error) redirect(`${BASE}/guardians/${guardianId}/edit?err=update_failed`);

  revalidatePath(BASE);
  redirect(`${BASE}?ok=guardian_updated`);
}
