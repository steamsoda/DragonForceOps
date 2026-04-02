import { redirect } from "next/navigation";
import { PageShell } from "@/components/ui/page-shell";
import { requireSuperAdminContext } from "@/lib/auth/permissions";
import { formatRoleWithCampus } from "@/lib/auth/role-display";
import { createClient } from "@/lib/supabase/server";
import { grantRoleAction, revokeRoleAction } from "@/server/actions/users";

const ALL_ROLES = [
  { code: "superadmin", label: "Super Admin" },
  { code: "director_admin", label: "Director Admin" },
  { code: "front_desk", label: "Recepcion / Caja" },
  { code: "coach", label: "Coach" }
] as const;

const ERROR_MESSAGES: Record<string, string> = {
  invalid_form: "Datos invalidos.",
  role_not_found: "Rol no encontrado.",
  grant_failed: "No se pudo asignar el rol.",
  revoke_failed: "No se pudo revocar el rol."
};

type AuthUserRow = { id: string; email: string | null; last_sign_in_at: string | null; created_at: string | null };
type CampusRow = { id: string; name: string; code: string };
type UserRoleRow = {
  user_id: string;
  campus_id: string | null;
  campuses: { name: string | null; code: string | null } | null;
  app_roles: { code: string } | null;
};
type RoleAssignment = {
  code: string;
  campusId: string | null;
  campusName: string | null;
};
type SearchParams = Promise<{ ok?: string; err?: string }>;

