import { createClient } from "@/lib/supabase/server";
import { APP_ROLES } from "@/lib/auth/roles";
import { summarizeRoleScopes, type RoleScope } from "@/lib/auth/role-display";

type CampusRow = {
  id: string;
  code: string;
  name: string;
};

type PersonaCampusTarget = "all" | "linda_vista" | "contry";

type DebugPersonaSpec = {
  key: string;
  email: string;
  roleCode: string;
  campusTarget: PersonaCampusTarget;
};

type DebugRoleRow = {
  campus_id: string | null;
  campuses: {
    id: string | null;
    name: string | null;
    code: string | null;
  } | null;
  app_roles: {
    code: string;
  } | null;
};

export type DebugPersonaSummary = {
  id: string;
  email: string;
  roleScopes: RoleScope[];
  roleSummary: string;
  source: "persona";
  personaKey: string;
};

const DEBUG_PERSONA_PREFIX = "debug-persona:";

const PERSONAS: DebugPersonaSpec[] = [
  {
    key: "sports-lindavista",
    email: "director.deportivo.lindavista.debug@preview",
    roleCode: APP_ROLES.DIRECTOR_DEPORTIVO,
    campusTarget: "all",
  },
  {
    key: "sports-contry",
    email: "director.deportivo.contry.debug@preview",
    roleCode: APP_ROLES.DIRECTOR_DEPORTIVO,
    campusTarget: "contry",
  },
  {
    key: "frontdesk-contry",
    email: "recepcion.contry.debug@preview",
    roleCode: APP_ROLES.FRONT_DESK,
    campusTarget: "contry",
  },
  {
    key: "frontdesk-lindavista",
    email: "recepcion.lindavista.debug@preview",
    roleCode: APP_ROLES.FRONT_DESK,
    campusTarget: "linda_vista",
  },
  {
    key: "frontdesk-hub",
    email: "recepcion.hub.debug@preview",
    roleCode: APP_ROLES.FRONT_DESK,
    campusTarget: "all",
  },
  {
    key: "nutrition-lindavista",
    email: "nutricion.lindavista.debug@preview",
    roleCode: APP_ROLES.NUTRITIONIST,
    campusTarget: "linda_vista",
  },
  {
    key: "nutrition-contry",
    email: "nutricion.contry.debug@preview",
    roleCode: APP_ROLES.NUTRITIONIST,
    campusTarget: "contry",
  },
  {
    key: "fieldadmin-lindavista",
    email: "admin.campo.lindavista.debug@preview",
    roleCode: APP_ROLES.ATTENDANCE_ADMIN,
    campusTarget: "linda_vista",
  },
  {
    key: "fieldadmin-contry",
    email: "admin.campo.contry.debug@preview",
    roleCode: APP_ROLES.ATTENDANCE_ADMIN,
    campusTarget: "contry",
  },
  {
    key: "director",
    email: "director.debug@preview",
    roleCode: APP_ROLES.DIRECTOR_ADMIN,
    campusTarget: "all",
  },
];

function normalizeText(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function personaId(key: string) {
  return `${DEBUG_PERSONA_PREFIX}${key}`;
}

function resolvePersonaCampuses(target: PersonaCampusTarget, campuses: CampusRow[]) {
  if (target === "all") return campuses;

  const matcher = target === "contry" ? "contry" : "linda";
  return campuses.filter((campus) => {
    const normalized = `${normalizeText(campus.code)} ${normalizeText(campus.name)}`;
    return normalized.includes(matcher);
  });
}

function buildRoleRows(spec: DebugPersonaSpec, campuses: CampusRow[]): DebugRoleRow[] {
  if (spec.roleCode === APP_ROLES.DIRECTOR_ADMIN) {
    return [
      {
        campus_id: null,
        campuses: null,
        app_roles: { code: spec.roleCode },
      },
    ];
  }

  if (spec.roleCode === APP_ROLES.DIRECTOR_DEPORTIVO) {
    return resolvePersonaCampuses(spec.campusTarget, campuses).map((campus) => ({
      campus_id: campus.id,
      campuses: {
        id: campus.id,
        name: campus.name,
        code: campus.code,
      },
      app_roles: { code: spec.roleCode },
    }));
  }

  return resolvePersonaCampuses(spec.campusTarget, campuses).map((campus) => ({
    campus_id: campus.id,
    campuses: {
      id: campus.id,
      name: campus.name,
      code: campus.code,
    },
    app_roles: { code: spec.roleCode },
  }));
}

async function loadActiveCampuses(supabaseArg?: Awaited<ReturnType<typeof createClient>>) {
  const supabase = supabaseArg ?? (await createClient());
  const { data } = await supabase
    .from("campuses")
    .select("id, code, name")
    .eq("is_active", true)
    .order("name")
    .returns<CampusRow[]>();

  return data ?? [];
}

function roleScopesFromRows(rows: DebugRoleRow[]): RoleScope[] {
  return rows
    .filter((row): row is DebugRoleRow & { app_roles: { code: string } } => Boolean(row.app_roles?.code))
    .map((row) => ({
      code: row.app_roles.code,
      campusId: row.campus_id,
      campusName: row.campuses?.name ?? null,
    }));
}

export function isDebugPersonaId(userId: string | null | undefined) {
  return typeof userId === "string" && userId.startsWith(DEBUG_PERSONA_PREFIX);
}

export async function resolveDebugPersona(
  userId: string,
  supabaseArg?: Awaited<ReturnType<typeof createClient>>
): Promise<{ id: string; email: string; roleRows: DebugRoleRow[] } | null> {
  if (!isDebugPersonaId(userId)) return null;

  const key = userId.slice(DEBUG_PERSONA_PREFIX.length);
  const spec = PERSONAS.find((candidate) => candidate.key === key);
  if (!spec) return null;

  const campuses = await loadActiveCampuses(supabaseArg);
  return {
    id: personaId(spec.key),
    email: spec.email,
    roleRows: buildRoleRows(spec, campuses),
  };
}

export async function listDebugPersonas(
  supabaseArg?: Awaited<ReturnType<typeof createClient>>
): Promise<DebugPersonaSummary[]> {
  const campuses = await loadActiveCampuses(supabaseArg);

  return PERSONAS.map((spec) => {
    const roleRows = buildRoleRows(spec, campuses);
    const roleScopes = roleScopesFromRows(roleRows);
    return {
      id: personaId(spec.key),
      email: spec.email,
      roleScopes,
      roleSummary: summarizeRoleScopes(roleScopes).join(" | ") || "Sin roles",
      source: "persona" as const,
      personaKey: spec.key,
    };
  });
}
