import { redirect } from "next/navigation";
import { PageShell } from "@/components/ui/page-shell";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { getCompetitionSignupDashboardData } from "@/lib/queries/sports-signups";

type SearchParams = Promise<{
  campus?: string;
}>;

export default async function SportsSignupsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const dashboard = await getCompetitionSignupDashboardData({
    campusId: params.campus ?? "",
  });

  if (!dashboard) redirect("/unauthorized");

  return (
    <PageShell
      title="Inscripciones Torneos"
      subtitle="Visualizador temporal de jugadores con inscripción confirmada por competencia. Solo muestra conteos y jugadores, sin información financiera."
      breadcrumbs={[{ label: "Inscripciones Torneos" }]}
    >
      <div className="space-y-4">
        <form className="grid gap-3 rounded-md border border-slate-200 p-3 dark:border-slate-700 md:grid-cols-[1fr_auto_auto]">
          <select
            name="campus"
            defaultValue={dashboard.selectedCampusId}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
          >
            <option value="">Todos los campus</option>
            {dashboard.campuses.map((campus) => (
              <option key={campus.id} value={campus.id}>
                {campus.name}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded-md bg-portoBlue px-3 py-2 text-sm font-medium text-white hover:bg-portoDark"
          >
            Aplicar
          </button>
          <a
            href="/sports-signups"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800"
          >
            Limpiar
          </a>
        </form>

        <div className="grid gap-3 md:grid-cols-3">
          {dashboard.families.map((family) => (
            <KpiCard
              key={family.key}
              label={family.label}
              value={family.totalConfirmed.toLocaleString("es-MX")}
              description="Jugadores con inscripción confirmada"
            />
          ))}
        </div>

        <div className="space-y-4">
          {dashboard.families.map((family) => (
            <section key={family.key} className="rounded-md border border-slate-200 p-4 dark:border-slate-700">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{family.label}</h2>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    {family.totalConfirmed.toLocaleString("es-MX")} jugadores confirmados
                  </p>
                </div>
              </div>

              {family.campuses.length === 0 ? (
                <p className="rounded-md border border-dashed border-slate-300 px-4 py-5 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                  No hay jugadores confirmados en esta competencia con el filtro actual.
                </p>
              ) : (
                <div className="space-y-3">
                  {family.campuses.map((campus) => (
                    <details key={`${family.key}-${campus.campusId}`} className="rounded-md border border-slate-200 px-4 py-3 dark:border-slate-700" open>
                      <summary className="cursor-pointer list-none">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="font-medium text-slate-900 dark:text-slate-100">{campus.campusName}</p>
                            <p className="text-sm text-slate-500 dark:text-slate-400">
                              {campus.categories.length} categoría{campus.categories.length !== 1 ? "s" : ""}
                            </p>
                          </div>
                          <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                            {campus.confirmedCount.toLocaleString("es-MX")}
                          </p>
                        </div>
                      </summary>

                      <div className="mt-3 space-y-2">
                        {campus.categories.map((category) => (
                          <details key={`${campus.campusId}-${category.key}`} className="rounded-md bg-slate-50 px-3 py-2 dark:bg-slate-800/60">
                            <summary className="cursor-pointer list-none">
                              <div className="flex items-center justify-between gap-3">
                                <div>
                                  <p className="font-medium text-slate-900 dark:text-slate-100">{category.label}</p>
                                  <p className="text-xs text-slate-500 dark:text-slate-400">
                                    {category.players.length} jugador{category.players.length !== 1 ? "es" : ""}
                                  </p>
                                </div>
                                <p className="font-semibold text-slate-900 dark:text-slate-100">
                                  {category.confirmedCount.toLocaleString("es-MX")}
                                </p>
                              </div>
                            </summary>

                            <div className="mt-3 overflow-x-auto">
                              <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-700">
                                <thead>
                                  <tr className="text-left text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                    <th className="py-2 pr-3">Jugador</th>
                                    <th className="py-2 pr-3">Equipo base</th>
                                    <th className="py-2 pr-3">Torneos</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                  {category.players.map((player) => (
                                    <tr key={player.enrollmentId}>
                                      <td className="py-2 pr-3 font-medium text-slate-900 dark:text-slate-100">
                                        {player.playerName}
                                      </td>
                                      <td className="py-2 pr-3 text-slate-600 dark:text-slate-300">
                                        {player.baseTeamName ?? "Sin equipo base"}
                                      </td>
                                      <td className="py-2 pr-3 text-slate-600 dark:text-slate-300">
                                        {player.tournaments.join(", ")}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </details>
                        ))}
                      </div>
                    </details>
                  ))}
                </div>
              )}
            </section>
          ))}
        </div>

        <p className="text-sm text-slate-600 dark:text-slate-400">
          Fuente de verdad: solo `tournament_player_entries` con estado `confirmed`. No se muestran montos, pagos crudos ni información de corte.
        </p>
      </div>
    </PageShell>
  );
}
