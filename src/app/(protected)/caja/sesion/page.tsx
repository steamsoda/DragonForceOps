import Link from "next/link";
import { PageShell } from "@/components/ui/page-shell";
import { getCampusSessionStatuses } from "@/lib/queries/cash-sessions";
import { openCashSessionAction, closeCashSessionAction } from "@/server/actions/cash-sessions";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Sesión de Caja — Dragon Force Ops" };

function fmt(v: number) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(v);
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleString("es-MX", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC"
  });
}

const ERROR_LABELS: Record<string, string> = {
  invalid_form: "Formulario inválido.",
  invalid_amount: "El monto debe ser 0 o mayor.",
  unauthorized: "Solo el director puede gestionar sesiones.",
  session_already_open: "Ya hay una sesión abierta para este campus.",
  session_not_found: "Sesión no encontrada.",
  open_failed: "Error al abrir la sesión.",
  close_failed: "Error al cerrar la sesión."
};

type SearchParams = Promise<{ ok?: string; err?: string }>;

export default async function CajaSessionPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;

  const supabase = await createClient();
  const { data: isDirector } = await supabase.rpc("is_director_admin");
  const statuses = await getCampusSessionStatuses();

  const banner = params.ok === "opened"
    ? { type: "success", msg: "Sesión abierta correctamente." }
    : params.ok === "closed"
    ? { type: "success", msg: "Sesión cerrada correctamente." }
    : params.err
    ? { type: "error", msg: ERROR_LABELS[params.err] ?? `Error: ${params.err}` }
    : null;

  return (
    <PageShell
      title="Sesiones de Caja"
      subtitle="Abre y cierra sesiones por campus al inicio y fin del turno"
      breadcrumbs={[{ label: "Caja", href: "/caja" }, { label: "Sesiones" }]}
    >
      <div className="space-y-6">
        {banner && (
          <div className={`rounded-md border px-4 py-3 text-sm ${
            banner.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-rose-200 bg-rose-50 text-rose-800"
          }`}>
            {banner.msg}
          </div>
        )}

        {/* Campus session cards */}
        <div className="grid gap-4 sm:grid-cols-2">
          {statuses.map(({ campusId, campusName, session }) => (
            <div
              key={campusId}
              className={`rounded-xl border-2 p-5 ${
                session
                  ? "border-emerald-300 bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-900/20"
                  : "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800"
              }`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-semibold text-slate-900 dark:text-slate-100">{campusName}</p>
                  {session ? (
                    <>
                      <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
                        Sesión abierta
                      </p>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        Apertura: {fmtTime(session.openedAt)}
                      </p>
                      <div className="mt-3 flex gap-4 text-sm">
                        <div>
                          <p className="text-xs text-slate-500 dark:text-slate-400">Efectivo inicial</p>
                          <p className="font-semibold text-slate-900 dark:text-slate-100">{fmt(session.openingCash)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-500 dark:text-slate-400">Cobrado en sesión</p>
                          <p className="font-semibold text-emerald-700 dark:text-emerald-400">{fmt(session.cashIn)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-500 dark:text-slate-400">Esperado en caja</p>
                          <p className="font-semibold text-slate-900 dark:text-slate-100">{fmt(session.openingCash + session.cashIn)}</p>
                        </div>
                      </div>
                    </>
                  ) : (
                    <p className="mt-1 text-xs text-slate-400">Sin sesión activa</p>
                  )}
                </div>
              </div>

              {/* Director actions */}
              {isDirector && (
                <div className="mt-4">
                  {session ? (
                    /* Close session form */
                    <details className="group">
                      <summary className="cursor-pointer list-none rounded-md border border-rose-300 px-3 py-2 text-sm font-medium text-rose-600 hover:bg-rose-50 dark:border-rose-700 dark:text-rose-400 dark:hover:bg-rose-900/20">
                        Cerrar sesión
                      </summary>
                      <form action={closeCashSessionAction} className="mt-3 space-y-3">
                        <input type="hidden" name="session_id" value={session.id} />
                        <label className="block space-y-1 text-sm">
                          <span className="font-medium text-slate-700 dark:text-slate-300">
                            Efectivo contado al cierre (opcional)
                          </span>
                          <input
                            type="number"
                            name="closing_cash"
                            min="0"
                            step="0.01"
                            placeholder="0.00"
                            className="w-full rounded-md border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm"
                          />
                          <p className="text-xs text-slate-400">
                            Esperado: {fmt(session.openingCash + session.cashIn)}
                          </p>
                        </label>
                        <label className="block space-y-1 text-sm">
                          <span className="font-medium text-slate-700 dark:text-slate-300">Notas (opcional)</span>
                          <input
                            type="text"
                            name="notes"
                            placeholder="Ej: variación de $50 por cambio"
                            className="w-full rounded-md border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm"
                          />
                        </label>
                        <button
                          type="submit"
                          className="w-full rounded-md bg-rose-600 py-2 text-sm font-semibold text-white hover:bg-rose-700"
                        >
                          Confirmar cierre
                        </button>
                      </form>
                    </details>
                  ) : (
                    /* Open session form */
                    <details className="group">
                      <summary className="cursor-pointer list-none rounded-md border border-emerald-500 bg-emerald-500 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-600">
                        Abrir sesión
                      </summary>
                      <form action={openCashSessionAction} className="mt-3 space-y-3">
                        <input type="hidden" name="campus_id" value={campusId} />
                        <label className="block space-y-1 text-sm">
                          <span className="font-medium text-slate-700 dark:text-slate-300">
                            Efectivo inicial en caja
                          </span>
                          <input
                            type="number"
                            name="opening_cash"
                            min="0"
                            step="0.01"
                            defaultValue="0"
                            required
                            className="w-full rounded-md border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm"
                          />
                        </label>
                        <button
                          type="submit"
                          className="w-full rounded-md bg-emerald-600 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
                        >
                          Confirmar apertura
                        </button>
                      </form>
                    </details>
                  )}
                </div>
              )}

              {/* Read-only note for non-directors */}
              {!isDirector && !session && (
                <p className="mt-3 text-xs text-slate-400">El director debe abrir la sesión antes de recibir pagos en efectivo.</p>
              )}
            </div>
          ))}
        </div>

        <div className="rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-4 py-3 text-xs text-slate-600 dark:text-slate-400 space-y-1">
          <p className="font-medium text-slate-700 dark:text-slate-300">Cómo funciona</p>
          <ul className="list-disc list-inside space-y-0.5">
            <li>Abre la sesión al inicio del turno con el efectivo disponible en caja.</li>
            <li>Los pagos en efectivo registrados en Caja se vinculan automáticamente a la sesión abierta.</li>
            <li>Al cierre, cuenta el efectivo físico y registra el total. El sistema muestra la variación.</li>
            <li>Solo el director puede abrir y cerrar sesiones.</li>
          </ul>
        </div>

        <Link href="/caja" className="inline-block text-sm text-portoBlue hover:underline">
          ← Volver a Caja
        </Link>
      </div>
    </PageShell>
  );
}
