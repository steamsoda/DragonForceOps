"use server";

import { revalidatePath } from "next/cache";
import { requireDirectorContext } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";

export async function updateTagSettingsAction(formData: FormData): Promise<void> {
  const { supabase, user } = await requireDirectorContext("/unauthorized");

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

export async function updatePrinterSettingsAction(formData: FormData): Promise<void> {
  const { supabase, user } = await requireDirectorContext("/unauthorized");

  const printerName = formData.get("printer_name")?.toString().trim() || "EPSON TM-T20IV";

  await supabase.from("app_settings").upsert(
    { key: "printer_name", value: printerName, label: "Nombre de impresora", updated_by: user.id, updated_at: new Date().toISOString() },
    { onConflict: "key" }
  );

  revalidatePath("/admin/configuracion");
}

const TAG_LABELS: Record<string, string> = {
  tag_payment:    "Tag: Al corriente / Pendiente",
  tag_team_type:  "Tag: Selectivo / Clases",
  tag_goalkeeper: "Tag: Portero",
  tag_uniform:    "Tag: Estado de uniforme",
};
