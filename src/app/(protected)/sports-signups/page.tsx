import { redirect } from "next/navigation";
import { SportsSignupsBoard } from "@/components/sports/sports-signups-board";
import { PageShell } from "@/components/ui/page-shell";
import { getPermissionContext } from "@/lib/auth/permissions";
import {
  getCompetitionSignupDashboardData,
} from "@/lib/queries/sports-signups";
import {
  archiveSportsSignupTournamentAction,
  saveSportsSignupTournamentSettingsAction,
} from "@/server/actions/sports-signups";

type SearchParams = Promise<{
  campus?: string;
  competition?: string;
  paidFrom?: string;
  paidTo?: string;
  perf?: string;
  ok?: string;
  err?: string;
}>;

const OK_MESSAGES: Record<string, string> = {
  tournament_settings_saved: "Competencia actualizada.",
  tournament_archived: "Competencia archivada.",
};

const ERR_MESSAGES: Record<string, string> = {
  invalid_tournament_settings: "Selecciona campus y producto validos.",
  invalid_tournament_dates: "La fecha final no puede ser anterior al inicio.",
  invalid_tournament_product: "Selecciona un producto activo de torneo o copa.",
  tournament_settings_failed: "No se pudo guardar la competencia.",
  tournament_signup_backfill_failed: "La competencia se guardo, pero no se pudieron sincronizar las inscripciones existentes.",
  tournament_archive_failed: "No se pudo archivar la competencia.",
};

