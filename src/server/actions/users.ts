"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { assertDebugWritesAllowed } from "@/lib/auth/debug-view";
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
  if (!targetUserId || !roleCode) redirect(`${BASE}?err=invalid_form`);

  const { data: role } = await supabase
    .from("app_roles")
    .select("id")
    .eq("code", roleCode)
    .maybeSingle<{ id: string }>();

  if (!role) redirect(`${BASE}?err=role_not_found`);

  let campusId: string | null = null;
  if (roleCode === "front_desk") {
    if (!campusIdRaw) redirect(`${BASE}?err=invalid_form`);
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
  if (!targetUserId || !roleCode) redirect(`${BASE}?err=invalid_form`);

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
