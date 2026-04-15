import Link from "next/link";
import { PageShell } from "@/components/ui/page-shell";
import { requireSportsDirectorContext } from "@/lib/auth/permissions";
import { listTournamentsPageData } from "@/lib/queries/tournaments";
import { createTournamentAction } from "@/server/actions/tournaments";

const OK_MESSAGES: Record<string, string> = {
  created: "Competencia creada.",
};

const ERR_MESSAGES: Record<string, string> = {
  invalid_form: "Completa el formulario de la competencia.",
  invalid_birth_range: "La ventana de categoría no es válida.",
  invalid_product: "Selecciona un producto de copa o torneo.",
  create_failed: "No se pudo crear la competencia.",
};

export default async function TournamentsPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; err?: string }>;
}) {
  await requireSportsDirectorContext("/unauthorized");
  const [{ campuses, products, tournaments }, query] = await Promise.all([
    listTournamentsPageData(),
    searchParams,
  ]);

  return (
    <PageShell
      title="Copas / Torneos"
      subtitle="Configura competencias y luego bájalas a una vista compacta por categoría y equipo base."
      breadcrumbs={[{ label: "Copas / Torneos" }]}
      wide
    >
      <div className="space-y-6">
        {query.ok && OK_MESSAGES[query.ok] ? (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            {OK_MESSAGES[query.ok]}
          </div>
        ) : null}
        {query.err && ERR_MESSAGES[query.err] ? (
          <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {ERR_MESSAGES[query.err]}
          </div>
        ) : null}

        <section className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/40">
          <div className="mb-4">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Nueva competencia</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              El producto ligado es el ancla de pago. La inscripción confirmada se reconoce cuando ese cargo queda pagado al 100%.
            </p>
          </div>

          <form action={createTournamentAction} className="grid gap-4 lg:grid-cols-3">
            <label className="space-y-1 text-sm">
              <span className="font-medium text-slate-700 dark:text-slate-200">Nombre</span>
              <input
                name="name"
                required
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-950"
                placeholder="Copa Regia Verano 2026"
              />
            </label>

            <label className="space-y-1 text-sm">
              <span className="font-medium text-slate-700 dark:text-slate-200">Campus</span>
              <select
                name="campusId"
                required
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-950"
              >
                <option value="">Selecciona...</option>
                {campuses.map((campus) => (
                  <option key={campus.id} value={campus.id}>
                    {campus.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1 text-sm">
              <span className="font-medium text-slate-700 dark:text-slate-200">Producto ligado</span>
              <select
                name="productId"
                required
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-950"
              >
                <option value="">Selecciona...</option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1 text-sm">
              <span className="font-medium text-slate-700 dark:text-slate-200">Género</span>
              <select
                name="gender"
                required
                defaultValue="male"
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-950"
              >
                <option value="male">Varonil</option>
                <option value="female">Femenil</option>
                <option value="mixed">Mixto</option>
              </select>
            </label>

            <label className="space-y-1 text-sm">
              <span className="font-medium text-slate-700 dark:text-slate-200">Inicio</span>
              <input name="startDate" type="date" className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-950" />
            </label>

            <label className="space-y-1 text-sm">
              <span className="font-medium text-slate-700 dark:text-slate-200">Fin</span>
              <input name="endDate" type="date" className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-950" />
            </label>

            <label className="space-y-1 text-sm">
              <span className="font-medium text-slate-700 dark:text-slate-200">Cierre de inscripción</span>
              <input name="signupDeadline" type="date" className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-950" />
            </label>

            <label className="space-y-1 text-sm">
              <span className="font-medium text-slate-700 dark:text-slate-200">Categoría inicial</span>
              <input
                name="eligibleBirthYearMin"
                inputMode="numeric"
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-950"
                placeholder="2013"
              />
            </label>

            <label className="space-y-1 text-sm">
              <span className="font-medium text-slate-700 dark:text-slate-200">Categoría final</span>
              <input
                name="eligibleBirthYearMax"
                inputMode="numeric"
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-950"
                placeholder="2014"
              />
            </label>

            <div className="flex items-end">
              <button type="submit" className="rounded-md bg-portoBlue px-4 py-2 text-sm font-medium text-white hover:bg-portoDark">
                Crear competencia
              </button>
            </div>
          </form>
        </section>

        <section className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {tournaments.map((tournament) => (
              <article
                key={tournament.id}
                className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900"
              >
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{tournament.name}</h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      {tournament.campusName} · {tournament.gender === "male" ? "Varonil" : tournament.gender === "female" ? "Femenil" : "Mixto"} · {tournament.productName ?? "Sin producto"}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      tournament.isActive
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                        : "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300"
                    }`}
                  >
                    {tournament.isActive ? "Activa" : "Inactiva"}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-md bg-slate-50 p-3 dark:bg-slate-800/70">
                    <p className="text-xs uppercase text-slate-500 dark:text-slate-400">Equipos base</p>
                    <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">{tournament.sourceTeamCount}</p>
                  </div>
                  <div className="rounded-md bg-slate-50 p-3 dark:bg-slate-800/70">
                    <p className="text-xs uppercase text-slate-500 dark:text-slate-400">Categorías</p>
                    <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">{tournament.categoryCount}</p>
                  </div>
                  <div className="rounded-md bg-slate-50 p-3 dark:bg-slate-800/70">
                    <p className="text-xs uppercase text-slate-500 dark:text-slate-400">Inscritos</p>
                    <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">{tournament.signedCount}</p>
                  </div>
                  <div className="rounded-md bg-slate-50 p-3 dark:bg-slate-800/70">
                    <p className="text-xs uppercase text-slate-500 dark:text-slate-400">Roster final</p>
                    <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">{tournament.finalRosterCount}</p>
                  </div>
                  <div className="rounded-md bg-slate-50 p-3 dark:bg-slate-800/70">
                    <p className="text-xs uppercase text-slate-500 dark:text-slate-400">Interesados</p>
                    <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">{tournament.interestedCount}</p>
                  </div>
                  <div className="rounded-md bg-slate-50 p-3 dark:bg-slate-800/70">
                    <p className="text-xs uppercase text-slate-500 dark:text-slate-400">Equipos aprobados</p>
                    <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">{tournament.approvedTeamCount}</p>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between text-sm">
                  <div className="text-slate-500 dark:text-slate-400">
                    Cierre: {tournament.signupDeadline ? new Date(tournament.signupDeadline).toLocaleDateString("es-MX") : "Sin fecha"}
                  </div>
                  <Link href={`/tournaments/${tournament.id}`} className="rounded-md border border-slate-300 px-3 py-1.5 text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800">
                    Abrir
                  </Link>
                </div>
              </article>
            ))}
          </div>

          {tournaments.length === 0 ? (
            <p className="rounded-md border border-dashed border-slate-300 px-4 py-6 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
              Todavía no hay competencias configuradas.
            </p>
          ) : null}
        </section>
      </div>
    </PageShell>
  );
}
