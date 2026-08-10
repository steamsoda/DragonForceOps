"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { assertDebugWritesAllowed } from "@/lib/auth/debug-view";
import { writeAuditLog } from "@/lib/audit";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const BASE = "/admin/users";

async function assertSuperAdmin() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) redirect(`/?error=unauthenticated`);

  const { data: roles } = await supabase
    .from("user_roles")
    .select("app_roles(code)")
    .eq("user_id", user.id)
    .returns<{ app_roles: { code: string } | null }[]>();

  const codes = (roles ?? []).map((r) => r.app_roles?.code).filter(Boolean);
  if (!codes.includes("superadmin")) redirect("/unauthorized");

  return { supabase, user };
}

export async function grantRoleAction(formData: FormData) {
  await assertDebugWritesAllowed(BASE);
  const { supabase } = await assertSuperAdmin();

  const targetUserId = formData.get("user_id")?.toString().trim() ?? "";
  const roleCode = formData.get("role_code")?.toString().trim() ?? "";
  const campusIdRaw = formData.get("campus_id")?.toString().trim() ?? "";
  if (!targetUserId || !roleCode || roleCode === "coach") redirect(`${BASE}?err=invalid_form`);

  const { data: role } = await supabase
    .from("app_roles")
    .select("id")
    .eq("code", roleCode)
    .maybeSingle<{ id: string }>();

  if (!role) redirect(`${BASE}?err=role_not_found`);

  let campusId: string | null = null;
  if (roleCode === "front_desk" || roleCode === "nutritionist" || roleCode === "attendance_admin") {
    if (!campusIdRaw) redirect(`${BASE}?err=invalid_form`);
    const { data: campus } = await supabase
      .from("campuses")
      .select("id")
      .eq("id", campusIdRaw)
      .eq("is_active", true)
      .maybeSingle<{ id: string }>();
    if (!campus) redirect(`${BASE}?err=invalid_form`);
    campusId = campus.id;
  } else if (roleCode === "director_deportivo" && campusIdRaw) {
    const { data: campus } = await supabase
      .from("campuses")
      .select("id")
      .eq("id", campusIdRaw)
      .eq("is_active", true)
      .maybeSingle<{ id: string }>();
    if (!campus) redirect(`${BASE}?err=invalid_form`);
    campusId = campus.id;
  }

  const { error } = await supabase
    .from("user_roles")
    .insert({ user_id: targetUserId, role_id: role.id, campus_id: campusId });

  if (error && error.code !== "23505" && !error.message.toLowerCase().includes("duplicate")) {
    redirect(`${BASE}?err=grant_failed`);
  }

  revalidatePath(BASE);
  redirect(`${BASE}?ok=granted`);
}

export async function revokeRoleAction(formData: FormData) {
  await assertDebugWritesAllowed(BASE);
  const { supabase } = await assertSuperAdmin();

  const targetUserId = formData.get("user_id")?.toString().trim() ?? "";
  const roleCode = formData.get("role_code")?.toString().trim() ?? "";
  const campusIdRaw = formData.get("campus_id")?.toString().trim() ?? "";
  if (!targetUserId || !roleCode || roleCode === "coach") redirect(`${BASE}?err=invalid_form`);

  const { data: role } = await supabase
    .from("app_roles")
    .select("id")
    .eq("code", roleCode)
    .maybeSingle<{ id: string }>();

  if (!role) redirect(`${BASE}?err=role_not_found`);

  let revokeQuery = supabase
    .from("user_roles")
    .delete()
    .eq("user_id", targetUserId)
    .eq("role_id", role.id);

  revokeQuery = campusIdRaw
    ? revokeQuery.eq("campus_id", campusIdRaw)
    : revokeQuery.is("campus_id", null);

  const { error } = await revokeQuery;

  if (error) redirect(`${BASE}?err=revoke_failed`);

  revalidatePath(BASE);
  redirect(`${BASE}?ok=revoked`);
}

