import Link from "next/link";
import { PageShell } from "@/components/ui/page-shell";
import { PrintButton } from "./print-button";
import { getOperationalCampusAccess } from "@/lib/auth/campuses";
import {
  getCorteCheckpointById,
  getOrCreateCurrentCorteCheckpoint,
  listClosedCorteCheckpoints,
} from "@/lib/queries/corte-checkpoints";
import { getCorteDiarioData } from "@/lib/queries/reports";
import { getPrinterName } from "@/lib/queries/settings";
import { formatDateTimeMonterrey, formatTimeMonterrey } from "@/lib/time";

function fmt(value: number) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 2,
  }).format(value);
}

type SearchParams = Promise<{ campus?: string; checkpoint?: string }>;

export default async function CorteDiarioPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const [campusAccess, printerName] = await Promise.all([getOperationalCampusAccess(), getPrinterName()]);

  const accessibleCampuses = campusAccess?.campuses ?? [];
  const selectedCampusId = params.campus ?? campusAccess?.defaultCampusId ?? accessibleCampuses[0]?.id ?? "";
  const historicalCheckpoint = params.checkpoint ? await getCorteCheckpointById(params.checkpoint) : null;
  const checkpoint = historicalCheckpoint ?? (selectedCampusId ? await getOrCreateCurrentCorteCheckpoint(selectedCampusId) : null);
  const data = checkpoint
    ? await getCorteDiarioData({
        campusId: checkpoint.campusId,
        openedAt: checkpoint.openedAt,
        closedAt: checkpoint.status === "closed" ? checkpoint.closedAt : undefined,
      })
    : null;
  const closedHistory = checkpoint ? await listClosedCorteCheckpoints(checkpoint.campusId, 12) : [];
  const canUseFallbackSessionPage = Boolean(campusAccess?.isDirector);
  const isHistorical = checkpoint?.status === "closed";

  return (
    <PageShell
      title="Corte Diario"
      subtitle={
        checkpoint
          ? isHistorical
            ? `Corte historico: ${formatDateTimeMonterrey(checkpoint.openedAt)} - ${checkpoint.closedAt ? formatDateTimeMonterrey(checkpoint.closedAt) : "-"}`
            : `Corte abierto desde ${formatDateTimeMonterrey(checkpoint.openedAt)}`
          : "Selecciona un campus para ver su corte activo"
      }
    >
      <div className="space-y-6">
        <form className="grid gap-3 rounded-md border border-slate-200 p-3 print:hidden md:grid-cols-[1fr_auto] dark:border-slate-700">
          <input type="hidden" name="checkpoint" value="" />
          <select
            name="campus"
            defaultValue={checkpoint?.campusId ?? selectedCampusId}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-600"
          >
            {accessibleCampuses.map((campus) => (
              <option key={campus.id} value={campus.id}>
                {campus.name}
              </option>
            ))}
          </select>
          <button type="submit" className="rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800">
            Cambiar campus
          </button>
        </form>

        {checkpoint && data ? (
          <>
            <div className="rounded-md border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{data.campusName}</p>
                  {isHistorical ? (
                    <>
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        Resumen historico del checkpoint cerrado para {data.campusName}.
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Periodo: {formatDateTimeMonterrey(data.openedAt)} - {checkpoint.closedAt ? formatDateTimeMonterrey(checkpoint.closedAt) : "-"}
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        Este corte incluye todos los pagos registrados desde la ultima impresion de {data.campusName}.
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">Periodo actual: {formatDateTimeMonterrey(data.openedAt)} - ahora</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Al imprimir, este corte se cierra automaticamente y el siguiente empieza en ese mismo momento.
                      </p>
                    </>
                  )}
                </div>
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-2 md:justify-end">
                    <Link
                      href={
                        isHistorical
                          ? `/reports/corte-diario/detalle?checkpoint=${encodeURIComponent(checkpoint.id)}`
                          : `/reports/corte-diario/detalle?campus=${encodeURIComponent(data.campusId)}`
                      }
                      className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      Reporte detallado
                    </Link>
                    {isHistorical ? (
                      <Link
                        href={`/reports/corte-diario?campus=${encodeURIComponent(data.campusId)}`}
                        className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                      >
                        Volver al corte actual
                      </Link>
                    ) : (
                      <PrintButton campusId={data.campusId} printerName={printerName} />
                    )}
                  </div>
                  {!isHistorical && canUseFallbackSessionPage ? (
                    <Link href="/caja/sesion" className="block text-left text-xs text-slate-500 hover:underline dark:text-slate-400 md:text-right">
                      Abrir herramienta avanzada de sesion
                    </Link>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-md border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800">
                <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Total contado</p>
                <p className="mt-1 text-2xl font-semibold text-slate-900 dark:text-slate-100">{fmt(data.totalCobrado)}</p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {data.countedPaymentsCount} pago{data.countedPaymentsCount !== 1 ? "s" : ""} contado{data.countedPaymentsCount !== 1 ? "s" : ""}
                </p>
                {data.excludedPaymentsCount > 0 ? (
                  <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                    {data.excludedPaymentsCount} pago{data.excludedPaymentsCount !== 1 ? "s" : ""} 360Player visible{data.excludedPaymentsCount !== 1 ? "s" : ""} pero fuera del corte
                  </p>
                ) : null}
              </div>
              {data.byMethod.map((method) => (
                <div key={method.method} className="rounded-md border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800">
                  <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">{method.methodLabel}</p>
                  <p className="mt-1 text-2xl font-semibold text-slate-900 dark:text-slate-100">{fmt(method.total)}</p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{method.count} pago{method.count !== 1 ? "s" : ""}</p>
                </div>
              ))}
            </div>

            {data.excludedPaymentsCount > 0 ? (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/20 dark:text-amber-300">
                Los pagos registrados con metodo 360Player aparecen en la bitacora del turno, pero no suman al total del corte ni a sus desgloses.
              </div>
            ) : null}

            {data.byChargeType.length > 0 ? (
              <div className="rounded-md border border-slate-200 p-4 dark:border-slate-700">
                <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-300">Por tipo de cargo</h2>
                <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
                  {data.byChargeType.map((chargeType) => (
                    <div key={chargeType.typeCode} className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800">
                      <span className="text-slate-600 dark:text-slate-400">{chargeType.typeName}</span>
                      <span className="font-medium text-slate-900 dark:text-slate-100">{fmt(chargeType.total)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {data.payments.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">Sin pagos registrados en este corte.</p>
            ) : (
              <>
                <div className="space-y-3 md:hidden">
                  {data.payments.map((payment) => (
                    <div key={payment.id} className="space-y-3 rounded-md border border-slate-200 px-4 py-4 dark:border-slate-700">
                      <div className="space-y-1">
                        <Link href={`/enrollments/${payment.enrollmentId}/charges`} className="text-base font-semibold text-portoBlue hover:underline">
                          {payment.playerName}
                        </Link>
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                          {formatTimeMonterrey(payment.paidAt)} | Cat. {payment.birthYear ?? "-"} | {payment.methodLabel}
                        </p>
                      </div>
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <p className="text-xs uppercase tracking-wide text-slate-400">Campus jugador</p>
                          <p>{payment.playerCampusName}</p>
                        </div>
                        <div>
                          <p className="text-xs uppercase tracking-wide text-slate-400">Campus que recibe</p>
                          <p>{payment.operatorCampusName}</p>
                        </div>
                        <div>
                          <p className="text-xs uppercase tracking-wide text-slate-400">Conceptos</p>
                          <p>{payment.concepts.length > 0 ? payment.concepts.join(" | ") : "-"}</p>
                        </div>
                        <div>
                          <p className="text-xs uppercase tracking-wide text-slate-400">Monto</p>
                          <p className="font-medium">{fmt(payment.amount)}</p>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2 text-xs">
                        {payment.isRefund ? (
                          <span className="rounded-full bg-rose-100 px-2 py-0.5 font-medium text-rose-800 dark:bg-rose-900/30 dark:text-rose-300">
                            Reembolso
                          </span>
                        ) : null}
                        {payment.isCrossCampus ? (
                          <span className="rounded-full bg-sky-100 px-2 py-0.5 font-medium text-sky-800 dark:bg-sky-900/30 dark:text-sky-300">
                            Cruzado
                          </span>
                        ) : null}
                        {payment.excludedFromCorte ? (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                            Externo
                          </span>
                        ) : null}
                      </div>
                      <p className="text-sm text-slate-500 dark:text-slate-400">Notas: {payment.notes ?? "-"}</p>
                    </div>
                  ))}
                </div>

                <div className="hidden overflow-x-auto md:block">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:text-slate-400">
                        <th className="px-3 py-2">Hora</th>
                        <th className="px-3 py-2">Jugador</th>
                        <th className="px-3 py-2">Campus jugador</th>
                        <th className="px-3 py-2">Campus que recibe</th>
                        <th className="px-3 py-2">Cat.</th>
                        <th className="px-3 py-2">Metodo</th>
                        <th className="px-3 py-2">Conceptos pagados</th>
                        <th className="px-3 py-2 text-right">Monto</th>
                        <th className="px-3 py-2">Notas</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {data.payments.map((payment) => (
                        <tr key={payment.id} className="hover:bg-slate-50 dark:hover:bg-slate-800">
                          <td className="px-3 py-2 text-slate-500 dark:text-slate-400">{formatTimeMonterrey(payment.paidAt)}</td>
                          <td className="px-3 py-2">
                            <Link href={`/enrollments/${payment.enrollmentId}/charges`} className="text-portoBlue hover:underline">
                              {payment.playerName}
                            </Link>
                          </td>
                          <td className="px-3 py-2 text-slate-500 dark:text-slate-400">{payment.playerCampusName}</td>
                          <td className="px-3 py-2 text-slate-500 dark:text-slate-400">
                            <div className="flex items-center gap-2">
                              <span>{payment.operatorCampusName}</span>
                              {payment.isCrossCampus ? (
                                <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-medium text-sky-800 dark:bg-sky-900/30 dark:text-sky-300">
                                  Cruzado
                                </span>
                              ) : null}
                            </div>
                          </td>
                          <td className="px-3 py-2 text-slate-500 dark:text-slate-400">{payment.birthYear ?? "-"}</td>
                          <td className="px-3 py-2 text-slate-600 dark:text-slate-400">
                            <div className="flex items-center gap-2">
                              <span>{payment.methodLabel}</span>
                              {payment.isRefund ? (
                                <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-medium text-rose-800 dark:bg-rose-900/30 dark:text-rose-300">
                                  Reembolso
                                </span>
                              ) : null}
                              {payment.excludedFromCorte ? (
                                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                                  Externo
                                </span>
                              ) : null}
                            </div>
                          </td>
                          <td className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400">
                            {payment.concepts.length > 0 ? payment.concepts.join(" | ") : "-"}
                          </td>
                          <td className="px-3 py-2 text-right font-medium">{fmt(payment.amount)}</td>
                          <td className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400">{payment.notes ?? "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-slate-300 font-semibold dark:border-slate-600">
                        <td className="px-3 py-2" colSpan={7}>Total</td>
                        <td className="px-3 py-2 text-right">{fmt(data.totalCobrado)}</td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </>
            )}

            {closedHistory.length > 0 ? (
              <div className="rounded-md border border-slate-200 p-4 dark:border-slate-700">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-300">Historial de cortes</h2>
                  {isHistorical ? (
                    <Link href={`/reports/corte-diario?campus=${encodeURIComponent(data.campusId)}`} className="text-xs text-portoBlue hover:underline">
                      Ver corte actual
                    </Link>
                  ) : null}
                </div>

                <div className="space-y-3 md:hidden">
                  {closedHistory.map((historyRow) => (
                    <div key={historyRow.id} className="space-y-3 rounded-md border border-slate-200 px-4 py-4 dark:border-slate-700">
                      <div className="grid gap-2 text-sm">
                        <p><span className="font-medium">Abierto:</span> {formatDateTimeMonterrey(historyRow.openedAt)}</p>
                        <p><span className="font-medium">Cerrado:</span> {historyRow.closedAt ? formatDateTimeMonterrey(historyRow.closedAt) : "-"}</p>
                        <p><span className="font-medium">Impreso:</span> {historyRow.printedAt ? formatDateTimeMonterrey(historyRow.printedAt) : "-"}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Link
                          href={`/reports/corte-diario?campus=${encodeURIComponent(historyRow.campusId)}&checkpoint=${encodeURIComponent(historyRow.id)}`}
                          className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                        >
                          Ver resumen
                        </Link>
                        <Link
                          href={`/reports/corte-diario/detalle?checkpoint=${encodeURIComponent(historyRow.id)}`}
                          className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                        >
                          Reporte detallado
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="hidden overflow-x-auto md:block">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:text-slate-400">
                        <th className="px-3 py-2">Abierto</th>
                        <th className="px-3 py-2">Cerrado</th>
                        <th className="px-3 py-2">Impreso</th>
                        <th className="px-3 py-2 text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {closedHistory.map((historyRow) => (
                        <tr key={historyRow.id}>
                          <td className="px-3 py-2">{formatDateTimeMonterrey(historyRow.openedAt)}</td>
                          <td className="px-3 py-2">{historyRow.closedAt ? formatDateTimeMonterrey(historyRow.closedAt) : "-"}</td>
                          <td className="px-3 py-2">{historyRow.printedAt ? formatDateTimeMonterrey(historyRow.printedAt) : "-"}</td>
                          <td className="px-3 py-2 text-right">
                            <div className="flex justify-end gap-2">
                              <Link
                                href={`/reports/corte-diario?campus=${encodeURIComponent(historyRow.campusId)}&checkpoint=${encodeURIComponent(historyRow.id)}`}
                                className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                              >
                                Ver resumen
                              </Link>
                              <Link
                                href={`/reports/corte-diario/detalle?checkpoint=${encodeURIComponent(historyRow.id)}`}
                                className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                              >
                                Reporte detallado
                              </Link>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}
          </>
        ) : (
          <div className="rounded-md border border-slate-200 bg-white p-6 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
            No hay campus disponibles para este usuario.
          </div>
        )}
      </div>
    </PageShell>
  );
}
