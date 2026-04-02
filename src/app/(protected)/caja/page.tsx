import Link from "next/link";
import { CajaClient } from "@/components/caja/caja-client";
import { getOperationalCampusAccess } from "@/lib/auth/campuses";
import { getPermissionContext } from "@/lib/auth/permissions";
import { getPrinterName } from "@/lib/queries/settings";

export const metadata = { title: "Caja - Dragon Force Ops" };

export default async function CajaPage({
  searchParams,
}: {
  searchParams: Promise<{ enrollmentId?: string }>;
}) {
  const permissionContext = await getPermissionContext();
  const [printerName, sp, campusAccess] = await Promise.all([
    getPrinterName(),
    searchParams,
    getOperationalCampusAccess(),
  ]);
  const isDirector = permissionContext?.isDirector ?? false;
  const initialEnrollmentId = sp.enrollmentId;

  return (
    <main className="min-h-screen bg-slate-50 dark:bg-slate-800">
      <div className="mx-auto max-w-7xl px-4 py-5 sm:py-6 lg:px-6 xl:px-8">
        <div className="mb-4 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-portoDark dark:text-portoBlue">Caja</h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Busqueda rapida y registro de pagos</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:flex lg:flex-wrap lg:justify-end">
            <Link
              href="/reports/corte-diario"
              className="rounded-md border border-portoBlue/40 px-3 py-1.5 text-center text-xs font-medium text-portoBlue hover:bg-portoBlue/10"
            >
              Corte Diario
            </Link>
            <Link
              href="/players/new"
              className="rounded-md border border-slate-300 px-3 py-1.5 text-center text-xs font-medium text-slate-600 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-400 dark:hover:bg-slate-700"
            >
              Nueva inscripcion
            </Link>
            {isDirector ? (
              <Link
                href="/caja/sesion"
                className="rounded-md border border-slate-300 px-3 py-1.5 text-center text-xs font-medium text-slate-600 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-400 dark:hover:bg-slate-700"
              >
                Sesion de Caja
              </Link>
            ) : null}
          </div>
        </div>

        <CajaClient
          printerName={printerName}
          initialEnrollmentId={initialEnrollmentId}
          allowedCampuses={campusAccess?.campuses ?? []}
          defaultCampusId={campusAccess?.defaultCampusId ?? null}
        />
      </div>
    </main>
  );
}
