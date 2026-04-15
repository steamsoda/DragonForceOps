import Link from "next/link";
import { PageShell } from "@/components/ui/page-shell";
import { requireSportsDirectorContext } from "@/lib/auth/permissions";
import { getDirectorDashboardData, TEAM_GENDER_LABELS } from "@/lib/queries/tournaments";

export default async function DirectorDeportivoPage({
  searchParams,
}: {
  searchParams: Promise<{ campusId?: string; tournamentId?: string }>;
}) {
  await requireSportsDirectorContext("/unauthorized");
  const query = await searchParams;
  const dashboard = await getDirectorDashboardData(query.campusId, query.tournamentId);

  return (
    <PageShell
      title="Director Deportivo"
      subtitle="Vista compacta por campus, categoría y equipo base para revisar inscripciones deportivas."
      breadcrumbs={[{ label: "Director Deportivo" }]}
      wide
    >
      <div className="space-y-6">
        <section className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/40">
          <div className="mb-4">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Filtro operativo</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              La competencia muestra avance deportivo solamente. La confirmación sigue viniendo del pago completo en Caja.
            </p>
          </div>

          <form className="grid gap-3 md:grid-cols-[1fr_1fr_auto]" method="get">
            <label className="space-y-1 text-sm">
              <span className="font-medium text-slate-700 dark:text-slate-200">Campus</span>
              <select
                name="campusId"
                defaultValue={dashboard.selectedCampusId ?? ""}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-950"
              >
                {dashboard.campuses.map((campus) => (
                  <option key={campus.id} value={campus.id}>
                    {campus.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1 text-sm">
              <span className="font-medium text-slate-700 dark:text-slate-200">Competencia</span>
              <select
                name="tournamentId"
                defaultValue={dashboard.selectedTournamentId ?? ""}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-950"
              >
                {dashboard.tournaments.map((tournament) => (
                  <option key={tournament.id} value={tournament.id}>
                    {tournament.name}
                  </option>
                ))}
              </select>
            </label>

            <div className="flex items-end">
              <button
                type="submit"
                className="rounded-md bg-portoBlue px-4 py-2 text-sm font-medium text-white hover:bg-portoDark"
              >
                Ver tablero
              </button>
            </div>
          </form>
        </section>

        {dashboard.selectedTournament ? (
          <section className="grid gap-4 md:grid-cols-4">
            <div className="rounded-md border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900">
              <p className="text-xs uppercase text-slate-500 dark:text-slate-400">Competencia</p>
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{dashboard.selectedTournament.name}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {dashboard.selectedTournament.campusName} ·{" "}
                {TEAM_GENDER_LABELS[dashboard.selectedTournament.gender ?? ""] ?? "Mixto"}
              </p>
            </div>
            <div className="rounded-md border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900">
              <p className="text-xs uppercase text-slate-500 dark:text-slate-400">Inscritos</p>
              <p className="text-2xl font-semibold text-slate-900 dark:text-slate-100">{dashboard.selectedTournament.signedCount}</p>
            </div>
            <div className="rounded-md border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900">
              <p className="text-xs uppercase text-slate-500 dark:text-slate-400">Interesados</p>
              <p className="text-2xl font-semibold text-slate-900 dark:text-slate-100">{dashboard.selectedTournament.interestedCount}</p>
            </div>
            <div className="rounded-md border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900">
              <p className="text-xs uppercase text-slate-500 dark:text-slate-400">Equipos aprobados</p>
              <p className="text-2xl font-semibold text-slate-900 dark:text-slate-100">{dashboard.selectedTournament.approvedTeamCount}</p>
            </div>
          </section>
        ) : null}

        {dashboard.selectedTournament ? (
          <section className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Vista por categoría</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Empieza por la categoría y luego baja al equipo base. El flujo diario ya no arranca desde una lista gigante de competencias.
                </p>
              </div>
              <Link
                href={`/tournaments/${dashboard.selectedTournament.id}`}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Abrir detalle
              </Link>
            </div>

            <div className="space-y-4">
              {dashboard.categoryGroups.map((group) => (
                <article
                  key={group.key}
                  className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900"
                >
                  <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">{group.label}</h3>
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        {group.confirmedCount}/{group.rosterCount} inscritos · {group.interestedCount} interesados ·{" "}
                        {group.finalRosterCount} en roster final
                      </p>
                    </div>
                    <div className="rounded-md bg-slate-50 px-3 py-2 text-right text-sm dark:bg-slate-800/70">
                      <p className="text-xs uppercase text-slate-500 dark:text-slate-400">Equipos</p>
                      <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">{group.teamCount}</p>
                    </div>
                  </div>

                  <div className="grid gap-3 lg:grid-cols-2">
                    {group.teams.map((team) => (
                      <div key={team.linkId} className="rounded-md border border-slate-200 p-3 dark:border-slate-700">
                        <div className="mb-2 flex items-start justify-between gap-3">
                          <div>
                            <p className="font-medium text-slate-900 dark:text-slate-100">{team.sourceTeamName}</p>
                            <p className="text-sm text-slate-500 dark:text-slate-400">
                              {team.level ?? "Sin nivel"} · {TEAM_GENDER_LABELS[team.gender ?? ""] ?? "Mixto"} ·{" "}
                              {team.coachName ?? "Sin coach"}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">{team.progressLabel}</p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">Inscritos / roster base</p>
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-2 text-sm">
                          <div className="rounded-md bg-slate-50 px-3 py-2 dark:bg-slate-800/60">
                            <p className="text-xs uppercase text-slate-500 dark:text-slate-400">Interés</p>
                            <p className="font-semibold text-slate-900 dark:text-slate-100">{team.interestedCount}</p>
                          </div>
                          <div className="rounded-md bg-slate-50 px-3 py-2 dark:bg-slate-800/60">
                            <p className="text-xs uppercase text-slate-500 dark:text-slate-400">Final</p>
                            <p className="font-semibold text-slate-900 dark:text-slate-100">{team.finalRosterLabel}</p>
                          </div>
                          <div className="rounded-md bg-slate-50 px-3 py-2 dark:bg-slate-800/60">
                            <p className="text-xs uppercase text-slate-500 dark:text-slate-400">Modo</p>
                            <p className="font-semibold text-slate-900 dark:text-slate-100">
                              {team.participationMode === "invited" ? "Invitado" : "Competitivo"}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : (
          <p className="rounded-md border border-dashed border-slate-300 px-4 py-8 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
            No hay competencias visibles para este campus.
          </p>
        )}
      </div>
    </PageShell>
  );
}
