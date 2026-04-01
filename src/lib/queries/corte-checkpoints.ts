import { canAccessCampus, getOperationalCampusAccess } from "@/lib/auth/campuses";
import { getMonterreyDateString, getMonterreyDayBounds } from "@/lib/time";
import { createClient } from "@/lib/supabase/server";

export type CorteCheckpoint = {
  id: string;
  campusId: string;
  campusName: string;
  openedAt: string;
  closedAt: string | null;
  printedAt: string | null;
  status: "open" | "closed";
};

type CheckpointRow = {
  id: string;
  campus_id: string;
  opened_at: string;
  closed_at: string | null;
  printed_at: string | null;
  status: "open" | "closed";
  campuses: { name: string | null } | null;
};

function mapCheckpoint(row: CheckpointRow): CorteCheckpoint {
  return {
    id: row.id,
    campusId: row.campus_id,
    campusName: row.campuses?.name ?? "-",
    openedAt: row.opened_at,
    closedAt: row.closed_at,
    printedAt: row.printed_at,
    status: row.status,
  };
}

async function resolveFallbackOpenedAt(
  supabase: Awaited<ReturnType<typeof createClient>>,
  campusId: string
) {
  const { data: latestClosedCheckpoint } = await supabase
    .from("corte_checkpoints")
    .select("closed_at")
    .eq("campus_id", campusId)
    .eq("status", "closed")
    .not("closed_at", "is", null)
    .order("closed_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ closed_at: string }>();

  if (latestClosedCheckpoint?.closed_at) {
    return latestClosedCheckpoint.closed_at;
  }

  const { data: openCashSession } = await supabase
    .from("cash_sessions")
    .select("opened_at")
    .eq("campus_id", campusId)
    .eq("status", "open")
    .order("opened_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ opened_at: string }>();

  if (openCashSession?.opened_at) {
    return openCashSession.opened_at;
  }

  const todayBounds = getMonterreyDayBounds(getMonterreyDateString());
  const { data: firstPaymentToday } = await supabase
    .from("payments")
    .select("paid_at")
    .eq("status", "posted")
    .eq("operator_campus_id", campusId)
    .gte("paid_at", todayBounds.start)
    .lt("paid_at", todayBounds.end)
    .order("paid_at", { ascending: true })
    .limit(1)
    .maybeSingle<{ paid_at: string }>();

  return firstPaymentToday?.paid_at ?? new Date().toISOString();
}

export async function getCurrentCorteCheckpoint(campusId: string): Promise<CorteCheckpoint | null> {
  const supabase = await createClient();
  const campusAccess = await getOperationalCampusAccess();
  if (!canAccessCampus(campusAccess, campusId)) return null;

  const { data } = await supabase
    .from("corte_checkpoints")
    .select("id, campus_id, opened_at, closed_at, printed_at, status, campuses(name)")
    .eq("campus_id", campusId)
    .eq("status", "open")
    .maybeSingle<CheckpointRow>();

  return data ? mapCheckpoint(data) : null;
}

export async function getOrCreateCurrentCorteCheckpoint(campusId: string): Promise<CorteCheckpoint | null> {
  const supabase = await createClient();
  const campusAccess = await getOperationalCampusAccess();
  if (!canAccessCampus(campusAccess, campusId)) return null;

  const existing = await getCurrentCorteCheckpoint(campusId);
  if (existing) return existing;

  const openedAt = await resolveFallbackOpenedAt(supabase, campusId);
  const { data, error } = await supabase
    .from("corte_checkpoints")
    .insert({
      campus_id: campusId,
      opened_at: openedAt,
      status: "open",
    })
    .select("id, campus_id, opened_at, closed_at, printed_at, status, campuses(name)")
    .single<CheckpointRow>();

  if (!error && data) return mapCheckpoint(data);

  const fallback = await supabase
    .from("corte_checkpoints")
    .select("id, campus_id, opened_at, closed_at, printed_at, status, campuses(name)")
    .eq("campus_id", campusId)
    .eq("status", "open")
    .maybeSingle<CheckpointRow>();

  return fallback.data ? mapCheckpoint(fallback.data) : null;
}
