import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { canAccessCampus, getOperationalCampusAccess, type OperationalCampusAccess } from "@/lib/auth/campuses";
import { APP_ROLES } from "@/lib/auth/roles";

type RoleCodeRow = {
  app_roles: { code: string } | null;
};

type EnrollmentCampusRow = {
  campus_id: string;
};

export type PermissionContext = {
  supabase: Awaited<ReturnType<typeof createClient>>;
  user: { id: string; email: string | null };
  roleCodes: string[];
  campusAccess: OperationalCampusAccess | null;
  isSuperAdmin: boolean;
  isDirector: boolean;
  isFrontDesk: boolean;
  hasOperationalAccess: boolean;
};

export async function getPermissionContext(): Promise<PermissionContext | null> {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) return null;

  const [{ data: roleRows }, campusAccess] = await Promise.all([
    supabase
      .from("user_roles")
      .select("app_roles(code)")
      .eq("user_id", user.id)
      .returns<RoleCodeRow[]>(),
    getOperationalCampusAccess(),
  ]);

  const roleCodes = (roleRows ?? [])
    .map((row) => row.app_roles?.code)
    .filter((code): code is string => typeof code === "string" && code.length > 0);
  const isSuperAdmin = roleCodes.includes(APP_ROLES.SUPERADMIN);
  const isDirector = isSuperAdmin || roleCodes.includes(APP_ROLES.DIRECTOR_ADMIN);
  const isFrontDesk = roleCodes.includes(APP_ROLES.FRONT_DESK);

  return {
    supabase,
    user: { id: user.id, email: user.email ?? null },
    roleCodes,
    campusAccess,
    isSuperAdmin,
    isDirector,
    isFrontDesk,
    hasOperationalAccess: isDirector || isFrontDesk,
  };
}

export async function requireOperationalContext(redirectTo = "/unauthorized") {
  const context = await getPermissionContext();
  if (!context?.hasOperationalAccess) redirect(redirectTo);
  return context;
}

export async function requireDirectorContext(redirectTo = "/unauthorized") {
  const context = await getPermissionContext();
  if (!context?.isDirector) redirect(redirectTo);
  return context;
}

export async function requireSuperAdminContext(redirectTo = "/unauthorized") {
  const context = await getPermissionContext();
  if (!context?.isSuperAdmin) redirect(redirectTo);
  return context;
}

export async function canAccessEnrollmentRecord(
  enrollmentId: string,
  context?: PermissionContext | null
): Promise<boolean> {
  const resolvedContext = context ?? (await getPermissionContext());
  if (!resolvedContext?.hasOperationalAccess) return false;

  const { data } = await resolvedContext.supabase
    .from("enrollments")
    .select("campus_id")
    .eq("id", enrollmentId)
    .maybeSingle<EnrollmentCampusRow | null>();

  return Boolean(data?.campus_id && canAccessCampus(resolvedContext.campusAccess, data.campus_id));
}

export async function canAccessPlayerRecord(
  playerId: string,
  context?: PermissionContext | null
): Promise<boolean> {
  const resolvedContext = context ?? (await getPermissionContext());
  if (!resolvedContext?.hasOperationalAccess) return false;

  const { data } = await resolvedContext.supabase
    .from("enrollments")
    .select("campus_id")
    .eq("player_id", playerId)
    .returns<EnrollmentCampusRow[]>();

  return (data ?? []).some((row) => canAccessCampus(resolvedContext.campusAccess, row.campus_id));
}

export async function canAccessGuardianRecord(
  playerId: string,
  guardianId: string,
  context?: PermissionContext | null
): Promise<boolean> {
  const resolvedContext = context ?? (await getPermissionContext());
  if (!resolvedContext?.hasOperationalAccess) return false;

  if (!(await canAccessPlayerRecord(playerId, resolvedContext))) return false;

  const { data } = await resolvedContext.supabase
    .from("player_guardians")
    .select("guardian_id")
    .eq("player_id", playerId)
    .eq("guardian_id", guardianId)
    .maybeSingle<{ guardian_id: string } | null>();

  return Boolean(data?.guardian_id);
}
