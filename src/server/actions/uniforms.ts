"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type UniformOrder = {
  id: string;
  uniformType: "training" | "game";
  size: string | null;
  status: "ordered" | "delivered";
  orderedAt: string;
  deliveredAt: string | null;
  notes: string | null;
};

export async function getUniformOrdersAction(enrollmentId: string): Promise<UniformOrder[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("uniform_orders")
    .select("id, uniform_type, size, status, ordered_at, delivered_at, notes")
    .eq("enrollment_id", enrollmentId)
    .order("ordered_at", { ascending: false });

  return (data ?? []).map((r) => ({
    id: r.id,
    uniformType: r.uniform_type as "training" | "game",
    size: r.size,
    status: r.status as "ordered" | "delivered",
    orderedAt: r.ordered_at,
    deliveredAt: r.delivered_at,
    notes: r.notes,
  }));
}

export async function createUniformOrderAction(
  playerId: string,
  enrollmentId: string,
  formData: FormData
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "unauthenticated" };

  const uniformType = formData.get("uniformType")?.toString();
  if (uniformType !== "training" && uniformType !== "game") {
    return { ok: false, error: "invalid_type" };
  }

  const size = formData.get("size")?.toString().trim() || null;
  const notes = formData.get("notes")?.toString().trim() || null;

  const { error } = await supabase.from("uniform_orders").insert({
    player_id: playerId,
    enrollment_id: enrollmentId,
    uniform_type: uniformType,
    size,
    notes,
    created_by: user.id,
  });

  if (error) return { ok: false, error: "insert_failed" };

  revalidatePath(`/players/${playerId}`);
  return { ok: true };
}

export async function markUniformDeliveredAction(
  orderId: string,
  playerId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "unauthenticated" };

  const { error } = await supabase
    .from("uniform_orders")
    .update({ status: "delivered", delivered_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", orderId);

  if (error) return { ok: false, error: "update_failed" };

  revalidatePath(`/players/${playerId}`);
  return { ok: true };
}
