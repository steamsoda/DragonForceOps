import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { APP_ROLES } from "@/lib/auth/roles";
import type { RoleScope } from "@/lib/auth/role-display";

const DEBUG_VIEW_USER_ID_COOKIE = "debug-view-user-id";
const DEBUG_VIEW_USER_EMAIL_COOKIE = "debug-view-user-email";

type RoleRow = {
  campus_id: string | null;
  campuses: {
    name: string | null;
    code: string | null;
  } | null;
  app_roles: {
    code: string;
  } | null;
};

export type DebugResolvedUser = {
  id: string;
  email: string | null;
  roleRows: RoleRow[];
  roleCodes: string[];
  roleScopes: RoleScope[];
  isSuperAdmin: boolean;
  isDirector: boolean;
  isFrontDesk: boolean;
};

export type DebugViewContext = {
  enabled: boolean;
  canManage: boolean;
  actor: DebugResolvedUser;
  effective: DebugResolvedUser;
  activeView: { userId: string; email: string | null } | null;
  isReadOnly: boolean;
};

function isNonEmptyString(value: string | null | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function isPreviewDebugEnabled() {
  return process.env.VERCEL_ENV === "preview" || process.env.NODE_ENV === "development";
}

async function loadRoleRows(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string
): Promise<RoleRow[]> {
  const { data } = await supabase
    .from("user_roles")
    .select("campus_id, campuses(name, code), app_roles(code)")
    .eq("user_id", userId)
    .returns<RoleRow[]>();

  return data ?? [];
}

function buildResolvedUser(userId: string, email: string | null, roleRows: RoleRow[]): DebugResolvedUser {
  const roleCodes = roleRows
    .map((row) => row.app_roles?.code)
    .filter((code): code is string => isNonEmptyString(code));
  const roleScopes: RoleScope[] = roleRows
    .filter((row): row is RoleRow & { app_roles: { code: string } } => Boolean(row.app_roles?.code))
    .map((row) => ({
      code: row.app_roles.code,
      campusId: row.campus_id,
      campusName: row.campuses?.name ?? null,
    }));

  return {
    id: userId,
    email,
    roleRows,
    roleCodes,
    roleScopes,
    isSuperAdmin: roleCodes.includes(APP_ROLES.SUPERADMIN),
    isDirector:
      roleCodes.includes(APP_ROLES.SUPERADMIN) || roleCodes.includes(APP_ROLES.DIRECTOR_ADMIN),
    isFrontDesk: roleCodes.includes(APP_ROLES.FRONT_DESK),
  };
}

export async function getDebugViewContext(): Promise<DebugViewContext | null> {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) return null;

  const actorRoleRows = await loadRoleRows(supabase, user.id);
  const actor = buildResolvedUser(user.id, user.email ?? null, actorRoleRows);
  const enabled = isPreviewDebugEnabled();
  const canManage = enabled && actor.isSuperAdmin;

  let activeView: DebugViewContext["activeView"] = null;
  let effective = actor;

  if (canManage) {
    const cookieStore = await cookies();
    const targetUserId = cookieStore.get(DEBUG_VIEW_USER_ID_COOKIE)?.value ?? null;
    const targetUserEmail = cookieStore.get(DEBUG_VIEW_USER_EMAIL_COOKIE)?.value ?? null;

    if (isNonEmptyString(targetUserId) && targetUserId !== actor.id) {
      const targetRoleRows = await loadRoleRows(supabase, targetUserId);
      activeView = { userId: targetUserId, email: targetUserEmail };
      effective = buildResolvedUser(targetUserId, targetUserEmail, targetRoleRows);
    }
  }

  return {
    enabled,
    canManage,
    actor,
    effective,
    activeView,
    isReadOnly: activeView !== null,
  };
}

function withErrorParam(path: string, errorCode: string) {
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}err=${encodeURIComponent(errorCode)}`;
}

export async function isDebugWriteBlocked() {
  const context = await getDebugViewContext();
  return Boolean(context?.isReadOnly);
}

export async function assertDebugWritesAllowed(redirectTo?: string) {
  const blocked = await isDebugWriteBlocked();
  if (!blocked) return;
  if (redirectTo) redirect(withErrorParam(redirectTo, "debug_read_only"));
  throw new Error("debug_read_only");
}

export async function clearDebugViewCookies() {
  const cookieStore = await cookies();
  cookieStore.delete(DEBUG_VIEW_USER_ID_COOKIE);
  cookieStore.delete(DEBUG_VIEW_USER_EMAIL_COOKIE);
}

export async function setDebugViewCookies(userId: string, email: string | null) {
  const cookieStore = await cookies();
  const secure = process.env.NODE_ENV !== "development";
  cookieStore.set(DEBUG_VIEW_USER_ID_COOKIE, userId, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
  });
  cookieStore.set(DEBUG_VIEW_USER_EMAIL_COOKIE, email ?? "", {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
  });
}

export async function getDebugRedirectTarget(fallback = "/dashboard") {
  const headerList = await headers();
  const referer = headerList.get("referer");
  if (!referer) return fallback;

  try {
    const url = new URL(referer);
    return `${url.pathname}${url.search}`;
  } catch {
    return fallback;
  }
}
