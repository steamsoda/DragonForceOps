"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function updateTagSettingsAction(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const { data: isAdmin } = await supabase.rpc("is_director_admin");
  if (!isAdmin) return;

  const keys = ["tag_payment", "tag_team_type", "tag_goalkeeper", "tag_uniform"];
  const updates = keys.map((key) => ({
    key,
    value: formData.get(key) === "1" ? true : false,
    label: TAG_LABELS[key] ?? key,
    updated_by: user.id,
    updated_at: new Date().toISOString(),
  }));

  const { error } = await supabase
    .from("app_settings")
    .upsert(updates, { onConflict: "key" });

  if (!error) {
    revalidatePath("/admin/configuracion");
    revalidatePath("/players");
  }
}

const TAG_LABELS: Record<string, string> = {
  tag_payment:    "Tag: Al corriente / Pendiente",
  tag_team_type:  "Tag: Selectivo / Clases",
  tag_goalkeeper: "Tag: Portero",
  tag_uniform:    "Tag: Estado de uniforme",
};
