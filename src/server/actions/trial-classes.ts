"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { canAccessCampus } from "@/lib/auth/campuses";
import { isDebugWriteBlocked } from "@/lib/auth/debug-view";
import { getPermissionContext } from "@/lib/auth/permissions";
import { writeAuditLog } from "@/lib/audit";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatDateMonterrey, formatTimeMonterrey, getMonterreyDateString } from "@/lib/time";

export type TrialTicketPayload = {
  visitId: string;
  prospectName: string;
  campusName: string;
  groupName: string;
  coachNames: string[];
  visitNumber: number;
  visitDate: string;
  checkedInAt: string;
};

export type TrialCheckInResult =
  | { ok: true; ticket: TrialTicketPayload; duplicate: boolean }
  | { ok: false; error: "debug_read_only" | "unauthorized" | "invalid_session" | "limit_reached" | "save_failed" };

export type TrialProspectCreateResult =
  | { ok: true; prospectId: string }
  | { ok: false; error: "debug_read_only" | "unauthorized" | "invalid_form" | "invalid_phone" | "invalid_birth_date" | "invalid_group" | "possible_duplicate" | "create_failed"; duplicateId?: string };

function clean(value: FormDataEntryValue | null, max = 2000) {
  return String(value ?? "").trim().slice(0, max);
}

function normalizedPhone(value: string) {
  return value.replace(/\D/g, "");
}

function returnPath(formData: FormData) {
  const raw = clean(formData.get("returnTo"), 500);
  return raw.startsWith("/trial-classes") ? raw : "/trial-classes";
}

async function requireTrialWriter(campusId?: string | null) {
  if (await isDebugWriteBlocked()) return null;
  const context = await getPermissionContext();
  if (!context?.hasOperationalAccess) return null;
  if (campusId && !canAccessCampus(context.campusAccess, campusId)) return null;
  return context;
}

export async function createTrialProspectAction(formData: FormData): Promise<TrialProspectCreateResult> {
  const campusId = clean(formData.get("campusId"), 80);
  const groupId = clean(formData.get("trainingGroupId"), 80);
  const firstName = clean(formData.get("firstName"), 100);
  const lastName = clean(formData.get("lastName"), 140);
  const birthDate = clean(formData.get("birthDate"), 10);
  const gender = clean(formData.get("gender"), 10);
  const guardianName = clean(formData.get("guardianName"), 180);
  const guardianPhone = clean(formData.get("guardianPhone"), 40);
  const phone = normalizedPhone(guardianPhone);
  const note = clean(formData.get("note"));

  if (await isDebugWriteBlocked()) return { ok: false, error: "debug_read_only" };
  const context = await requireTrialWriter(campusId);
  if (!context) return { ok: false, error: "unauthorized" };
  if (!firstName || !lastName || !["male", "female"].includes(gender) || !groupId) return { ok: false, error: "invalid_form" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate) || birthDate > getMonterreyDateString()) return { ok: false, error: "invalid_birth_date" };
  if (phone.length !== 10) return { ok: false, error: "invalid_phone" };

  const admin = createAdminClient();
  const { data: group } = await admin
    .from("training_groups")
    .select("id, campus_id, status")
    .eq("id", groupId)
    .maybeSingle<{ id: string; campus_id: string; status: string }>();
  if (!group || group.campus_id !== campusId || group.status !== "active") {
    return { ok: false, error: "invalid_group" };
  }

  const { data: candidates } = await admin
    .from("trial_prospects")
    .select("id, first_name, last_name, birth_date, guardian_phone_normalized")
    .eq("campus_id", campusId)
    .neq("status", "closed")
    .or(`guardian_phone_normalized.eq.${phone},birth_date.eq.${birthDate}`)
    .limit(50);
  const duplicate = (candidates ?? []).find((candidate) =>
    candidate.guardian_phone_normalized === phone ||
    (candidate.birth_date === birthDate &&
      candidate.first_name.toLocaleLowerCase("es-MX") === firstName.toLocaleLowerCase("es-MX") &&
      candidate.last_name.toLocaleLowerCase("es-MX") === lastName.toLocaleLowerCase("es-MX"))
  );
  if (duplicate) {
    return { ok: false, error: "possible_duplicate", duplicateId: duplicate.id };
  }

  const { data: prospect, error } = await admin
    .from("trial_prospects")
    .insert({
      campus_id: campusId,
      preferred_training_group_id: groupId,
      first_name: firstName,
      last_name: lastName,
      birth_date: birthDate,
      gender,
      guardian_name: guardianName || null,
      guardian_phone: guardianPhone,
      guardian_phone_normalized: phone,
      created_by: context.user.id,
      created_by_email: context.user.email,
    })
    .select("id")
    .single<{ id: string }>();
  if (error || !prospect) {
    console.error("[trial-classes] prospect insert failed", error);
    return { ok: false, error: "create_failed" };
  }

  if (note) {
    await admin.from("trial_prospect_notes").insert({
      prospect_id: prospect.id,
      campus_id: campusId,
      body: note,
      created_by: context.user.id,
      created_by_email: context.user.email,
    });
  }
  await writeAuditLog(admin, {
    actorUserId: context.user.id,
    actorEmail: context.user.email,
    action: "trial_prospect.created",
    tableName: "trial_prospects",
    recordId: prospect.id,
    afterData: { campus_id: campusId, preferred_training_group_id: groupId },
  });
  revalidatePath("/trial-classes");
  return { ok: true, prospectId: prospect.id };
}

