import Link from "next/link";
import { AttendanceCampusButtons } from "@/components/attendance/attendance-campus-buttons";
import { TrainingWorkloadPrintButton } from "@/components/reports/training-workload-print-button";
import { PageShell } from "@/components/ui/page-shell";
import { requireAttendanceReadContext } from "@/lib/auth/permissions";
import {
  getTrainingWorkloadReport,
  type TrainingWorkloadGroupRow,
  type TrainingWorkloadSessionCell,
} from "@/lib/queries/training-workload-report";

type SearchParams = Promise<{ campus?: string; mode?: string }>;
type ReportMode = "coach" | "schedule";
type DisplayRow = TrainingWorkloadGroupRow & { coachUnitName?: string };
type DisplaySection = {
  key: string;
  name: string;
  detail: string;
  sessionColumns: Array<{ key: string; date: string }>;
  groups: DisplayRow[];
};

function compactDate(value: string) {
  const [, month, day] = value.split("-");
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

function modeHref(mode: ReportMode, campusId: string | null) {
  const search = new URLSearchParams({ mode });
  if (campusId) search.set("campus", campusId);
  return `/reports/carga-entrenamiento?${search.toString()}`;
}

function SessionValue({ cell }: { cell: TrainingWorkloadSessionCell }) {
  if (cell.status === "unregistered") {
    return (
      <Link href={`/attendance/sessions/${cell.sessionId}`} prefetch={false} className="inline-flex min-w-10 flex-col items-center rounded border border-amber-300 bg-amber-50 px-1 py-0.5 font-semibold text-amber-800 hover:bg-amber-100 focus:outline-none focus:ring-2 focus:ring-amber-500 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200 dark:hover:bg-amber-900/50 print:min-w-0 print:rounded-none print:border-0 print:bg-white print:p-0 print:text-black" title="Abrir sesion sin asistencia registrada">
        <span>SR</span>
        {cell.tryouts > 0 ? <span className="text-[9px] print:text-[5px]">+{cell.tryouts}P</span> : null}
      </Link>
    );
  }
  return (
    <Link href={`/attendance/sessions/${cell.sessionId}`} prefetch={false} className="inline-flex min-w-10 flex-col items-center rounded border border-emerald-200 bg-emerald-50 px-1 py-0.5 font-semibold text-emerald-800 hover:bg-emerald-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200 dark:hover:bg-emerald-900/40 print:min-w-0 print:rounded-none print:border-0 print:bg-white print:p-0 print:text-black" title={`${cell.officialAttended} de ${cell.officialRoster} jugadores asistieron${cell.tryouts ? ` + ${cell.tryouts} prueba` : ""}. Abrir sesion.`}>
      <span>{cell.officialAttended}</span>
      {cell.tryouts > 0 ? <span className="text-[9px] text-blue-700 dark:text-blue-300 print:text-[5px] print:text-black">+{cell.tryouts}P</span> : null}
    </Link>
  );
}

function SessionValues({ cells }: { cells?: TrainingWorkloadSessionCell[] }) {
  if (!cells?.length) return <span className="text-slate-300 dark:text-slate-700 print:text-slate-400">-</span>;
  return <div className="flex flex-wrap justify-center gap-1 print:gap-0.5">{cells.map((cell) => <SessionValue key={cell.sessionId} cell={cell} />)}</div>;
}

function WorkloadMatrix({ sections, mode }: { sections: DisplaySection[]; mode: ReportMode }) {
  return (
    <section className="space-y-5 print:space-y-2">
      {sections.map((section) => (
        <article key={section.key} className="overflow-hidden rounded-md border border-slate-200 dark:border-slate-700 print:overflow-visible print:rounded-none print:border-black print:break-inside-auto">
          <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-900 print:bg-white print:px-1 print:py-1">
            <div>
              <h2 className="font-semibold print:text-[9px]">{mode === "coach" ? "Coach " : ""}{section.name}</h2>
              <p className="text-xs text-slate-500 print:text-[6px] print:text-black">{section.detail}</p>
            </div>
          </header>
          <div className="overflow-x-auto print:overflow-visible">
            <table className="min-w-max border-collapse text-xs print:w-full print:min-w-0 print:table-fixed print:text-[6px]">
              <thead className="bg-white text-slate-500 dark:bg-slate-950 print:table-header-group print:text-black">
                <tr>
                  <th className="sticky left-0 z-20 min-w-44 border-b border-r border-slate-200 bg-white px-3 py-2 text-left dark:border-slate-700 dark:bg-slate-950 print:static print:w-24 print:border-black print:px-1 print:py-0.5">Grupo</th>
                  <th className="min-w-20 border-b border-r border-slate-200 px-2 py-2 text-center dark:border-slate-700 print:w-10 print:border-black print:px-0.5 print:py-0.5">Cat.</th>
                  <th className="min-w-24 border-b border-r border-slate-200 px-2 py-2 text-center dark:border-slate-700 print:w-20 print:border-black print:px-0.5 print:py-0.5">{mode === "coach" ? "Horario" : "Coach(es)"}</th>
                  {section.sessionColumns.map((column) => (
                    <th key={column.key} className="min-w-14 border-b border-r border-slate-200 px-1 py-1 text-center dark:border-slate-700 print:w-5 print:border-black print:p-0" title={fullDate(column.date)}>{compactDate(column.date)}</th>
                  ))}
                  <th className="min-w-20 border-b border-r border-slate-200 bg-emerald-50 px-2 py-2 text-center dark:border-slate-700 dark:bg-emerald-950/20 print:w-8 print:border-black print:bg-white print:p-0">Prom.<br />oficial</th>
                  <th className="min-w-20 border-b border-r border-slate-200 bg-cyan-50 px-2 py-2 text-center dark:border-slate-700 dark:bg-cyan-950/20 print:w-8 print:border-black print:bg-white print:p-0">%<br />asistencia</th>
                  <th className="min-w-20 border-b border-r border-slate-200 bg-blue-50 px-2 py-2 text-center dark:border-slate-700 dark:bg-blue-950/20 print:w-8 print:border-black print:bg-white print:p-0">Prom.<br />pruebas</th>
                  <th className="min-w-20 border-b border-slate-200 bg-slate-100 px-2 py-2 text-center dark:border-slate-700 dark:bg-slate-900 print:w-8 print:border-black print:bg-white print:p-0">Prom.<br />total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-700 print:divide-black">
                {section.groups.map((group) => (
                  <tr key={group.rowKey} className="hover:bg-slate-50 dark:hover:bg-slate-900/70 print:break-inside-avoid">
                    <td className="sticky left-0 z-10 border-r border-slate-200 bg-white px-3 py-2 font-medium dark:border-slate-700 dark:bg-slate-950 print:static print:border-black print:px-1 print:py-0.5">{group.trainingGroupName}</td>
                    <td className="border-r border-slate-200 px-2 py-2 text-center dark:border-slate-700 print:border-black print:p-0.5">{group.birthYearLabel}</td>
                    <td className="border-r border-slate-200 px-2 py-2 text-center tabular-nums dark:border-slate-700 print:border-black print:p-0.5">{mode === "coach" ? group.scheduleLabel : group.coachUnitName}</td>
                    {section.sessionColumns.map((column) => (
                      <td key={column.key} className="border-r border-slate-200 px-1 py-1 text-center tabular-nums dark:border-slate-700 print:border-black print:p-0"><SessionValues cells={group.cells[column.key]} /></td>
                    ))}
                    <td className="border-r border-slate-200 bg-emerald-50/50 px-2 py-2 text-center font-semibold tabular-nums dark:border-slate-700 dark:bg-emerald-950/10 print:border-black print:bg-white print:p-0">{averageLabel(group.officialAverage)}</td>
                    <td className="border-r border-slate-200 bg-cyan-50/50 px-2 py-2 text-center font-semibold tabular-nums dark:border-slate-700 dark:bg-cyan-950/10 print:border-black print:bg-white print:p-0">{group.attendanceRate == null ? "-" : `${averageLabel(group.attendanceRate)}%`}</td>
                    <td className="border-r border-slate-200 bg-blue-50/50 px-2 py-2 text-center font-semibold tabular-nums dark:border-slate-700 dark:bg-blue-950/10 print:border-black print:bg-white print:p-0">{averageLabel(group.tryoutAverage)}</td>
                    <td className="bg-slate-50 px-2 py-2 text-center font-semibold tabular-nums dark:bg-slate-900 print:bg-white print:p-0">{averageLabel(group.totalAverage)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      ))}
      {sections.length === 0 ? <p className="rounded-md border border-slate-200 px-4 py-10 text-center text-sm text-slate-500 dark:border-slate-700">No hay sesiones dentro de los ultimos 30 dias para este campus.</p> : null}
    </section>
  );
}

export default async function TrainingWorkloadReportPage({ searchParams }: { searchParams: SearchParams }) {
  await requireAttendanceReadContext("/unauthorized");
  const params = await searchParams;
  const mode: ReportMode = params.mode === "schedule" ? "schedule" : "coach";
  const data = await getTrainingWorkloadReport({ campusId: params.campus });
  const sections: DisplaySection[] = mode === "coach"
    ? data.coachSections.map((section) => ({
        key: section.coachUnitKey,
        name: section.coachUnitName,
        detail: `${section.groups.length} grupo(s) | ${section.sessionColumns.length} dia(s) con sesion`,
        sessionColumns: section.sessionColumns,
        groups: section.groups,
      }))
    : data.scheduleSections.map((section) => ({
        key: section.blockKey,
        name: section.blockName,
        detail: `${section.groups.length} grupo/coaching unit(s) | ${section.sessionColumns.length} dia(s) con sesion`,
        sessionColumns: section.sessionColumns,
        groups: section.groups,
      }));

  return (
    <PageShell
      title="Promedios de asistencia por coach"
      subtitle={`Jugadores atendidos por coach y grupo en los ultimos 30 dias naturales | ${data.selectedCampusName ?? "Sin campus"}`}
      breadcrumbs={[{ label: "Reportes" }, { label: "Carga de entrenamiento" }]}
      wide
    >
      <style>{`@media print { @page { size: landscape; margin: 7mm; } }`}</style>
      <div className="space-y-5 print:space-y-2">
        <section className="rounded-md border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900 print:hidden">
          <AttendanceCampusButtons pathname="/reports/carga-entrenamiento" campuses={data.campuses} selectedCampusId={data.selectedCampusId} params={{ mode }} showAll={false} />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-3 dark:border-slate-700">
            <div className="flex rounded-md border border-slate-300 bg-white p-1 dark:border-slate-600 dark:bg-slate-950">
              <Link href={modeHref("coach", data.selectedCampusId)} prefetch={false} className={`rounded px-4 py-2 text-sm font-semibold ${mode === "coach" ? "bg-portoBlue text-white" : "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"}`}>Por coach</Link>
              <Link href={modeHref("schedule", data.selectedCampusId)} prefetch={false} className={`rounded px-4 py-2 text-sm font-semibold ${mode === "schedule" ? "bg-portoBlue text-white" : "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"}`}>Por horario</Link>
            </div>
            <TrainingWorkloadPrintButton />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600 dark:text-slate-300">
            <span><strong>Periodo:</strong> {fullDate(data.periodStart)} al {fullDate(data.periodEnd)}</span>
            <span><strong>Lectura:</strong> numero = asistencia oficial, <span className="text-blue-700 dark:text-blue-300">+P</span> = clases de prueba, <span className="text-amber-700 dark:text-amber-300">SR</span> = sin registrar.</span>
          </div>
        </section>

        <div className="hidden border-b border-black pb-1 text-[7px] print:block">
          <strong>{mode === "coach" ? "Por coach" : "Por horario"}</strong> | {data.selectedCampusName} | {fullDate(data.periodStart)} al {fullDate(data.periodEnd)} | Numero = oficial, +P = prueba, SR = sin registrar
        </div>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6 print:hidden">
          {[
            [mode === "coach" ? "Unidades coach" : "Bloques", mode === "coach" ? data.totals.coachUnits : data.scheduleSections.length],
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

        <WorkloadMatrix sections={sections} mode={mode} />
      </div>
    </PageShell>
  );
}
