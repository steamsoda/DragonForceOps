import Link from "next/link";
import { PageShell } from "@/components/ui/page-shell";
import { listCampuses } from "@/lib/queries/players";
import { listDashboardNewEnrollments } from "@/lib/queries/dashboard";
import { formatDateMonterrey, formatDateTimeMonterrey } from "@/lib/time";

type SearchParams = Promise<{
  campus?: string;
  month?: string;
}>;

const STATUS_LABELS: Record<string, string> = {
  active: "Activa",
  ended: "Baja",
  cancelled: "Cancelada",
};

export default async function DashboardNewEnrollmentsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const selectedCampusId = params.campus ?? "";
  const requestedMonth = params.month;

  const [campuses, result] = await Promise.all([
    listCampuses(),
    listDashboardNewEnrollments({
      campusId: selectedCampusId || undefined,
      month: requestedMonth,
    }),
  ]);

  return (
    <PageShell
      title="Nuevas inscripciones"
      subtitle="Detalle de jugadores contados en el KPI del Panel para el mes seleccionado."
      breadcrumbs={[
        { label: "Panel", href: "/dashboard" },
        { label: "Nuevas inscripciones" },
      ]}
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
            defaultValue={result.selectedMonth}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-600"
          />
          <button
            type="submit"
            className="rounded-md bg-portoBlue px-3 py-2 text-sm font-medium text-white hover:bg-portoDark"
          >
            Aplicar
          </button>
          <Link
            href="/dashboard/new-enrollments"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800"
          >
            Limpiar
          </Link>
        </form>

        <div className="rounded-md border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/50">
          <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Mes seleccionado</p>
          <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">
            {formatDateMonterrey(`${result.selectedMonth}-01T12:00:00.000Z`).slice(3)}
          </p>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            {result.rows.length.toLocaleString("es-MX")} inscripción
            {result.rows.length !== 1 ? "es" : ""} encontrada
            {result.rows.length !== 1 ? "s" : ""}
          </p>
        </div>

        <div className="overflow-x-auto rounded-md border border-slate-200 dark:border-slate-700">
          <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-700">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-600 dark:bg-slate-800 dark:text-slate-400">
              <tr>
                <th className="px-3 py-2">Jugador</th>
                <th className="px-3 py-2">Campus</th>
                <th className="px-3 py-2">Estado</th>
                <th className="px-3 py-2">Creada</th>
                <th className="px-3 py-2">Fecha inscripción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {result.rows.length === 0 ? (
                <tr>
                  <td className="px-3 py-4 text-slate-600 dark:text-slate-400" colSpan={5}>
                    No hay inscripciones nuevas con esos filtros.
                  </td>
                </tr>
              ) : (
                result.rows.map((row) => (
                  <tr key={row.enrollmentId} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="px-3 py-2">
                      <Link
                        href={`/players/${row.playerId}`}
                        className="font-medium text-slate-900 hover:text-portoBlue hover:underline dark:text-slate-100"
                      >
                        {row.playerName}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-slate-600 dark:text-slate-400">{row.campusName}</td>
                    <td className="px-3 py-2 text-slate-600 dark:text-slate-400">
                      {STATUS_LABELS[row.status] ?? row.status}
                    </td>
                    <td className="px-3 py-2 text-slate-600 dark:text-slate-400">
                      {formatDateTimeMonterrey(row.createdAt)}
                    </td>
                    <td className="px-3 py-2 text-slate-600 dark:text-slate-400">
                      {row.inscriptionDate ? formatDateMonterrey(`${row.inscriptionDate}T12:00:00.000Z`) : "-"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </PageShell>
  );
}
