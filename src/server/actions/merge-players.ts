"use server";

import { redirect } from "next/navigation";
import { requireDirectorContext } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";

export async function mergePlayersAction(formData: FormData): Promise<void> {
  const masterId    = formData.get("masterId")?.toString().trim();
  const duplicateId = formData.get("duplicateId")?.toString().trim();
  const reason      = formData.get("reason")?.toString().trim() || "Fusión de jugadores duplicados";

  if (!masterId || !duplicateId) redirect("/admin/merge-players?err=missing_ids");

  const supabase = await createClient();
  const { user } = await requireDirectorContext("/admin/merge-players?err=unauthorized");

  const { error } = await supabase.rpc("merge_players", {
    p_master_id:    masterId,
    p_duplicate_id: duplicateId,
    p_actor_id:     user.id,
    p_reason:       reason,
  });

  if (error) {
    const code = error.message.includes("both_have_active_enrollment")
      ? "both_active"
      : error.message.includes("master_and_duplicate_same")
      ? "same_player"
      : "merge_failed";
    redirect(`/admin/merge-players?masterId=${masterId}&duplicateId=${duplicateId}&err=${code}`);
  }

  redirect(`/players/${masterId}?ok=merged`);
}
