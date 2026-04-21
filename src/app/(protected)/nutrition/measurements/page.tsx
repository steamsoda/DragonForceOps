import Link from "next/link";
import { PageShell } from "@/components/ui/page-shell";
import { requireNutritionContext } from "@/lib/auth/permissions";
import { listNutritionCampuses, listNutritionMeasurementRows } from "@/lib/queries/nutrition";
import { formatDateMonterrey } from "@/lib/time";

type SearchParams = Promise<{
  campus?: string;
  q?: string;
  status?: "pending" | "all";
}>;

export default async function NutritionMeasurementsPage({ searchParams }: { searchParams: SearchParams }) {
  await requireNutritionContext("/unauthorized");
  const params = await searchParams;
  const selectedCampusId = params.campus ?? "";
  const status = params.status === "all" ? "all" : "pending";
  const queryText = params.q ?? "";

  const [campuses, rows] = await Promise.all([
    listNutritionCampuses(),
    listNutritionMeasurementRows({
      campusId: selectedCampusId || undefined,
      q: queryText || undefined,
      intakeStatus: status,
    }),
  ]);

  return (
    <PageShell
      title="Toma de medidas"
      subtitle="Cola de primera toma y vista general de jugadores activos visibles para nutricion."
      breadcrumbs={[{ label: "Nutricion", href: "/nutrition" }, { label: "Toma de medidas" }]}
      wide
    >
      <div className="space-y-4">
        <form className="grid gap-3 rounded-md border border-slate-200 p-3 dark:border-slate-700 md:grid-cols-[1fr_1fr_1fr_auto_auto]">
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
          <select
            name="status"
            defaultValue={status}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-600"
          >
            <option value="pending">Primera toma pendiente</option>
            <option value="all">Todos los jugadores</option>
          </select>
          <input
            type="search"
            name="q"
            defaultValue={queryText}
            placeholder="Buscar jugador"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-600"
          />
          <button type="submit" className="rounded-md bg-portoBlue px-3 py-2 text-sm font-medium text-white hover:bg-portoDark">
            Aplicar
          </button>
          <Link
            href="/nutrition/measurements"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800"
          >
            Limpiar
          </Link>
        </form>

        <div className="rounded-md border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/50">
          <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Vista actual</p>
          <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">
            {status === "pending" ? "Primera toma pendiente" : "Todos los jugadores"}
          </p>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            {rows.length.toLocaleString("es-MX")} jugador{rows.length !== 1 ? "es" : ""} visible{rows.length !== 1 ? "s" : ""}.
          </p>
        </div>

        <div className="overflow-x-auto rounded-md border border-slate-200 dark:border-slate-700">
          <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-700">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-600 dark:bg-slate-800 dark:text-slate-400">
              <tr>
                <th className="px-3 py-2">Jugador</th>
                <th className="px-3 py-2">Campus</th>
                <th className="px-3 py-2">Cat.</th>
                <th className="px-3 py-2">Genero</th>
                <th className="px-3 py-2">Nivel</th>
                <th className="px-3 py-2">Tutor</th>
                <th className="px-3 py-2">Ult. inscripcion</th>
                <th className="px-3 py-2">Ult. medicion</th>
                <th className="px-3 py-2">Peso</th>
                <th className="px-3 py-2">Estatura</th>
                <th className="px-3 py-2">Estado</th>
                <th className="px-3 py-2">Accion</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {rows.length === 0 ? (
                <tr>
                  <td className="px-3 py-4 text-slate-600 dark:text-slate-400" colSpan={12}>
                    No hay jugadores con esos filtros.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.enrollmentId} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="px-3 py-2 font-medium text-slate-900 dark:text-slate-100">{row.playerName}</td>
                    <td className="px-3 py-2 text-slate-600 dark:text-slate-400">{row.campusName}</td>
                    <td className="px-3 py-2 text-slate-600 dark:text-slate-400">{row.birthYear ?? "-"}</td>
                    <td className="px-3 py-2 text-slate-600 dark:text-slate-400">{row.genderLabel}</td>
                    <td className="px-3 py-2 text-slate-600 dark:text-slate-400">{row.level ?? "-"}</td>
                    <td className="px-3 py-2 text-slate-600 dark:text-slate-400">
                      {row.guardianContact ? (
                        <span>
                          {row.guardianContact.name}
                          {row.guardianContact.phonePrimary ? ` | ${row.guardianContact.phonePrimary}` : ""}
                        </span>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="px-3 py-2 text-slate-600 dark:text-slate-400">
                      {row.latestEnrollmentDate ? formatDateMonterrey(`${row.latestEnrollmentDate}T12:00:00.000Z`) : "-"}
                    </td>
                    <td className="px-3 py-2 text-slate-600 dark:text-slate-400">
                      {row.latestMeasurementAt ? formatDateMonterrey(row.latestMeasurementAt) : "-"}
                    </td>
                    <td className="px-3 py-2 text-slate-600 dark:text-slate-400">
                      {row.latestWeightKg != null ? `${row.latestWeightKg.toFixed(1)} kg` : "-"}
                    </td>
                    <td className="px-3 py-2 text-slate-600 dark:text-slate-400">
                      {row.latestHeightCm != null ? `${row.latestHeightCm.toFixed(1)} cm` : "-"}
                    </td>
                    <td className="px-3 py-2">
                      {row.hasCurrentEnrollmentMeasurement ? (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                          Medido
                        </span>
                      ) : (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                          Pendiente
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <Link
                        href={`/nutrition/players/${row.playerId}`}
                        className="text-sm font-medium text-portoBlue hover:underline"
                      >
                        Abrir ficha
                      </Link>
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
