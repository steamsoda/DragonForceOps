import { AttendanceCampusButtons } from "@/components/attendance/attendance-campus-buttons";
import { PageShell } from "@/components/ui/page-shell";
import { requireAttendanceReadContext } from "@/lib/auth/permissions";
import { getTrainingWorkloadReport, type TrainingWorkloadSessionCell } from "@/lib/queries/training-workload-report";

type SearchParams = Promise<{ campus?: string }>;

function compactDate(value: string) {
  const [year, month, day] = value.split("-");
  return `${day}/${month}`;
}

function fullDate(value: string) {
  return new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T12:00:00Z`));
}

function averageLabel(value: number | null) {
  return value == null ? "-" : value.toLocaleString("es-MX", { maximumFractionDigits: 1 });
}

function SessionValue({ cell }: { cell?: TrainingWorkloadSessionCell }) {
  if (!cell) return <span className="text-slate-300 dark:text-slate-700">-</span>;
  if (cell.status === "unregistered") {
    return (
      <span className="inline-flex min-w-10 flex-col items-center rounded border border-amber-300 bg-amber-50 px-1 py-0.5 font-semibold text-amber-800 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200" title="Sesion pasada sin asistencia registrada">
        <span>SR</span>
        {cell.tryouts > 0 ? <span className="text-[9px]">+{cell.tryouts}P</span> : null}
      </span>
    );
  }
  return (
    <span className="inline-flex min-w-10 flex-col items-center rounded border border-emerald-200 bg-emerald-50 px-1 py-0.5 font-semibold text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200" title={`${cell.officialAttended} oficiales${cell.tryouts ? ` + ${cell.tryouts} prueba` : ""}`}>
      <span>{cell.officialAttended}</span>
      {cell.tryouts > 0 ? <span className="text-[9px] text-blue-700 dark:text-blue-300">+{cell.tryouts}P</span> : null}
    </span>
  );
}

export default async function TrainingWorkloadReportPage({ searchParams }: { searchParams: SearchParams }) {
  await requireAttendanceReadContext("/unauthorized");
  const params = await searchParams;
  const data = await getTrainingWorkloadReport({ campusId: params.campus });

  return (
    <PageShell
      title="Carga de entrenamiento"
      subtitle={`Jugadores atendidos por coach y grupo en los ultimos 30 dias naturales | ${data.selectedCampusName ?? "Sin campus"}`}
      breadcrumbs={[{ label: "Reportes" }, { label: "Carga de entrenamiento" }]}
      wide
    >
      <div className="space-y-5">
        <section className="rounded-md border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900">
          <AttendanceCampusButtons
            pathname="/reports/carga-entrenamiento"
            campuses={data.campuses}
            selectedCampusId={data.selectedCampusId}
            showAll={false}
          />
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600 dark:text-slate-300">
            <span><strong>Periodo:</strong> {fullDate(data.periodStart)} al {fullDate(data.periodEnd)}</span>
            <span><strong>Lectura:</strong> numero = asistencia oficial, <span className="text-blue-700 dark:text-blue-300">+P</span> = clases de prueba, <span className="text-amber-700 dark:text-amber-300">SR</span> = sin registrar.</span>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          {[
            ["Unidades coach", data.totals.coachUnits],
            ["Grupos", data.totals.groups],
            ["Sesiones registradas", data.totals.completedSessions],
            ["Sin registrar", data.totals.unregisteredSessions],
            ["Prom. oficiales", averageLabel(data.totals.officialAverage)],
            ["Prom. total", averageLabel(data.totals.totalAverage)],
          ].map(([label, value]) => (
            <article key={label} className="rounded-md border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900">
              <p className="text-[11px] font-semibold uppercase text-slate-500">{label}</p>
              <p className="mt-1 text-xl font-semibold">{value}</p>
            </article>
          ))}
        </section>

        {data.totals.legacySessions > 0 ? (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
            Las sesiones historicas marcadas como legado usan la asignacion de coaches disponible al crear esta herramienta. Las sesiones nuevas conservan el coach real de la sesion.
          </p>
        ) : null}

        <section className="space-y-5">
          {data.coachSections.map((section) => (
            <article key={section.coachUnitKey} className="overflow-hidden rounded-md border border-slate-200 dark:border-slate-700">
              <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-900">
                <div>
                  <h2 className="font-semibold">Coach {section.coachUnitName}</h2>
                  <p className="text-xs text-slate-500">{section.groups.length} grupo(s) | {section.sessionColumns.length} fecha/horario(s)</p>
                </div>
                {section.legacySessions > 0 ? <span className="rounded-full border border-amber-300 px-2 py-1 text-[10px] font-semibold text-amber-800 dark:border-amber-700 dark:text-amber-200">Historial legado</span> : null}
              </header>
              <div className="overflow-x-auto">
                <table className="min-w-max border-collapse text-xs">
                  <thead className="bg-white text-slate-500 dark:bg-slate-950">
                    <tr>
                      <th className="sticky left-0 z-20 min-w-44 border-b border-r border-slate-200 bg-white px-3 py-2 text-left dark:border-slate-700 dark:bg-slate-950">Grupo</th>
                      <th className="min-w-20 border-b border-r border-slate-200 px-2 py-2 text-center dark:border-slate-700">Cat.</th>
                      <th className="min-w-24 border-b border-r border-slate-200 px-2 py-2 text-center dark:border-slate-700">Horario</th>
                      {section.sessionColumns.map((column) => (
                        <th key={column.key} className="min-w-14 border-b border-r border-slate-200 px-1 py-1 text-center dark:border-slate-700" title={fullDate(column.date)}>
                          <span className="block font-semibold text-slate-700 dark:text-slate-200">{compactDate(column.date)}</span>
                        </th>
                      ))}
                      <th className="min-w-20 border-b border-r border-slate-200 bg-emerald-50 px-2 py-2 text-center dark:border-slate-700 dark:bg-emerald-950/20">Prom.<br />oficial</th>
                      <th className="min-w-20 border-b border-r border-slate-200 bg-blue-50 px-2 py-2 text-center dark:border-slate-700 dark:bg-blue-950/20">Prom.<br />pruebas</th>
                      <th className="min-w-20 border-b border-slate-200 bg-slate-100 px-2 py-2 text-center dark:border-slate-700 dark:bg-slate-900">Prom.<br />total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                    {section.groups.map((group) => (
                      <tr key={group.rowKey} className="hover:bg-slate-50 dark:hover:bg-slate-900/70">
                        <td className="sticky left-0 z-10 border-r border-slate-200 bg-white px-3 py-2 font-medium dark:border-slate-700 dark:bg-slate-950">{group.trainingGroupName}</td>
                        <td className="border-r border-slate-200 px-2 py-2 text-center dark:border-slate-700">{group.birthYearLabel}</td>
                        <td className="border-r border-slate-200 px-2 py-2 text-center tabular-nums dark:border-slate-700">{group.scheduleLabel}</td>
                        {section.sessionColumns.map((column) => (
                          <td key={column.key} className="border-r border-slate-200 px-1 py-1 text-center tabular-nums dark:border-slate-700"><SessionValue cell={group.cells[column.key]} /></td>
                        ))}
                        <td className="border-r border-slate-200 bg-emerald-50/50 px-2 py-2 text-center font-semibold tabular-nums dark:border-slate-700 dark:bg-emerald-950/10">{averageLabel(group.officialAverage)}</td>
                        <td className="border-r border-slate-200 bg-blue-50/50 px-2 py-2 text-center font-semibold tabular-nums dark:border-slate-700 dark:bg-blue-950/10">{averageLabel(group.tryoutAverage)}</td>
                        <td className="bg-slate-50 px-2 py-2 text-center font-semibold tabular-nums dark:bg-slate-900">{averageLabel(group.totalAverage)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>
          ))}
          {data.coachSections.length === 0 ? (
            <p className="rounded-md border border-slate-200 px-4 py-10 text-center text-sm text-slate-500 dark:border-slate-700">No hay sesiones dentro de los ultimos 30 dias para este campus.</p>
          ) : null}
        </section>
      </div>
    </PageShell>
  );
}