export async function linkCoachUserAction(formData: FormData) {
  await assertDebugWritesAllowed(BASE);
  const { user } = await assertSuperAdmin();
  const targetUserId = formData.get("user_id")?.toString().trim() ?? "";
  const coachId = formData.get("coach_id")?.toString().trim() ?? "";
  if (!targetUserId || !coachId) redirect(`${BASE}?err=invalid_coach_link`);

  const admin = createAdminClient();
  const [targetUser, coachResult, roleResult] = await Promise.all([
    admin.auth.admin.getUserById(targetUserId),
    admin.from("coaches").select("id, user_id, first_name, last_name, is_active").eq("id", coachId).maybeSingle<{
      id: string;
      user_id: string | null;
      first_name: string;
      last_name: string;
      is_active: boolean;
    }>(),
    admin.from("app_roles").select("id").eq("code", "coach").maybeSingle<{ id: string }>(),
  ]);
  const coach = coachResult.data;
  const role = roleResult.data;
  if (targetUser.error || !targetUser.data.user || coachResult.error || !coach || !coach.is_active || roleResult.error || !role) {
    redirect(`${BASE}?err=invalid_coach_link`);
  }
  if (coach.user_id && coach.user_id !== targetUserId) redirect(`${BASE}?err=coach_already_linked`);

  const existingCoach = await admin
    .from("coaches")
    .select("id")
    .eq("user_id", targetUserId)
    .neq("id", coachId)
    .maybeSingle<{ id: string }>();
  if (existingCoach.error || existingCoach.data) redirect(`${BASE}?err=user_already_linked`);

  const linkResult = await admin.from("coaches").update({ user_id: targetUserId }).eq("id", coachId).is("user_id", null);
  if (linkResult.error) redirect(`${BASE}?err=coach_link_failed`);
  const existingRole = await admin
    .from("user_roles")
    .select("id")
    .eq("user_id", targetUserId)
    .eq("role_id", role.id)
    .is("campus_id", null)
    .limit(1)
    .maybeSingle<{ id: string }>();
  const roleInsert = existingRole.error
    ? { error: existingRole.error }
    : existingRole.data
      ? { error: null }
      : await admin.from("user_roles").insert({ user_id: targetUserId, role_id: role.id, campus_id: null });
  if (roleInsert.error) {
    await admin.from("coaches").update({ user_id: null }).eq("id", coachId).eq("user_id", targetUserId);
    redirect(`${BASE}?err=coach_link_failed`);
  }
  await writeAuditLog(admin, {
    actorUserId: user.id,
    actorEmail: user.email,
    action: "coach.account_linked",
    tableName: "coaches",
    recordId: coachId,
    afterData: { user_id: targetUserId, coach_name: `${coach.first_name} ${coach.last_name}`.trim() },
  });
  revalidatePath(BASE);
  redirect(`${BASE}?ok=coach_linked`);
}

export async function unlinkCoachUserAction(formData: FormData) {
  await assertDebugWritesAllowed(BASE);
  const { user } = await assertSuperAdmin();
  const targetUserId = formData.get("user_id")?.toString().trim() ?? "";
  const coachId = formData.get("coach_id")?.toString().trim() ?? "";
  if (!targetUserId || !coachId) redirect(`${BASE}?err=invalid_coach_link`);

  const admin = createAdminClient();
  const roleResult = await admin.from("app_roles").select("id").eq("code", "coach").maybeSingle<{ id: string }>();
  if (roleResult.error || !roleResult.data) redirect(`${BASE}?err=coach_unlink_failed`);
  const clearResult = await admin.from("coaches").update({ user_id: null }).eq("id", coachId).eq("user_id", targetUserId);
  if (clearResult.error) redirect(`${BASE}?err=coach_unlink_failed`);
  const revokeResult = await admin
    .from("user_roles")
    .delete()
    .eq("user_id", targetUserId)
    .eq("role_id", roleResult.data.id)
    .is("campus_id", null);
  if (revokeResult.error) redirect(`${BASE}?err=coach_unlink_failed`);
  await writeAuditLog(admin, {
    actorUserId: user.id,
    actorEmail: user.email,
    action: "coach.account_unlinked",
    tableName: "coaches",
    recordId: coachId,
    beforeData: { user_id: targetUserId },
  });
  revalidatePath(BASE);
  redirect(`${BASE}?ok=coach_unlinked`);
}
