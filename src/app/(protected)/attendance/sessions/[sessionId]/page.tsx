import { notFound } from "next/navigation";
import { AttendanceRecorder } from "@/components/attendance/attendance-recorder";
import { PageShell } from "@/components/ui/page-shell";
import { requireAttendanceReadContext } from "@/lib/auth/permissions";
import { ATTENDANCE_SESSION_TYPE_LABELS, getAttendanceSessionDetail } from "@/lib/queries/attendance";
import { cancelAttendanceSessionAction } from "@/server/actions/attendance";

type Params = Promise<{ sessionId: string }>;
type SearchParams = Promise<{ ok?: string; err?: string }>;

const STATUS_LABELS: Record<string, string> = {
  scheduled: "Sin registrar",
  completed: "Registrada",
  cancelled: "Cancelada",
};

export default async function AttendanceSessionPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  await requireAttendanceReadContext("/unauthorized");
  const { sessionId } = await params;
  const query = await searchParams;
  const session = await getAttendanceSessionDetail(sessionId);
  if (!session) notFound();

  const disabled = !session.canWrite || session.status === "cancelled" || (session.status === "completed" && !session.canCorrect);

  return (
    <PageShell
      title={`${session.teamName} | ${session.sessionDate} ${session.startTime}`}
      subtitle={`${session.campusName} | ${ATTENDANCE_SESSION_TYPE_LABELS[session.sessionType]} | ${session.sourceType === "training_group" ? "Grupo" : "Equipo"} | Coach ${session.coachName ?? "-"} | ${STATUS_LABELS[session.status]}`}
      breadcrumbs={[{ label: "Asistencia", href: "/attendance" }, { label: "Sesion" }]}
      wide
    >
      <div className="space-y-5">
        {query.err ? (
          <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">Error: {query.err}</div>
        ) : null}
        {query.ok ? (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">Asistencia actualizada.</div>
        ) : null}

        <div className="grid gap-3 md:grid-cols-4">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900">
            <p className="text-xs uppercase text-slate-500">Jugadores</p>
            <p className="text-2xl font-bold">{session.rosterCount}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900">
            <p className="text-xs uppercase text-slate-500">Registros</p>
            <p className="text-2xl font-bold">{session.recordedCount}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900">
            <p className="text-xs uppercase text-slate-500">Horario</p>
            <p className="text-lg font-semibold">{session.startTime} - {session.endTime}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900">
            <p className="text-xs uppercase text-slate-500">Estado</p>
            <p className="text-lg font-semibold">{STATUS_LABELS[session.status]}</p>
          </div>
        </div>

        {session.opponentName || session.notes ? (
          <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm dark:border-slate-700 dark:bg-slate-900">
            {session.opponentName ? <p><strong>Rival:</strong> {session.opponentName}</p> : null}
            {session.notes ? <p><strong>Notas de sesion:</strong> {session.notes}</p> : null}
          </div>
        ) : null}

        {session.status === "cancelled" ? (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
            Sesion cancelada. Motivo: {session.cancelledReasonCode ?? "-"} {session.cancelledReason ? `| ${session.cancelledReason}` : ""}
          </div>
        ) : (
          <AttendanceRecorder sessionId={session.id} roster={session.roster} sessionNotes={session.notes} disabled={disabled} />
        )}

        {session.canWrite && session.status !== "cancelled" ? (
          <details className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
            <summary className="cursor-pointer list-none text-sm font-semibold text-slate-700 dark:text-slate-200">
              Zona de cancelacion de sesion
            </summary>
            <form action={cancelAttendanceSessionAction.bind(null, session.id)} className="mt-3 grid gap-3 md:grid-cols-3">
              <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200 md:col-span-3">
                Esta accion cancela toda la sesion y la excluye de reportes de asistencia. Usala solo por lluvia, feriado u otra cancelacion real.
              </p>
              <label className="text-sm font-medium">
                Motivo
                <select name="cancelled_reason_code" className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950">
                  <option value="rain">Lluvia</option>
                  <option value="holiday">Dia festivo</option>
                  <option value="other">Otro</option>
                </select>
              </label>
              <label className="text-sm font-medium md:col-span-2">
                Detalle opcional
                <input name="cancelled_reason" className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950" />
              </label>
              <label className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-300 md:col-span-3">
                <input type="checkbox" name="confirm_cancel" value="1" required className="mt-1" />
                Confirmo que quiero cancelar esta sesion completa.
              </label>
              <button className="rounded-md border border-rose-300 px-4 py-2 text-sm font-semibold text-rose-800 hover:bg-rose-100 dark:border-rose-800 dark:text-rose-300 dark:hover:bg-rose-950">
                Confirmar cancelacion
              </button>
            </form>
          </details>
        ) : null}
      </div>
    </PageShell>
  );
}