export default async function UsersAdminPage({ searchParams }: { searchParams: SearchParams }) {
  await requireSuperAdminContext("/unauthorized");
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) redirect("/");

  const [{ data: authUsersRaw, error: usersError }, { data: allRoleRows }, { data: campuses }] = await Promise.all([
    supabase.rpc("list_auth_users"),
    supabase
      .from("user_roles")
      .select("user_id, campus_id, campuses(name, code), app_roles(code)")
      .returns<UserRoleRow[]>(),
    supabase
      .from("campuses")
      .select("id, name, code")
      .eq("is_active", true)
      .order("name")
      .returns<CampusRow[]>()
  ]);

  const authUsers = (authUsersRaw ?? []) as AuthUserRow[];
  const rolesByUser: Record<string, RoleAssignment[]> = {};

  for (const row of allRoleRows ?? []) {
    if (!row.app_roles?.code) continue;

    (rolesByUser[row.user_id] ??= []).push({
      code: row.app_roles.code,
      campusId: row.campus_id,
      campusName: row.campuses?.name ?? null
    });
  }

  const pendingUsers = authUsers.filter((authUser) => !rolesByUser[authUser.id]?.length);
  const activeUsers = authUsers.filter((authUser) => rolesByUser[authUser.id]?.length);

  const query = await searchParams;
  const successMessage = query.ok === "granted" ? "Rol asignado." : query.ok === "revoked" ? "Rol revocado." : null;
  const errorMessage = query.err ? ERROR_MESSAGES[query.err] ?? "Error desconocido." : null;

  function formatDate(value: string | null) {
    if (!value) return "Nunca";
    return new Intl.DateTimeFormat("es-MX", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
  }

  function RoleBadges({ userId, roles }: { userId: string; roles: RoleAssignment[] }) {
    return (
      <div className="flex flex-wrap gap-1">
        {roles.map((role) => (
          <form key={`${role.code}-${role.campusId ?? "all"}`} action={revokeRoleAction}>
            <input type="hidden" name="user_id" value={userId} />
            <input type="hidden" name="role_code" value={role.code} />
            {role.campusId ? <input type="hidden" name="campus_id" value={role.campusId} /> : null}
            <button
              type="submit"
              title="Revocar"
              className="inline-flex items-center gap-1 rounded-full bg-portoBlue/10 px-2 py-0.5 text-xs font-medium text-portoDark transition-colors hover:bg-rose-100 hover:text-rose-700 dark:text-portoBlue dark:hover:bg-rose-900/30 dark:hover:text-rose-400"
            >
              {formatRoleWithCampus(role)}
              <span className="opacity-60">x</span>
            </button>
          </form>
        ))}
      </div>
    );
  }

  function GrantForm({ userId, existingRoles }: { userId: string; existingRoles: RoleAssignment[] }) {
    const existingKeys = new Set(existingRoles.map((role) => `${role.code}:${role.campusId ?? ""}`));
    const hasAssignableRoles =
      ALL_ROLES.some((role) => role.code !== "front_desk" && !existingKeys.has(`${role.code}:`)) ||
      (campuses ?? []).some((campus) => !existingKeys.has(`front_desk:${campus.id}`));

    if (!hasAssignableRoles) return null;

    return (
      <form action={grantRoleAction} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="user_id" value={userId} />
        <select
          name="role_code"
          className="rounded border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-600 dark:bg-slate-800"
        >
          {ALL_ROLES.filter(
            (role) => role.code !== "front_desk" || (campuses ?? []).some((campus) => !existingKeys.has(`front_desk:${campus.id}`))
          ).map((role) => (
            <option key={role.code} value={role.code}>
              {role.label}
            </option>
          ))}
        </select>
        <select
          name="campus_id"
          defaultValue=""
          className="rounded border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-600 dark:bg-slate-800"
        >
          <option value="">Sin campus</option>
          {(campuses ?? []).map((campus) => (
            <option key={campus.id} value={campus.id}>
              {campus.name}
            </option>
          ))}
        </select>
        <button type="submit" className="rounded bg-portoBlue px-2 py-1 text-xs font-medium text-white hover:bg-portoDark">
          Asignar
        </button>
        <p className="text-[11px] text-slate-400">Para Recepcion / Caja el campus es obligatorio.</p>
      </form>
    );
  }

  return (
    <PageShell title="Usuarios y Permisos" subtitle="Gestiona el acceso del personal">
      <div className="space-y-6">
        {successMessage ? (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
            {successMessage}
          </div>
        ) : null}

        {errorMessage ? (
          <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-300">
            {errorMessage}
          </div>
        ) : null}

        {usersError ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Error al cargar usuarios: {usersError.message}
          </div>
        ) : null}

        {pendingUsers.length > 0 ? (
          <section className="space-y-2">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Esperando acceso
              <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-400">
                {pendingUsers.length}
              </span>
            </h2>
            <div className="overflow-x-auto rounded-md border border-amber-200 dark:border-amber-800">
              <table className="min-w-full divide-y divide-amber-100 text-sm dark:divide-amber-900">
                <thead className="bg-amber-50 text-left text-xs uppercase tracking-wide text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">
                  <tr>
                    <th className="px-4 py-2">Email</th>
                    <th className="px-4 py-2">Primer acceso</th>
                    <th className="px-4 py-2">Asignar rol</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-amber-50 dark:divide-amber-900/50">
                  {pendingUsers.map((authUser) => (
                    <tr key={authUser.id}>
                      <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">{authUser.email}</td>
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{formatDate(authUser.created_at)}</td>
                      <td className="px-4 py-3">
                        <GrantForm userId={authUser.id} existingRoles={[]} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Personal con acceso</h2>
          <div className="overflow-x-auto rounded-md border border-slate-200 dark:border-slate-700">
            <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-700">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-2">Email</th>
                  <th className="px-4 py-2">Ultimo acceso</th>
                  <th className="px-4 py-2">Roles</th>
                  <th className="px-4 py-2">Asignar rol</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {activeUsers.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-4 text-slate-400">
                      Sin usuarios activos.
                    </td>
                  </tr>
                ) : (
                  activeUsers.map((authUser) => {
                    const roles = rolesByUser[authUser.id] ?? [];

                    return (
                      <tr key={authUser.id}>
                        <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">
                          {authUser.email}
                          {authUser.id === user.id ? (
                            <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500 dark:bg-slate-700 dark:text-slate-400">
                              tu
                            </span>
                          ) : null}
                        </td>
                        <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{formatDate(authUser.last_sign_in_at)}</td>
                        <td className="px-4 py-3">
                          <RoleBadges userId={authUser.id} roles={roles} />
                        </td>
                        <td className="px-4 py-3">
                          <GrantForm userId={authUser.id} existingRoles={roles} />
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </PageShell>
  );
}
