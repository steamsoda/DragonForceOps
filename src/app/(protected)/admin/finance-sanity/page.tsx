import { PageShell } from "@/components/ui/page-shell";
import Link from "next/link";
import { requireSuperAdminContext } from "@/lib/auth/permissions";
import {
  ENROLLMENT_FINANCE_ANOMALY_CODES,
  ENROLLMENT_FINANCE_ANOMALY_LABELS,
  type EnrollmentFinanceAnomalyCode,
  type EnrollmentFinanceAnomalySeverity,
} from "@/lib/finance/enrollment-anomalies";
import { listCampuses } from "@/lib/queries/players";
import { getFinanceSanityData } from "@/lib/queries/finance-sanity";

type SearchParams = Promise<{ campus?: string; anomaly?: string; severity?: string }>;

function formatCurrency(value: number) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatSignedCurrency(value: number) {
  const formatted = formatCurrency(Math.abs(value));
  if (Math.abs(value) < 0.01) return formatCurrency(0);
  return value > 0 ? `+${formatted}` : `-${formatted}`;
}

function driftClass(value: number, isCount = false) {
  const threshold = isCount ? value !== 0 : Math.abs(value) >= 0.01;
  if (threshold) {
    return "text-rose-700 dark:text-rose-300";
  }
  return "text-emerald-700 dark:text-emerald-300";
}

function hasBalanceDrift(sanity: Awaited<ReturnType<typeof getFinanceSanityData>>) {
  return (
    Math.abs(sanity.summary.pendingVsCanonicalBalanceDrift) >= 0.01 ||
    Math.abs(sanity.summary.dashboardVsCanonicalBalanceDrift) >= 0.01 ||
    sanity.summary.pendingVsCanonicalCountDrift !== 0 ||
    sanity.summary.dashboardVsCanonicalCountDrift !== 0 ||
    sanity.driftRows.length > 0
  );
}

function severityBadgeClass(value: EnrollmentFinanceAnomalySeverity) {
  return value === "needs_correction"
    ? "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-300"
    : "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300";
}

function buildFilterHref({
  campus,
  anomaly,
  severity,
}: {
  campus?: string;
  anomaly?: string;
  severity?: string;
}) {
  const params = new URLSearchParams();
  if (campus) params.set("campus", campus);
  if (anomaly) params.set("anomaly", anomaly);
  if (severity) params.set("severity", severity);
  const query = params.toString();
  return `/admin/finance-sanity${query ? `?${query}` : ""}`;
}

