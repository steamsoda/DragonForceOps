import Link from "next/link";
import { CajaClient } from "@/components/caja/caja-client";
import { getCampusSessionStatuses } from "@/lib/queries/cash-sessions";
import { getPrinterName } from "@/lib/queries/settings";

export const metadata = { title: "Caja — Dragon Force Ops" };

export default async function CajaPage() {
  const [statuses, printerName] = await Promise.all([
    getCampusSessionStatuses(),
    getPrinterName(),
  ]);
  const anyOpen = statuses.some((s) => s.session !== null);

  return (
    <main className="min-h-screen bg-slate-50 dark:bg-slate-800">
      <div className="mx-auto max-w-2xl px-4 py-8">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-portoDark dark:text-portoBlue">Caja</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Búsqueda rápida y registro de pagos</p>
          </div>
          <Link
            href="/caja/sesion"
            className="rounded-md border border-slate-300 dark:border-slate-600 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"
          >
            Gestionar sesión
          </Link>
        </div>

        {/* Session status */}
        {anyOpen ? (
          /* Happy path: subtle pills */
          <div className="mb-5 flex flex-wrap gap-2">
            {statuses.map(({ campusName, session }) => (
              <span
                key={campusName}
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  session
                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                    : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                }`}
              >
                {campusName}: {session ? "Sesión abierta ✓" : "Sin sesión ⚠"}
              </span>
            ))}
          </div>
        ) : (
          /* No sessions open — prominent warning */
          <div className="mb-5 rounded-lg border-2 border-amber-400 bg-amber-50 dark:border-amber-600 dark:bg-amber-900/20 px-4 py-4">
            <p className="font-semibold text-amber-800 dark:text-amber-300">
              Sin sesión de caja activa
            </p>
            <p className="mt-1 text-sm text-amber-700 dark:text-amber-400">
              Los pagos en efectivo no quedarán vinculados a ninguna sesión. Pide al director que abra la sesión antes de recibir cobros.
            </p>
            <Link
              href="/caja/sesion"
              className="mt-3 inline-block rounded-md bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600 dark:bg-amber-600 dark:hover:bg-amber-700"
            >
              Abrir sesión →
            </Link>
          </div>
        )}

        <CajaClient printerName={printerName} />
      </div>
    </main>
  );
}
