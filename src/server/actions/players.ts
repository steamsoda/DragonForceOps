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

  const uniformSize = formData.get("uniformSize")?.toString().trim() || null;
  const medicalNotes = formData.get("medicalNotes")?.toString().trim() || null;
  const gender = formData.get("gender")?.toString().trim() || null;

  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) redirect(`${BASE}?err=unauthenticated`);

  const { error } = await supabase
    .from("players")
    .update({ uniform_size: uniformSize, medical_notes: medicalNotes, gender: gender || null })
    .eq("id", playerId);

  if (error) redirect(`${BASE}/edit?err=update_failed`);

  revalidatePath(BASE);
  redirect(`${BASE}?ok=updated`);
}
