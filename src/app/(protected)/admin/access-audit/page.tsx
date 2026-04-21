import { PageShell } from "@/components/ui/page-shell";
import { getAccessAuditSnapshot } from "@/lib/auth/access-audit";
import { requireSuperAdminContext } from "@/lib/auth/permissions";

function StatusPill({ tone, label }: { tone: "good" | "bad" | "neutral"; label: string }) {
  const className =
    tone === "good"
      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
      : tone === "bad"
        ? "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300"
        : "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200";

  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${className}`}>
      {label}
    </span>
  );
}

function formatDate(value: string | null) {
  if (!value) return "Nunca";
  return new Intl.DateTimeFormat("es-MX", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

export default async function AccessAuditPage() {
  await requireSuperAdminContext("/unauthorized");
  const snapshot = await getAccessAuditSnapshot();
  const env = snapshot.env.diagnostics;

  return (
    <PageShell
      title="Auditoria de accesos"
      subtitle="Diagnostico seguro de entorno, roles y campus. No muestra secretos ni permite cambios."
      breadcrumbs={[{ label: "Admin" }, { label: "Auditoria de accesos" }]}
      wide
    >
      <div className="space-y-5">
        <section className="grid gap-3 md:grid-cols-4">
          <article className="rounded-lg border border-slate-200 p-4 dark:border-slate-700">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Supabase env</p>
            <div className="mt-2">
              <StatusPill tone={snapshot.env.match ? "good" : "bad"} label={snapshot.env.match ? "URL/key coinciden" : "Revisar mismatch"} />
            </div>
          </article>
          <article className="rounded-lg border border-slate-200 p-4 dark:border-slate-700">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">URL project ref</p>
            <p className="mt-2 font-mono text-sm text-slate-900 dark:text-slate-100">{env.urlProjectRef ?? "No detectable"}</p>
          </article>
          <article className="rounded-lg border border-slate-200 p-4 dark:border-slate-700">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Service key ref</p>
            <p className="mt-2 font-mono text-sm text-slate-900 dark:text-slate-100">{env.serviceRoleJwtRef ?? "No detectable"}</p>
          </article>
          <article className="rounded-lg border border-slate-200 p-4 dark:border-slate-700">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">JWT metadata</p>
            <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">
              role: <span className="font-mono">{env.serviceRoleJwtRole ?? "-"}</span> | issuer:{" "}
              <span className="font-mono">{env.serviceRoleIssuer ?? "-"}</span>
            </p>
          </article>
        </section>

        <section className="rounded-lg border border-slate-200 p-4 dark:border-slate-700">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Usuarios clave</h2>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                Snapshot generado {formatDate(snapshot.generatedAt)}. Roles y campus se resuelven con la misma regla de alcance del app.
              </p>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Campus activos: {snapshot.activeCampuses.map((campus) => campus.name).join(", ") || "ninguno"}
            </p>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-700">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                <tr>
                  <th className="px-3 py-2">Usuario</th>
                  <th className="px-3 py-2">Roles DB</th>
                  <th className="px-3 py-2">Operativo</th>
                  <th className="px-3 py-2">Nutricion</th>
                  <th className="px-3 py-2">Checks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {snapshot.users.map((user) => (
                  <tr key={user.email}>
                    <td className="px-3 py-3 align-top">
                      <p className="font-medium text-slate-900 dark:text-slate-100">{user.email}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {user.exists ? `Ultimo acceso: ${formatDate(user.lastSignInAt)}` : "No existe en auth.users"}
                      </p>
                    </td>
                    <td className="px-3 py-3 align-top">
                      <div className="flex flex-wrap gap-1">
                        {user.roles.length === 0 ? (
                          <span className="text-xs text-slate-400">Sin roles</span>
                        ) : (
                          user.roles.map((role) => (
                            <span
                              key={`${user.email}-${role.code}-${role.campusId ?? "all"}`}
                              className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700 dark:bg-slate-700 dark:text-slate-200"
                            >
                              {role.code} | {role.campusName ?? "Todos"}
                            </span>
                          ))
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-3 align-top text-slate-700 dark:text-slate-300">{user.operationalCampusLabel}</td>
                    <td className="px-3 py-3 align-top text-slate-700 dark:text-slate-300">{user.nutritionCampusLabel}</td>
                    <td className="px-3 py-3 align-top">
                      <div className="flex flex-wrap gap-1">
                        <StatusPill tone={user.checks.caja ? "good" : "neutral"} label={`Caja ${user.checks.caja ? "si" : "no"}`} />
                        <StatusPill tone={user.checks.sports ? "good" : "neutral"} label={`Sports ${user.checks.sports ? "si" : "no"}`} />
                        <StatusPill tone={user.checks.nutrition ? "good" : "neutral"} label={`Nutricion ${user.checks.nutrition ? "si" : "no"}`} />
                        <StatusPill tone={user.checks.director ? "good" : "neutral"} label={`Director ${user.checks.director ? "si" : "no"}`} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </PageShell>
  );
}
