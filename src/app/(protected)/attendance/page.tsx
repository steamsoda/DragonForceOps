import Link from "next/link";
import { PageShell } from "@/components/ui/page-shell";
import { requireAttendanceWriteContext } from "@/lib/auth/permissions";
import { ATTENDANCE_SESSION_TYPE_LABELS, listAttendanceScheduleTemplates, listAttendanceSessions } from "@/lib/queries/attendance";
import { createManualAttendanceSessionAction, generateAttendanceSessionsAction } from "@/server/actions/attendance";

type SearchParams = Promise<{ date?: string; campus?: string; ok?: string; err?: string; start?: string; end?: string; expected?: string; existing?: string; created?: string }>;

const STATUS_LABELS: Record<string, string> = {
  scheduled: "Pendiente",
  completed: "Registrada",
  cancelled: "Cancelada",
};

const STATUS_STYLES: Record<string, string> = {
  scheduled: "border-amber-200 bg-amber-50 text-amber-800",
  completed: "border-emerald-200 bg-emerald-50 text-emerald-800",
  cancelled: "border-slate-200 bg-slate-50 text-slate-600",
};

function shortTime(value: string) {
  return value.slice(0, 5);
}

function sessionActionLabel(status: string) {
  if (status === "scheduled") return "Tomar asistencia";
  if (status === "completed") return "Ver / corregir";
  return "Ver cancelacion";
}

export default async function AttendanceTodayPage({ searchParams }: { searchParams: SearchParams }) {
  const context = await requireAttendanceWriteContext("/unauthorized");
  const params = await searchParams;
  const canManageAttendanceSetup = context.isDirector || context.isSportsDirector;
  const canUseGenerationTool = context.isDirector || context.isSportsDirector;
  const data = await listAttendanceSessions({ date: params.date, campusId: params.campus });
  const setup = canManageAttendanceSetup ? await listAttendanceScheduleTemplates() : null;
  const selectedCampus = data.campuses.find((campus) => campus.id === data.selectedCampusId) ?? null;

  const grouped = new Map<string, typeof data.sessions>();
  for (const session of data.sessions) {
    grouped.set(session.startTime, [...(grouped.get(session.startTime) ?? []), session]);
  }

  const summary = data.sessions.reduce(
    (acc, session) => {
      acc.total += 1;
      if (session.status === "scheduled") acc.pending += 1;
      if (session.status === "completed") acc.completed += 1;
      if (session.status === "cancelled") acc.cancelled += 1;
      return acc;
    },
    { total: 0, pending: 0, completed: 0, cancelled: 0 },
  );

  return (
    <PageShell title="Asistencia de hoy" subtitle="Entrenamientos listos para tomar asistencia en cancha." wide>
      <div className="space-y-5">
        {params.err ? (
          <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
            No se pudo completar la accion: {params.err}
          </div>
        ) : null}
        {params.ok === "generated" ? (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            Sesiones generadas para la semana {params.start ?? "-"} a {params.end ?? "-"}. Esperadas: {params.expected ?? "0"} | Creadas: {params.created ?? "0"} | Ya existian: {params.existing ?? "0"}.
          </div>
        ) : null}

        {!canManageAttendanceSetup ? (
          <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-100">
            Flujo de campo: abre un grupo, marca solo las ausencias o cambios necesarios y guarda. Los horarios y grupos se configuran por direccion.
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
          <button className="rounded-md bg-portoBlue px-4 py-2 text-sm font-semibold text-white hover:bg-portoDark">Ver entrenamientos</button>
        </form>

        <div className="grid gap-3 md:grid-cols-4">
          <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900">
            <p className="text-xs uppercase tracking-wide text-slate-500">Sesiones</p>
            <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{summary.total}</p>
          </div>
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900/50 dark:bg-amber-950/20">
            <p className="text-xs uppercase tracking-wide text-amber-700 dark:text-amber-200">Pendientes</p>
            <p className="text-2xl font-bold text-amber-900 dark:text-amber-100">{summary.pending}</p>
          </div>
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 dark:border-emerald-900/50 dark:bg-emerald-950/20">
            <p className="text-xs uppercase tracking-wide text-emerald-700 dark:text-emerald-200">Registradas</p>
            <p className="text-2xl font-bold text-emerald-900 dark:text-emerald-100">{summary.completed}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-900">
            <p className="text-xs uppercase tracking-wide text-slate-500">Canceladas</p>
            <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{summary.cancelled}</p>
          </div>
        </div>

        {canUseGenerationTool ? (
          <section className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950 dark:border-blue-900/50 dark:bg-blue-950/20 dark:text-blue-100">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="font-semibold">Generar sesiones de la semana</p>
                <p className="mt-1 text-blue-900/80 dark:text-blue-100/80">
                  {selectedCampus
                    ? `Usa los horarios activos de ${selectedCampus.name} para materializar entrenamientos de lunes a domingo. Es seguro repetirlo: no duplica sesiones existentes.`
                    : "Selecciona un campus para generar solo esa semana/campus. La generacion desde la app no usa Todos los campus para evitar cambios accidentales."}
                </p>
              </div>
              {selectedCampus ? (
                <form action={generateAttendanceSessionsAction} className="flex shrink-0 items-center gap-2">
                  <input type="hidden" name="date" value={data.selectedDate} />
                  <input type="hidden" name="campus" value={selectedCampus.id} />
                  <button className="rounded-md bg-portoBlue px-4 py-2 text-sm font-semibold text-white hover:bg-portoDark">
                    Generar {selectedCampus.name}
                  </button>
                </form>
              ) : (
                <span className="rounded-md border border-blue-300 px-4 py-2 text-sm font-semibold text-blue-900 dark:border-blue-800 dark:text-blue-100">
                  Elige campus
                </span>
              )}
            </div>
          </section>
        ) : null}

        {setup?.canCreateManualSessions ? (
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
            {canManageAttendanceSetup
              ? "No hay sesiones para esta fecha. Revisa Horarios o crea una sesion manual si aplica."
              : "No hay entrenamientos programados para esta fecha. Si esto no coincide con la operacion del dia, avisa a direccion para revisar los horarios."}
          </div>
        ) : (
          <div className="space-y-4">
            {Array.from(grouped.entries()).map(([time, sessions]) => (
              <section key={time} className="space-y-2">
                <h2 className="text-sm font-bold text-slate-500">{shortTime(time)}</h2>
                <div className="grid gap-3">
                  {sessions.map((session) => (
                    <Link
                      key={session.id}
                      href={`/attendance/sessions/${session.id}`}
                      className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-portoBlue dark:border-slate-700 dark:bg-slate-900"
                    >
                      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">{session.teamName}</p>
                            <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${STATUS_STYLES[session.status]}`}>{STATUS_LABELS[session.status]}</span>
                          </div>
                          <p className="text-sm text-slate-500 dark:text-slate-400">
                            {shortTime(session.startTime)}-{shortTime(session.endTime)} | {session.campusName} | {ATTENDANCE_SESSION_TYPE_LABELS[session.sessionType]}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            {session.sourceType === "training_group" ? "Grupo de entrenamiento" : "Equipo"} | Coach {session.coachName ?? "-"} | {session.rosterCount} jugadores
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full border border-slate-200 px-2 py-1 text-xs text-slate-700 dark:border-slate-700 dark:text-slate-200">
                            {session.recordedCount}/{session.rosterCount} registros
                          </span>
                          <span className="rounded-md bg-portoBlue px-3 py-2 text-sm font-semibold text-white">
                            {sessionActionLabel(session.status)}
                          </span>
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
