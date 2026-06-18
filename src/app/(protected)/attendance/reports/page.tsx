import Link from "next/link";
import { AttendanceCampusButtons } from "@/components/attendance/attendance-campus-buttons";
import { PageShell } from "@/components/ui/page-shell";
import { requireAttendanceReadContext } from "@/lib/auth/permissions";
import { ATTENDANCE_SESSION_TYPE_LABELS, getAttendanceDailyReport, getAttendanceReports } from "@/lib/queries/attendance";

type SearchParams = Promise<{ campus?: string; period?: string; birthYear?: string; month?: string; date?: string }>;

function formatRate(rate: number | null) {
  return rate == null ? "Sin datos" : `${rate}%`;
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
  if (status === "present") return "A Asistio";
  if (status === "absent") return "F Falta";
  if (status === "injury") return "🩹 Lesion";
  if (status === "justified") return "📝 Justificada";
  return status;
}

export default async function AttendanceReportsPage({ searchParams }: { searchParams: SearchParams }) {
  await requireAttendanceReadContext("/unauthorized");
  const params = await searchParams;
  const periodDays = Number(params.period ?? 30);
  const birthYear = params.birthYear ? Number(params.birthYear) : undefined;
  const [data, daily] = await Promise.all([
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
  ]);

  const birthYears = Array.from(new Set(data.inactivePlayers.map((row) => row.birthYear).filter((value): value is number => Boolean(value)))).sort((a, b) => b - a);

  return (
    <PageShell title="Reportes de asistencia" subtitle="Lectura operativa para detectar inactividad y comparar equipos." wide>
      <div className="space-y-6">
        <section className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900">
          <AttendanceCampusButtons
            pathname="/attendance/reports"
            campuses={data.campuses}
            selectedCampusId={data.selectedCampusId}
            params={{ period: data.periodDays, birthYear, month: data.month, date: daily.selectedDate }}
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

        <section className="space-y-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Reporte diario</h2>
            <p className="text-sm text-slate-500">Resumen operativo de sesiones, capturas, faltas, lesiones, justificaciones y notas del dia seleccionado.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
            <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
              <p className="text-xs uppercase text-slate-500">Sesiones</p>
              <p className="text-2xl font-bold">{daily.totals.sessions}</p>
              <p className="text-xs text-slate-500">{daily.totals.completed} registradas | {daily.totals.scheduled} sin registrar | {daily.totals.cancelled} canceladas</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
              <p className="text-xs uppercase text-slate-500">Esperados</p>
              <p className="text-2xl font-bold">{daily.totals.expectedPlayers}</p>
              <p className="text-xs text-slate-500">{daily.totals.recorded} registros | {daily.totals.missingRecords} pendientes</p>
            </div>
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200">
              <p className="text-xs uppercase">A Asistio</p>
              <p className="text-2xl font-bold">{daily.totals.present}</p>
            </div>
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-rose-800 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-200">
              <p className="text-xs uppercase">F Falta</p>
              <p className="text-2xl font-bold">{daily.totals.absent}</p>
            </div>
            <div className="rounded-lg border border-sky-200 bg-sky-50 p-4 text-sky-800 dark:border-sky-800 dark:bg-sky-950/30 dark:text-sky-200">
              <p className="text-xs uppercase">🩹 Lesion</p>
              <p className="text-2xl font-bold">{daily.totals.injury}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
              <p className="text-xs uppercase">📝 Notas</p>
              <p className="text-2xl font-bold">{daily.totals.sessionNotes + daily.totals.playerNotes}</p>
              <p className="text-xs text-slate-500">{daily.totals.sessionNotes} sesion | {daily.totals.playerNotes} jugador</p>
            </div>
          </div>

          {daily.closures.length > 0 ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
              <p className="font-semibold">Cierres / avisos del dia</p>
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
                  <th className="px-3 py-2">Esperados</th>
                  <th className="px-3 py-2">Registros</th>
                  <th className="px-3 py-2">A</th>
                  <th className="px-3 py-2">F</th>
                  <th className="px-3 py-2">Lesion</th>
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
                    <td className={`px-3 py-2 font-semibold ${session.status !== "cancelled" && session.recordedCount < session.rosterCount ? "text-amber-700 dark:text-amber-300" : ""}`}>{session.recordedCount}</td>
                    <td className="px-3 py-2 text-emerald-700 dark:text-emerald-300">{session.counts.present}</td>
                    <td className="px-3 py-2 text-rose-700 dark:text-rose-300">{session.counts.absent}</td>
                    <td className="px-3 py-2 text-sky-700 dark:text-sky-300">{session.counts.injury}</td>
                    <td className="px-3 py-2">{session.counts.justified}</td>
                    <td className="px-3 py-2">{(session.notes ? 1 : 0) + session.playerNotes.length}</td>
                  </tr>
                ))}
                {daily.sessions.length === 0 ? (
                  <tr><td colSpan={9} className="px-3 py-8 text-center text-slate-500">Sin sesiones para el dia seleccionado.</td></tr>
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

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Jugadores con menor asistencia</h2>
          <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
            <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-700">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-900">
                <tr>
                  <th className="px-3 py-2">Jugador</th>
                  <th className="px-3 py-2">Campus</th>
                  <th className="px-3 py-2">Grupo / equipo</th>
                  <th className="px-3 py-2">Sesiones</th>
                  <th className="px-3 py-2">Ausencias</th>
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

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Grupos / equipos y coach</h2>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {data.teamReports.map((row) => (
              <article key={row.teamId} className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
                <p className="font-semibold text-slate-900 dark:text-slate-100">{row.teamName}</p>
                <p className="text-sm text-slate-500">{row.campusName} | Coach {row.coachName ?? "-"}</p>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center text-sm">
                  <div><p className="text-xs text-slate-500">Sesiones</p><p className="font-bold">{row.completedSessions}</p></div>
                  <div><p className="text-xs text-slate-500">Ausencias</p><p className="font-bold">{row.absent}</p></div>
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
