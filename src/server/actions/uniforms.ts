"use server";

import { revalidatePath } from "next/cache";
import { canAccessEnrollmentRecord, getPermissionContext, requireOperationalContext } from "@/lib/auth/permissions";
import { isDebugWriteBlocked } from "@/lib/auth/debug-view";

export type UniformOrderStatus = "pending_order" | "ordered" | "delivered";

export type UniformOrder = {
  id: string;
  chargeId: string | null;
  uniformType: "training" | "game";
  size: string | null;
  status: UniformOrderStatus;
  soldAt: string | null;
  orderedAt: string | null;
  deliveredAt: string | null;
  notes: string | null;
};

type UniformOrderRow = {
  id: string;
  enrollment_id: string;
  player_id: string;
  charge_id: string | null;
  uniform_type: "training" | "game";
  size: string | null;
  status: UniformOrderStatus;
  sold_at: string | null;
  ordered_at: string | null;
  delivered_at: string | null;
  notes: string | null;
};

async function getManageableUniformOrder(orderId: string) {
  const context = await requireOperationalContext();
  const { data } = await context.supabase
    .from("uniform_orders")
    .select("id, enrollment_id, player_id, charge_id, uniform_type, size, status, sold_at, ordered_at, delivered_at, notes")
    .eq("id", orderId)
    .maybeSingle<UniformOrderRow | null>();

  if (!data) return { context, row: null };
  if (!(await canAccessEnrollmentRecord(data.enrollment_id, context))) {
    return { context, row: null };
  }

  return { context, row: data };
}

function revalidateUniformSurfaces(playerId: string | null, enrollmentId: string) {
  revalidatePath("/uniforms");
  revalidatePath(`/enrollments/${enrollmentId}/charges`);
  if (playerId) revalidatePath(`/players/${playerId}`);
}

export async function getUniformOrdersAction(enrollmentId: string): Promise<UniformOrder[]> {
  const context = await getPermissionContext();
  if (!context?.hasOperationalAccess) return [];
  if (!(await canAccessEnrollmentRecord(enrollmentId, context))) return [];

  const { data } = await context.supabase
    .from("uniform_orders")
    .select("id, charge_id, uniform_type, size, status, sold_at, ordered_at, delivered_at, notes")
    .eq("enrollment_id", enrollmentId)
    .order("sold_at", { ascending: false, nullsFirst: false })
    .order("updated_at", { ascending: false })
    .returns<Array<Omit<UniformOrderRow, "enrollment_id" | "player_id">>>();

  return (data ?? []).map((row) => ({
    id: row.id,
    chargeId: row.charge_id,
    uniformType: row.uniform_type,
    size: row.size,
    status: row.status,
    soldAt: row.sold_at,
    orderedAt: row.ordered_at,
    deliveredAt: row.delivered_at,
    notes: row.notes,
  }));
}

export async function markUniformOrderedAction(orderId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (await isDebugWriteBlocked()) return { ok: false, error: "debug_read_only" };
  const { context, row } = await getManageableUniformOrder(orderId);
  if (!row) return { ok: false, error: "not_found" };
  if (row.status !== "pending_order") return { ok: false, error: "invalid_state" };

  const orderedAt = new Date().toISOString();
  const { error } = await context.supabase
    .from("uniform_orders")
    .update({ status: "ordered", ordered_at: orderedAt, updated_at: orderedAt })
    .eq("id", row.id);

  if (error) return { ok: false, error: "update_failed" };

  revalidateUniformSurfaces(row.player_id, row.enrollment_id);
  return { ok: true };
}

export async function markUniformDeliveredAction(orderId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (await isDebugWriteBlocked()) return { ok: false, error: "debug_read_only" };
  const { context, row } = await getManageableUniformOrder(orderId);
  if (!row) return { ok: false, error: "not_found" };
  if (row.status === "delivered") return { ok: true };

  const deliveredAt = new Date().toISOString();
  const { error } = await context.supabase
    .from("uniform_orders")
    .update({ status: "delivered", delivered_at: deliveredAt, updated_at: deliveredAt })
    .eq("id", row.id);

  if (error) return { ok: false, error: "update_failed" };

  revalidateUniformSurfaces(row.player_id, row.enrollment_id);
  return { ok: true };
}

export async function bulkMarkUniformOrderedAction(
  orderIds: string[]
): Promise<{ ok: true; updated: number } | { ok: false; error: string }> {
  if (await isDebugWriteBlocked()) return { ok: false, error: "debug_read_only" };
  const context = await requireOperationalContext();
  const uniqueIds = Array.from(new Set(orderIds.filter(Boolean)));
  if (uniqueIds.length === 0) return { ok: false, error: "invalid_form" };

  const { data } = await context.supabase
    .from("uniform_orders")
    .select("id, enrollment_id, player_id, status")
    .in("id", uniqueIds)
    .returns<Array<Pick<UniformOrderRow, "id" | "enrollment_id" | "player_id" | "status">>>();

  const manageable: Array<Pick<UniformOrderRow, "id" | "enrollment_id" | "player_id" | "status">> = [];
  for (const row of data ?? []) {
    if (row.status !== "pending_order") continue;
    if (await canAccessEnrollmentRecord(row.enrollment_id, context)) manageable.push(row);
  }

  if (manageable.length === 0) return { ok: true, updated: 0 };

  const orderedAt = new Date().toISOString();
  const { error } = await context.supabase
    .from("uniform_orders")
    .update({ status: "ordered", ordered_at: orderedAt, updated_at: orderedAt })
    .in("id", manageable.map((row) => row.id));

  if (error) return { ok: false, error: "update_failed" };

  revalidatePath("/uniforms");
  const seenPlayers = new Set<string>();
  for (const row of manageable) {
    revalidatePath(`/enrollments/${row.enrollment_id}/charges`);
    if (!seenPlayers.has(row.player_id)) {
      seenPlayers.add(row.player_id);
      revalidatePath(`/players/${row.player_id}`);
    }
  }

  return { ok: true, updated: manageable.length };
}
