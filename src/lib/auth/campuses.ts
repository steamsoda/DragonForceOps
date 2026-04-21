import { tryCreateAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getDebugViewContext } from "@/lib/auth/debug-view";

export type AccessibleCampus = {
  id: string;
  code: string;
  name: string;
};

export function isContryCampus(campus: { code: string; name: string }) {
  const normalized = `${campus.code} ${campus.name}`.toLowerCase();
  return normalized.includes("contry") || normalized.includes("ctr");
}

export function findContryCampus<T extends { code: string; name: string }>(campuses: T[]) {
  return campuses.find(isContryCampus);
}

type RoleCampusRow = {
  campus_id: string | null;
  app_roles: { code: string } | null;
  campuses: { id: string; code: string; name: string } | null;
};

function rankDefaultCampus(campus: AccessibleCampus) {
  const normalized = `${campus.code} ${campus.name}`.toLowerCase();
  if (normalized.includes("linda") || normalized.includes("lv")) return 0;
  return 1;
}

function chooseDefaultCampus(campuses: AccessibleCampus[]) {
  if (campuses.length === 0) return null;
  return [...campuses].sort((a, b) => {
    const rankDiff = rankDefaultCampus(a) - rankDefaultCampus(b);
    if (rankDiff !== 0) return rankDiff;
    return a.name.localeCompare(b.name, "es-MX");
  })[0];
}

async function loadAllCampuses() {
  const supabase = await createClient();
  const admin = tryCreateAdminClient();

  const primary = await supabase
    .from("campuses")
    .select("id, code, name")
    .eq("is_active", true)
    .order("name")
    .returns<AccessibleCampus[]>();

  if (!primary.error && (primary.data?.length ?? 0) > 0) {
    return primary.data ?? [];
  }

  if (!admin) {
    return primary.data ?? [];
  }

  const fallback = await admin
    .from("campuses")
    .select("id, code, name")
    .eq("is_active", true)
    .order("name")
    .returns<AccessibleCampus[]>();

  if (fallback.error) {
    console.error("campus bootstrap fallback failed", fallback.error);
    return primary.data ?? [];
  }

  return fallback.data ?? primary.data ?? [];
}

export type OperationalCampusAccess = {
  userId: string;
  isDirector: boolean;
  isSportsDirector: boolean;
  isGlobalSportsDirector: boolean;
  isFrontDesk: boolean;
  isLegacyGlobalFrontDesk: boolean;
  campuses: AccessibleCampus[];
  campusIds: string[];
  defaultCampusId: string | null;
};

export type NutritionCampusAccess = {
  userId: string;
  isDirector: boolean;
  isNutritionist: boolean;
  isGlobalNutritionist: boolean;
  campuses: AccessibleCampus[];
  campusIds: string[];
  defaultCampusId: string | null;
};

