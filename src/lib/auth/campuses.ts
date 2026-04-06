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

export type OperationalCampusAccess = {
  userId: string;
  isDirector: boolean;
  isFrontDesk: boolean;
  isLegacyGlobalFrontDesk: boolean;
  campuses: AccessibleCampus[];
  campusIds: string[];
  defaultCampusId: string | null;
};

export async function getOperationalCampusAccess(): Promise<OperationalCampusAccess | null> {
  const debugContext = await getDebugViewContext();
  if (!debugContext) return null;

  const supabase = await createClient();
  const [{ data: allCampuses }] = await Promise.all([
    supabase
      .from("campuses")
      .select("id, code, name")
      .eq("is_active", true)
      .order("name")
      .returns<AccessibleCampus[]>(),
  ]);

  const rows = (debugContext.effective.roleRows as RoleCampusRow[]) ?? [];
  const roleCodes = rows.map((row) => row.app_roles?.code).filter(Boolean);
  const isDirector = roleCodes.some((code) => code === "director_admin" || code === "superadmin");
  const frontDeskRows = rows.filter((row) => row.app_roles?.code === "front_desk");
  const isFrontDesk = frontDeskRows.length > 0;
  const isLegacyGlobalFrontDesk = frontDeskRows.some((row) => row.campus_id === null);

  let campuses: AccessibleCampus[] = [];
  if (isDirector || isLegacyGlobalFrontDesk) {
    campuses = allCampuses ?? [];
  } else if (isFrontDesk) {
    const seen = new Set<string>();
    campuses = frontDeskRows
      .map((row) => row.campuses)
      .filter((campus): campus is NonNullable<RoleCampusRow["campuses"]> => Boolean(campus))
      .filter((campus) => {
        if (seen.has(campus.id)) return false;
        seen.add(campus.id);
        return true;
      })
      .map((campus) => ({ id: campus.id, code: campus.code, name: campus.name }));
  }

  const defaultCampus = chooseDefaultCampus(campuses);

  return {
    userId: debugContext.effective.id,
    isDirector,
    isFrontDesk,
    isLegacyGlobalFrontDesk,
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