export default async function FinanceSanityPage({ searchParams }: { searchParams: SearchParams }) {
  await requireSuperAdminContext("/unauthorized");
  const params = await searchParams;
  const selectedCampusId = params.campus ?? "";
  const selectedAnomalyCode = ENROLLMENT_FINANCE_ANOMALY_CODES.includes(
    (params.anomaly ?? "") as EnrollmentFinanceAnomalyCode,
  )
    ? ((params.anomaly ?? "") as EnrollmentFinanceAnomalyCode)
    : undefined;
  const selectedSeverity =
    params.severity === "warning" || params.severity === "needs_correction"
      ? (params.severity as EnrollmentFinanceAnomalySeverity)
      : undefined;

  const [campuses, sanity] = await Promise.all([
    listCampuses(),
    getFinanceSanityData(selectedCampusId || undefined, {
      anomalyCode: selectedAnomalyCode,
      severity: selectedSeverity,
    }),
  ]);

  const selectedCampusName =
    campuses.find((campus) => campus.id === selectedCampusId)?.name ?? "Todos los campus visibles";
  const balanceDriftDetected = hasBalanceDrift(sanity);
  const anomalyDetected = sanity.activeAnomalyRows.length > 0;

  return (
    <PageShell
      title="Sanidad financiera"
      subtitle="Vista oculta para verificar que saldos, pendientes y KPIs usen la misma verdad financiera."
      breadcrumbs={[
        { label: "Admin" },
        { label: "Sanidad financiera" },
      ]}
      wide
    >
      <div className="space-y-6">
        <form className="grid gap-3 rounded-md border border-slate-200 p-3 md:grid-cols-4 dark:border-slate-700">
          <select
            name="campus"
            defaultValue={selectedCampusId}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
          >
            <option value="">Todos los campus visibles</option>
            {campuses.map((campus) => (
              <option key={campus.id} value={campus.id}>
                {campus.name}
              </option>
            ))}
          </select>
          <select
            name="anomaly"
            defaultValue={selectedAnomalyCode ?? ""}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
          >
            <option value="">Todas las anomalias</option>
            {ENROLLMENT_FINANCE_ANOMALY_CODES.map((code) => (
              <option key={code} value={code}>
                {ENROLLMENT_FINANCE_ANOMALY_LABELS[code]}
              </option>
            ))}
          </select>
          <select
            name="severity"
            defaultValue={selectedSeverity ?? ""}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
          >
            <option value="">Todas las severidades</option>
            <option value="needs_correction">Requiere correccion</option>
            <option value="warning">Advertencia</option>
          </select>
          <button
            type="submit"
            className="rounded-md bg-portoBlue px-4 py-2 text-sm font-medium text-white hover:bg-portoDark"
          >
            Verificar
          </button>
        </form>

        <div
          className={`rounded-lg border p-4 ${
            sanity.isHealthy
              ? "border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30"
              : "border-rose-200 bg-rose-50 dark:border-rose-800 dark:bg-rose-950/30"
          }`}
        >
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {sanity.isHealthy
              ? "Sin drift ni anomalias activas"
              : balanceDriftDetected
                ? "Se detecto drift financiero"
                : "Se detectaron anomalias financieras"}
          </p>
          <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">
            Alcance actual: {selectedCampusName}. La referencia canonica es <code>v_enrollment_balances</code>; esta
            vista compara ese saldo contra <code>Pendientes</code> y contra el KPI del Panel
            {anomalyDetected ? ", y tambien agrupa cuentas con estados financieros sospechosos." : "."}
          </p>
        </div>

        <div className="grid gap-3 xl:grid-cols-3">
          <section className="rounded-md border border-slate-200 p-4 dark:border-slate-700">
            <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Canonico</p>
            <p className="mt-1 text-xl font-semibold text-slate-900 dark:text-slate-100">
              {formatCurrency(sanity.summary.canonicalPendingBalance)}
            </p>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              {sanity.summary.canonicalEnrollmentsWithBalance} inscripciones con saldo
            </p>
          </section>
          <section className="rounded-md border border-slate-200 p-4 dark:border-slate-700">
            <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Pendientes RPC</p>
            <p className="mt-1 text-xl font-semibold text-slate-900 dark:text-slate-100">
              {formatCurrency(sanity.summary.pendingRpcBalance)}
            </p>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              {sanity.summary.pendingRpcEnrollments} inscripciones visibles en Pendientes
            </p>
            <p className={`mt-2 text-xs font-medium ${driftClass(sanity.summary.pendingVsCanonicalBalanceDrift)}`}>
              Drift saldo: {formatSignedCurrency(sanity.summary.pendingVsCanonicalBalanceDrift)}
            </p>
            <p className={`text-xs font-medium ${driftClass(sanity.summary.pendingVsCanonicalCountDrift, true)}`}>
              Drift conteo: {sanity.summary.pendingVsCanonicalCountDrift > 0 ? "+" : ""}
              {sanity.summary.pendingVsCanonicalCountDrift}
            </p>
          </section>
          <section className="rounded-md border border-slate-200 p-4 dark:border-slate-700">
            <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Panel KPI</p>
            <p className="mt-1 text-xl font-semibold text-slate-900 dark:text-slate-100">
              {formatCurrency(sanity.summary.dashboardPendingBalance)}
            </p>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              {sanity.summary.dashboardEnrollmentsWithBalance} inscripciones con saldo
            </p>
            <p className={`mt-2 text-xs font-medium ${driftClass(sanity.summary.dashboardVsCanonicalBalanceDrift)}`}>
              Drift saldo: {formatSignedCurrency(sanity.summary.dashboardVsCanonicalBalanceDrift)}
            </p>
            <p className={`text-xs font-medium ${driftClass(sanity.summary.dashboardVsCanonicalCountDrift, true)}`}>
              Drift conteo: {sanity.summary.dashboardVsCanonicalCountDrift > 0 ? "+" : ""}
              {sanity.summary.dashboardVsCanonicalCountDrift}
            </p>
          </section>
        </div>

        <section className="rounded-md border border-slate-200 p-4 dark:border-slate-700">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Reglas de referencia</h2>
          <ul className="mt-2 space-y-1 text-sm text-slate-600 dark:text-slate-400">
            <li>`v_enrollment_balances` es la verdad canonica para saldo vivo por inscripcion.</li>
            <li>`finance_*_facts` es la verdad canonica para reportes y cortes.</li>
            <li>Si esta pagina detecta drift, primero se corrige la capa SQL compartida y luego las pantallas.</li>
          </ul>
        </section>

        <section className="rounded-md border border-slate-200 p-4 dark:border-slate-700">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Anomalias activas</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Vista agrupada por inscripcion usando las mismas reglas del diagnostico financiero.
              </p>
            </div>
            <span className="rounded-full border border-slate-300 px-3 py-1 text-xs font-medium text-slate-600 dark:border-slate-600 dark:text-slate-300">
              {sanity.activeAnomalyRows.length} cuenta{sanity.activeAnomalyRows.length !== 1 ? "s" : ""}
            </span>
          </div>

          {sanity.activeAnomalyRows.length === 0 ? (
            <div className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">
              No hay anomalias activas para los filtros actuales.
            </div>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-700">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                  <tr>
                    <th className="px-3 py-2">Jugador</th>
                    <th className="px-3 py-2">Campus</th>
                    <th className="px-3 py-2 text-right">Canonico</th>
                    <th className="px-3 py-2 text-right">Derivado</th>
                    <th className="px-3 py-2">Alertas</th>
                    <th className="px-3 py-2 text-right">Cuenta</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {sanity.activeAnomalyRows.map((row) => (
                    <tr key={row.enrollmentId}>
                      <td className="px-3 py-2 align-top">
                        <div className="space-y-1">
                          <p className="font-medium text-slate-900 dark:text-slate-100">{row.playerName}</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            Cat. {row.birthYear ?? "-"} · {row.enrollmentId}
                          </p>
                        </div>
                      </td>
                      <td className="px-3 py-2 align-top text-slate-600 dark:text-slate-400">{row.campusName}</td>
                      <td className="px-3 py-2 align-top text-right text-slate-700 dark:text-slate-300">
                            {formatCurrency(row.canonicalBalance)}
                      </td>
                      <td className="px-3 py-2 align-top text-right text-slate-700 dark:text-slate-300">
                        {formatCurrency(row.derivedBalance)}
                      </td>
                      <td className="px-3 py-2 align-top">
                        <div className="space-y-2">
                          {row.anomalies.map((anomaly) => (
                            <div key={anomaly.key} className="space-y-1">
                              <span
                                className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${severityBadgeClass(anomaly.severity)}`}
                              >
                                {anomaly.title}
                              </span>
                              <p className="max-w-xl text-xs text-slate-500 dark:text-slate-400">{anomaly.detail}</p>
                            </div>
                          ))}
                        </div>
                      </td>
                      <td className="px-3 py-2 align-top text-right">
                        <Link
                          href={`/enrollments/${row.enrollmentId}/charges`}
                          className="text-sm font-medium text-portoBlue hover:underline"
                        >
                          Ver cuenta
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="rounded-md border border-slate-200 p-4 dark:border-slate-700">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Mismatches por inscripcion</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Solo aparecen filas donde el saldo canonico y el saldo mostrado en Pendientes no coinciden.
              </p>
            </div>
            <span className="rounded-full border border-slate-300 px-3 py-1 text-xs font-medium text-slate-600 dark:border-slate-600 dark:text-slate-300">
              {sanity.driftRows.length} fila{sanity.driftRows.length !== 1 ? "s" : ""}
            </span>
          </div>

          {sanity.driftRows.length === 0 ? (
            <div className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">
              Sin mismatches activos en las primeras 50 inscripciones con validacion.
            </div>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-700">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                  <tr>
                    <th className="px-3 py-2">Jugador</th>
                    <th className="px-3 py-2">Campus</th>
                    <th className="px-3 py-2 text-right">Canonico</th>
                    <th className="px-3 py-2 text-right">Pendientes</th>
                    <th className="px-3 py-2 text-right">Drift</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {sanity.driftRows.map((row) => (
                    <tr key={row.enrollmentId}>
                      <td className="px-3 py-2">
                        <div className="space-y-1">
                          <p className="font-medium text-slate-900 dark:text-slate-100">{row.playerName}</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">{row.enrollmentId}</p>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-slate-600 dark:text-slate-400">{row.campusName}</td>
                      <td className="px-3 py-2 text-right text-slate-700 dark:text-slate-300">
                        {formatCurrency(row.canonicalBalance)}
                      </td>
                      <td className="px-3 py-2 text-right text-slate-700 dark:text-slate-300">
                        {formatCurrency(row.pendingRpcBalance)}
                      </td>
                      <td className={`px-3 py-2 text-right font-medium ${driftClass(row.balanceDrift)}`}>
                        {formatSignedCurrency(row.balanceDrift)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="rounded-md border border-slate-200 p-4 dark:border-slate-700">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Eventos recientes de anomalias</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Detectadas o resueltas despues de mutaciones de cuenta.
              </p>
            </div>
            <Link
              href={buildFilterHref({ campus: selectedCampusId || undefined })}
              className="text-xs font-medium text-portoBlue hover:underline"
            >
              Limpiar filtros
            </Link>
          </div>

          {sanity.recentAnomalyEvents.length === 0 ? (
            <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
              No hay eventos recientes para los filtros actuales.
            </div>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-700">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                  <tr>
                    <th className="px-3 py-2">Fecha</th>
                    <th className="px-3 py-2">Evento</th>
                    <th className="px-3 py-2">Jugador</th>
                    <th className="px-3 py-2">Campus</th>
                    <th className="px-3 py-2">Anomalia</th>
                    <th className="px-3 py-2">Disparador</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {sanity.recentAnomalyEvents.map((event) => (
                    <tr key={event.id}>
                      <td className="px-3 py-2 text-slate-600 dark:text-slate-400">{event.eventAt}</td>
                      <td className="px-3 py-2">
                        <span
                          className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                            event.action === "finance.anomaly_detected"
                              ? "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-300"
                              : "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300"
                          }`}
                        >
                          {event.action === "finance.anomaly_detected" ? "Detectada" : "Resuelta"}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <div className="space-y-1">
                          <p className="font-medium text-slate-900 dark:text-slate-100">{event.playerName}</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            Cat. {event.birthYear ?? "-"} ·{" "}
                            <Link href={`/enrollments/${event.enrollmentId}/charges`} className="text-portoBlue hover:underline">
                              cuenta
                            </Link>
                          </p>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-slate-600 dark:text-slate-400">{event.campusName}</td>
                      <td className="px-3 py-2">
                        <div className="space-y-1">
                          <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${severityBadgeClass(event.severity)}`}>
                            {event.title}
                          </span>
                          <p className="text-xs text-slate-500 dark:text-slate-400">{event.detail}</p>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400">{event.triggerAction ?? "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </PageShell>
  );
}
