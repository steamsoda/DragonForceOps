"use server";

import { redirect } from "next/navigation";
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

  redirect(`/players/${player.id}`);
}
