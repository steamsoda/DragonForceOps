import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { canAccessCampus, getOperationalCampusAccess, type OperationalCampusAccess } from "@/lib/auth/campuses";
import { getDebugViewContext } from "@/lib/auth/debug-view";
import { APP_ROLES } from "@/lib/auth/roles";

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
  isSportsDirector: boolean;
  isFrontDesk: boolean;
  hasOperationalAccess: boolean;
  hasSportsAccess: boolean;
};

export async function getPermissionContext(): Promise<PermissionContext | null> {
  const debugContext = await getDebugViewContext();
  if (!debugContext) return null;

  const supabase = await createClient();
  const campusAccess = await getOperationalCampusAccess();
  const roleCodes = debugContext.effective.roleCodes;
  const isSuperAdmin = roleCodes.includes(APP_ROLES.SUPERADMIN);
  const isDirector = isSuperAdmin || roleCodes.includes(APP_ROLES.DIRECTOR_ADMIN);
  const isSportsDirector = isDirector || roleCodes.includes(APP_ROLES.DIRECTOR_DEPORTIVO);
  const isFrontDesk = roleCodes.includes(APP_ROLES.FRONT_DESK);

  return {
    supabase,
    user: { id: debugContext.effective.id, email: debugContext.effective.email ?? null },
    roleCodes,
    campusAccess,
    isSuperAdmin,
    isDirector,
    isSportsDirector,
    isFrontDesk,
    hasOperationalAccess: isDirector || isFrontDesk,
    hasSportsAccess: isSportsDirector,
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

export async function requireSportsDirectorContext(redirectTo = "/unauthorized") {
  const context = await getPermissionContext();
  if (!context?.hasSportsAccess) redirect(redirectTo);
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
