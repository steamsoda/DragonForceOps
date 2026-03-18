import { redirect } from "next/navigation";
import { PageShell } from "@/components/ui/page-shell";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { grantRoleAction, revokeRoleAction } from "@/server/actions/users";

const ALL_ROLES = [
  { code: "superadmin", label: "Super Admin" },
  { code: "director_admin", label: "Director Admin" },
  { code: "front_desk", label: "Recepción / Caja" },
  { code: "admin_restricted", label: "Admin Restringido" },
  { code: "coach", label: "Coach" }
] as const;

const ERROR_MESSAGES: Record<string, string> = {
  invalid_form: "Datos invalidos.",
  role_not_found: "Rol no encontrado.",
  grant_failed: "No se pudo asignar el rol.",
  revoke_failed: "No se pudo revocar el rol."
};

type SearchParams = Promise<{ ok?: string; err?: string }>;

export default async function UsersAdminPage({ searchParams }: { searchParams: SearchParams }) {
  // Superadmin only
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: myRoles } = await supabase
    .from("user_roles")
    .select("app_roles(code)")
    .eq("user_id", user.id)
    .returns<{ app_roles: { code: string } | null }[]>();

  const myCodes = (myRoles ?? []).map((r) => r.app_roles?.code).filter(Boolean);
  if (!myCodes.includes("superadmin")) redirect("/unauthorized");

  // Load all auth users + their roles via admin client
  const admin = createAdminClient();
  const { data: { users: authUsers } } = await admin.auth.admin.listUsers({ perPage: 200 });

  const { data: allRoleRows } = await admin
    .from("user_roles")
    .select("user_id, app_roles(code)")
    .returns<{ user_id: string; app_roles: { code: string } | null }[]>();

  // Map user_id → [roleCodes]
  const rolesByUser: Record<string, string[]> = {};
  for (const row of allRoleRows ?? []) {
    if (!row.app_roles?.code) continue;
    (rolesByUser[row.user_id] ??= []).push(row.app_roles.code);
  }

  const query = await searchParams;
  const successMessage = query.ok === "granted" ? "Rol asignado." : query.ok === "revoked" ? "Rol revocado." : null;
  const errorMessage = query.err ? ERROR_MESSAGES[query.err] ?? "Error desconocido." : null;

  return (
    <PageShell title="Usuarios y Permisos" subtitle="Gestiona el acceso del personal">
      <div className="space-y-4">
        {successMessage && (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
            {successMessage}
          </div>
        )}
        {errorMessage && (
          <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-300">
            {errorMessage}
          </div>
        )}

        <div className="overflow-x-auto rounded-md border border-slate-200 dark:border-slate-700">
          <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700 text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800 text-left text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
              <tr>
                <th className="px-4 py-2">Email</th>
                <th className="px-4 py-2">Ultimo acceso</th>
                <th className="px-4 py-2">Roles activos</th>
                <th className="px-4 py-2">Asignar rol</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {authUsers.map((u) => {
                const roles = rolesByUser[u.id] ?? [];
                const availableToGrant = ALL_ROLES.filter((r) => !roles.includes(r.code));
                return (
                  <tr key={u.id}>
                    <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">
                      {u.email}
                      {u.id === user.id && (
                        <span className="ml-2 rounded-full bg-slate-100 dark:bg-slate-700 px-2 py-0.5 text-xs text-slate-500 dark:text-slate-400">tú</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                      {u.last_sign_in_at
                        ? new Intl.DateTimeFormat("es-MX", { dateStyle: "short", timeStyle: "short" }).format(new Date(u.last_sign_in_at))
                        : "Nunca"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {roles.length === 0 ? (
                          <span className="text-slate-400 dark:text-slate-500 text-xs">Sin acceso</span>
                        ) : (
                          roles.map((code) => (
                            <form key={code} action={revokeRoleAction}>
                              <input type="hidden" name="user_id" value={u.id} />
                              <input type="hidden" name="role_code" value={code} />
                              <button
                                type="submit"
                                title="Revocar"
                                className="inline-flex items-center gap-1 rounded-full bg-portoBlue/10 px-2 py-0.5 text-xs font-medium text-portoDark dark:text-portoBlue hover:bg-rose-100 hover:text-rose-700 dark:hover:bg-rose-900/30 dark:hover:text-rose-400 transition-colors"
                              >
                                {ALL_ROLES.find((r) => r.code === code)?.label ?? code}
                                <span className="opacity-60">×</span>
                              </button>
                            </form>
                          ))
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {availableToGrant.length > 0 && (
                        <form action={grantRoleAction} className="flex items-center gap-2">
                          <input type="hidden" name="user_id" value={u.id} />
                          <select
                            name="role_code"
                            className="rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-1 text-xs"
                          >
                            {availableToGrant.map((r) => (
                              <option key={r.code} value={r.code}>{r.label}</option>
                            ))}
                          </select>
                          <button
                            type="submit"
                            className="rounded bg-portoBlue px-2 py-1 text-xs font-medium text-white hover:bg-portoDark"
                          >
                            Asignar
                          </button>
                        </form>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </PageShell>
  );
}
