import Link from "next/link";
import { AttendanceRiskBadge } from "@/components/attendance/attendance-risk-badge";
import { AttendanceCampusButtons } from "@/components/attendance/attendance-campus-buttons";
import { RecentAttendanceChips } from "@/components/attendance/recent-attendance-chips";
import { WeeklyCoachPacketPrintButton } from "@/components/attendance/weekly-coach-packet-print-button";
import { PageShell } from "@/components/ui/page-shell";
import { requireAttendanceReadContext } from "@/lib/auth/permissions";
import { getAttendanceCollectionsRiskReport } from "@/lib/queries/attendance-collections-risk";
import { ATTENDANCE_SESSION_TYPE_LABELS, getAttendanceDailyReport, getAttendanceReports } from "@/lib/queries/attendance";
import { getWeeklyCoachPacket } from "@/lib/queries/weekly-coach-packet";

type SearchParams = Promise<{ campus?: string; period?: string; birthYear?: string; month?: string; date?: string; week?: string; coach?: string }>;

function formatRate(rate: number | null) {
  return rate == null ? "Sin datos" : `${rate}%`;
}

function formatPercent(numerator: number, denominator: number) {
  if (denominator <= 0) return "Sin datos";
  return `${Math.round((numerator / denominator) * 100)}%`;
}

function formatDate(value: string | null) {
  if (!value) return "-";
  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
}

function dailyAttendanceCount(counts: { present: number; absent: number; injury: number; justified: number; total: number }) {
  return counts.present + counts.injury + counts.justified;
}

const SESSION_STATUS_LABELS: Record<string, string> = {
  scheduled: "Sin registrar",
  completed: "Registrada",
  cancelled: "Cancelada",
};

function statusPillClass(status: string) {
  if (status === "completed") return "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200";
  if (status === "cancelled") return "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-200";
  return "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200";
}

function statusLabel(status: string) {
  if (status === "present") return "A Asistió";
  if (status === "absent") return "F Falta";
  if (status === "injury") return "🩹 Lesión";
  if (status === "justified") return "📝 Justificada";
  return status;
}

