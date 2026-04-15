import Link from "next/link";
import { redirect } from "next/navigation";
import { PageShell } from "@/components/ui/page-shell";
import {
  type FamilyKey,
  getCompetitionSignupDashboardData,
} from "@/lib/queries/sports-signups";

type SearchParams = Promise<{
  campus?: string;
  family?: string;
}>;

function buildSportsSignupsHref(campusId: string, familyKey: string) {
  const params = new URLSearchParams();
  if (campusId) params.set("campus", campusId);
  if (familyKey) params.set("family", familyKey);
  const query = params.toString();
  return query ? `/sports-signups?${query}` : "/sports-signups";
}

export default async function SportsSignupsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const dashboard = await getCompetitionSignupDashboardData({
    campusId: params.campus ?? "",
  });

  if (!dashboard) redirect("/unauthorized");

  const fallbackFamily = dashboard.families[0]?.key ?? "";
  const selectedFamilyKey = dashboard.families.some((family) => family.key === params.family)
    ? (params.family as FamilyKey)
    : fallbackFamily;
  const selectedFamily =
    dashboard.families.find((family) => family.key === selectedFamilyKey) ?? dashboard.families[0] ?? null;

  return (
    <PageShell
      title="Inscripciones Torneos"
      subtitle="Vista operativa por campus y por producto de torneo pagado. Solo muestra jugadores confirmados y avance por categoría."
      breadcrumbs={[{ label: "Inscripciones Torneos" }]}
    >
      <div className="space-y-6">
        {dashboard.loadError ? (
          <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100">
            {dashboard.loadError}
          </div>
        ) : null}

        <section className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
            Campus
          </p>
          <div className="grid gap-3 sm:grid-cols-2 xl:max-w-4xl">
            {dashboard.campuses.map((campus) => {
              const isSelected = campus.id === dashboard.selectedCampusId;
              return (
                <Link
                  key={campus.id}
                  href={buildSportsSignupsHref(campus.id, selectedFamilyKey)}
                  className={[
                    "rounded-xl border px-5 py-6 text-center text-xl font-semibold tracking-wide transition",
                    isSelected
                      ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-950"
                      : "border-slate-200 bg-slate-100 text-slate-900 hover:border-slate-300 hover:bg-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700",
                  ].join(" ")}
                >
                  {campus.name.toUpperCase()}
                </Link>
              );
            })}
          </div>
        </section>

        <section className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
            Competencias
          </p>
          <div className="grid gap-3 md:grid-cols-3">
            {dashboard.families.map((family) => {
              const isSelected = family.key === selectedFamilyKey;
              return (
                <Link
                  key={family.key}
                  href={buildSportsSignupsHref(dashboard.selectedCampusId, family.key)}
                  className={[
                    "rounded-xl border p-4 transition",
                    isSelected
                      ? "border-portoBlue bg-portoBlue text-white shadow-sm"
                      : "border-slate-200 bg-slate-100 text-slate-900 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700",
                  ].join(" ")}
                >
                  <p className="text-sm font-semibold uppercase tracking-wide">{family.label}</p>
                  <p className="mt-3 text-4xl font-bold">{family.totalConfirmed.toLocaleString("es-MX")}</p>
                  <p
                    className={[
                      "mt-1 text-xs",
                      isSelected ? "text-white/80" : "text-slate-500 dark:text-slate-400",
                    ].join(" ")}
                  >
                    Jugadores con producto totalmente pagado
                  </p>
                </Link>
              );
            })}
          </div>
        </section>

        {selectedFamily ? (
          <section className="rounded-2xl border border-slate-200 bg-slate-100 p-5 dark:border-slate-700 dark:bg-slate-900/60">
            <div className="mb-5 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
                  {dashboard.selectedCampusName}
                </p>
                <h2 className="text-2xl font-semibold text-slate-950 dark:text-slate-50">{selectedFamily.label}</h2>
              </div>
              <div className="text-sm text-slate-600 dark:text-slate-300">
                <span className="font-semibold text-slate-950 dark:text-slate-100">
                  {selectedFamily.totalConfirmed.toLocaleString("es-MX")}
                </span>{" "}
                pagados confirmados
                {selectedFamily.totalEligible > 0 ? (
                  <>
                    {" · "}
                    <span className="font-semibold text-slate-950 dark:text-slate-100">
                      {selectedFamily.totalEligible.toLocaleString("es-MX")}
                    </span>{" "}
                    elegibles
                  </>
                ) : null}
              </div>
            </div>

            {selectedFamily.categories.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-8 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-950/40 dark:text-slate-400">
                No hay categorías activas o jugadores pagados para esta competencia en el campus seleccionado.
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
                {selectedFamily.categories.map((category) => (
                  <article
                    key={`${selectedFamily.key}-${category.key}`}
                    className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-950/70"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-2xl font-semibold text-slate-950 dark:text-slate-50">{category.label}</h3>
                        <p className="mt-1 text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          Pagados / elegibles
                        </p>
                      </div>
                      <p className="text-2xl font-semibold text-slate-950 dark:text-slate-50">
                        {category.confirmedCount}/{category.eligibleCount}
                      </p>
                    </div>

                    <div className="mt-4 min-h-56 space-y-1 text-sm text-slate-700 dark:text-slate-200">
                      {category.players.length > 0 ? (
                        category.players.map((player) => (
                          <p key={player.enrollmentId} className="leading-5">
                            {player.playerName}
                          </p>
                        ))
                      ) : (
                        <p className="text-sm italic text-slate-400 dark:text-slate-500">Sin jugadores pagados.</p>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        ) : (
          <div className="rounded-xl border border-dashed border-slate-300 px-4 py-8 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
            No hay familias de competencia disponibles.
          </div>
        )}

        <p className="text-sm text-slate-600 dark:text-slate-400">
          Fuente de verdad: cargos positivos, no anulados, con asignaciones de pago suficientes para cubrir el monto completo.
        </p>
      </div>
    </PageShell>
  );
}
