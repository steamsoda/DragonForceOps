"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type AcademyEvent = {
  id: string;
  title: string;
  description: string | null;
  proposedDate: string;
  actualDate: string | null;
  isDone: boolean;
  cost: number | null;
  participantCount: number | null;
  evaluation: number | null;
  satisfactionAvg: number | null;
  campusId: string | null;
  notes: string | null;
};

export async function listEventsForMonthAction(month: string): Promise<AcademyEvent[]> {
  const supabase = await createClient();
  const firstDay = `${month}-01`;
  const [year, mon] = month.split("-").map(Number);
  const lastDay = new Date(year, mon, 0).toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from("academy_events")
    .select("*")
    .gte("proposed_date", firstDay)
    .lte("proposed_date", lastDay)
    .order("proposed_date", { ascending: true });

  if (error || !data) return [];

  return data.map((r) => ({
    id: r.id,
    title: r.title,
    description: r.description,
    proposedDate: r.proposed_date,
    actualDate: r.actual_date,
    isDone: r.is_done,
    cost: r.cost,
    participantCount: r.participant_count,
    evaluation: r.evaluation,
    satisfactionAvg: r.satisfaction_avg,
    campusId: r.campus_id,
    notes: r.notes
  }));
}

export async function createAcademyEventAction(
  month: string,
  formData: FormData
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();
  if (userError || !user) return { ok: false, error: "unauthenticated" };

  const title = (formData.get("title") as string)?.trim();
  const proposedDate = formData.get("proposed_date") as string;
  if (!title || !proposedDate) return { ok: false, error: "missing_required" };

  const costRaw = formData.get("cost") as string;
  const participantRaw = formData.get("participant_count") as string;
  const evaluationRaw = formData.get("evaluation") as string;
  const satisfactionRaw = formData.get("satisfaction_avg") as string;
  const campusId = (formData.get("campus_id") as string) || null;

  const { error } = await supabase.from("academy_events").insert({
    title,
    description: (formData.get("description") as string)?.trim() || null,
    proposed_date: proposedDate,
    actual_date: (formData.get("actual_date") as string) || null,
    is_done: formData.get("is_done") === "true",
    cost: costRaw ? parseFloat(costRaw) : null,
    participant_count: participantRaw ? parseInt(participantRaw, 10) : null,
    evaluation: evaluationRaw ? parseInt(evaluationRaw, 10) : null,
    satisfaction_avg: satisfactionRaw ? parseFloat(satisfactionRaw) : null,
    campus_id: campusId,
    notes: (formData.get("notes") as string)?.trim() || null,
    created_by: user.id
  });

  if (error) return { ok: false, error: "insert_failed" };

  revalidatePath(`/reports/porto-mensual`);
  return { ok: true };
}

export async function toggleEventDoneAction(
  eventId: string,
  isDone: boolean,
  actualDate: string | null
): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("academy_events")
    .update({
      is_done: isDone,
      actual_date: isDone ? (actualDate ?? new Date().toISOString().slice(0, 10)) : null,
      updated_at: new Date().toISOString()
    })
    .eq("id", eventId);

  revalidatePath("/reports/porto-mensual");
  return { ok: !error };
}

export async function deleteAcademyEventAction(eventId: string): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const { error } = await supabase.from("academy_events").delete().eq("id", eventId);
  revalidatePath("/reports/porto-mensual");
  return { ok: !error };
}
