import Link from "next/link";
import { PageShell } from "@/components/ui/page-shell";
import { requireNutritionContext } from "@/lib/auth/permissions";
import {
  getNutritionGroupedRosterData,
  listNutritionCampuses,
  listNutritionMeasurementRows,
  type NutritionGroupedRosterData,
} from "@/lib/queries/nutrition";
import { formatDateMonterrey } from "@/lib/time";

type SearchParams = Promise<{
  campus?: string;
  gender?: string;
  q?: string;
  status?: "pending" | "all";
  view?: "groups" | "list";
}>;

function measurementsHref({
  view,
  campusId,
  gender,
  status,
}: {
  view?: "groups" | "list";
  campusId?: string;
  gender?: string;
  status?: "pending" | "all";
}) {
  const params = new URLSearchParams();
  if (view && view !== "groups") params.set("view", view);
  if (campusId) params.set("campus", campusId);
  if (gender) params.set("gender", gender);
  if (status && status !== "pending") params.set("status", status);
  const query = params.toString();
  return query ? `/nutrition/measurements?${query}` : "/nutrition/measurements";
}

function measurementStatusChip(done: boolean) {
  return done ? (
    <span className="inline-flex min-h-6 items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">
      Medido
    </span>
  ) : (
    <span className="inline-flex min-h-6 items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
      Pendiente
    </span>
  );
}

