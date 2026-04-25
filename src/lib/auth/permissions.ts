import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  canAccessCampus,
  canAccessAttendanceCampus,
  canAccessNutritionCampus,
  getAttendanceCampusAccess,
  getNutritionCampusAccess,
  getOperationalCampusAccess,
  type AttendanceCampusAccess,
  type NutritionCampusAccess,
  type OperationalCampusAccess
} from "@/lib/auth/campuses";
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
  nutritionCampusAccess: NutritionCampusAccess | null;
  attendanceCampusAccess: AttendanceCampusAccess | null;
  isSuperAdmin: boolean;
  isDirector: boolean;
  isSportsDirector: boolean;
  isNutritionist: boolean;
  isAttendanceAdmin: boolean;
  isFrontDesk: boolean;
  hasOperationalAccess: boolean;
  hasSportsAccess: boolean;
  hasNutritionAccess: boolean;
  hasAttendanceReadAccess: boolean;
  hasAttendanceWriteAccess: boolean;
};

export async function getPermissionContext(): Promise<PermissionContext | null> {
  const debugContext = await getDebugViewContext();
  if (!debugContext) return null;

  const supabase = await createClient();
  const [campusAccess, nutritionCampusAccess, attendanceCampusAccess] = await Promise.all([
    getOperationalCampusAccess(),
    getNutritionCampusAccess(),
    getAttendanceCampusAccess(),
  ]);
  const roleCodes = debugContext.effective.roleCodes;
  const isSuperAdmin = roleCodes.includes(APP_ROLES.SUPERADMIN);
  const isDirector = isSuperAdmin || roleCodes.includes(APP_ROLES.DIRECTOR_ADMIN);
  const isSportsDirector = isDirector || roleCodes.includes(APP_ROLES.DIRECTOR_DEPORTIVO);
  const isNutritionist = roleCodes.includes(APP_ROLES.NUTRITIONIST);
  const isAttendanceAdmin = roleCodes.includes(APP_ROLES.ATTENDANCE_ADMIN);
  const isFrontDesk = roleCodes.includes(APP_ROLES.FRONT_DESK);

  return {
    supabase,
    user: { id: debugContext.effective.id, email: debugContext.effective.email ?? null },
    roleCodes,
    campusAccess,
    nutritionCampusAccess,
    attendanceCampusAccess,
    isSuperAdmin,
    isDirector,
    isSportsDirector,
    isNutritionist,
    isAttendanceAdmin,
    isFrontDesk,
    hasOperationalAccess: isDirector || isFrontDesk,
    hasSportsAccess: isSportsDirector,
    hasNutritionAccess: isDirector || isNutritionist,
    hasAttendanceReadAccess: isDirector || isSportsDirector || isAttendanceAdmin || isFrontDesk,
    hasAttendanceWriteAccess: isDirector || isSportsDirector || isAttendanceAdmin,
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

export async function requireNutritionContext(redirectTo = "/unauthorized") {
  const context = await getPermissionContext();
  if (!context?.hasNutritionAccess) redirect(redirectTo);
  return context;
}

export async function requireAttendanceReadContext(redirectTo = "/unauthorized") {
  const context = await getPermissionContext();
  if (!context?.hasAttendanceReadAccess) redirect(redirectTo);
  return context;
}

export async function requireAttendanceWriteContext(redirectTo = "/unauthorized") {
  const context = await getPermissionContext();
  if (!context?.hasAttendanceWriteAccess) redirect(redirectTo);
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

export async function canAccessNutritionPlayerRecord(
  playerId: string,
  context?: PermissionContext | null
): Promise<boolean> {
  const resolvedContext = context ?? (await getPermissionContext());
  if (!resolvedContext?.hasNutritionAccess) return false;

  const { data } = await resolvedContext.supabase
    .from("enrollments")
    .select("campus_id")
    .eq("player_id", playerId)
    .returns<EnrollmentCampusRow[]>();

  return (data ?? []).some((row) => canAccessNutritionCampus(resolvedContext.nutritionCampusAccess, row.campus_id));
}

export async function canAccessAttendancePlayerRecord(
  playerId: string,
  context?: PermissionContext | null
): Promise<boolean> {
  const resolvedContext = context ?? (await getPermissionContext());
  if (!resolvedContext?.hasAttendanceReadAccess) return false;

  const { data } = await resolvedContext.supabase
    .from("enrollments")
    .select("campus_id")
    .eq("player_id", playerId)
    .returns<EnrollmentCampusRow[]>();

  return (data ?? []).some((row) => canAccessAttendanceCampus(resolvedContext.attendanceCampusAccess, row.campus_id));
}