export async function getOperationalCampusAccess(): Promise<OperationalCampusAccess | null> {
  const debugContext = await getDebugViewContext();
  if (!debugContext) return null;

  const allCampuses = await loadAllCampuses();

  const rows = (debugContext.effective.roleRows as RoleCampusRow[]) ?? [];
  const roleCodes = rows.map((row) => row.app_roles?.code).filter(Boolean);
  const isDirector = roleCodes.some((code) => code === "director_admin" || code === "superadmin");
  const sportsDirectorRows = rows.filter((row) => row.app_roles?.code === "director_deportivo");
  const isSportsDirector = sportsDirectorRows.length > 0;
  const isGlobalSportsDirector = sportsDirectorRows.some((row) => row.campus_id === null);
  const frontDeskRows = rows.filter((row) => row.app_roles?.code === "front_desk");
  const isFrontDesk = frontDeskRows.length > 0;
  const isLegacyGlobalFrontDesk = frontDeskRows.some((row) => row.campus_id === null);

  let campuses: AccessibleCampus[] = [];
  if (isDirector || isLegacyGlobalFrontDesk || isGlobalSportsDirector) {
    campuses = allCampuses ?? [];
  } else if (isFrontDesk || isSportsDirector) {
    const seen = new Set<string>();
    campuses = [...frontDeskRows, ...sportsDirectorRows]
      .map((row) => row.campuses)
      .filter((campus): campus is NonNullable<RoleCampusRow["campuses"]> => Boolean(campus))
      .filter((campus) => {
        if (seen.has(campus.id)) return false;
        seen.add(campus.id);
        return true;
      })
      .map((campus) => ({ id: campus.id, code: campus.code, name: campus.name }));

    // Fallback: nested campuses join can return null if RLS timing delays policy evaluation.
    // Reconstruct from the campus_id column (always returned) + allCampuses.
    if (campuses.length === 0) {
      const campusIdSet = new Set(
        [...frontDeskRows, ...sportsDirectorRows]
          .map((row) => row.campus_id)
          .filter((id): id is string => Boolean(id))
      );
      campuses = allCampuses.filter((c) => campusIdSet.has(c.id));
    }
  }

  const defaultCampus = chooseDefaultCampus(campuses);

  return {
    userId: debugContext.effective.id,
    isDirector,
    isSportsDirector,
    isGlobalSportsDirector,
    isFrontDesk,
    isLegacyGlobalFrontDesk,
    campuses,
    campusIds: campuses.map((campus) => campus.id),
    defaultCampusId: defaultCampus?.id ?? null,
  };
}

export async function getNutritionCampusAccess(): Promise<NutritionCampusAccess | null> {
  const debugContext = await getDebugViewContext();
  if (!debugContext) return null;

  const allCampuses = await loadAllCampuses();

  const rows = (debugContext.effective.roleRows as RoleCampusRow[]) ?? [];
  const roleCodes = rows.map((row) => row.app_roles?.code).filter(Boolean);
  const isDirector = roleCodes.some((code) => code === "director_admin" || code === "superadmin");
  const nutritionRows = rows.filter((row) => row.app_roles?.code === "nutritionist");
  const isNutritionist = nutritionRows.length > 0;
  const isGlobalNutritionist = nutritionRows.some((row) => row.campus_id === null);

  let campuses: AccessibleCampus[] = [];
  if (isDirector || isGlobalNutritionist) {
    campuses = allCampuses ?? [];
  } else if (isNutritionist) {
    const seen = new Set<string>();
    campuses = nutritionRows
      .map((row) => row.campuses)
      .filter((campus): campus is NonNullable<RoleCampusRow["campuses"]> => Boolean(campus))
      .filter((campus) => {
        if (seen.has(campus.id)) return false;
        seen.add(campus.id);
        return true;
      })
      .map((campus) => ({ id: campus.id, code: campus.code, name: campus.name }));

    if (campuses.length === 0) {
      const campusIdSet = new Set(
        nutritionRows
          .map((row) => row.campus_id)
          .filter((id): id is string => Boolean(id))
      );
      campuses = allCampuses.filter((c) => campusIdSet.has(c.id));
    }
  }

  const defaultCampus = chooseDefaultCampus(campuses);

  return {
    userId: debugContext.effective.id,
    isDirector,
    isNutritionist,
    isGlobalNutritionist,
    campuses,
    campusIds: campuses.map((campus) => campus.id),
    defaultCampusId: defaultCampus?.id ?? null,
  };
}

export function canAccessCampus(access: OperationalCampusAccess | null, campusId: string | null | undefined) {
  if (!access || !campusId) return false;
  if (access.isDirector || access.isLegacyGlobalFrontDesk) return true;
  return access.campusIds.includes(campusId);
}

export function canAccessNutritionCampus(access: NutritionCampusAccess | null, campusId: string | null | undefined) {
  if (!access || !campusId) return false;
  if (access.isDirector || access.isGlobalNutritionist) return true;
  return access.campusIds.includes(campusId);
}

