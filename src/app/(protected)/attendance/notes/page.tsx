import Link from "next/link";
import { AttendanceCampusButtons } from "@/components/attendance/attendance-campus-buttons";
import { PageShell } from "@/components/ui/page-shell";
import { requireAttendanceReadContext } from "@/lib/auth/permissions";
import {
  ATTENDANCE_SESSION_TYPE_LABELS,
  ATTENDANCE_STATUS_LABELS,
  getAttendanceDailyNotes,
  type AttendanceDailyNoteSession,
} from "@/lib/queries/attendance";

type SearchParams = Promise<{ campus?: string; date?: string }>;

const SESSION_STATUS_LABELS: Record<string, string> = {
  scheduled: "Pendiente",
  completed: "Registrada",
  cancelled: "Cancelada",
};

const SESSION_STATUS_STYLES: Record<string, string> = {
  scheduled: "border-amber-200 bg-amber-50 text-amber-800",
  completed: "border-emerald-200 bg-emerald-50 text-emerald-800",
  cancelled: "border-slate-200 bg-slate-50 text-slate-600",
};

const RECORD_STATUS_STYLES: Record<string, string> = {
  present: "border-emerald-200 bg-emerald-50 text-emerald-800",
  absent: "border-rose-200 bg-rose-50 text-rose-800",
  injury: "border-sky-200 bg-sky-50 text-sky-800",
  justified: "border-slate-200 bg-slate-50 text-slate-700",
};

function shortTime(value: string) {
  return value.slice(0, 5);
}

function hasAnyNotes(session: AttendanceDailyNoteSession) {
  return Boolean(session.notes) || session.playerNotes.length > 0;
}

function statusClass(status: string) {
  return SESSION_STATUS_STYLES[status] ?? "border-slate-200 bg-slate-50 text-slate-600";
}

function recordStatusClass(status: string) {
  return RECORD_STATUS_STYLES[status] ?? "border-slate-200 bg-slate-50 text-slate-700";
}

export default async function AttendanceNotesPage({ searchParams }: { searchParams: SearchParams }) {
  await requireAttendanceReadContext("/unauthorized");
  const params = await searchParams;
  const data = await getAttendanceDailyNotes({ campusId: params.campus, date: params.date });
  const sessionsWithNotes = data.sessions.filter(hasAnyNotes);

  return (
    <PageShell
      title="Notas de asistencia"
      subtitle="Revision diaria de notas generales y observaciones por jugador."
      breadcrumbs={[{ label: "Asistencia", href: "/attendance" }, { label: "Notas" }]}
      wide
    >
      <div className="space-y-5">
        <section className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900">
          <form className="flex flex-wrap items-end gap-3">
            <label className="text-sm font-medium">
              Fecha
              <input
                name="date"
                type="date"
                defaultValue={data.selectedDate}
                className="mt-1 block rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950"
              />
            </label>
            {data.selectedCampusId ? <input type="hidden" name="campus" value={data.selectedCampusId} /> : null}
            <button className="rounded-md bg-portoBlue px-4 py-2 text-sm font-semibold text-white hover:bg-portoDark">
              Ver notas
            </button>
          </form>
          <AttendanceCampusButtons
            pathname="/attendance/notes"
            campuses={data.campuses}
            selectedCampusId={data.selectedCampusId}
            params={{ date: data.selectedDate }}
            allLabel="Todos"
          />
        </section>

        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900">
            <p className="text-xs uppercase tracking-wide text-slate-500">Sesiones del dia</p>
            <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{data.totals.sessions}</p>
          </div>
          <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 dark:border-blue-900/50 dark:bg-blue-950/20">
            <p className="text-xs uppercase tracking-wide text-blue-700 dark:text-blue-200">Notas de sesion</p>
            <p className="text-2xl font-bold text-blue-900 dark:text-blue-100">{data.totals.sessionNotes}</p>
          </div>
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 dark:border-emerald-900/50 dark:bg-emerald-950/20">
            <p className="text-xs uppercase tracking-wide text-emerald-700 dark:text-emerald-200">Notas de jugadores</p>
            <p className="text-2xl font-bold text-emerald-900 dark:text-emerald-100">{data.totals.playerNotes}</p>
          </div>
        </div>

        {data.sessions.length === 0 ? (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-6 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
            No hay sesiones para esta fecha y campus.
          </div>
        ) : sessionsWithNotes.length === 0 ? (
          <div className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
            Hay {data.sessions.length} sesiones en el dia, pero ninguna tiene notas capturadas.
          </div>
        ) : (
          <div className="space-y-4">
            {sessionsWithNotes.map((session) => (
              <article key={session.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{session.teamName}</h2>
                      <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${statusClass(session.status)}`}>
                        {SESSION_STATUS_LABELS[session.status] ?? session.status}
                      </span>
                    </div>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      {shortTime(session.startTime)}-{shortTime(session.endTime)} | {session.campusName} | {ATTENDANCE_SESSION_TYPE_LABELS[session.sessionType] ?? session.sessionType}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {session.sourceType === "training_group" ? "Grupo de entrenamiento" : "Equipo"} | Coach {session.coachName ?? "-"} | {session.recordedCount}/{session.rosterCount} registros
                    </p>
                  </div>
                  <Link
                    href={`/attendance/sessions/${session.id}`}
                    className="inline-flex items-center justify-center rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:border-portoBlue hover:text-portoBlue dark:border-slate-600 dark:text-slate-200"
                  >
                    Abrir sesion
                  </Link>
                </div>

                {session.notes ? (
                  <div className="mt-4 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-sm text-blue-950 dark:border-blue-900/50 dark:bg-blue-950/20 dark:text-blue-100">
                    <p className="text-xs font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-200">Nota general</p>
                    <p className="mt-1 whitespace-pre-wrap">{session.notes}</p>
                  </div>
                ) : null}

                {session.playerNotes.length > 0 ? (
                  <div className="mt-4 space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Notas por jugador</p>
                    <div className="grid gap-2">
                      {session.playerNotes.map((note) => (
                        <div key={note.recordId} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950">
                          <div className="flex flex-wrap items-center gap-2">
                            <Link href={`/players/${note.playerId}`} className="font-semibold text-portoBlue hover:underline">
                              {note.playerName}
                            </Link>
                            <span className="text-xs text-slate-500">Cat. {note.birthYear ?? "-"}</span>
                            <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${recordStatusClass(note.status)}`}>
                              {ATTENDANCE_STATUS_LABELS[note.status] ?? note.status}
                            </span>
                          </div>
                          <p className="mt-1 whitespace-pre-wrap text-slate-700 dark:text-slate-200">{note.note}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </div>
    </PageShell>
  );
}
