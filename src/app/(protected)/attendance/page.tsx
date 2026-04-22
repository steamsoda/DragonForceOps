import Link from "next/link";
import { PageShell } from "@/components/ui/page-shell";
import { requireAttendanceWriteContext } from "@/lib/auth/permissions";
import { ATTENDANCE_SESSION_TYPE_LABELS, listAttendanceScheduleTemplates, listAttendanceSessions } from "@/lib/queries/attendance";
import { createManualAttendanceSessionAction } from "@/server/actions/attendance";

type SearchParams = Promise<{ date?: string; campus?: string; ok?: string; err?: string }>;

const STATUS_LABELS: Record<string, string> = {
  scheduled: "Sin registrar",
  completed: "Registrada",
  cancelled: "Cancelada",
};

const STATUS_STYLES: Record<string, string> = {
  scheduled: "border-amber-200 bg-amber-50 text-amber-800",
  completed: "border-emerald-200 bg-emerald-50 text-emerald-800",
  cancelled: "border-slate-200 bg-slate-50 text-slate-600",
};

export default async function AttendanceTodayPage({ searchParams }: { searchParams: SearchParams }) {
  await requireAttendanceWriteContext("/unauthorized");
  const params = await searchParams;
  const [data, setup] = await Promise.all([
    listAttendanceSessions({ date: params.date, campusId: params.campus }),
    listAttendanceScheduleTemplates(),
  ]);

  const grouped = new Map<string, typeof data.sessions>();
  for (const session of data.sessions) {
    grouped.set(session.startTime, [...(grouped.get(session.startTime) ?? []), session]);
  }

  return (
    <PageShell title="Asistencia" subtitle="Sesiones del dia para registrar en cancha." wide>
      <div className="space-y-5">
        {params.err ? (
          <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
            No se pudo completar la accion: {params.err}
          </div>
        ) : null}

        <form className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900">
          <label className="text-sm font-medium">
            Fecha
            <input name="date" type="date" defaultValue={data.selectedDate} className="mt-1 block rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950" />
          </label>
          <label className="text-sm font-medium">
            Campus
            <select name="campus" defaultValue={data.selectedCampusId ?? ""} className="mt-1 block rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950">
              <option value="">Todos los campus</option>
              {data.campuses.map((campus) => (
                <option key={campus.id} value={campus.id}>{campus.name}</option>
              ))}
            </select>
          </label>
          <button className="rounded-md bg-portoBlue px-4 py-2 text-sm font-semibold text-white hover:bg-portoDark">Ver dia</button>
        </form>

        {setup.canCreateManualSessions ? (
          <details className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
            <summary className="cursor-pointer list-none text-sm font-semibold text-slate-900 dark:text-slate-100">Crear partido / especial</summary>
            <form action={createManualAttendanceSessionAction} className="mt-4 grid gap-3 md:grid-cols-3">
              <label className="text-sm font-medium md:col-span-2">
                Equipo
                <select name="team_id" required className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950">
                  {setup.allTeams.map((team) => (
                    <option key={team.id} value={team.id}>{team.campusName} | {team.name}</option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-medium">
                Tipo
                <select name="session_type" defaultValue="match" className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950">
                  <option value="match">Partido</option>
                  <option value="special">Especial</option>
                </select>
              </label>
              <label className="text-sm font-medium">
                Fecha
                <input name="session_date" type="date" defaultValue={data.selectedDate} required className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950" />
              </label>
              <label className="text-sm font-medium">
                Inicio
                <input name="start_time" type="time" required className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950" />
              </label>
              <label className="text-sm font-medium">
                Fin
                <input name="end_time" type="time" required className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950" />
              </label>
              <label className="text-sm font-medium">
                Rival
                <input name="opponent_name" className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950" />
              </label>
              <label className="text-sm font-medium md:col-span-2">
                Notas
                <input name="notes" className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950" />
              </label>
              <div className="flex items-end">
                <button className="w-full rounded-md bg-portoBlue px-4 py-2 text-sm font-semibold text-white hover:bg-portoDark">Crear sesion</button>
              </div>
            </form>
          </details>
        ) : null}

        {data.sessions.length === 0 ? (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-6 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
            No hay sesiones para esta fecha. Crea horarios en Asistencia &gt; Horarios o agrega una sesion manual.
          </div>
        ) : (
          <div className="space-y-4">
            {Array.from(grouped.entries()).map(([time, sessions]) => (
              <section key={time} className="space-y-2">
                <h2 className="text-sm font-bold text-slate-500">{time}</h2>
                <div className="grid gap-3">
                  {sessions.map((session) => (
                    <Link
                      key={session.id}
                      href={`/attendance/sessions/${session.id}`}
                      className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-portoBlue dark:border-slate-700 dark:bg-slate-900"
                    >
                      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <div>
                          <p className="font-semibold text-slate-900 dark:text-slate-100">{session.teamName}</p>
                          <p className="text-sm text-slate-500">
                            {session.campusName} | {ATTENDANCE_SESSION_TYPE_LABELS[session.sessionType]} | Coach {session.coachName ?? "-"}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full border border-slate-200 px-2 py-1 text-xs">{session.recordedCount}/{session.rosterCount} registros</span>
                          <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${STATUS_STYLES[session.status]}`}>{STATUS_LABELS[session.status]}</span>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </PageShell>
  );
}
