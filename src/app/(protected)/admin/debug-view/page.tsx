import { PageShell } from "@/components/ui/page-shell";
import { clearDebugViewAction, setDebugViewUserAction } from "@/server/actions/debug-view";
import { getDebugRecentUserIds, getDebugViewContext, requireDebugManagerContext } from "@/lib/auth/debug-view";
import { listDebuggableUsers } from "@/lib/auth/debug-users";

type SearchParams = Promise<{ q?: string; err?: string }>;

function formatDate(value: string | null) {
  if (!value) return "Nunca";
  return new Intl.DateTimeFormat("es-MX", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

export default async function DebugViewAdminPage({ searchParams }: { searchParams: SearchParams }) {
  await requireDebugManagerContext("/unauthorized");
  const debugContext = await getDebugViewContext();
  if (!debugContext?.canManage) return null;

  const params = await searchParams;
  const query = (params.q ?? "").trim().toLowerCase();

  const [users, recentUserIds] = await Promise.all([listDebuggableUsers(), getDebugRecentUserIds()]);

  const filteredUsers = users.filter((user) => {
    if (!query) return true;
    return user.email.toLowerCase().includes(query) || user.roleSummary.toLowerCase().includes(query);
  });

  const recentUsers = recentUserIds
    .map((userId) => users.find((user) => user.id === userId))
    .filter((user): user is (typeof users)[number] => Boolean(user));

  return (
    <PageShell
      title="Debug de permisos"
      subtitle="Preview-only view-as tool para validar roles y campus sin cambiar la sesion real."
    >
      <div className="space-y-5">
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/30">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                Actor real: {debugContext.actor.email}
              </p>
              <p className="text-xs text-amber-800 dark:text-amber-300">
                {debugContext.isReadOnly
                  ? `Vista activa: ${debugContext.effective.email ?? debugContext.activeView?.userId}`
                  : "Sin vista activa"}
              </p>
            </div>
            {debugContext.isReadOnly ? (
              <form action={clearDebugViewAction}>
                <button
                  type="submit"
                  className="rounded-md bg-amber-500 px-3 py-2 text-sm font-medium text-white hover:bg-amber-600"
                >
                  Salir de vista
                </button>
              </form>
            ) : (
              <span className="rounded-full border border-amber-300 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-amber-800 dark:border-amber-700 dark:text-amber-300">
                Modo normal
              </span>
            )}
          </div>
        </div>

        <form method="GET" className="flex flex-wrap gap-3">
          <input
            type="text"
            name="q"
            defaultValue={params.q ?? ""}
            placeholder="Buscar por email o rol..."
            className="min-w-[280px] flex-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
          />
          <button
            type="submit"
            className="rounded-md bg-portoBlue px-4 py-2 text-sm font-medium text-white hover:bg-portoDark"
          >
            Filtrar
          </button>
        </form>

        {recentUsers.length > 0 ? (
          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Recientes</h2>
            <div className="flex flex-wrap gap-2">
              {recentUsers.map((user) => (
                <form key={user.id} action={setDebugViewUserAction}>
                  <input type="hidden" name="target_user_id" value={user.id} />
                  <button
                    type="submit"
                    className="rounded-full border border-amber-300 px-3 py-1 text-xs font-medium text-amber-800 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-300 dark:hover:bg-amber-900/40"
                  >
                    {user.email}
                  </button>
                </form>
              ))}
            </div>
          </section>
        ) : null}

        {params.err === "debug_user_not_found" ? (
          <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-300">
            No se encontro el usuario seleccionado para vista debug.
          </div>
        ) : null}

        <div className="overflow-x-auto rounded-md border border-slate-200 dark:border-slate-700">
          <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-700">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              <tr>
                <th className="px-4 py-2">Usuario</th>
                <th className="px-4 py-2">Roles</th>
                <th className="px-4 py-2">Ultimo acceso</th>
                <th className="px-4 py-2">Estado</th>
                <th className="px-4 py-2 text-right">Accion</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredUsers.map((user) => {
                const isActor = user.id === debugContext.actor.id;
                const isActiveView = debugContext.activeView?.userId === user.id;

                return (
                  <tr key={user.id}>
                    <td className="px-4 py-3">
                      <div className="space-y-1">
                        <p className="font-medium text-slate-900 dark:text-slate-100">{user.email}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Alta: {formatDate(user.createdAt)}
                        </p>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{user.roleSummary}</td>
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{formatDate(user.lastSignInAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        {isActor ? (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                            Tu usuario
                          </span>
                        ) : null}
                        {isActiveView ? (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                            Vista activa
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {isActiveView ? (
                        <form action={clearDebugViewAction} className="inline-flex">
                          <button
                            type="submit"
                            className="rounded-md border border-amber-300 px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-300 dark:hover:bg-amber-900/40"
                          >
                            Reset
                          </button>
                        </form>
                      ) : (
                        <form action={setDebugViewUserAction} className="inline-flex">
                          <input type="hidden" name="target_user_id" value={user.id} />
                          <button
                            type="submit"
                            className="rounded-md bg-portoBlue px-3 py-1.5 text-xs font-medium text-white hover:bg-portoDark"
                          >
                            Ver como
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
