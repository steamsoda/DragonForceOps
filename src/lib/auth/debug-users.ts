import { createClient } from "@/lib/supabase/server";
import { listDebugPersonas } from "@/lib/auth/debug-personas";
import { summarizeRoleScopes, type RoleScope } from "@/lib/auth/role-display";

type AuthUserRow = {
  id: string;
  email: string | null;
  last_sign_in_at?: string | null;
  created_at?: string | null;
};

type UserRoleRow = {
  user_id: string;
  campus_id: string | null;
  campuses: { name: string | null } | null;
  app_roles: { code: string } | null;
};

export type DebugUserSummary = {
  id: string;
  email: string;
  lastSignInAt: string | null;
  createdAt: string | null;
  roleScopes: RoleScope[];
  roleSummary: string;
  source: "auth" | "persona";
  personaKey?: string;
};

export async function listDebuggableUsers(
  supabaseArg?: Awaited<ReturnType<typeof createClient>>
): Promise<DebugUserSummary[]> {
  const supabase = supabaseArg ?? (await createClient());
  const [{ data: authUsersRaw }, { data: roleRows }] = await Promise.all([
    supabase.rpc("list_auth_users"),
    supabase
      .from("user_roles")
      .select("user_id, campus_id, campuses(name), app_roles(code)")
      .returns<UserRoleRow[]>(),
  ]);
  const debugPersonas = await listDebugPersonas(supabase);

  const rolesByUser = new Map<string, RoleScope[]>();
  for (const row of roleRows ?? []) {
    if (!row.app_roles?.code) continue;
    const scopes = rolesByUser.get(row.user_id) ?? [];
    scopes.push({
      code: row.app_roles.code,
      campusId: row.campus_id,
      campusName: row.campuses?.name ?? null,
    });
    rolesByUser.set(row.user_id, scopes);
  }

  const authUsers: DebugUserSummary[] = ((authUsersRaw ?? []) as AuthUserRow[])
    .filter((user): user is AuthUserRow & { email: string } => Boolean(user.email))
    .map((user) => {
      const roleScopes = rolesByUser.get(user.id) ?? [];
      return {
        id: user.id,
        email: user.email,
        lastSignInAt: user.last_sign_in_at ?? null,
        createdAt: user.created_at ?? null,
        roleScopes,
        roleSummary: summarizeRoleScopes(roleScopes).join(" | ") || "Sin roles",
        source: "auth" as const,
      };
    });

  const personaUsers: DebugUserSummary[] = debugPersonas.map((persona) => ({
    id: persona.id,
    email: persona.email,
    lastSignInAt: null,
    createdAt: null,
    roleScopes: persona.roleScopes,
    roleSummary: persona.roleSummary,
    source: "persona" as const,
    personaKey: persona.personaKey,
  }));

  return [...personaUsers, ...authUsers].sort((a, b) => {
      if (a.source !== b.source) return a.source === "persona" ? -1 : 1;
      return a.email.localeCompare(b.email, "es-MX");
    });
}
