import Link from "next/link";
import { AttendanceCampusButtons } from "@/components/attendance/attendance-campus-buttons";
import { WeeklyAttendanceFrequencyChart } from "@/components/reports/weekly-attendance-frequency-chart";
import { PageShell } from "@/components/ui/page-shell";
import { requireAttendanceReadContext } from "@/lib/auth/permissions";
import { getWeeklyAttendanceFrequencyReport } from "@/lib/queries/weekly-attendance-frequency-report";

type SearchParams = Promise<{ campus?: string; coach?: string; group?: string }>;

function formatRate(value: number | null) {
  return value == null ? "Sin datos" : `${value}%`;
}

function formatAverage(value: number | null) {
  return value == null ? "Sin datos" : value.toLocaleString("es-MX", { minimumFractionDigits: 1, maximumFractionDigits: 2 });
}

function weekLabel(start: string, end: string) {
  const format = (value: string) => {
    const [year, month, day] = value.split("-");
    return `${day}/${month}/${year}`;
  };
  return `${format(start)} - ${format(end)}`;
}

export default async function WeeklyAttendanceFrequencyPage({ searchParams }: { searchParams: SearchParams }) {
  await requireAttendanceReadContext("/unauthorized");
  const params = await searchParams;
  const data = await getWeeklyAttendanceFrequencyReport({ campusId: params.campus, coachId: params.coach, trainingGroupId: params.group });

  return (
    <PageShell
      title="Frecuencia semanal de asistencia"
      subtitle={`Cuantas sesiones asiste cada jugador durante las ultimas ${data.weekCount} semanas completas`}
      breadcrumbs={[{ label: "Reportes" }, { label: "Frecuencia semanal" }]}
      wide
    >
      <div className="space-y-5">
        <section className="space-y-3 rounded-md border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900">
          <AttendanceCampusButtons
            pathname="/reports/frecuencia-semanal"
            campuses={data.campuses}
            selectedCampusId={data.selectedCampusId}
            params={{ coach: data.selectedCoachId, group: data.selectedTrainingGroupId }}
            allLabel="Todos"
          />
          <form className="grid items-end gap-3 lg:grid-cols-[minmax(14rem,0.8fr)_minmax(18rem,1.4fr)_auto_auto]">
            {data.selectedCampusId ? <input type="hidden" name="campus" value={data.selectedCampusId} /> : null}
            <label className="text-sm font-medium">
              Profesor
              <select name="coach" defaultValue={data.selectedCoachId} className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-950">
                <option value="">Todos los profesores</option>
                {data.coachOptions.map((coach) => <option key={coach.id} value={coach.id}>{coach.name}</option>)}
              </select>
            </label>
            <label className="text-sm font-medium">
              Grupo de entrenamiento
              <select name="group" defaultValue={data.selectedTrainingGroupId} className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-950">
                <option value="">Todos los grupos</option>
                {data.groupOptions.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
              </select>
            </label>
            <button className="rounded-md bg-portoBlue px-4 py-2 text-sm font-semibold text-white hover:bg-portoDark">Aplicar</button>
            <Link href="/reports/frecuencia-semanal" prefetch={false} className="rounded-md border border-slate-300 px-4 py-2 text-center text-sm font-semibold hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800">Limpiar</Link>
          </form>
          <p className="text-xs text-slate-500">
            Solo cuenta A Asistio en sesiones de entrenamiento completadas. Las semanas son lunes a domingo en Monterrey; la semana actual, sesiones canceladas, sesiones sin registrar y clases de prueba no alteran este reporte.
          </p>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ["Semanas completas", data.weeklySummaries.length],
            ["Sesiones ofrecidas", data.totals.sessionsOffered],
            ["Promedio por jugador/semana", formatAverage(data.totals.averageSessionsAttended)],
            ["Porcentaje de asistencia", formatRate(data.totals.attendanceRate)],
          ].map(([label, value]) => (
            <article key={label} className="rounded-md border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900">
              <p className="text-[11px] font-semibold uppercase text-slate-500">{label}</p>
              <p className="mt-1 text-xl font-semibold">{value}</p>
            </article>
          ))}
        </section>

        <WeeklyAttendanceFrequencyChart weeks={data.weeklySummaries} />

        <section>
          <h2 className="mb-2 text-base font-semibold">Resumen semanal</h2>
          <div className="overflow-x-auto rounded-md border border-slate-200 dark:border-slate-700">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500 dark:bg-slate-900">
                <tr>
                  <th className="px-3 py-2">Semana</th><th className="px-3 py-2 text-center">Sesiones</th><th className="px-3 py-2 text-center">Evaluados</th><th className="px-3 py-2 text-center">0</th><th className="px-3 py-2 text-center">1</th><th className="px-3 py-2 text-center">2</th><th className="px-3 py-2 text-center">3</th><th className="px-3 py-2 text-center">4+</th><th className="px-3 py-2 text-center">Promedio</th><th className="px-3 py-2 text-center">Asistencia</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                {data.weeklySummaries.map((week) => (
                  <tr key={week.key}>
                    <td className="whitespace-nowrap px-3 py-2 font-medium">{week.weekStart && week.weekEnd ? weekLabel(week.weekStart, week.weekEnd) : week.label}</td>
                    <td className="px-3 py-2 text-center">{week.sessionsOffered}</td><td className="px-3 py-2 text-center">{week.playerWeeks}</td><td className="px-3 py-2 text-center text-rose-700">{week.buckets.zero}</td><td className="px-3 py-2 text-center text-amber-700">{week.buckets.one}</td><td className="px-3 py-2 text-center">{week.buckets.two}</td><td className="px-3 py-2 text-center text-emerald-700">{week.buckets.three}</td><td className="px-3 py-2 text-center text-teal-700">{week.buckets.fourPlus}</td><td className="px-3 py-2 text-center">{formatAverage(week.averageSessionsAttended)}</td><td className="px-3 py-2 text-center font-semibold">{formatRate(week.attendanceRate)}</td>
                  </tr>
                ))}
                {data.weeklySummaries.length === 0 ? <tr><td colSpan={10} className="px-3 py-8 text-center text-slate-500">Sin asistencia registrada en semanas completas para este alcance.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold">Comparativo por grupo</h2>
          <div className="overflow-x-auto rounded-md border border-slate-200 dark:border-slate-700">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500 dark:bg-slate-900">
                <tr><th className="px-3 py-2">Campus | Categoria | Grupo | Profesor</th><th className="px-3 py-2 text-center">Sesiones</th><th className="px-3 py-2 text-center">Jugador-semana</th><th className="px-3 py-2 text-center">0</th><th className="px-3 py-2 text-center">1</th><th className="px-3 py-2 text-center">2</th><th className="px-3 py-2 text-center">3</th><th className="px-3 py-2 text-center">4+</th><th className="px-3 py-2 text-center">Promedio</th><th className="px-3 py-2 text-center">Asistencia</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                {data.groupSummaries.map((group) => (
                  <tr key={group.key}>
                    <td className="px-3 py-2 font-medium">{group.label}</td><td className="px-3 py-2 text-center">{group.sessionsOffered}</td><td className="px-3 py-2 text-center">{group.playerWeeks}</td><td className="px-3 py-2 text-center text-rose-700">{group.buckets.zero}</td><td className="px-3 py-2 text-center text-amber-700">{group.buckets.one}</td><td className="px-3 py-2 text-center">{group.buckets.two}</td><td className="px-3 py-2 text-center text-emerald-700">{group.buckets.three}</td><td className="px-3 py-2 text-center text-teal-700">{group.buckets.fourPlus}</td><td className="px-3 py-2 text-center">{formatAverage(group.averageSessionsAttended)}</td><td className="px-3 py-2 text-center font-semibold">{formatRate(group.attendanceRate)}</td>
                  </tr>
                ))}
                {data.groupSummaries.length === 0 ? <tr><td colSpan={10} className="px-3 py-8 text-center text-slate-500">Sin grupos evaluados.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </PageShell>
  );
}
