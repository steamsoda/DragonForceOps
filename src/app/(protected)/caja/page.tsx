import Link from "next/link";
import { CajaClient } from "@/components/caja/caja-client";
import { getCampusSessionStatuses } from "@/lib/queries/cash-sessions";

export const metadata = { title: "Caja — Dragon Force Ops" };

export default async function CajaPage() {
  const statuses = await getCampusSessionStatuses();
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

        {/* Session status banner */}
        <div className="mb-5 flex flex-wrap gap-2">
          {statuses.map(({ campusName, session }) => (
            <span
              key={campusName}
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                session
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                  : "bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400"
              }`}
            >
              {campusName}: {session ? "Sesión abierta ✓" : "Sin sesión"}
            </span>
          ))}
          {!anyOpen && (
            <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
              Los pagos en efectivo se registrarán sin sesión activa
            </span>
          )}
        </div>

        <CajaClient />
      </div>
    </main>
  );
}
