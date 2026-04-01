import Link from "next/link";
import { redirect } from "next/navigation";
import { PageShell } from "@/components/ui/page-shell";
import { getOperationalCampusAccess } from "@/lib/auth/campuses";
import { getCampusSessionStatuses } from "@/lib/queries/cash-sessions";
import { openCashSessionAction, closeCashSessionAction } from "@/server/actions/cash-sessions";

export const metadata = { title: "Sesion de Caja - Dragon Force Ops" };

function fmt(v: number) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(v);
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleString("es-MX", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Monterrey"
  });
}

const ERROR_LABELS: Record<string, string> = {
  invalid_form: "Formulario invalido.",
  invalid_amount: "El monto debe ser 0 o mayor.",
  unauthorized: "No tienes permiso para gestionar ese campus.",
  session_already_open: "Ya hay una sesion abierta para este campus.",
  session_not_found: "Sesion no encontrada.",
  open_failed: "Error al abrir la sesion.",
  close_failed: "Error al cerrar la sesion."
};

type SearchParams = Promise<{ ok?: string; err?: string }>;

export default async function CajaSessionPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const [campusAccess, statuses] = await Promise.all([getOperationalCampusAccess(), getCampusSessionStatuses()]);
  if (!campusAccess?.isDirector) {
    redirect("/caja");
  }

  const banner = params.ok === "opened"
    ? { type: "success", msg: "Sesion abierta correctamente." }
    : params.ok === "closed"
    ? { type: "success", msg: "Sesion cerrada correctamente." }
    : params.err
    ? { type: "error", msg: ERROR_LABELS[params.err] ?? `Error: ${params.err}` }
    : null;

  return (
    <PageShell
      title="Sesiones de Caja"
      subtitle="Herramienta administrativa de respaldo para directores"
      breadcrumbs={[{ label: "Caja", href: "/caja" }, { label: "Sesiones" }]}
    >
      <div className="space-y-6">
        {banner ? (
          <div className={`rounded-md border px-4 py-3 text-sm ${
            banner.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-rose-200 bg-rose-50 text-rose-800"
          }`}>
            {banner.msg}
          </div>
        ) : null}

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
                        Sesion abierta
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
                          <p className="text-xs text-slate-500 dark:text-slate-400">Cobrado en sesion</p>
                          <p className="font-semibold text-emerald-700 dark:text-emerald-400">{fmt(session.cashIn)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-500 dark:text-slate-400">Esperado en caja</p>
                          <p className="font-semibold text-slate-900 dark:text-slate-100">{fmt(session.openingCash + session.cashIn)}</p>
                        </div>
                      </div>
                    </>
                  ) : (
                    <p className="mt-1 text-xs text-slate-400">Sin sesion activa</p>
                  )}
                </div>
              </div>

              <div className="mt-4">
                {session ? (
                  <details className="group">
                    <summary className="cursor-pointer list-none rounded-md border border-rose-300 px-3 py-2 text-sm font-medium text-rose-600 hover:bg-rose-50 dark:border-rose-700 dark:text-rose-400 dark:hover:bg-rose-900/20">
                      Cerrar sesion
                    </summary>
                    <form action={closeCashSessionAction} className="mt-3 space-y-3">
                      <input type="hidden" name="session_id" value={session.id} />
                      <label className="block space-y-1 text-sm">
                        <span className="font-medium text-slate-700 dark:text-slate-300">Efectivo contado al cierre (opcional)</span>
                        <input
                          type="number"
                          name="closing_cash"
                          min="0"
                          step="0.01"
                          placeholder="0.00"
                          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-600"
                        />
                        <p className="text-xs text-slate-400">Esperado: {fmt(session.openingCash + session.cashIn)}</p>
                      </label>
                      <label className="block space-y-1 text-sm">
                        <span className="font-medium text-slate-700 dark:text-slate-300">Notas (opcional)</span>
                        <input
                          type="text"
                          name="notes"
                          placeholder="Ej: variacion por cambio"
                          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-600"
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
                  <details className="group">
                    <summary className="cursor-pointer list-none rounded-md border border-emerald-500 bg-emerald-500 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-600">
                      Abrir sesion
                    </summary>
                    <form action={openCashSessionAction} className="mt-3 space-y-3">
                      <input type="hidden" name="campus_id" value={campusId} />
                      <label className="block space-y-1 text-sm">
                        <span className="font-medium text-slate-700 dark:text-slate-300">Efectivo inicial en caja</span>
                        <input
                          type="number"
                          name="opening_cash"
                          min="0"
                          step="0.01"
                          defaultValue="0"
                          required
                          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-600"
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
            </div>
          ))}
        </div>

        <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600 space-y-1 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
          <p className="font-medium text-slate-700 dark:text-slate-300">Uso recomendado</p>
          <ul className="list-disc list-inside space-y-0.5">
            <li>La operacion diaria ya no depende de abrir o cerrar sesiones manualmente.</li>
            <li>Esta pantalla queda solo como respaldo administrativo para directores.</li>
            <li>Recepcion debe cerrar su turno desde Corte Diario.</li>
          </ul>
        </div>

        <Link href="/caja" className="inline-block text-sm text-portoBlue hover:underline">
          Volver a Caja
        </Link>
      </div>
    </PageShell>
  );
}
