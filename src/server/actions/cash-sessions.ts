"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { canAccessCampus, getOperationalCampusAccess } from "@/lib/auth/campuses";
import { assertDebugWritesAllowed } from "@/lib/auth/debug-view";
import { createClient } from "@/lib/supabase/server";
import { writeAuditLog } from "@/lib/audit";

const BASE = "/caja/sesion";

async function assertOperationalAccess() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  const campusAccess = await getOperationalCampusAccess();
  if (!campusAccess || !campusAccess.isDirector) return null;
  return { supabase, user, campusAccess };
}

export async function openCashSessionAction(formData: FormData): Promise<void> {
  const campusId = formData.get("campus_id")?.toString().trim() ?? "";
  const openingCashRaw = formData.get("opening_cash")?.toString().trim() ?? "0";
  const openingCash = parseFloat(openingCashRaw);

  if (!campusId) redirect(`${BASE}?err=invalid_form`);
  if (isNaN(openingCash) || openingCash < 0) redirect(`${BASE}?err=invalid_amount`);
  await assertDebugWritesAllowed(BASE);

  const auth = await assertOperationalAccess();
  if (!auth) redirect(`${BASE}?err=unauthorized`);
  const { supabase, user, campusAccess } = auth;
  if (!canAccessCampus(campusAccess, campusId)) redirect(`${BASE}?err=unauthorized`);

  // Block if already an open session for this campus
  const { data: existing } = await supabase
    .from("cash_sessions")
    .select("id")
    .eq("campus_id", campusId)
    .eq("status", "open")
    .maybeSingle();

  if (existing) redirect(`${BASE}?err=session_already_open`);

  const { data: session, error } = await supabase
    .from("cash_sessions")
    .insert({
      campus_id: campusId,
      opened_by: user.id,
      opening_cash: openingCash,
      status: "open"
    })
    .select("id")
    .single<{ id: string }>();

  if (error || !session) redirect(`${BASE}?err=open_failed`);

  await writeAuditLog(supabase, {
    actorUserId: user.id,
    actorEmail: user.email ?? null,
    action: "cash_session.opened",
    tableName: "cash_sessions",
    recordId: session.id,
    afterData: { campus_id: campusId, opening_cash: openingCash }
  });

  revalidatePath(BASE);
  revalidatePath("/caja");
  redirect(`${BASE}?ok=opened`);
}

export async function closeCashSessionAction(formData: FormData): Promise<void> {
  const sessionId = formData.get("session_id")?.toString().trim() ?? "";
  const closingCashRaw = formData.get("closing_cash")?.toString().trim() ?? "";
  const notes = formData.get("notes")?.toString().trim() || null;
  const redirectTo = formData.get("redirect_to")?.toString().trim() || BASE;

  if (!sessionId) redirect(`${redirectTo}?err=invalid_form`);
  const closingCash = closingCashRaw ? parseFloat(closingCashRaw) : null;
  if (closingCash !== null && (isNaN(closingCash) || closingCash < 0)) {
    redirect(`${redirectTo}?err=invalid_amount`);
  }
  await assertDebugWritesAllowed(redirectTo);

  const auth = await assertOperationalAccess();
  if (!auth) redirect(`${redirectTo}?err=unauthorized`);
  const { supabase, user, campusAccess } = auth;

  const { data: session } = await supabase
    .from("cash_sessions")
    .select("id, campus_id, status")
    .eq("id", sessionId)
    .eq("status", "open")
    .maybeSingle<{ id: string; campus_id: string; status: string }>();

  if (!session) redirect(`${redirectTo}?err=session_not_found`);
  if (!canAccessCampus(campusAccess, session.campus_id)) redirect(`${redirectTo}?err=unauthorized`);

  const { error } = await supabase
    .from("cash_sessions")
    .update({
      status: "closed",
      closed_at: new Date().toISOString(),
      closed_by: user.id,
      closing_cash_reported: closingCash,
      notes
    })
    .eq("id", sessionId);

  if (error) redirect(`${redirectTo}?err=close_failed`);

  await writeAuditLog(supabase, {
    actorUserId: user.id,
    actorEmail: user.email ?? null,
    action: "cash_session.closed",
    tableName: "cash_sessions",
    recordId: sessionId,
    afterData: { campus_id: session.campus_id, closing_cash_reported: closingCash, notes }
  });

  revalidatePath(BASE);
  revalidatePath("/caja");
  revalidatePath(redirectTo);
  redirect(`${redirectTo}?ok=closed`);
}
