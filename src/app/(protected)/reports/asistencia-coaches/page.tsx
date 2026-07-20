import Link from "next/link";
import { AttendanceCampusButtons } from "@/components/attendance/attendance-campus-buttons";
import { CoachAttendanceCharts } from "@/components/reports/coach-attendance-charts";
import { CoachAttendancePrintButton } from "@/components/reports/coach-attendance-print-button";
import { PageShell } from "@/components/ui/page-shell";
import { requireAttendanceReadContext } from "@/lib/auth/permissions";
import { getCoachAttendanceReport } from "@/lib/queries/coach-attendance-report";

type SearchParams = Promise<{ campus?: string; month?: string; coach?: string }>;

function formatRate(value: number | null) {
  return value == null ? "Sin datos" : `${value}%`;
}

function monthLabel(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  if (!year || !monthNumber) return month;
  const label = new Intl.DateTimeFormat("es-MX", { month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(year, monthNumber - 1, 1)));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function rateClass(value: number | null) {
  if (value == null) return "text-slate-500";
  if (value >= 80) return "text-emerald-700";
  if (value >= 60) return "text-amber-700";
  return "text-rose-700";
}

export default async function CoachAttendanceReportPage({ searchParams }: { searchParams: SearchParams }) {
  await requireAttendanceReadContext("/unauthorized");
  const params = await searchParams;
  const data = await getCoachAttendanceReport({ campusId: params.campus, month: params.month, coachId: params.coach });
  const printableCoachName = data.selectedCoachSummary?.coachName ?? "Todos los coaches";

  return (
    <PageShell
      title="Asistencia por coach"
      subtitle={`Participacion mensual por campus, categoria, coach y grupo | ${monthLabel(data.selectedMonth)}`}
      breadcrumbs={[{ label: "Reportes" }, { label: "Asistencia por coach" }]}
      wide
    >
      <div className="space-y-5">
        <section className="space-y-3 rounded-md border border-slate-200 bg-slate-50 p-3 print:hidden dark:border-slate-700 dark:bg-slate-900">
          <AttendanceCampusButtons
            pathname="/reports/asistencia-coaches"
            campuses={data.campuses}
            selectedCampusId={data.selectedCampusId}
            params={{ month: data.selectedMonth, coach: data.selectedCoachId }}
            allLabel="Todos"
          />
          <form className="grid items-end gap-3 md:grid-cols-[minmax(12rem,0.7fr)_minmax(16rem,1fr)_auto_auto]">
            {data.selectedCampusId ? <input type="hidden" name="campus" value={data.selectedCampusId} /> : null}
            <label className="text-sm font-medium">
              Mes
              <input name="month" type="month" defaultValue={data.selectedMonth} className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-950" />
            </label>
            <label className="text-sm font-medium">
              Coach
              <select name="coach" defaultValue={data.selectedCoachId} className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-950">
                <option value="">Todos los coaches</option>
                {data.coachOptions.map((coach) => <option key={coach.id} value={coach.id}>{coach.name}</option>)}
              </select>
            </label>
            <button type="submit" className="rounded-md bg-portoBlue px-4 py-2 text-sm font-semibold text-white hover:bg-portoDark">Aplicar</button>
            <div className="flex gap-2">
              <Link href="/reports/asistencia-coaches" prefetch={false} className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800">Limpiar</Link>
              <CoachAttendancePrintButton selectedCoach={Boolean(data.selectedCoachId)} />
            </div>
          </form>
          <p className="text-xs text-slate-500">
            Cuenta como asistencia solo un registro confirmado A Asistio. Los grupos sin sesiones completadas quedan fuera del porcentaje.
          </p>
          <p className="text-xs text-slate-500">
            El Panel general cuenta a todos los jugadores activos. Este reporte cuenta solo el plantel asignado a grupos; el total general evita duplicar jugadores en grupos con coach principal y auxiliar.
          </p>
        </section>

        <div className="hidden border-b border-black pb-2 text-xs print:block">
          <strong>{printableCoachName}</strong> | {monthLabel(data.selectedMonth)}
        </div>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6 print:grid-cols-6 print:gap-1">
          {[
            ["Plantel asignado", data.totals.rosterCount],
            ["Evaluados", data.totals.evaluatedCount],
            ["Con asistencia", data.totals.attendedCount],
            ["Sin asistencia", data.totals.notAttendedCount],
            ["Participacion", formatRate(data.totals.participationRate)],
            ["Sin sesiones", data.totals.groupsWithoutSessions],
          ].map(([label, value]) => (
            <article key={label} className="rounded-md border border-slate-200 bg-slate-50 p-3 print:rounded-none print:border-black print:bg-white print:p-1 dark:border-slate-700 dark:bg-slate-900">
              <p className="text-[11px] font-semibold uppercase text-slate-500 print:text-[8px] print:text-black">{label}</p>
              <p className="mt-1 text-xl font-semibold print:text-sm">{value}</p>
            </article>
          ))}
        </section>

        {data.totals.groupsWithoutSessions > 0 ? (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 print:border-black print:bg-white print:text-[9px]">
            {data.totals.groupsWithoutSessions} grupo(s) no tienen sesiones completadas en este mes y no afectan el porcentaje.
          </p>
        ) : null}

        <CoachAttendanceCharts
          attended={data.totals.attendedCount}
          notAttended={data.totals.notAttendedCount}
          selectedCoach={data.selectedCoachSummary}
          coachSummaries={data.coachSummaries}
        />

        <section className="print:hidden">
          <h2 className="mb-2 text-base font-semibold">Resumen por coach</h2>
          <div className="overflow-x-auto rounded-md border border-slate-200 dark:border-slate-700">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500 dark:bg-slate-900">
                <tr><th className="px-3 py-2">Coach</th><th className="px-3 py-2 text-center">Grupos</th><th className="px-3 py-2 text-center">Plantel</th><th className="px-3 py-2 text-center">Con asistencia</th><th className="px-3 py-2 text-center">Sin asistencia</th><th className="px-3 py-2 text-center">Participacion</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                {data.coachSummaries.map((coach) => (
                  <tr key={coach.coachId}>
                    <td className="px-3 py-2 font-medium">{coach.coachName}{coach.groupsWithoutSessions > 0 ? <span className="ml-2 text-xs text-amber-700">{coach.groupsWithoutSessions} sin sesiones</span> : null}</td>
                    <td className="px-3 py-2 text-center">{coach.groups}</td><td className="px-3 py-2 text-center">{coach.rosterCount}</td><td className="px-3 py-2 text-center text-emerald-700">{coach.attendedCount}</td><td className="px-3 py-2 text-center text-rose-700">{coach.notAttendedCount}</td><td className={`px-3 py-2 text-center font-semibold ${rateClass(coach.participationRate)}`}>{formatRate(coach.participationRate)}</td>
                  </tr>
                ))}
                {data.coachSummaries.length === 0 ? <tr><td colSpan={6} className="px-3 py-8 text-center text-slate-500">Sin datos para este alcance.</td></tr> : null}
              </tbody>
              {data.coachSummaries.length > 0 ? (
                <tfoot className="border-t-2 border-slate-300 bg-slate-100 font-semibold dark:border-slate-600 dark:bg-slate-950">
                  <tr>
                    <td className="px-3 py-2">Total general <span className="block text-[11px] font-normal text-slate-500">Jugadores unicos, sin duplicar coaches compartidos</span></td>
                    <td className="px-3 py-2 text-center">{data.totals.groups}</td>
                    <td className="px-3 py-2 text-center">{data.totals.rosterCount}</td>
                    <td className="px-3 py-2 text-center text-emerald-700">{data.totals.attendedCount}</td>
                    <td className="px-3 py-2 text-center text-rose-700">{data.totals.notAttendedCount}</td>
                    <td className={`px-3 py-2 text-center ${rateClass(data.totals.participationRate)}`}>{formatRate(data.totals.participationRate)}</td>
                  </tr>
                </tfoot>
              ) : null}
            </table>
          </div>
        </section>

        <section className="space-y-5 print:space-y-3">
          <div>
            <h2 className="text-base font-semibold print:text-sm">Detalle del reporte</h2>
            <p className="text-xs text-slate-500 print:text-black">Orden: campus, categoria, coach y grupo. Las listas muestran el plantel activo actual.</p>
          </div>
          {data.campusSections.map((campus) => (
            <section key={campus.campusId} className="space-y-4 print:space-y-2">
              <h2 className="border-b-2 border-portoBlue pb-1 text-lg font-semibold print:border-black print:text-sm">{campus.campusName}</h2>
              {campus.birthYears.map((year) => (
                <section key={year.label} className="space-y-3 rounded-md border border-sky-200 p-3 print:space-y-1 print:rounded-none print:border-black print:p-1 dark:border-sky-800">
                  <h3 className="border-b border-sky-200 pb-2 text-[17px] font-bold text-slate-900 print:border-black print:pb-1 print:text-xs dark:border-sky-800 dark:text-slate-100">{year.label}</h3>
                  {year.coaches.map((coach) => (
                    <section key={coach.coachId} className="space-y-2 print:space-y-1">
                      <h4 className="text-sm font-semibold print:text-[10px]">Coach {coach.coachName}</h4>
                      {coach.groups.map((group, groupIndex) => (
                        <article key={`${group.trainingGroupId}:${group.coachId}`} className={`border-t border-slate-200 px-2 py-2 print:border-black print:bg-white print:px-0 print:py-1 dark:border-slate-700 ${groupIndex % 2 === 0 ? "bg-sky-50/70 dark:bg-sky-950/30" : "bg-white dark:bg-slate-950"}`}>
                          <div className="grid gap-1 text-sm sm:grid-cols-[minmax(12rem,1fr)_repeat(5,auto)] sm:items-center sm:gap-4 print:grid-cols-[1fr_repeat(5,auto)] print:text-[8px]">
                            <strong>{group.trainingGroupName} <span className="font-normal text-slate-500 print:text-black">({group.coachRole})</span></strong>
                            <span>Sesiones: {group.completedSessions}</span><span>Plantel: {group.rosterCount}</span><span>A: {group.attendedCount}</span><span>Sin A: {group.notAttendedCount}</span><strong className={rateClass(group.participationRate)}>{formatRate(group.participationRate)}</strong>
                          </div>
                          {group.completedSessions === 0 ? (
                            <p className="mt-1 text-xs text-amber-700 print:text-[8px] print:text-black">Sin sesiones registradas. Plantel no evaluado: {group.players.map((player) => player.playerName).join(", ")}.</p>
                          ) : (
                            <div className="mt-2 grid gap-2 md:grid-cols-2 print:mt-1 print:grid-cols-2 print:gap-3 print:text-[8px]">
                              <p><strong>Con asistencia:</strong> {group.players.filter((player) => player.attended).map((player) => player.playerName).join(", ") || "Ninguno"}.</p>
                              <p><strong>Sin asistencia:</strong> {group.players.filter((player) => !player.attended).map((player) => player.playerName).join(", ") || "Ninguno"}.</p>
                            </div>
                          )}
                        </article>
                      ))}
                    </section>
                  ))}
                </section>
              ))}
            </section>
          ))}
          {data.campusSections.length === 0 ? <p className="py-8 text-center text-sm text-slate-500">Sin planteles activos para este alcance.</p> : null}
        </section>
      </div>
    </PageShell>
  );
}
