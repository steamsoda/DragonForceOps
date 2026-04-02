"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  clearDebugViewCookies,
  getDebugRedirectTarget,
  isPreviewDebugEnabled,
  setDebugViewCookies,
} from "@/lib/auth/debug-view";

const BASE = "/dashboard";

async function assertDebugManager() {
  if (!isPreviewDebugEnabled()) redirect("/unauthorized");

  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) redirect("/login");

  const { data: roles } = await supabase
    .from("user_roles")
    .select("app_roles(code)")
    .eq("user_id", user.id)
    .returns<{ app_roles: { code: string } | null }[]>();

  const isSuperAdmin = (roles ?? []).some((row) => row.app_roles?.code === "superadmin");
  if (!isSuperAdmin) redirect("/unauthorized");

  return { supabase, user };
}

export async function setDebugViewUserAction(formData: FormData): Promise<void> {
  const lookup = formData.get("target_email")?.toString().trim().toLowerCase() ?? "";
  const redirectTo = (formData.get("redirect_to")?.toString().trim() || (await getDebugRedirectTarget(BASE)));

  if (!lookup) {
    await clearDebugViewCookies();
    revalidatePath("/");
    redirect(redirectTo);
  }

  const { supabase, user } = await assertDebugManager();
  const { data: authUsersRaw } = await supabase.rpc("list_auth_users");
  const authUsers = (authUsersRaw ?? []) as Array<{ id: string; email: string | null }>;
  const target = authUsers.find((candidate) => candidate.email?.toLowerCase() === lookup);

  if (!target?.id) redirect(`${redirectTo}${redirectTo.includes("?") ? "&" : "?"}err=debug_user_not_found`);
  if (target.id === user.id) {
    await clearDebugViewCookies();
  } else {
    await setDebugViewCookies(target.id, target.email ?? null);
  }

  revalidatePath("/");
  redirect(redirectTo);
}

export async function clearDebugViewAction(formData: FormData): Promise<void> {
  await assertDebugManager();
  const redirectTo = formData.get("redirect_to")?.toString().trim() || (await getDebugRedirectTarget(BASE));
  await clearDebugViewCookies();
  revalidatePath("/");
  redirect(redirectTo);
}