function NutritionViewTabs({ view, status, campusId, gender }: { view: "groups" | "list"; status: "pending" | "all"; campusId: string; gender: string }) {
  const items = [
    { key: "groups", label: "Vista por grupos" },
    { key: "list", label: "Lista" },
  ] as const;

  return (
    <div className="flex flex-wrap gap-2 border-b border-slate-200 dark:border-slate-700">
      {items.map((item) => (
        <Link
          key={item.key}
          href={measurementsHref({ view: item.key, campusId, gender, status })}
          className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
            view === item.key
              ? "border-portoBlue text-portoBlue"
              : "border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300"
          }`}
        >
          {item.label}
        </Link>
      ))}
    </div>
  );
}

function NutritionGroupedRoster({ data }: { data: NutritionGroupedRosterData | null }) {
  if (!data) {
    return (
      <div className="rounded-md border border-slate-200 px-4 py-5 text-sm text-slate-600 dark:border-slate-700 dark:text-slate-400">
        No hay campus disponibles para esta vista.
      </div>
    );
  }

  const genderOptions = [
    { value: "", label: "Todos" },
    { value: "male", label: "Varonil" },
    { value: "female", label: "Femenil" },
  ];
  const statusOptions = [
    { value: "pending" as const, label: "Primera toma pendiente" },
    { value: "all" as const, label: "Todos los jugadores" },
  ];

  return (
    <div className="space-y-4">
      <div className="space-y-4 rounded-md border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Campus</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">Vista por grupos de entrenamiento, sin datos financieros.</p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
              {data.totalPlayers} jugadores
            </span>
            {data.unassignedCount > 0 ? (
              <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                {data.unassignedCount} sin grupo
              </span>
            ) : null}
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {data.campuses.map((campus) => {
            const active = campus.id === data.selectedCampusId;
            return (
              <Link
                key={campus.id}
                href={measurementsHref({ campusId: campus.id, gender: data.selectedGender, status: data.intakeStatus })}
                className={`rounded-lg border px-4 py-3 text-left transition ${
                  active
                    ? "border-portoBlue bg-blue-50 text-portoBlue shadow-sm dark:border-blue-400 dark:bg-blue-950/30 dark:text-blue-200"
                    : "border-slate-200 bg-white text-slate-700 hover:border-portoBlue hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:border-blue-400 dark:hover:bg-slate-800"
                }`}
              >
                <span className="block text-sm font-semibold">{campus.name}</span>
                <span className="mt-1 block text-xs opacity-75">{active ? "Campus seleccionado" : "Ver nutricion del campus"}</span>
              </Link>
            );
          })}
        </div>

        <div className="grid gap-3 border-t border-slate-100 pt-3 dark:border-slate-800 md:grid-cols-2">
          <div className="space-y-2">
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Genero</p>
            <div className="flex flex-wrap gap-2">
              {genderOptions.map((option) => (
                <Link
                  key={option.value || "all"}
                  href={measurementsHref({ campusId: data.selectedCampusId, gender: option.value, status: data.intakeStatus })}
                  className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
                    data.selectedGender === option.value
                      ? "border-portoBlue bg-portoBlue text-white"
                      : "border-slate-200 bg-white text-slate-700 hover:border-portoBlue hover:text-portoBlue dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                  }`}
                >
                  {option.label}
                </Link>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Estado</p>
            <div className="flex flex-wrap gap-2">
              {statusOptions.map((option) => (
                <Link
                  key={option.value}
                  href={measurementsHref({ campusId: data.selectedCampusId, gender: data.selectedGender, status: option.value })}
                  className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
                    data.intakeStatus === option.value
                      ? "border-portoBlue bg-portoBlue text-white"
                      : "border-slate-200 bg-white text-slate-700 hover:border-portoBlue hover:text-portoBlue dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                  }`}
                >
                  {option.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-md border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900">
        <div className="flex min-w-max gap-2">
          {data.sections.map((section) => (
            <a
              key={section.id}
              href={`#nutricion-grupo-${section.id}`}
              className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:border-portoBlue hover:text-portoBlue dark:border-slate-700 dark:text-slate-300"
            >
              {section.name} ({section.rows.length})
            </a>
          ))}
        </div>
      </div>

      <div className="space-y-5">
        {data.sections.map((section) => (
          <section key={section.id} id={`nutricion-grupo-${section.id}`} className="space-y-2">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{section.name}</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">{section.subtitle}</p>
              </div>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                {section.rows.length} jugadores
              </span>
            </div>

            <div className="overflow-x-auto rounded-md border border-slate-200 dark:border-slate-700">
              <table className="min-w-full border-collapse text-xs">
                <thead className="bg-slate-50 text-left uppercase tracking-wide text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                  <tr>
                    <th className="w-12 border-b border-slate-200 px-2 py-2 text-center dark:border-slate-700">#</th>
                    <th className="border-b border-slate-200 px-2 py-2 dark:border-slate-700">ID</th>
                    <th className="min-w-64 border-b border-slate-200 px-2 py-2 dark:border-slate-700">Nombre</th>
                    <th className="border-b border-slate-200 px-2 py-2 text-center dark:border-slate-700">CAT</th>
                    <th className="border-b border-slate-200 px-2 py-2 dark:border-slate-700">Nivel/Grupo</th>
                    <th className="border-b border-slate-200 px-2 py-2 dark:border-slate-700">Tutor</th>
                    <th className="border-b border-slate-200 px-2 py-2 text-center dark:border-slate-700">INSC</th>
                    <th className="border-b border-slate-200 px-2 py-2 text-center dark:border-slate-700">Ult. medicion</th>
                    <th className="border-b border-slate-200 px-2 py-2 text-center dark:border-slate-700">Peso</th>
                    <th className="border-b border-slate-200 px-2 py-2 text-center dark:border-slate-700">Estatura</th>
                    <th className="border-b border-slate-200 px-2 py-2 text-center dark:border-slate-700">Estado</th>
                    <th className="border-b border-slate-200 px-2 py-2 text-center dark:border-slate-700">Accion</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {section.rows.length === 0 ? (
                    <tr>
                      <td colSpan={12} className="px-3 py-4 text-slate-500 dark:text-slate-400">
                        Sin jugadores activos en este grupo.
                      </td>
                    </tr>
                  ) : (
                    section.rows.map((row, index) => (
                      <tr key={row.enrollmentId} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                        <td className="px-2 py-2 text-center text-slate-500 dark:text-slate-400">{index + 1}</td>
                        <td className="px-2 py-2 font-mono text-slate-700 dark:text-slate-300">{row.publicPlayerId}</td>
                        <td className="px-2 py-2 font-medium text-slate-900 dark:text-slate-100">{row.playerName}</td>
                        <td className="px-2 py-2 text-center text-slate-700 dark:text-slate-300">{row.birthYear ?? "-"}</td>
                        <td className="px-2 py-2 text-slate-700 dark:text-slate-300">{row.levelGroup}</td>
                        <td className="px-2 py-2 text-slate-700 dark:text-slate-300">
                          {row.guardianContact ? (
                            <span>
                              {row.guardianContact.name}
                              {row.guardianContact.phonePrimary ? ` | ${row.guardianContact.phonePrimary}` : ""}
                            </span>
                          ) : (
                            "-"
                          )}
                        </td>
                        <td className="px-2 py-2 text-center text-slate-700 dark:text-slate-300">
                          {row.latestEnrollmentDate ? formatDateMonterrey(`${row.latestEnrollmentDate}T12:00:00.000Z`) : "-"}
                        </td>
                        <td className="px-2 py-2 text-center text-slate-700 dark:text-slate-300">
                          {row.latestMeasurementAt ? formatDateMonterrey(row.latestMeasurementAt) : "-"}
                        </td>
                        <td className="px-2 py-2 text-center text-slate-700 dark:text-slate-300">
                          {row.latestWeightKg != null ? `${row.latestWeightKg.toFixed(1)} kg` : "-"}
                        </td>
                        <td className="px-2 py-2 text-center text-slate-700 dark:text-slate-300">
                          {row.latestHeightCm != null ? `${row.latestHeightCm.toFixed(1)} cm` : "-"}
                        </td>
                        <td className="px-2 py-2 text-center">{measurementStatusChip(row.hasCurrentEnrollmentMeasurement)}</td>
                        <td className="px-2 py-2 text-center">
                          <Link href={`/nutrition/players/${row.playerId}`} className="font-medium text-portoBlue hover:underline">
                            Abrir ficha
                          </Link>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

export default async function NutritionMeasurementsPage({ searchParams }: { searchParams: SearchParams }) {
  await requireNutritionContext("/unauthorized");
  const params = await searchParams;
  const selectedCampusId = params.campus ?? "";
  const selectedGender = params.gender === "male" || params.gender === "female" ? params.gender : "";
  const status = params.status === "all" ? "all" : "pending";
  const queryText = params.q ?? "";
  const view = params.view === "list" ? "list" : "groups";

  const [campuses, rows, groupedData] = await Promise.all([
    view === "list" ? listNutritionCampuses() : Promise.resolve([]),
    view === "list"
      ? listNutritionMeasurementRows({
          campusId: selectedCampusId || undefined,
          q: queryText || undefined,
          intakeStatus: status,
        })
      : Promise.resolve([]),
    view === "groups"
      ? getNutritionGroupedRosterData({
          campusId: selectedCampusId || undefined,
          gender: selectedGender || undefined,
          intakeStatus: status,
        })
      : Promise.resolve(null),
  ]);

  return (
    <PageShell
      title="Toma de medidas"
      subtitle="Cola de primera toma y vista general de jugadores activos visibles para nutricion."
      breadcrumbs={[{ label: "Nutricion", href: "/nutrition" }, { label: "Toma de medidas" }]}
      wide
    >
      <div className="space-y-4">
        <NutritionViewTabs view={view} status={status} campusId={selectedCampusId} gender={selectedGender} />

        {view === "groups" ? (
          <NutritionGroupedRoster data={groupedData} />
        ) : (
          <>
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
          </>
        )}
      </div>
    </PageShell>
  );
}
