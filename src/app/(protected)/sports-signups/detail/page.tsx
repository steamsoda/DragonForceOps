import Link from "next/link";
import { redirect } from "next/navigation";
import { PageShell } from "@/components/ui/page-shell";
import { getCompetitionSignupCategoryDetailData } from "@/lib/queries/sports-signups";

type SearchParams = Promise<{
  campus?: string;
  competition?: string;
  birthYear?: string;
}>;

export default async function SportsSignupsDetailPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const detail = await getCompetitionSignupCategoryDetailData({
    campusId: params.campus ?? "",
    competitionId: params.competition ?? "",
    birthYear: params.birthYear ?? "",
  });

  if (!detail) redirect("/unauthorized");

  return (
    <PageShell
      title={`${detail.competitionLabel} · ${detail.categoryLabel}`}
      subtitle={`Jugadores pagados y no pagados agrupados por nivel en ${detail.campusName}.`}
      breadcrumbs={[
        { label: "Inscripciones Torneos", href: "/sports-signups" },
        { label: detail.competitionLabel },
        { label: detail.categoryLabel },
      ]}
      wide
    >
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 dark:border-slate-700 dark:bg-slate-900/60">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
              {detail.campusName}
            </p>
            <p className="text-lg font-semibold text-slate-950 dark:text-slate-50">
              {detail.totalConfirmed} jugadores pagados confirmados
            </p>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              {detail.totalUnpaid} jugadores no pagados
            </p>
          </div>
          <Link
            href={`/sports-signups?campus=${encodeURIComponent(detail.campusId)}&competition=${encodeURIComponent(detail.competitionId)}`}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Volver al tablero
          </Link>
        </div>

        <section className="space-y-4">
          <div className="flex items-end justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-slate-950 dark:text-slate-50">Pagados</h2>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Jugadores confirmados para esta competencia.
              </p>
            </div>
            <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
              {detail.totalConfirmed} pagados
            </p>
          </div>

          {detail.paidLevelGroups.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 px-4 py-8 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
              No hay jugadores pagados en esta categoria para la competencia seleccionada.
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {detail.paidLevelGroups.map((group) => (
                <section
                  key={`paid-${group.level}`}
                  className="rounded-xl border border-emerald-200 bg-white p-4 shadow-sm dark:border-emerald-900/60 dark:bg-slate-950/70"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-2xl font-semibold text-slate-950 dark:text-slate-50">{group.level}</h3>
                      <p className="mt-1 text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        Nivel
                      </p>
                    </div>
                    <p className="text-2xl font-semibold text-slate-950 dark:text-slate-50">
                      {group.playerCount}
                    </p>
                  </div>

                  <div className="mt-4 space-y-3">
                    {group.players.map((player) => (
                      <div
                        key={player.enrollmentId}
                        className="rounded-lg border border-emerald-100 bg-emerald-50/60 px-3 py-2 dark:border-emerald-950 dark:bg-slate-900/60"
                      >
                        <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{player.playerName}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Equipo: {player.teamName}
                        </p>
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </section>

        <section className="space-y-4">
          <div className="flex items-end justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-slate-950 dark:text-slate-50">No pagados</h2>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Jugadores activos de la categoria que todavia no han pagado esta competencia.
              </p>
            </div>
            <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
              {detail.totalUnpaid} no pagados
            </p>
          </div>

          {detail.unpaidLevelGroups.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 px-4 py-8 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
              No hay jugadores pendientes de pago en esta categoria.
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {detail.unpaidLevelGroups.map((group) => (
                <section
                  key={`unpaid-${group.level}`}
                  className="rounded-xl border border-rose-200 bg-white p-4 shadow-sm dark:border-rose-900/60 dark:bg-slate-950/70"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-2xl font-semibold text-slate-950 dark:text-slate-50">{group.level}</h3>
                      <p className="mt-1 text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        Nivel
                      </p>
                    </div>
                    <p className="text-2xl font-semibold text-slate-950 dark:text-slate-50">
                      {group.playerCount}
                    </p>
                  </div>

                  <div className="mt-4 space-y-3">
                    {group.players.map((player) => (
                      <div
                        key={player.enrollmentId}
                        className="rounded-lg border border-rose-100 bg-rose-50/60 px-3 py-2 dark:border-rose-950 dark:bg-slate-900/60"
                      >
                        <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{player.playerName}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Equipo: {player.teamName}
                        </p>
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </section>
      </div>
    </PageShell>
  );
}
