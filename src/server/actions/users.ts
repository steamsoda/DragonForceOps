"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
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
  const { supabase } = await assertSuperAdmin();

  const targetUserId = formData.get("user_id")?.toString().trim() ?? "";
  const roleCode = formData.get("role_code")?.toString().trim() ?? "";
  if (!targetUserId || !roleCode) redirect(`${BASE}?err=invalid_form`);

  const { data: role } = await supabase
    .from("app_roles")
    .select("id")
    .eq("code", roleCode)
    .maybeSingle<{ id: string }>();

  if (!role) redirect(`${BASE}?err=role_not_found`);

  const { error } = await supabase
    .from("user_roles")
    .insert({ user_id: targetUserId, role_id: role.id });

  if (error && !error.message.includes("duplicate")) {
    redirect(`${BASE}?err=grant_failed`);
  }

  revalidatePath(BASE);
  redirect(`${BASE}?ok=granted`);
}

export async function revokeRoleAction(formData: FormData) {
  const { supabase } = await assertSuperAdmin();

  const targetUserId = formData.get("user_id")?.toString().trim() ?? "";
  const roleCode = formData.get("role_code")?.toString().trim() ?? "";
  if (!targetUserId || !roleCode) redirect(`${BASE}?err=invalid_form`);

  const { data: role } = await supabase
    .from("app_roles")
    .select("id")
    .eq("code", roleCode)
    .maybeSingle<{ id: string }>();

  if (!role) redirect(`${BASE}?err=role_not_found`);

  const { error } = await supabase
    .from("user_roles")
    .delete()
    .eq("user_id", targetUserId)
    .eq("role_id", role.id);

  if (error) redirect(`${BASE}?err=revoke_failed`);

  revalidatePath(BASE);
  redirect(`${BASE}?ok=revoked`);
}
