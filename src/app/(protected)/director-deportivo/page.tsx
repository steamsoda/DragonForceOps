import Link from "next/link";
import { PageShell } from "@/components/ui/page-shell";
import { requireSportsDirectorContext } from "@/lib/auth/permissions";
import { getDirectorDashboardData } from "@/lib/queries/tournaments";

function formatBirthWindow(min: number | null, max: number | null) {
  if (min === null && max === null) return "Sin filtro";
  if (min !== null && max !== null && min === max) return String(min);
  return `${min ?? "?"} - ${max ?? "?"}`;
}

export default async function DirectorDeportivoPage({
  searchParams,
}: {
  searchParams: Promise<{ campusId?: string }>;
}) {
  await requireSportsDirectorContext("/unauthorized");
  const query = await searchParams;
  const dashboard = await getDirectorDashboardData(query.campusId);

  return (
    <PageShell
      title="Director Deportivo"
      subtitle="Tablero operativo de inscripcion deportiva, armado de escuadras y avance por competencia."
      breadcrumbs={[{ label: "Director Deportivo" }]}
      wide
    >
      <div className="space-y-6">
        <section className="flex flex-wrap items-end justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/40">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Vista deportiva</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Este tablero no muestra dinero. Solo estados de inscripcion y armado por campus, equipo base y escuadra.
            </p>
          </div>

          <form className="flex items-end gap-2" method="get">
            <label className="space-y-1 text-sm">
              <span className="font-medium text-slate-700 dark:text-slate-200">Campus</span>
              <select
                name="campusId"
                defaultValue={dashboard.selectedCampusId ?? ""}
                className="rounded-md border border-slate-300 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-950"
              >
                {dashboard.campuses.map((campus) => (
                  <option key={campus.id} value={campus.id}>
                    {campus.name}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className="rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800">
              Ver
            </button>
          </form>
        </section>

        <section className="grid gap-4 xl:grid-cols-2">
          {dashboard.competitions.map((competition) => (
            <article key={competition.id} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{competition.name}</h2>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    {competition.campusName} · {competition.gender === "male" ? "Varonil" : competition.gender === "female" ? "Femenil" : "Mixto"} · {formatBirthWindow(competition.eligibleBirthYearMin, competition.eligibleBirthYearMax)}
                  </p>
                </div>
                <Link href={`/tournaments/${competition.id}`} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800">
                  Abrir
                </Link>
              </div>

              <div className="mb-4 grid grid-cols-4 gap-3 text-sm">
                <div className="rounded-md bg-slate-50 p-3 dark:bg-slate-800/70">
                  <p className="text-xs uppercase text-slate-500 dark:text-slate-400">Equipos base</p>
                  <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">{competition.sourceTeamCount}</p>
                </div>
                <div className="rounded-md bg-slate-50 p-3 dark:bg-slate-800/70">
                  <p className="text-xs uppercase text-slate-500 dark:text-slate-400">Inscritos</p>
                  <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">{competition.signedCount}</p>
                </div>
                <div className="rounded-md bg-slate-50 p-3 dark:bg-slate-800/70">
                  <p className="text-xs uppercase text-slate-500 dark:text-slate-400">Sin escuadra</p>
                  <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">{competition.awaitingAssignmentCount}</p>
                </div>
                <div className="rounded-md bg-slate-50 p-3 dark:bg-slate-800/70">
                  <p className="text-xs uppercase text-slate-500 dark:text-slate-400">Escuadras</p>
                  <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">{competition.squadCount}</p>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Progreso por equipo base</h3>
                  <div className="space-y-2">
                    {competition.sourceTeamProgress.map((team) => (
                      <div key={team.linkId} className="rounded-md border border-slate-200 px-3 py-2 text-sm dark:border-slate-700">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="font-medium text-slate-900 dark:text-slate-100">{team.sourceTeamName}</p>
                            <p className="text-slate-500 dark:text-slate-400">
                              {team.birthYear ?? "Sin categoria"} · {team.gender === "male" ? "Varonil" : team.gender === "female" ? "Femenil" : team.gender === "mixed" ? "Mixto" : "Sin genero"} · {team.level ?? "Sin nivel"} · {team.coachName ?? "Sin coach"}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">{team.progressLabel}</p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">Inscritos / elegibles</p>
                          </div>
                        </div>
                      </div>
                    ))}
                    {competition.sourceTeamProgress.length === 0 ? (
                      <p className="rounded-md border border-dashed border-slate-300 px-4 py-4 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                        Todavia no hay equipos base ligados.
                      </p>
                    ) : null}
                  </div>
                </div>

                <div>
                  <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Escuadras</h3>
                  <div className="space-y-2">
                    {competition.squads.map((squad) => (
                      <div key={squad.id} className="rounded-md border border-slate-200 px-3 py-2 text-sm dark:border-slate-700">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="font-medium text-slate-900 dark:text-slate-100">{squad.label}</p>
                            <p className="text-slate-500 dark:text-slate-400">{squad.sourceTeamName}</p>
                          </div>
                          <div className="text-right">
                            <p className="font-semibold text-slate-900 dark:text-slate-100">{squad.fillLabel}</p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">Plantilla</p>
                          </div>
                          <div className="text-right">
                            <p className="font-semibold text-slate-900 dark:text-slate-100">{squad.refuerzoLabel}</p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">Refuerzos</p>
                          </div>
                        </div>
                      </div>
                    ))}
                    {competition.squads.length === 0 ? (
                      <p className="rounded-md border border-dashed border-slate-300 px-4 py-4 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                        Sin escuadras creadas todavia.
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>
            </article>
          ))}

          {dashboard.competitions.length === 0 ? (
            <p className="rounded-md border border-dashed border-slate-300 px-4 py-8 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
              No hay competencias visibles para este campus todavia.
            </p>
          ) : null}
        </section>
      </div>
    </PageShell>
  );
}