export default async function AttendanceReportsPage({ searchParams }: { searchParams: SearchParams }) {
  const context = await requireAttendanceReadContext("/unauthorized");
  const params = await searchParams;
  const periodDays = Number(params.period ?? 30);
  const birthYear = params.birthYear ? Number(params.birthYear) : undefined;
  const canViewCollectionsRisk = context.hasOperationalAccess;
  const [data, daily, collectionsRisk, weeklyCoachPacket] = await Promise.all([
    getAttendanceReports({
      campusId: params.campus,
      periodDays,
      birthYear: Number.isFinite(birthYear) ? birthYear : undefined,
      month: params.month,
    }),
    getAttendanceDailyReport({
      campusId: params.campus,
      date: params.date,
    }),
    canViewCollectionsRisk
      ? getAttendanceCollectionsRiskReport({
          campusId: params.campus,
          birthYear: Number.isFinite(birthYear) ? birthYear : undefined,
        })
      : Promise.resolve(null),
    getWeeklyCoachPacket({
      campusId: params.campus,
      week: params.week,
      coach: params.coach,
    }),
  ]);

  const birthYears = Array.from(new Set(data.inactivePlayers.map((row) => row.birthYear).filter((value): value is number => Boolean(value)))).sort((a, b) => b - a);
  const dailyCountedAttendance = daily.totals.present + daily.totals.injury + daily.totals.justified;
  const dailyAttendanceRate = formatPercent(dailyCountedAttendance, daily.totals.recorded);
  const dailyCaptureRate = formatPercent(daily.totals.recorded, daily.totals.expectedPlayers);
  const distributionTotal = Math.max(daily.totals.recorded, 1);
  const presentWidth = (daily.totals.present / distributionTotal) * 100;
  const absentWidth = (daily.totals.absent / distributionTotal) * 100;
  const injuryWidth = (daily.totals.injury / distributionTotal) * 100;
  const justifiedWidth = (daily.totals.justified / distributionTotal) * 100;

  return (
    <PageShell title="Reportes de asistencia" subtitle="Lectura operativa para detectar inactividad y comparar equipos." wide>
      <div className="space-y-6">
        <section className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3 print:hidden dark:border-slate-700 dark:bg-slate-900">
          <AttendanceCampusButtons
            pathname="/attendance/reports"
            campuses={data.campuses}
            selectedCampusId={data.selectedCampusId}
            params={{ period: data.periodDays, birthYear, month: data.month, date: daily.selectedDate, week: weeklyCoachPacket.week.value, coach: weeklyCoachPacket.selectedCoachKey }}
            allLabel="Todos"
          />
          <form className="grid gap-3 md:grid-cols-4">
            {data.selectedCampusId ? <input type="hidden" name="campus" value={data.selectedCampusId} /> : null}
            <label className="text-sm font-medium">
              Periodo
              <select name="period" defaultValue={data.periodDays} className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950">
                <option value="30">30 dias</option>
                <option value="60">60 dias</option>
                <option value="90">90 dias</option>
              </select>
            </label>
            <label className="text-sm font-medium">
              Categoria
              <select name="birthYear" defaultValue={birthYear ?? ""} className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950">
                <option value="">Todas</option>
                {birthYears.map((year) => <option key={year} value={year}>{year}</option>)}
              </select>
            </label>
            <label className="text-sm font-medium">
              Mes equipos
              <input name="month" type="month" defaultValue={data.month} className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950" />
            </label>
            <label className="text-sm font-medium">
              Dia
              <input name="date" type="date" defaultValue={daily.selectedDate} className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950" />
            </label>
            <div className="flex items-end">
              <button className="w-full rounded-md bg-portoBlue px-4 py-2 text-sm font-semibold text-white hover:bg-portoDark">Aplicar filtros</button>
            </div>
          </form>
        </section>

        <section className="space-y-3 print:hidden">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Reporte semanal para coaches</h2>
            <p className="text-sm text-slate-500">Paquete imprimible por campus o coach. No muestra montos ni meses pendientes.</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
            <form className="grid gap-3 md:grid-cols-[1fr_1fr_auto_auto]">
              {data.selectedCampusId ? <input type="hidden" name="campus" value={data.selectedCampusId} /> : null}
              <input type="hidden" name="period" value={data.periodDays} />
              {birthYear ? <input type="hidden" name="birthYear" value={birthYear} /> : null}
              <input type="hidden" name="month" value={data.month} />
              <input type="hidden" name="date" value={daily.selectedDate} />
              <label className="text-sm font-medium">
                Semana
                <input name="week" type="week" defaultValue={weeklyCoachPacket.week.value} className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950" />
              </label>
              <label className="text-sm font-medium">
                Coach
                <select name="coach" defaultValue={weeklyCoachPacket.selectedCoachKey} className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950">
                  <option value="">Todos los coaches</option>
                  {weeklyCoachPacket.coachOptions.map((coach) => <option key={coach.key} value={coach.key}>{coach.label}</option>)}
                </select>
              </label>
              <div className="flex items-end">
                <button className="w-full rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-portoBlue hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:hover:bg-slate-900">
                  Ver reporte
                </button>
              </div>
              <div className="flex items-end">
                <WeeklyCoachPacketPrintButton />
              </div>
            </form>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-950">
                <p className="text-xs uppercase text-slate-500">Semana</p>
                <p className="font-semibold">{weeklyCoachPacket.week.label}</p>
              </div>
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-950">
                <p className="text-xs uppercase text-slate-500">Coaches</p>
                <p className="font-semibold">{weeklyCoachPacket.totals.coaches}</p>
              </div>
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-950">
                <p className="text-xs uppercase text-slate-500">Grupos</p>
                <p className="font-semibold">{weeklyCoachPacket.totals.groups}</p>
              </div>
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-950">
                <p className="text-xs uppercase text-slate-500">Nuevos</p>
                <p className="font-semibold">{weeklyCoachPacket.totals.newPlayers}</p>
              </div>
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-950">
                <p className="text-xs uppercase text-slate-500">Seguimiento</p>
                <p className="font-semibold">{weeklyCoachPacket.totals.pendingPayment + weeklyCoachPacket.totals.absenceRisk}</p>
              </div>
            </div>
          </div>
        </section>

        <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-4 print:border-0 print:p-0 dark:border-slate-700 dark:bg-slate-900">
          <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-3 print:pb-2 dark:border-slate-700">
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">Dragon Force Monterrey</p>
              <h2 className="text-xl font-bold text-slate-900 print:text-lg dark:text-slate-100">Reporte semanal para coaches</h2>
              <p className="text-sm text-slate-500">{weeklyCoachPacket.week.label}</p>
            </div>
            <div className="text-left text-sm sm:text-right">
              <p>{weeklyCoachPacket.selectedCampusId ? weeklyCoachPacket.campuses.find((campus) => campus.id === weeklyCoachPacket.selectedCampusId)?.name : "Todos los campus"}</p>
              <p>{weeklyCoachPacket.selectedCoachKey || "Todos los coaches"}</p>
              <p>{weeklyCoachPacket.totals.players} jugadores</p>
            </div>
          </header>

          {weeklyCoachPacket.sections.map((section) => (
            <article key={section.coachKey} className="space-y-3 print:break-before-page first:print:break-before-auto">
              <div className="rounded-md bg-slate-100 px-3 py-2 print:border print:border-slate-400 print:bg-white dark:bg-slate-800">
                <h3 className="font-bold text-slate-900 dark:text-slate-100">Coach {section.coachLabel}</h3>
              </div>
              {section.groups.map((group) => (
                <div key={group.trainingGroupId} className="overflow-x-auto rounded-md border border-slate-200 print:break-inside-avoid print:overflow-visible dark:border-slate-700">
                  <div className="border-b border-slate-200 px-3 py-2 dark:border-slate-700">
                    <p className="font-semibold text-slate-900 dark:text-slate-100">{group.trainingGroupName}</p>
                    <p className="text-xs text-slate-500">{group.campusName} | Cat. {group.birthYearLabel} | {group.players.length} jugadores</p>
                  </div>
                  <table className="min-w-full border-collapse text-sm print:text-[10px]">
                    <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500 print:bg-white print:text-[9px] dark:bg-slate-950">
                      <tr>
                        <th className="w-10 border-b border-slate-200 px-2 py-2">#</th>
                        <th className="border-b border-slate-200 px-2 py-2">ID</th>
                        <th className="border-b border-slate-200 px-2 py-2">Jugador</th>
                        <th className="border-b border-slate-200 px-2 py-2">Cat.</th>
                        <th className="border-b border-slate-200 px-2 py-2">Inscripcion</th>
                        <th className="border-b border-slate-200 px-2 py-2">Semana</th>
                        <th className="border-b border-slate-200 px-2 py-2">Tags</th>
                        <th className="w-56 border-b border-slate-200 px-2 py-2">Notas</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.players.map((player, index) => (
                        <tr key={player.enrollmentId} className="border-b border-slate-100 print:border-slate-300 dark:border-slate-800">
                          <td className="px-2 py-2 align-top">{index + 1}</td>
                          <td className="px-2 py-2 align-top">{player.publicPlayerId ?? "-"}</td>
                          <td className="px-2 py-2 align-top font-medium text-slate-900 dark:text-slate-100">{player.playerName}</td>
                          <td className="px-2 py-2 align-top">{player.birthYear ?? "-"}</td>
                          <td className="px-2 py-2 align-top">{formatDate(player.enrollmentStartDate)}</td>
                          <td className="px-2 py-2 align-top">{player.attendedCount}/{player.sessionCount} asistencias</td>
                          <td className="px-2 py-2 align-top">
                            <div className="flex flex-wrap gap-1 print:block">
                              <span>{player.hasPendingPayment ? "Pendiente de pago" : "Al corriente"}</span>
                              {player.isNewThisWeek ? <span className="print:ml-1">Nuevo</span> : null}
                              {player.hasAbsenceRisk ? <span className="print:ml-1">3+ faltas</span> : null}
                            </div>
                          </td>
                          <td className="px-2 py-2 align-top print:h-10" />
                        </tr>
                      ))}
                      {group.players.length === 0 ? (
                        <tr><td colSpan={8} className="px-3 py-6 text-center text-slate-500">Sin jugadores activos.</td></tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              ))}
            </article>
          ))}

          {weeklyCoachPacket.sections.length === 0 ? (
            <div className="rounded-md border border-slate-200 bg-slate-50 p-6 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900">
              Sin grupos para los filtros seleccionados.
            </div>
          ) : null}
        </section>

        <section className="space-y-3 print:hidden">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Reporte diario</h2>
            <p className="text-sm text-slate-500">Resumen operativo de sesiones, capturas, faltas, lesiones, justificaciones y notas del día seleccionado.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
            <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
              <p className="text-xs uppercase text-slate-500">Sesiones</p>
              <p className="text-2xl font-bold">{daily.totals.sessions}</p>
              <p className="text-xs text-slate-500">{daily.totals.completed} registradas | {daily.totals.scheduled} sin registrar | {daily.totals.cancelled} canceladas</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
              <p className="text-xs uppercase text-slate-500">Roster real</p>
              <p className="text-2xl font-bold">{daily.totals.expectedPlayers}</p>
              <p className="text-xs text-slate-500">{daily.totals.recorded} capturados | {daily.totals.missingRecords} pendientes</p>
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">{dailyCaptureRate} captura</p>
            </div>
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200">
              <p className="text-xs uppercase">A Asistió</p>
              <p className="text-2xl font-bold">{daily.totals.present}</p>
            </div>
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-rose-800 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-200">
              <p className="text-xs uppercase">F Falta</p>
              <p className="text-2xl font-bold">{daily.totals.absent}</p>
            </div>
            <div className="rounded-lg border border-sky-200 bg-sky-50 p-4 text-sky-800 dark:border-sky-800 dark:bg-sky-950/30 dark:text-sky-200">
              <p className="text-xs uppercase">🩹 Lesión</p>
              <p className="text-2xl font-bold">{daily.totals.injury}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
              <p className="text-xs uppercase">📝 Notas</p>
              <p className="text-2xl font-bold">{daily.totals.sessionNotes + daily.totals.playerNotes}</p>
              <p className="text-xs text-slate-500">{daily.totals.sessionNotes} sesion | {daily.totals.playerNotes} jugador</p>
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.85fr)]">
            <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Distribucion de asistencia</h3>
                  <p className="text-xs text-slate-500">Porcentaje calculado sobre registros capturados del día.</p>
                </div>
                <span className="rounded-full border border-slate-200 px-3 py-1 text-sm font-semibold dark:border-slate-700">{dailyAttendanceRate}</span>
              </div>
              <div className="mt-4 flex h-4 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800" aria-label="Distribucion de asistencia diaria">
                <div className="bg-emerald-500" style={{ width: `${presentWidth}%` }} title={`A Asistió: ${daily.totals.present}`} />
                <div className="bg-rose-500" style={{ width: `${absentWidth}%` }} title={`F Falta: ${daily.totals.absent}`} />
                <div className="bg-sky-500" style={{ width: `${injuryWidth}%` }} title={`Lesión: ${daily.totals.injury}`} />
                <div className="bg-amber-400" style={{ width: `${justifiedWidth}%` }} title={`Justificada: ${daily.totals.justified}`} />
              </div>
              <div className="mt-3 grid gap-2 text-xs text-slate-600 sm:grid-cols-4 dark:text-slate-300">
                <span><span className="mr-1 inline-block size-2 rounded-full bg-emerald-500" />A {daily.totals.present}</span>
                <span><span className="mr-1 inline-block size-2 rounded-full bg-rose-500" />F {daily.totals.absent}</span>
                <span><span className="mr-1 inline-block size-2 rounded-full bg-sky-500" />Lesión {daily.totals.injury}</span>
                <span><span className="mr-1 inline-block size-2 rounded-full bg-amber-400" />Just. {daily.totals.justified}</span>
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Captura por sesion</h3>
              <div className="mt-3 max-h-52 space-y-3 overflow-y-auto pr-1">
                {daily.sessions.filter((session) => session.status !== "cancelled").map((session) => {
                  const width = session.rosterCount > 0 ? Math.min(100, (session.recordedCount / session.rosterCount) * 100) : 0;
                  return (
                    <div key={session.id}>
                      <div className="flex items-center justify-between gap-3 text-xs">
                        <span className="truncate font-medium text-slate-700 dark:text-slate-200">{session.teamName}</span>
                        <span className="shrink-0 text-slate-500">{session.recordedCount}/{session.rosterCount}</span>
                      </div>
                      <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                        <div className={session.recordedCount >= session.rosterCount ? "h-full bg-emerald-500" : "h-full bg-amber-500"} style={{ width: `${width}%` }} />
                      </div>
                    </div>
                  );
                })}
                {daily.sessions.filter((session) => session.status !== "cancelled").length === 0 ? (
                  <p className="text-sm text-slate-500">Sin sesiones activas para graficar.</p>
                ) : null}
              </div>
            </div>
          </div>

          {daily.closures.length > 0 ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
              <p className="font-semibold">Cierres / avisos del día</p>
              <ul className="mt-2 space-y-1">
                {daily.closures.map((closure) => (
                  <li key={closure.id}>
                    {closure.campusName}: {closure.title}{closure.notes ? ` | ${closure.notes}` : ""}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
            <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-700">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-900">
                <tr>
                  <th className="px-3 py-2">Sesion</th>
                  <th className="px-3 py-2">Estado</th>
                  <th className="px-3 py-2">Roster</th>
                  <th className="px-3 py-2">Asistencia</th>
                  <th className="px-3 py-2">A</th>
                  <th className="px-3 py-2">F</th>
                  <th className="px-3 py-2">Lesión</th>
                  <th className="px-3 py-2">Just.</th>
                  <th className="px-3 py-2">Notas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {daily.sessions.map((session) => (
                  <tr key={session.id}>
                    <td className="px-3 py-2">
                      <Link href={`/attendance/sessions/${session.id}`} className="font-semibold text-portoBlue hover:underline">{session.teamName}</Link>
                      <p className="text-xs text-slate-500">{session.startTime}-{session.endTime} | {session.campusName} | {ATTENDANCE_SESSION_TYPE_LABELS[session.sessionType] ?? session.sessionType} | Coach {session.coachName ?? "-"}</p>
                      {session.cancelledReasonCode ? <p className="text-xs text-rose-700">Cancelacion: {session.cancelledReasonCode}{session.cancelledReason ? ` | ${session.cancelledReason}` : ""}</p> : null}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${statusPillClass(session.status)}`}>
                        {SESSION_STATUS_LABELS[session.status] ?? session.status}
                      </span>
                    </td>
                    <td className="px-3 py-2">{session.rosterCount}</td>
                    <td className={`px-3 py-2 font-semibold ${session.status !== "cancelled" && session.recordedCount < session.rosterCount ? "text-amber-700 dark:text-amber-300" : ""}`}>
                      {formatPercent(dailyAttendanceCount(session.counts), session.counts.total)}
                      <p className="text-xs font-normal text-slate-500">{session.recordedCount}/{session.rosterCount} capturados</p>
                    </td>
                    <td className="px-3 py-2 text-emerald-700 dark:text-emerald-300">{session.counts.present}</td>
                    <td className="px-3 py-2 text-rose-700 dark:text-rose-300">{session.counts.absent}</td>
                    <td className="px-3 py-2 text-sky-700 dark:text-sky-300">{session.counts.injury}</td>
                    <td className="px-3 py-2">{session.counts.justified}</td>
                    <td className="px-3 py-2">{(session.notes ? 1 : 0) + session.playerNotes.length}</td>
                  </tr>
                ))}
                {daily.sessions.length === 0 ? (
                  <tr><td colSpan={9} className="px-3 py-8 text-center text-slate-500">Sin sesiones para el día seleccionado.</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>

          {daily.sessions.some((session) => session.notes || session.playerNotes.length > 0) ? (
            <div className="grid gap-3 lg:grid-cols-2">
              {daily.sessions.filter((session) => session.notes || session.playerNotes.length > 0).map((session) => (
                <article key={session.id} className="rounded-lg border border-slate-200 bg-white p-4 text-sm dark:border-slate-700 dark:bg-slate-900">
                  <p className="font-semibold text-slate-900 dark:text-slate-100">{session.teamName}</p>
                  {session.notes ? <p className="mt-2 rounded-md bg-slate-50 px-3 py-2 text-slate-700 dark:bg-slate-800 dark:text-slate-200">Sesion: {session.notes}</p> : null}
                  {session.playerNotes.length > 0 ? (
                    <div className="mt-2 space-y-2">
                      {session.playerNotes.map((note) => (
                        <p key={note.recordId} className="rounded-md bg-amber-50 px-3 py-2 text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                          <span className="font-semibold">{note.playerName}</span> ({statusLabel(note.status)}): {note.note}
                        </p>
                      ))}
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          ) : null}
        </section>

        {collectionsRisk ? (
          <section className="space-y-3 print:hidden">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Riesgo asistencia + cobranza</h2>
              <p className="text-sm text-slate-500">
                Visible solo para roles operativos. No muestra montos: combina meses pendientes, asistencia reciente y senales de riesgo.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-rose-900 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-200">
                <p className="text-xs uppercase">Debe + riesgo</p>
                <p className="text-2xl font-bold">{collectionsRisk.summary.pendingAtRisk}</p>
                <p className="text-xs">Prioridad alta para llamada.</p>
              </div>
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                <p className="text-xs uppercase">Debe + asiste</p>
                <p className="text-2xl font-bold">{collectionsRisk.summary.pendingAttending}</p>
                <p className="text-xs">Pendiente, pero con asistencia reciente.</p>
              </div>
              <div className="rounded-lg border border-sky-200 bg-sky-50 p-4 text-sky-900 dark:border-sky-800 dark:bg-sky-950/30 dark:text-sky-200">
                <p className="text-xs uppercase">Al corriente + riesgo</p>
                <p className="text-2xl font-bold">{collectionsRisk.summary.currentAtRisk}</p>
                <p className="text-xs">No esta en pendientes, pero requiere seguimiento.</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
                <p className="text-xs uppercase text-slate-500">Al corriente sin registros</p>
                <p className="text-2xl font-bold">{collectionsRisk.summary.currentNoRecent}</p>
                <p className="text-xs text-slate-500">Activo sin ultimos registros visibles.</p>
              </div>
            </div>

            <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
              <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-700">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-900">
                  <tr>
                    <th className="px-3 py-2">Jugador</th>
                    <th className="px-3 py-2">Campus / grupo</th>
                    <th className="px-3 py-2">Pendientes</th>
                    <th className="px-3 py-2">Asistencia reciente</th>
                    <th className="px-3 py-2">Riesgo</th>
                    <th className="px-3 py-2">Lectura</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {collectionsRisk.rows.slice(0, 120).map((row) => (
                    <tr key={row.enrollmentId}>
                      <td className="px-3 py-2">
                        <Link href={`/players/${row.playerId}`} className="font-semibold text-portoBlue hover:underline">{row.playerName}</Link>
                        <p className="text-xs text-slate-500">{row.publicPlayerId ?? "Sin ID"} | Cat. {row.birthYear ?? "-"}</p>
                      </td>
                      <td className="px-3 py-2">
                        <p>{row.campusName}</p>
                        <p className="text-xs text-slate-500">{row.trainingGroupName ?? "Sin grupo"}</p>
                      </td>
                      <td className="px-3 py-2">
                        {row.pendingMonthCount > 0 ? (
                          <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                            {row.pendingMonthCount} mes{row.pendingMonthCount === 1 ? "" : "es"}
                          </span>
                        ) : (
                          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200">
                            Al corriente
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2"><RecentAttendanceChips items={row.recentAttendance} align="start" /></td>
                      <td className="px-3 py-2">
                        <AttendanceRiskBadge risk={row.attendanceRisk} compact />
                        {!row.attendanceRisk?.tier ? <span className="text-xs text-slate-400">Sin badge</span> : null}
                      </td>
                      <td className="px-3 py-2">
                        <p className="font-semibold text-slate-900 dark:text-slate-100">{row.relationLabel}</p>
                        <p className="text-xs text-slate-500">{row.relationDetail}</p>
                      </td>
                    </tr>
                  ))}
                  {collectionsRisk.rows.length === 0 ? (
                    <tr><td colSpan={6} className="px-3 py-8 text-center text-slate-500">Sin relaciones de riesgo para los filtros actuales.</td></tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            {collectionsRisk.rows.length > 120 ? (
              <p className="text-xs text-slate-500">Mostrando las primeras 120 filas por prioridad. Usa campus/categoria para acotar.</p>
            ) : null}
          </section>
        ) : null}

        <section className="space-y-3 print:hidden">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Jugadores con menor asistencia</h2>
          <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
            <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-700">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-900">
                <tr>
                  <th className="px-3 py-2">Jugador</th>
                  <th className="px-3 py-2">Campus</th>
                  <th className="px-3 py-2">Grupo / equipo</th>
                  <th className="px-3 py-2">Sesiones</th>
                  <th className="px-3 py-2">Faltas</th>
                  <th className="px-3 py-2">Asistencia</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {data.inactivePlayers.slice(0, 80).map((row) => (
                  <tr key={row.playerId}>
                    <td className="px-3 py-2">
                      <Link href={`/players/${row.playerId}`} className="font-medium text-portoBlue hover:underline">{row.playerName}</Link>
                      <p className="text-xs text-slate-500">Cat. {row.birthYear ?? "-"}</p>
                    </td>
                    <td className="px-3 py-2">{row.campusName}</td>
                    <td className="px-3 py-2">{row.teamName}</td>
                    <td className="px-3 py-2">{row.total}</td>
                    <td className="px-3 py-2">{row.absent}</td>
                    <td className={`px-3 py-2 font-semibold ${(row.rate ?? 100) < 70 ? "text-rose-700 dark:text-rose-300" : "text-slate-900 dark:text-slate-100"}`}>{formatRate(row.rate)}</td>
                  </tr>
                ))}
                {data.inactivePlayers.length === 0 ? (
                  <tr><td colSpan={6} className="px-3 py-8 text-center text-slate-500">Sin datos de asistencia para el periodo.</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        <section className="space-y-3 print:hidden">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Grupos / equipos y coach</h2>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {data.teamReports.map((row) => (
              <article key={row.teamId} className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
                <p className="font-semibold text-slate-900 dark:text-slate-100">{row.teamName}</p>
                <p className="text-sm text-slate-500">{row.campusName} | Coach {row.coachName ?? "-"}</p>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center text-sm">
                  <div><p className="text-xs text-slate-500">Sesiones</p><p className="font-bold">{row.completedSessions}</p></div>
                  <div><p className="text-xs text-slate-500">Faltas</p><p className="font-bold">{row.absent}</p></div>
                  <div><p className="text-xs text-slate-500">Tasa</p><p className="font-bold">{formatRate(row.rate)}</p></div>
                </div>
              </article>
            ))}
            {data.teamReports.length === 0 ? (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-6 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900">Sin equipos con asistencia registrada en el mes.</div>
            ) : null}
          </div>
        </section>
      </div>
    </PageShell>
  );
}
