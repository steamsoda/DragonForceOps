import { createClient } from "@/lib/supabase/server";

export type OpenSession = {
  id: string;
  campusId: string;
  campusName: string;
  openedAt: string;
  openingCash: number;
  cashIn: number; // sum of payment_in entries for this session
};

export type CampusSessionStatus = {
  campusId: string;
  campusName: string;
  session: OpenSession | null;
};

type SessionRow = {
  id: string;
  campus_id: string;
  opened_at: string;
  opening_cash: number;
  campuses: { name: string } | null;
  cash_session_entries: { entry_type: string; amount: number }[];
};

// Returns session status for every active campus (used on management page and Caja header)
export async function getCampusSessionStatuses(): Promise<CampusSessionStatus[]> {
  const supabase = await createClient();

  const [campusesResult, sessionsResult] = await Promise.all([
    supabase.from("campuses").select("id, name").eq("is_active", true).order("name"),
    supabase
      .from("cash_sessions")
      .select("id, campus_id, opened_at, opening_cash, campuses(name), cash_session_entries(entry_type, amount)")
      .eq("status", "open")
      .returns<SessionRow[]>()
  ]);

  const campuses = campusesResult.data ?? [];
  const openSessions = sessionsResult.data ?? [];

  // Index open sessions by campus_id
  const byCampus = new Map<string, OpenSession>();
  for (const s of openSessions) {
    const cashIn = s.cash_session_entries
      .filter((e) => e.entry_type === "payment_in")
      .reduce((sum, e) => sum + e.amount, 0);
    byCampus.set(s.campus_id, {
      id: s.id,
      campusId: s.campus_id,
      campusName: s.campuses?.name ?? "-",
      openedAt: s.opened_at,
      openingCash: s.opening_cash,
      cashIn
    });
  }

  return campuses.map((c) => ({
    campusId: c.id,
    campusName: c.name,
    session: byCampus.get(c.id) ?? null
  }));
}

// Monterrey is permanently UTC-6 (Mexico abolished DST after 2023).
const CST_OFFSET_MS = 6 * 60 * 60 * 1000;

// Returns any session (open or closed) whose opened_at falls within the given
// Monterrey calendar day. Used by Corte Diario to anchor the time window to the
// session even when staff run the report the morning after.
export async function getSessionForDate(
  campusId: string,
  dateStr: string
): Promise<{ openedAt: string; closedAt: string | null } | null> {
  const supabase = await createClient();
  const dayStart = new Date(`${dateStr}T06:00:00.000Z`); // MTY midnight = UTC 06:00
  const dayEnd   = new Date(dayStart.getTime() + 86_400_000);
  const { data } = await supabase
    .from("cash_sessions")
    .select("opened_at, closed_at")
    .eq("campus_id", campusId)
    .gte("opened_at", dayStart.toISOString())
    .lt("opened_at", dayEnd.toISOString())
    .order("opened_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ opened_at: string; closed_at: string | null }>();
  if (!data) return null;
  return { openedAt: data.opened_at, closedAt: data.closed_at };
}

// Returns the open session for a specific campus (used during payment posting)
export async function getOpenSessionForCampus(campusId: string): Promise<{ id: string } | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("cash_sessions")
    .select("id")
    .eq("campus_id", campusId)
    .eq("status", "open")
    .maybeSingle<{ id: string }>();
  return data ?? null;
}
