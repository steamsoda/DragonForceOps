import "server-only";
import { requireOperationalPageReader } from "@/lib/auth/operational-page-reader";
import { createAdminClient } from "@/lib/supabase/admin";
import * as staff from "./corte-checkpoints";
import { getCorteDiarioData } from "./reports";
import { getMonterreyDateString, getMonterreyDayBounds } from "@/lib/time";

const columns = "id,campus_id,opened_at,closed_at,printed_at,status,campuses(name)";
type Row = { id: string; campus_id: string; opened_at: string; closed_at: string | null; printed_at: string | null; status: "open" | "closed"; campuses: { name: string } | null };
function map(row: Row): staff.CorteCheckpoint {
  return { id: row.id, campusId: row.campus_id, campusName: row.campuses?.name ?? "-", openedAt: row.opened_at, closedAt: row.closed_at, printedAt: row.printed_at, status: row.status };
}
export async function getCorteCheckpointById(id: string) {
  const context = await requireOperationalPageReader();
  if (!context.isDirectorReadOnly) return staff.getCorteCheckpointById(id);
  const { data, error } = await createAdminClient().from("corte_checkpoints").select(columns)
    .eq("id", id).in("campus_id", context.campusAccess?.campusIds ?? []).maybeSingle<Row>();
  if (error) throw error;
  return data ? map(data) : null;
}
export async function getOrCreateCurrentCorteCheckpoint(campusId: string) {
  const context = await requireOperationalPageReader();
  if (!context.isDirectorReadOnly) return staff.getOrCreateCurrentCorteCheckpoint(campusId);
  if (!context.campusAccess?.campusIds.includes(campusId)) return null;
  const admin = createAdminClient();
  const { data, error } = await admin.from("corte_checkpoints").select(columns).eq("campus_id", campusId)
    .eq("status", "open").maybeSingle<Row>();
  if (error) throw error;
  if (data) return map(data);
  const { data: closed, error: closedError } = await admin.from("corte_checkpoints").select("closed_at")
    .eq("campus_id", campusId).eq("status", "closed").order("closed_at", { ascending: false }).limit(1).maybeSingle();
  if (closedError) throw closedError;
  let openedAt = closed?.closed_at;
  if (!openedAt) {
    const { data: session, error } = await admin.from("cash_sessions").select("opened_at")
      .eq("campus_id", campusId).eq("status", "open").order("opened_at", { ascending: false }).limit(1).maybeSingle();
    if (error) throw error;
    openedAt = session?.opened_at;
  }
  if (!openedAt) {
    const bounds = getMonterreyDayBounds(getMonterreyDateString());
    const { data: payment, error } = await admin.from("payments").select("paid_at")
      .eq("operator_campus_id", campusId).eq("status", "posted").gte("paid_at", bounds.start).lt("paid_at", bounds.end)
      .order("paid_at", { ascending: true }).limit(1).maybeSingle();
    if (error) throw error;
    openedAt = payment?.paid_at ?? new Date().toISOString();
  }
  // A display-only range, never a checkpoint insert or roll-forward.
  return { id: "read-only", campusId, campusName: context.campusAccess.campuses.find(c => c.id === campusId)?.name ?? "-",
    openedAt,
    closedAt: null, printedAt: null, status: "open" as const };
}
export async function listClosedCorteCheckpoints(campusId: string, limit = 12) {
  const context = await requireOperationalPageReader();
  if (!context.isDirectorReadOnly) return staff.listClosedCorteCheckpoints(campusId, limit);
  if (!context.campusAccess?.campusIds.includes(campusId)) return [];
  const { data, error } = await createAdminClient().from("corte_checkpoints").select(columns).eq("campus_id", campusId)
    .eq("status", "closed").order("closed_at", { ascending: false }).limit(Math.min(100, Math.max(1, limit))).returns<Row[]>();
  if (error) throw error;
  return (data ?? []).map(map);
}
export async function getCortePresentation(filters: Parameters<typeof getCorteDiarioData>[0]) {
  const context = await requireOperationalPageReader();
  const data = await getCorteDiarioData(filters);
  if (!context.isDirectorReadOnly) return data;
  return { campusId: data.campusId, campusName: data.campusName, openedAt: data.openedAt,
    closedAt: data.closedAt, isCurrentOpen: data.isCurrentOpen,
    countedPaymentsCount: data.countedPaymentsCount, excludedPaymentsCount: data.excludedPaymentsCount,
    totalCobrado: null, excludedPaymentsTotal: null, payments: data.payments,
    byMethod: data.byMethod.map(row => ({ method: row.method, methodLabel: row.methodLabel, count: row.count, total: null })),
    byChargeType: data.byChargeType.map(row => ({ typeCode: row.typeCode, typeName: row.typeName, total: null })),
    productDetails: data.productDetails.map(row => ({ description: row.description, total: null })),
  };
}
