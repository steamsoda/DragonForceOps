import Link from "next/link";
import { PageShell } from "@/components/ui/page-shell";
import { PrintButton } from "./print-button";
import { listCampuses } from "@/lib/queries/players";
import { getCorteDiarioData } from "@/lib/queries/reports";
import { getCampusSessionStatuses } from "@/lib/queries/cash-sessions";
import { closeCashSessionAction } from "@/server/actions/cash-sessions";
import { createClient } from "@/lib/supabase/server";
import { getPrinterName } from "@/lib/queries/settings";

function fmt(value: number) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 2
  }).format(value);
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("es-MX", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC"
  });
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("es-MX", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC"
  });
}

const CLOSE_ERROR_LABELS: Record<string, string> = {
  invalid_form: "Formulario inválido.",
  invalid_amount: "El monto debe ser 0 o mayor.",
  unauthorized: "Solo el director puede gestionar sesiones.",
  session_not_found: "Sesión no encontrada.",
  close_failed: "Error al cerrar la sesión."
};

type SearchParams = Promise<{ date?: string; campus?: string; ok?: string; err?: string }>;

export default async function CorteDiarioPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const selectedDate = params.date ?? "";
  const selectedCampusId = params.campus ?? "";

  const supabase = await createClient();
  const [campuses, data, sessionStatuses, isDirectorResult, printerName] = await Promise.all([
    listCampuses(),
    getCorteDiarioData({ date: selectedDate || undefined, campusId: selectedCampusId || undefined }),
    getCampusSessionStatuses(),
    supabase.rpc("is_director_admin"),
    getPrinterName(),
  ]);
  const isDirector = isDirectorResult.data ?? false;

  // Filter sessions to selected campus (or all if none selected)
  const relevantStatuses = selectedCampusId
    ? sessionStatuses.filter((s) => s.campusId === selectedCampusId)
    : sessionStatuses;

  const redirectTo = selectedCampusId
    ? `/reports/corte-diario?campus=${selectedCampusId}&date=${data.date}`
    : `/reports/corte-diario?date=${data.date}`;

  const banner = params.ok === "closed"
    ? { type: "success", msg: "Sesión cerrada correctamente." }
    : params.err
    ? { type: "error", msg: CLOSE_ERROR_LABELS[params.err] ?? `Error: ${params.err}` }
    : null;

  const campusLabel = campuses.find((c) => c.id === selectedCampusId)?.name ?? "Todos los campus";

  return (
    <PageShell title="Corte Diario" subtitle="Cobros registrados por fecha y campus">
      <div className="space-y-6">
        {/* Filters */}
        <form className="print:hidden grid gap-3 rounded-md border border-slate-200 dark:border-slate-700 p-3 md:grid-cols-[1fr_1fr_auto_auto]">
          <select
            name="campus"
            defaultValue={selectedCampusId}
            className="rounded-md border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm"
          >
            <option value="">Todos los campus</option>
            {campuses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <input
            type="date"
            name="date"
            defaultValue={data.date}
            className="rounded-md border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            className="rounded-md bg-portoBlue px-3 py-2 text-sm font-medium text-white hover:bg-portoDark"
          >
            Aplicar
          </button>
          <Link
            href="/reports/corte-diario"
            className="rounded-md border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-800 text-center"
          >
            Hoy
          </Link>
        </form>

        {/* Session status banner (feedback from close action) */}
        {banner && (
          <div className={`print:hidden rounded-md border px-4 py-3 text-sm ${
            banner.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300"
              : "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-900/20 dark:text-rose-300"
          }`}>
            {banner.msg}
          </div>
        )}

        {/* Print button */}
        <PrintButton
          printerName={printerName}
          data={{
            date: data.date,
            campusLabel: campusLabel,
            totalCobrado: data.totalCobrado,
            currency: "MXN",
            byMethod: data.byMethod.map((m) => ({ methodLabel: m.methodLabel, count: m.count, total: m.total })),
            byChargeType: data.byChargeType.map((t) => ({ typeName: t.typeName, total: t.total })),
            payments: data.payments.map((p) => ({ playerName: p.playerName, amount: p.amount, methodLabel: p.methodLabel, paidAt: p.paidAt })),
          }}
        />

        {/* Cash session panel */}
        <div className="print:hidden rounded-md border border-slate-200 dark:border-slate-700 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wide">Sesión de Caja</h2>
            <Link
              href="/caja/sesion"
              className="text-xs text-portoBlue hover:underline"
            >
              Abrir sesión →
            </Link>
          </div>
          {relevantStatuses.length === 0 ? (
            <p className="text-sm text-slate-400">Sin campus seleccionado.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {relevantStatuses.map(({ campusId, campusName, session }) => (
                <div
                  key={campusId}
                  className={`rounded-lg border-2 p-4 ${
                    session
                      ? "border-emerald-300 bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-900/20"
                      : "border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800"
                  }`}
                >
                  <p className="font-semibold text-slate-900 dark:text-slate-100 text-sm">{campusName}</p>
                  {session ? (
                    <>
                      <p className="mt-0.5 text-xs font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
                        Sesión abierta
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                        Apertura: {fmtDateTime(session.openedAt)}
                      </p>
                      <div className="mt-2 flex gap-4 text-xs">
                        <div>
                          <p className="text-slate-400">Efectivo inicial</p>
                          <p className="font-semibold text-slate-800 dark:text-slate-200">{fmt(session.openingCash)}</p>
                        </div>
                        <div>
                          <p className="text-slate-400">Cobrado</p>
                          <p className="font-semibold text-emerald-700 dark:text-emerald-400">{fmt(session.cashIn)}</p>
                        </div>
                        <div>
                          <p className="text-slate-400">Esperado</p>
                          <p className="font-semibold text-slate-800 dark:text-slate-200">{fmt(session.openingCash + session.cashIn)}</p>
                        </div>
                      </div>
                      {isDirector && (
                        <details className="mt-3 group">
                          <summary className="cursor-pointer list-none rounded-md border border-rose-300 px-3 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50 dark:border-rose-700 dark:text-rose-400 dark:hover:bg-rose-900/20">
                            Cerrar sesión
                          </summary>
                          <form action={closeCashSessionAction} className="mt-2 space-y-2">
                            <input type="hidden" name="session_id" value={session.id} />
                            <input type="hidden" name="redirect_to" value={redirectTo} />
                            <label className="block space-y-1 text-xs">
                              <span className="font-medium text-slate-700 dark:text-slate-300">Efectivo contado al cierre (opcional)</span>
                              <input
                                type="number"
                                name="closing_cash"
                                min="0"
                                step="0.01"
                                placeholder="0.00"
                                className="w-full rounded-md border border-slate-300 dark:border-slate-600 px-2 py-1.5 text-sm"
                              />
                              <p className="text-slate-400">Esperado: {fmt(session.openingCash + session.cashIn)}</p>
                            </label>
                            <label className="block space-y-1 text-xs">
                              <span className="font-medium text-slate-700 dark:text-slate-300">Notas (opcional)</span>
                              <input
                                type="text"
                                name="notes"
                                placeholder="Ej: variación de $50 por cambio"
                                className="w-full rounded-md border border-slate-300 dark:border-slate-600 px-2 py-1.5 text-sm"
                              />
                            </label>
                            <button
                              type="submit"
                              className="w-full rounded-md bg-rose-600 py-1.5 text-xs font-semibold text-white hover:bg-rose-700"
                            >
                              Confirmar cierre
                            </button>
                          </form>
                        </details>
                      )}
                    </>
                  ) : (
                    <p className="mt-1 text-xs text-slate-400">Sin sesión activa</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Summary tiles */}
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-4">
            <p className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wide">Total cobrado</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900 dark:text-slate-100">{fmt(data.totalCobrado)}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{data.payments.length} pago{data.payments.length !== 1 ? "s" : ""}</p>
          </div>
          {data.byMethod.map((m) => (
            <div key={m.method} className="rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-4">
              <p className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wide">{m.methodLabel}</p>
              <p className="mt-1 text-2xl font-semibold text-slate-900 dark:text-slate-100">{fmt(m.total)}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{m.count} pago{m.count !== 1 ? "s" : ""}</p>
            </div>
          ))}
        </div>

        {/* Charge-type breakdown */}
        {data.byChargeType.length > 0 && (
          <div className="rounded-md border border-slate-200 dark:border-slate-700 p-4">
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3 uppercase tracking-wide">Por tipo de cargo</h2>
            <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
              {data.byChargeType.map((ct) => (
                <div key={ct.typeCode} className="flex items-center justify-between rounded-md bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm">
                  <span className="text-slate-600 dark:text-slate-400">{ct.typeName}</span>
                  <span className="font-medium text-slate-900 dark:text-slate-100">{fmt(ct.total)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Payments table */}
        {data.payments.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-6">Sin cobros registrados para esta fecha.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700 text-left text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                  <th className="px-3 py-2">Hora (UTC)</th>
                  <th className="px-3 py-2">Jugador</th>
                  <th className="px-3 py-2">Método</th>
                  <th className="px-3 py-2 text-right">Monto</th>
                  <th className="px-3 py-2">Notas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.payments.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-800">
                    <td className="px-3 py-2 text-slate-500 dark:text-slate-400">{fmtTime(p.paidAt)}</td>
                    <td className="px-3 py-2">
                      <Link href={`/enrollments/${p.enrollmentId}/charges`} className="text-portoBlue hover:underline">
                        {p.playerName}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-slate-600 dark:text-slate-400">{p.methodLabel}</td>
                    <td className="px-3 py-2 text-right font-medium">{fmt(p.amount)}</td>
                    <td className="px-3 py-2 text-slate-500 dark:text-slate-400 text-xs">{p.notes ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-300 dark:border-slate-600 font-semibold">
                  <td className="px-3 py-2" colSpan={3}>Total</td>
                  <td className="px-3 py-2 text-right">{fmt(data.totalCobrado)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        <p className="print:hidden text-xs text-slate-400">Horarios en UTC. Campus: {campusLabel}.</p>

        {/* ── Print-only Corte Diario layout (80mm thermal) ── */}
        <div className="hidden print:block w-[72mm] font-mono text-[11px] leading-snug">
          <div className="text-center mb-2">
            <p className="font-bold text-[13px]">INVICTA · Dragon Force Porto</p>
            <p className="text-[10px]">FC Porto Dragon Force · Monterrey</p>
            <p className="text-[10px]">{campusLabel}</p>
          </div>

          <div className="border-t border-dashed border-black my-1.5" />

          <p className="text-center font-bold text-[12px]">CORTE DIARIO</p>
          <p className="text-center text-[10px]">{data.date}</p>

          <div className="border-t border-dashed border-black my-1.5" />

          {/* Summary by method */}
          <div className="space-y-0.5 mb-1">
            {data.byMethod.map((m) => (
              <div key={m.method} className="flex justify-between">
                <span>{m.methodLabel} ({m.count})</span>
                <span>{fmt(m.total)}</span>
              </div>
            ))}
          </div>
          <div className="border-t border-black my-1" />
          <div className="flex justify-between font-bold text-[12px]">
            <span>TOTAL ({data.payments.length} pagos)</span>
            <span>{fmt(data.totalCobrado)}</span>
          </div>

          {/* By charge type */}
          {data.byChargeType.length > 0 && (
            <>
              <div className="border-t border-dashed border-black my-1.5" />
              <p className="font-bold mb-0.5">Por tipo de cargo</p>
              <div className="space-y-0.5">
                {data.byChargeType.map((ct) => (
                  <div key={ct.typeCode} className="flex justify-between">
                    <span>{ct.typeName}</span>
                    <span>{fmt(ct.total)}</span>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Payment list */}
          {data.payments.length > 0 && (
            <>
              <div className="border-t border-dashed border-black my-1.5" />
              <p className="font-bold mb-0.5">Detalle de cobros</p>
              <div className="space-y-0.5">
                {data.payments.map((p) => (
                  <div key={p.id} className="flex justify-between text-[10px]">
                    <span className="mr-1">{fmtTime(p.paidAt)} {p.playerName.split(" ")[0]}</span>
                    <span className="shrink-0">{fmt(p.amount)}</span>
                  </div>
                ))}
              </div>
            </>
          )}

          <div className="border-t border-dashed border-black my-1.5" />
          <p className="text-center text-[10px]">Horarios en UTC</p>
        </div>
      </div>
    </PageShell>
  );
}
