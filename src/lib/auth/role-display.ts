type RoleCode = "superadmin" | "director_admin" | "director_deportivo" | "nutritionist" | "front_desk" | "coach" | string;

export type RoleScope = {
  code: RoleCode;
  campusId: string | null;
  campusName: string | null;
};

const ROLE_LABELS: Record<string, string> = {
  superadmin: "Super Admin",
  director_admin: "Director Admin",
  director_deportivo: "Director Deportivo",
  nutritionist: "Nutricionista",
  front_desk: "Recepcion / Caja",
  coach: "Coach"
};

function roleBaseLabel(code: string) {
  return ROLE_LABELS[code] ?? code;
}

function normalizeCampusNames(roles: RoleScope[]) {
  const campusNames = Array.from(
    new Set(
      roles
        .map((role) => role.campusName?.trim())
        .filter((name): name is string => Boolean(name))
    )
  ).sort((a, b) => a.localeCompare(b, "es-MX"));

  if (roles.some((role) => !role.campusId) || campusNames.length > 1) {
    return "Todos";
  }

  return campusNames[0] ?? "Todos";
}

export function formatRoleWithCampus(role: RoleScope) {
  const scope = role.campusId ? role.campusName ?? "Sin campus" : "Todos";
  return `${roleBaseLabel(role.code)} · ${scope}`;
}

export function summarizeRoleScopes(roles: RoleScope[]) {
  const grouped = new Map<string, RoleScope[]>();

  for (const role of roles) {
    const group = grouped.get(role.code) ?? [];
    group.push(role);
    grouped.set(role.code, group);
  }

  return Array.from(grouped.entries())
    .sort((a, b) => roleBaseLabel(a[0]).localeCompare(roleBaseLabel(b[0]), "es-MX"))
    .map(([code, group]) => `${roleBaseLabel(code)} · ${normalizeCampusNames(group)}`);
}
