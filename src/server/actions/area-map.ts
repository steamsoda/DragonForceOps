"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type AreaMapEntry = {
  id: string;
  entryDate: string;
  typeCode: string;
  topic: string;
  description: string;
  rootCause: string | null;
  correctiveAction: string | null;
  correctionAction: string | null;
  assignedTo: string | null;
  deadlineDays: number | null;
  closureDate: string | null;
  effectiveness: string | null;
  campusId: string | null;
};

export const AREA_MAP_TYPE_CODES: { code: string; label: string }[] = [
  { code: "C",   label: "C — Constatación" },
  { code: "SM",  label: "SM — Sugerencia de Mejoría" },
  { code: "R",   label: "R — Reclamación" },
  { code: "NC",  label: "NC — No Conforme" },
  { code: "PNC", label: "PNC — Posible No Conforme" },
  { code: "AS",  label: "AS — Auditoría" },
  { code: "OM",  label: "OM — Orden de Mejora" },
  { code: "M",   label: "M — Mantenimiento" }
];

export const AREA_MAP_TOPICS = [
  "Instalaciones",
  "Entrenadores",
  "Organización de la escuela",
  "Padres de familia y alumnos",
  "Torneos y equipos de competencia",
  "Kit alumnos",
  "Kit entrenadores",
  "Material Deportivo",
  "Decoración y publicidad",
  "Nutrición",
  "Psicología",
  "Fisioterapia",
  "Secretaria",
  "Auditoría Externa",
  "Auditoría Interna",
  "Hardware",
  "Software"
];

export const EFFECTIVENESS_LABELS: Record<string, string> = {
  E:  "Eficaz",
  NE: "No Eficaz",
  SP: "Sin efecto"
};

export async function listAreaMapEntriesAction(month: string): Promise<{
  monthEntries: AreaMapEntry[];
  openPrior: AreaMapEntry[];
}> {
  const supabase = await createClient();
  const firstDay = `${month}-01`;
  const [year, mon] = month.split("-").map(Number);
  const lastDay = new Date(year, mon, 0).toISOString().slice(0, 10);

  const [monthRes, openRes] = await Promise.all([
    // Entries logged in this month
    supabase
      .from("area_map_entries")
      .select("*")
      .gte("entry_date", firstDay)
      .lte("entry_date", lastDay)
      .order("entry_date", { ascending: true }),

    // Open entries from prior months (still unresolved)
    supabase
      .from("area_map_entries")
      .select("*")
      .lt("entry_date", firstDay)
      .is("closure_date", null)
      .order("entry_date", { ascending: true })
  ]);

  function toEntry(r: Record<string, unknown>): AreaMapEntry {
    return {
      id: r.id as string,
      entryDate: r.entry_date as string,
      typeCode: r.type_code as string,
      topic: r.topic as string,
      description: r.description as string,
      rootCause: r.root_cause as string | null,
      correctiveAction: r.corrective_action as string | null,
      correctionAction: r.correction_action as string | null,
      assignedTo: r.assigned_to as string | null,
      deadlineDays: r.deadline_days as number | null,
      closureDate: r.closure_date as string | null,
      effectiveness: r.effectiveness as string | null,
      campusId: r.campus_id as string | null
    };
  }

  return {
    monthEntries: (monthRes.data ?? []).map(toEntry),
    openPrior: (openRes.data ?? []).map(toEntry)
  };
}

export async function createAreaMapEntryAction(
  formData: FormData
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return { ok: false, error: "unauthenticated" };

  const entryDate  = formData.get("entry_date") as string;
  const typeCode   = (formData.get("type_code") as string)?.trim();
  const topic      = (formData.get("topic") as string)?.trim();
  const description = (formData.get("description") as string)?.trim();

  if (!entryDate || !typeCode || !topic || !description)
    return { ok: false, error: "missing_required" };

  const deadlineRaw = formData.get("deadline_days") as string;
  const campusId    = (formData.get("campus_id") as string) || null;

  const { error } = await supabase.from("area_map_entries").insert({
    entry_date:         entryDate,
    type_code:          typeCode,
    topic,
    description,
    root_cause:         (formData.get("root_cause") as string)?.trim() || null,
    corrective_action:  (formData.get("corrective_action") as string)?.trim() || null,
    correction_action:  (formData.get("correction_action") as string)?.trim() || null,
    assigned_to:        (formData.get("assigned_to") as string)?.trim() || null,
    deadline_days:      deadlineRaw ? parseInt(deadlineRaw, 10) : null,
    campus_id:          campusId,
    created_by:         user.id
  });

  if (error) return { ok: false, error: "insert_failed" };
  revalidatePath("/reports/porto-mensual");
  return { ok: true };
}

export async function closeAreaMapEntryAction(
  entryId: string,
  effectiveness: string,
  closureDate: string
): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("area_map_entries")
    .update({
      closure_date:  closureDate,
      effectiveness,
      updated_at:    new Date().toISOString()
    })
    .eq("id", entryId);

  revalidatePath("/reports/porto-mensual");
  return { ok: !error };
}

export async function deleteAreaMapEntryAction(entryId: string): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const { error } = await supabase.from("area_map_entries").delete().eq("id", entryId);
  revalidatePath("/reports/porto-mensual");
  return { ok: !error };
}
