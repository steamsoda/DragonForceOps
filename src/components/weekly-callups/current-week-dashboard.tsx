import Link from "next/link";
import type { WeeklyCallupsFoundationData, WeeklyCallupProgram } from "@/lib/queries/weekly-callups";

type Props = {
  data: WeeklyCallupsFoundationData;
  selectedCampusId: string;
  selectedProgram: WeeklyCallupProgram;
};

const PROGRAMS: Array<{ value: WeeklyCallupProgram; label: string }> = [
  { value: "selectivo", label: "Selectivos" },
  { value: "futbol_para_todos", label: "Futbol Para Todos" },
];

function weekDetails(weekStart: string) {
  const start = new Date(`${weekStart}T12:00:00Z`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);

  const thursday = new Date(start);
  thursday.setUTCDate(thursday.getUTCDate() + 3);
  const yearStart = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1));
  const weekNumber = Math.ceil((((thursday.getTime() - yearStart.getTime()) / 86_400_000) + 1) / 7);
  const formatter = new Intl.DateTimeFormat("es-MX", { timeZone: "UTC", day: "numeric", month: "short" });

  return {
    weekNumber,
    range: `${formatter.format(start)} - ${formatter.format(end)}`,
  };
}

function updatedLabel(value: string | undefined) {
  if (!value) return "Sin reporte";
  return new Intl.DateTimeFormat("es-MX", {
    timeZone: "America/Monterrey",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function CurrentWeekDashboard({ data, selectedCampusId, selectedProgram }: Props) {
  const week = weekDetails(data.currentWeekStart);
  const tournamentById = new Map(data.tournaments.map((tournament) => [tournament.id, tournament.name]));
  const currentCallups = data.callups.filter((callup) => callup.weekStart === data.currentWeekStart);
  const hrefFor = (campusId: string, program: WeeklyCallupProgram) => {
    const callup = currentCallups.find((row) => row.campusId === campusId && row.program === program);
    return callup
      ? `/convocatorias/${callup.id}`
      : `/convocatorias?campus=${encodeURIComponent(campusId)}&program=${encodeURIComponent(program)}&week=${encodeURIComponent(data.currentWeekStart)}`;
  };

  const rows = data.scheduleUnits
    .map((group) => {
      const report = data.coachScheduleDefaults[group.id];
      return {
        ...group,
        report,
        campusName: data.campuses.find((campus) => campus.id === group.campusId)?.name ?? "Campus",
        tournamentName: report ? tournamentById.get(report.tournamentId) ?? "Torneo" : "-",
      };
    })
    .sort((a, b) => {
      const reportOrder = Number(Boolean(a.report)) - Number(Boolean(b.report));
      if (reportOrder !== 0) return reportOrder;
      return a.campusName.localeCompare(b.campusName, "es")
        || a.program.localeCompare(b.program)
        || a.primaryCoachName.localeCompare(b.primaryCoachName, "es")
        || b.categoryLabel.localeCompare(a.categoryLabel, "es", { numeric: true })
        || a.name.localeCompare(b.name, "es");
    });

  return (
    <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase text-portoBlue">Control de esta semana</p>
          <h2 className="text-xl font-semibold">Semana {week.weekNumber} <span className="font-normal text-slate-500">| {week.range}</span></h2>
          <p className="text-sm text-slate-500">Rojo requiere seguimiento. Verde confirma partido reportado o descanso.</p>
        </div>
        <span className="rounded-full border border-slate-300 px-3 py-1 text-xs font-medium">Actualiza automaticamente</span>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {data.campuses.flatMap((campus) => PROGRAMS.map((program) => {
          const groups = data.scheduleUnits.filter((group) => group.campusId === campus.id && group.program === program.value);
          const reported = groups.filter((group) => Boolean(data.coachScheduleDefaults[group.id])).length;
          const pending = groups.length - reported;
          const hasCallup = currentCallups.some((callup) => callup.campusId === campus.id && callup.program === program.value);
          const selected = campus.id === selectedCampusId && program.value === selectedProgram;
          return (
            <Link
              key={`${campus.id}:${program.value}`}
              href={hrefFor(campus.id, program.value)}
              className={`rounded-md border p-3 transition-colors ${selected ? "border-portoBlue bg-blue-50" : "border-slate-200 hover:border-slate-400"}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div><p className="font-semibold">{campus.name}</p><p className="text-xs text-slate-500">{program.label}</p></div>
                <span className={`h-3 w-3 rounded-full ${pending === 0 && groups.length > 0 ? "bg-emerald-500" : "bg-rose-500"}`} aria-label={pending === 0 ? "Completo" : "Pendiente"} />
              </div>
              <div className="mt-3 flex items-end justify-between gap-2">
                <p className="text-2xl font-semibold">{reported}<span className="text-sm font-normal text-slate-500">/{groups.length}</span></p>
                <p className={`text-xs font-semibold ${pending ? "text-rose-700" : "text-emerald-700"}`}>{pending ? `${pending} pendientes` : "Reportes completos"}</p>
              </div>
              <p className={`mt-2 border-t pt-2 text-xs font-medium ${hasCallup ? "text-emerald-700" : "text-amber-700"}`}>
                {hasCallup ? "Abrir convocatoria" : "Preparar convocatoria"}
              </p>
            </Link>
          );
        }))}
      </div>

      <div className="overflow-x-auto rounded-md border border-slate-200">
        <table className="min-w-[960px] w-full border-collapse text-sm">
          <thead className="bg-slate-100 text-left text-xs uppercase text-slate-600">
            <tr>
              <th className="px-3 py-2">Estado</th>
              <th className="px-3 py-2">Coach</th>
              <th className="px-3 py-2">Grupo</th>
              <th className="px-3 py-2">Campus / programa</th>
              <th className="px-3 py-2">Torneo</th>
              <th className="px-3 py-2 text-center">Partidos</th>
              <th className="px-3 py-2">Ultima actualizacion</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {rows.map((row) => (
              <tr key={row.id} className={row.report ? "bg-emerald-50/40" : "bg-rose-50/60"}>
                <td className="px-3 py-2">
                  <span className={`inline-flex items-center gap-2 rounded-full border px-2 py-1 text-xs font-semibold ${row.report ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-rose-300 bg-rose-50 text-rose-800"}`}>
                    <span className={`h-2 w-2 rounded-full ${row.report ? "bg-emerald-500" : "bg-rose-500"}`} />
                    {row.report ? (row.report.isRest ? "Descanso" : "Reportado") : "Pendiente"}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <span className="font-medium">{row.primaryCoachName}</span>
                  {row.auxiliaryCoachNames.length ? <span className="block text-xs text-slate-500">Aux. {row.auxiliaryCoachNames.join(", ")}</span> : null}
                  {row.report && row.report.coachName !== row.primaryCoachName ? <span className="block text-xs text-slate-500">Reporto: {row.report.coachName}</span> : null}
                </td>
                <td className="px-3 py-2"><span className="font-medium text-portoBlue">{row.name}</span><span className="block text-xs text-slate-500">Cat. {row.categoryLabel}</span></td>
                <td className="px-3 py-2">{row.campusName}<span className="block text-xs text-slate-500">{PROGRAMS.find((program) => program.value === row.program)?.label}</span></td>
                <td className="px-3 py-2">{row.report?.isRest ? "Descanso" : row.tournamentName}</td>
                <td className="px-3 py-2 text-center font-semibold">{row.report?.games.length ?? 0}</td>
                <td className="px-3 py-2 text-xs text-slate-600">{updatedLabel(row.report?.updatedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