export async function addTrialProspectNoteAction(formData: FormData) {
  const back = returnPath(formData);
  const prospectId = clean(formData.get("prospectId"), 80);
  const body = clean(formData.get("body"));
  const admin = createAdminClient();
  const { data: prospect } = await admin
    .from("trial_prospects")
    .select("id, campus_id")
    .eq("id", prospectId)
    .maybeSingle<{ id: string; campus_id: string }>();
  const context = prospect ? await requireTrialWriter(prospect.campus_id) : null;
  if (!context || !body) redirect(`${back}${back.includes("?") ? "&" : "?"}err=note_failed`);
  const { error } = await admin.from("trial_prospect_notes").insert({
    prospect_id: prospectId,
    campus_id: prospect!.campus_id,
    body,
    created_by: context.user.id,
    created_by_email: context.user.email,
  });
  if (error) console.error("[trial-classes] note insert failed", error);
  revalidatePath("/trial-classes");
  redirect(`${back}${back.includes("?") ? "&" : "?"}${error ? "err=note_failed" : "ok=note_saved"}&focus=${prospectId}`);
}

export async function recordTrialVisitAction({ prospectId, attendanceSessionId, note }: { prospectId: string; attendanceSessionId: string; note?: string }): Promise<TrialCheckInResult> {
  if (await isDebugWriteBlocked()) return { ok: false, error: "debug_read_only" };
  const admin = createAdminClient();
  const { data: prospect } = await admin
    .from("trial_prospects")
    .select("id, campus_id, first_name, last_name")
    .eq("id", prospectId)
    .maybeSingle<{ id: string; campus_id: string; first_name: string; last_name: string }>();
  const context = prospect ? await requireTrialWriter(prospect.campus_id) : null;
  if (!context || !prospect) return { ok: false, error: "unauthorized" };

  const { data: previous } = await admin
    .from("trial_visits")
    .select("id")
    .eq("prospect_id", prospectId)
    .eq("attendance_session_id", attendanceSessionId)
    .maybeSingle<{ id: string }>();
  const { data: visit, error } = await admin.rpc("record_trial_visit", {
    p_prospect_id: prospectId,
    p_attendance_session_id: attendanceSessionId,
    p_actor_id: context.user.id,
    p_actor_email: context.user.email ?? "",
    p_note: note?.trim().slice(0, 2000) || null,
  });
  if (error || !visit) {
    const message = error?.message ?? "";
    if (message.includes("trial_limit_reached")) return { ok: false, error: "limit_reached" };
    if (message.includes("trial_session_invalid")) return { ok: false, error: "invalid_session" };
    console.error("[trial-classes] visit insert failed", error);
    return { ok: false, error: "save_failed" };
  }

  const visitRow = Array.isArray(visit) ? visit[0] : visit;
  const [{ data: campus }, { data: group }] = await Promise.all([
    admin.from("campuses").select("name").eq("id", visitRow.campus_id).single<{ name: string }>(),
    admin.from("training_groups").select("name").eq("id", visitRow.training_group_id).single<{ name: string }>(),
  ]);
  const coachSnapshot = (visitRow.coach_snapshot ?? []) as Array<{ name?: string }>;
  const ticket: TrialTicketPayload = {
    visitId: visitRow.id,
    prospectName: `${prospect.first_name} ${prospect.last_name}`,
    campusName: campus?.name ?? "Campus",
    groupName: group?.name ?? "Grupo",
    coachNames: coachSnapshot.map((coach) => coach.name ?? "").filter(Boolean),
    visitNumber: visitRow.visit_number,
    visitDate: formatDateMonterrey(`${visitRow.visit_date}T12:00:00Z`),
    checkedInAt: formatTimeMonterrey(visitRow.checked_in_at),
  };
  if (!previous) {
    await writeAuditLog(admin, {
      actorUserId: context.user.id,
      actorEmail: context.user.email,
      action: "trial_visit.checked_in",
      tableName: "trial_visits",
      recordId: visitRow.id,
      afterData: { prospect_id: prospectId, attendance_session_id: attendanceSessionId, visit_number: visitRow.visit_number },
    });
  }
  revalidatePath("/trial-classes");
  return { ok: true, ticket, duplicate: Boolean(previous) };
}
