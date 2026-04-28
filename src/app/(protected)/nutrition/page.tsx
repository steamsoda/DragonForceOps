import Link from "next/link";
import { PageShell } from "@/components/ui/page-shell";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { MeasurementActivityBar } from "@/components/nutrition/charts";
import { requireNutritionContext } from "@/lib/auth/permissions";
import { getNutritionDashboardData, listNutritionCampuses } from "@/lib/queries/nutrition";
import { formatDateTimeMonterrey } from "@/lib/time";

function buildMeasurementsHref(campusId: string, status: "pending" | "all") {
  const params = new URLSearchParams();
  if (campusId) params.set("campus", campusId);
  params.set("status", status);
  return `/nutrition/measurements?${params.toString()}`;
}

type SearchParams = Promise<{
  campus?: string;
  month?: string;
}>;

export default async function NutritionDashboardPage({ searchParams }: { searchParams: SearchParams }) {
  await requireNutritionContext("/unauthorized");
  const params = await searchParams;
  const selectedCampusId = params.campus ?? "";
  const requestedMonth = params.month;

  const [campuses, dashboard] = await Promise.all([
    listNutritionCampuses(),
    getNutritionDashboardData({
      campusId: selectedCampusId || undefined,
      month: requestedMonth,
    }),
  ]);

  return (
    <PageShell
      title="Nutricion"
      subtitle="Seguimiento de primeras tomas, mediciones historicas y actividad reciente."
      breadcrumbs={[{ label: "Nutricion" }]}
    >
      <div className="space-y-4">
        <form className="grid gap-3 rounded-md border border-slate-200 p-3 dark:border-slate-700 md:grid-cols-[1fr_1fr_auto_auto]">
          <select
            name="campus"
            defaultValue={selectedCampusId}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-600"
          >
            <option value="">Todos los campus</option>
            {campuses.map((campus) => (
              <option key={campus.id} value={campus.id}>
                {campus.name}
              </option>
            ))}
          </select>
          <input
            type="month"
            name="month"
            defaultValue={dashboard.selectedMonth}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-600"
          />
          <button type="submit" className="rounded-md bg-portoBlue px-3 py-2 text-sm font-medium text-white hover:bg-portoDark">
            Aplicar
          </button>
          <Link
            href="/nutrition"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800"
          >
            Limpiar
          </Link>
        </form>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <KpiCard
            label="Primera toma pendiente"
            value={dashboard.pendingFirstMeasurement.toLocaleString("es-MX")}
            description="Inscripciones activas sin una medicion en su ciclo actual."
            href={buildMeasurementsHref(selectedCampusId, "pending")}
          />
          <KpiCard
            label="Jugadores medidos"
            value={dashboard.measuredPlayers.toLocaleString("es-MX")}
            description="Inscripciones activas que ya tienen al menos una toma actual."
            href={buildMeasurementsHref(selectedCampusId, "all")}
          />
          <KpiCard
            label="Sesiones del mes"
            value={dashboard.sessionsThisMonth.toLocaleString("es-MX")}
            description="Capturas registradas en el mes seleccionado."
          />
          <KpiCard
            label="Cinturas del mes"
            value={dashboard.sessionsWithWaistThisMonth.toLocaleString("es-MX")}
            description="Sesiones del mes con circunferencia de cintura registrada."
          />
          <KpiCard
            label="Altas pendientes"
            value={dashboard.latestEnrollmentsPendingIntake.toLocaleString("es-MX")}
            description="Nuevas inscripciones del mes que aun no pasan por nutricion."
            href={buildMeasurementsHref(selectedCampusId, "pending")}
          />
        </div>

        <div className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <MeasurementActivityBar data={dashboard.activity} />

          <article className="rounded-md border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Actividad reciente</p>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Ultimas mediciones registradas.</p>
              </div>
              <Link href={buildMeasurementsHref(selectedCampusId, "all")} className="text-sm text-portoBlue hover:underline">
                Ver lista
              </Link>
            </div>

            <div className="mt-4 space-y-3">
              {dashboard.recentSessions.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">Aun no hay mediciones recientes.</p>
              ) : (
                dashboard.recentSessions.map((session) => (
                  <div key={session.id} className="rounded-md border border-slate-100 px-3 py-2 dark:border-slate-800">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-slate-900 dark:text-slate-100">{session.playerName}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {session.campusName} | {formatDateTimeMonterrey(session.measuredAt)}
                        </p>
                      </div>
                      <span className="rounded-full bg-teal-100 px-2 py-0.5 text-[11px] font-medium text-teal-700 dark:bg-teal-900/40 dark:text-teal-300">
                        {session.source === "initial_intake" ? "Primera toma" : "Seguimiento"}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                      {session.weightKg.toFixed(1)} kg | {session.heightCm.toFixed(1)} cm
                      {session.waistCircumferenceCm != null ? ` | Cintura ${session.waistCircumferenceCm.toFixed(1)} cm` : ""}
                    </p>
                  </div>
                ))
              )}
            </div>
          </article>
        </div>
      </div>
    </PageShell>
  );
}
