import { APP_ROLES } from "@/lib/auth/roles";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSupabaseServiceRoleDiagnostics } from "@/lib/supabase/env";

const KEY_USER_EMAILS = [
  "javierg@dragonforcemty.com",
  "julioc@dragonforcemty.com",
  "sebastiang@dragonforcemty.com",
  "denisseo@dragonforcemty.com",
  "patyg@dragonforcemty.com",
  "lorenar@dragonforcemty.com",
  "marcelog@dragonforcemty.com",
] as const;

type CampusRow = {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
};

type UserRoleRow = {
  user_id: string;
  campus_id: string | null;
  campuses: { id: string; code: string; name: string } | null;
  app_roles: { code: string } | null;
};

type AuthUser = {
  id: string;
  email: string | undefined;
  last_sign_in_at?: string | null;
  created_at?: string | null;
};

type AccessCampus = {
  id: string;
  code: string;
  name: string;
};

function sortCampuses(campuses: AccessCampus[]) {
  return [...campuses].sort((a, b) => a.name.localeCompare(b.name, "es-MX"));
}

function dedupeCampuses(campuses: AccessCampus[]) {
  const seen = new Set<string>();
  return campuses.filter((campus) => {
    if (seen.has(campus.id)) return false;
    seen.add(campus.id);
    return true;
  });
}

function resolveScopedCampuses(rows: UserRoleRow[], allCampuses: AccessCampus[]) {
  const joined = rows
    .map((row) => row.campuses)
    .filter((campus): campus is NonNullable<UserRoleRow["campuses"]> => Boolean(campus))
    .map((campus) => ({ id: campus.id, code: campus.code, name: campus.name }));

  if (joined.length > 0) return sortCampuses(dedupeCampuses(joined));

  const campusIds = new Set(rows.map((row) => row.campus_id).filter((id): id is string => Boolean(id)));
  return sortCampuses(allCampuses.filter((campus) => campusIds.has(campus.id)));
}

function formatCampuses(campuses: AccessCampus[]) {
  if (campuses.length === 0) return "Sin campus";
  return campuses.map((campus) => campus.name).join(", ");
}

function resolveUserAccess(rows: UserRoleRow[], activeCampuses: AccessCampus[]) {
  const roleCodes = rows.map((row) => row.app_roles?.code).filter((code): code is string => Boolean(code));
  const isSuperAdmin = roleCodes.includes(APP_ROLES.SUPERADMIN);
  const isDirector = isSuperAdmin || roleCodes.includes(APP_ROLES.DIRECTOR_ADMIN);
  const frontDeskRows = rows.filter((row) => row.app_roles?.code === APP_ROLES.FRONT_DESK);
  const sportsRows = rows.filter((row) => row.app_roles?.code === APP_ROLES.DIRECTOR_DEPORTIVO);
  const nutritionRows = rows.filter((row) => row.app_roles?.code === APP_ROLES.NUTRITIONIST);

  const hasGlobalFrontDesk = frontDeskRows.some((row) => row.campus_id === null);
  const hasGlobalSports = sportsRows.some((row) => row.campus_id === null);
  const hasGlobalNutrition = nutritionRows.some((row) => row.campus_id === null);

  const operationalCampuses =
    isDirector || hasGlobalFrontDesk || hasGlobalSports
      ? activeCampuses
      : resolveScopedCampuses([...frontDeskRows, ...sportsRows], activeCampuses);

  const nutritionCampuses =
    isDirector || hasGlobalNutrition
      ? activeCampuses
      : resolveScopedCampuses(nutritionRows, activeCampuses);

  const hasOperationalAccess = isDirector || frontDeskRows.length > 0;
  const hasSportsAccess = isDirector || sportsRows.length > 0;
  const hasNutritionAccess = isDirector || nutritionRows.length > 0;

  return {
    roleCodes,
    isSuperAdmin,
    isDirector,
    hasOperationalAccess,
    hasSportsAccess,
    hasNutritionAccess,
    operationalCampuses,
    nutritionCampuses,
    checks: {
      caja: hasOperationalAccess && operationalCampuses.length > 0,
      sports: hasSportsAccess && operationalCampuses.length > 0,
      nutrition: hasNutritionAccess && nutritionCampuses.length > 0,
      director: isDirector,
    },
  };
}

export async function getAccessAuditSnapshot() {
  const admin = createAdminClient();
  const envDiagnostics = getSupabaseServiceRoleDiagnostics(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  const envMatch = Boolean(
    envDiagnostics.urlProjectRef &&
      envDiagnostics.serviceRoleJwtRef &&
      envDiagnostics.urlProjectRef === envDiagnostics.serviceRoleJwtRef
  );

  const [{ data: campusRows }, { data: roleRows }, usersResponse] = await Promise.all([
    admin
      .from("campuses")
      .select("id, code, name, is_active")
      .eq("is_active", true)
      .order("name")
      .returns<CampusRow[]>(),
    admin
      .from("user_roles")
      .select("user_id, campus_id, campuses(id, code, name), app_roles(code)")
      .returns<UserRoleRow[]>(),
    admin.auth.admin.listUsers({ page: 1, perPage: 200 }),
  ]);

  const activeCampuses = sortCampuses(
    (campusRows ?? []).map((campus) => ({ id: campus.id, code: campus.code, name: campus.name }))
  );
  const rolesByUser = new Map<string, UserRoleRow[]>();
  for (const row of roleRows ?? []) {
    rolesByUser.set(row.user_id, [...(rolesByUser.get(row.user_id) ?? []), row]);
  }

  const authUsers = (usersResponse.data.users ?? []) as AuthUser[];
  const usersByEmail = new Map(
    authUsers
      .filter((user): user is AuthUser & { email: string } => Boolean(user.email))
      .map((user) => [user.email.toLowerCase(), user])
  );

  const users = KEY_USER_EMAILS.map((email) => {
    const user = usersByEmail.get(email.toLowerCase()) ?? null;
    const rows = user ? rolesByUser.get(user.id) ?? [] : [];
    const access = resolveUserAccess(rows, activeCampuses);

    return {
      email,
      userId: user?.id ?? null,
      exists: Boolean(user),
      lastSignInAt: user?.last_sign_in_at ?? null,
      roles: rows.map((row) => ({
        code: row.app_roles?.code ?? "unknown",
        campusId: row.campus_id,
        campusName: row.campuses?.name ?? null,
      })),
      roleCodes: access.roleCodes,
      operationalCampuses: access.operationalCampuses,
      nutritionCampuses: access.nutritionCampuses,
      operationalCampusLabel: formatCampuses(access.operationalCampuses),
      nutritionCampusLabel: formatCampuses(access.nutritionCampuses),
      checks: access.checks,
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    env: {
      diagnostics: envDiagnostics,
      match: envMatch,
    },
    activeCampuses,
    users,
  };
}