export default async function SportsSignupsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const permissionContext = await getPermissionContext();
  const dashboard = await getCompetitionSignupDashboardData({
    campusId: params.campus ?? "",
    competitionId: params.competition ?? "",
    paidFrom: params.paidFrom ?? "",
    paidTo: params.paidTo ?? "",
    perf: permissionContext?.isSuperAdmin === true && params.perf === "1",
  });

  if (!dashboard || !permissionContext) redirect("/unauthorized");

  const initialCompetitionId = dashboard.competitionOptions.some((option) => option.id === params.competition)
    ? (params.competition as string)
    : (dashboard.competitionOptions[0]?.id ?? "");
  const paidDateParams = `${dashboard.paidDateFilter.from ? `&paidFrom=${encodeURIComponent(dashboard.paidDateFilter.from)}` : ""}${dashboard.paidDateFilter.to ? `&paidTo=${encodeURIComponent(dashboard.paidDateFilter.to)}` : ""}`;
  const returnTo = `/sports-signups?campus=${encodeURIComponent(dashboard.selectedCampusId)}${initialCompetitionId ? `&competition=${encodeURIComponent(initialCompetitionId)}` : ""}${paidDateParams}`;
  const canManageTournamentSettings = permissionContext.isSuperAdmin;

  return (
    <PageShell
      title="Inscripciones Torneos"
      subtitle="Vista operativa por campus y por producto de torneo pagado. Solo muestra jugadores confirmados y avance por categoria."
      breadcrumbs={[{ label: "Inscripciones Torneos" }]}
      wide
    >
      <div className="mb-6 space-y-4">
        {params.ok && OK_MESSAGES[params.ok] ? (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            {OK_MESSAGES[params.ok]}
          </div>
        ) : null}
        {params.err && ERR_MESSAGES[params.err] ? (
          <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {ERR_MESSAGES[params.err]}
          </div>
        ) : null}

        {canManageTournamentSettings ? (
          <details className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <summary className="inline-flex cursor-pointer list-none rounded-md bg-portoBlue px-4 py-2 text-sm font-medium text-white hover:bg-portoDark">
              Configuracion de Torneos
            </summary>

            <div className="mt-4 mb-4 flex flex-col gap-1">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-800 dark:text-slate-100">
                Configuracion rapida de competencias
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                El producto sigue siendo el cobro en Caja. Aqui solo controlas visibilidad, fechas y orden de esta vista.
              </p>
            </div>

            <form action={saveSportsSignupTournamentSettingsAction} className="grid gap-3 lg:grid-cols-6">
              <input type="hidden" name="returnTo" value={returnTo} />
              <label className="space-y-1 text-sm lg:col-span-1">
                <span className="font-medium text-slate-700 dark:text-slate-200">Campus</span>
                <select
                  name="campusId"
                  defaultValue={dashboard.selectedCampusId}
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-950"
                >
                  <option value="__all__">Ambos campus</option>
                  {dashboard.campuses.map((campus) => (
                    <option key={campus.id} value={campus.id}>
                      {campus.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1 text-sm lg:col-span-2">
                <span className="font-medium text-slate-700 dark:text-slate-200">Producto</span>
                <select
                  name="productId"
                  required
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-950"
                >
                  <option value="">Selecciona producto...</option>
                  {dashboard.configurableProducts.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1 text-sm lg:col-span-3">
                <span className="font-medium text-slate-700 dark:text-slate-200">Nombre visible</span>
                <input
                  name="name"
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-950"
                  placeholder="Si lo dejas vacio se usa el nombre del producto"
                />
              </label>
              <label className="space-y-1 text-sm lg:col-span-1">
                <span className="font-medium text-slate-700 dark:text-slate-200">Inicio</span>
                <input name="startDate" type="date" className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-950" />
              </label>
              <label className="space-y-1 text-sm lg:col-span-1">
                <span className="font-medium text-slate-700 dark:text-slate-200">Fin</span>
                <input name="endDate" type="date" className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-950" />
              </label>
              <label className="space-y-1 text-sm lg:col-span-1">
                <span className="font-medium text-slate-700 dark:text-slate-200">Cierre registro</span>
                <input name="signupDeadline" type="date" className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-950" />
              </label>
              <div className="flex items-end lg:col-span-3">
                <button type="submit" className="rounded-md bg-portoBlue px-4 py-2 text-sm font-medium text-white hover:bg-portoDark">
                  Guardar / mostrar competencia
                </button>
              </div>
            </form>

            {dashboard.activeTournamentSettings.length > 0 ? (
              <div className="mt-4 rounded-lg border border-slate-200 dark:border-slate-700">
                <div className="grid grid-cols-[1.2fr_1.6fr_1fr_1fr_1fr_auto] gap-3 border-b border-slate-200 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:text-slate-400">
                  <span>Campus</span>
                  <span>Competencia</span>
                  <span>Inicio</span>
                  <span>Fin</span>
                  <span>Cierre</span>
                  <span>Accion</span>
                </div>
                {dashboard.activeTournamentSettings.map((setting) => (
                  <div key={setting.id} className="grid grid-cols-[1.2fr_1.6fr_1fr_1fr_1fr_auto] gap-3 border-b border-slate-100 px-3 py-2 text-sm last:border-b-0 dark:border-slate-800">
                    <span>{dashboard.campuses.find((campus) => campus.id === setting.campusId)?.name ?? "Campus"}</span>
                    <span className="font-medium">{setting.name}</span>
                    <span>{setting.startDate ?? "-"}</span>
                    <span>{setting.endDate ?? "-"}</span>
                    <span>{setting.signupDeadline ?? "-"}</span>
                    <form action={archiveSportsSignupTournamentAction}>
                      <input type="hidden" name="returnTo" value={returnTo} />
                      <input type="hidden" name="tournamentId" value={setting.id} />
                      <button type="submit" className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200">
                        Archivar
                      </button>
                    </form>
                  </div>
                ))}
              </div>
            ) : null}
          </details>
        ) : null}
      </div>

      <SportsSignupsBoard
        dashboard={dashboard}
        initialCompetitionId={initialCompetitionId}
        canExportCsv={permissionContext.isSuperAdmin}
        canUsePerfDebug={permissionContext.isSuperAdmin && params.perf === "1"}
      />
    </PageShell>
  );
}
