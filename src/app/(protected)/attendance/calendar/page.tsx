import Link from "next/link";
import { PageShell } from "@/components/ui/page-shell";
import { requireAttendanceReadContext } from "@/lib/auth/permissions";
import { ATTENDANCE_SESSION_TYPE_LABELS, getAttendanceCalendarData } from "@/lib/queries/attendance";
import { createAttendanceClosureAction } from "@/server/actions/attendance";

type SearchParams = Promise<{ campus?: string; month?: string; ok?: string; err?: string; cancelled?: string }>;

const STATUS_LABELS: Record<string, string> = {
  scheduled: "Pendiente",
  completed: "Tomada",
  cancelled: "Cancelada",
};

const STATUS_STYLES: Record<string, string> = {
  scheduled: "border-amber-200 bg-amber-50 text-amber-800",
  completed: "border-emerald-200 bg-emerald-50 text-emerald-800",
  cancelled: "border-slate-200 bg-slate-50 text-slate-600",
};

const CLOSURE_REASON_LABELS: Record<string, string> = {
  rain: "Lluvia",
  holiday: "Festivo",
  vacation: "Vacaciones",
  event: "Evento",
  other: "Otro",
};

function addMonths(month: string, delta: number) {
  const [yearRaw, monthRaw] = month.split("-");
  const date = new Date(Date.UTC(Number(yearRaw), Number(monthRaw) - 1 + delta, 1, 12));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function calendarHref(params: { campus?: string | null; month: string }) {
  const search = new URLSearchParams();
  if (params.campus) search.set("campus", params.campus);
  search.set("month", params.month);
  return `/attendance/calendar?${search.toString()}`;
}

function monthTitle(month: string) {
  const [year, monthRaw] = month.split("-");
  const labels = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
  return `${labels[Number(monthRaw) - 1] ?? monthRaw} ${year}`;
}

function isoDayOfWeek(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  const jsDay = new Date(Date.UTC(year, month - 1, day, 12)).getUTCDay();
  return jsDay === 0 ? 7 : jsDay;
}

export default async function AttendanceCalendarPage({ searchParams }: { searchParams: SearchParams }) {
  const context = await requireAttendanceReadContext("/unauthorized");
  const params = await searchParams;
  const data = await getAttendanceCalendarData({ campusId: params.campus, month: params.month });
  const selectedCampus = data.campuses.find((campus) => campus.id === data.selectedCampusId) ?? null;
  const previousMonth = addMonths(data.selectedMonth, -1);
  const nextMonth = addMonths(data.selectedMonth, 1);
  const leadingBlankDays = data.days[0] ? isoDayOfWeek(data.days[0].date) - 1 : 0;
  const canManageClosures = context.hasAttendanceWriteAccess && (context.isDirector || context.isSportsDirector);
  const defaultClosureCampusId = data.selectedCampusId ?? (context.isDirector ? "" : data.campuses[0]?.id ?? "");

  return (
    <PageShell
      title="Calendario de asistencia"
      subtitle="Vista mensual de sesiones generadas y cierres operativos. Los cierres crean/cancelan sesiones como canceladas para que el calendario siga explicando lo ocurrido."
      wide
    >
      <div className="space-y-5">
        {params.ok === "closure_created" ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            Cierre registrado. Sesiones programadas canceladas: {params.cancelled ?? "0"}.
          </div>
        ) : null}
        {params.err ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            No se pudo registrar el cierre. Codigo: {params.err}.
          </div>
        ) : null}

        <form className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900">
          <label className="text-sm font-medium">
            Mes
            <input name="month" type="month" defaultValue={data.selectedMonth} className="mt-1 block rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950" />
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
          <button className="rounded-md bg-portoBlue px-4 py-2 text-sm font-semibold text-white hover:bg-portoDark">Ver calendario</button>
          <div className="flex gap-2">
            <Link href={calendarHref({ campus: data.selectedCampusId, month: previousMonth })} className="rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-white dark:border-slate-600 dark:hover:bg-slate-800">
              Mes anterior
            </Link>
            <Link href={calendarHref({ campus: data.selectedCampusId, month: nextMonth })} className="rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-white dark:border-slate-600 dark:hover:bg-slate-800">
              Mes siguiente
            </Link>
          </div>
        </form>

        {canManageClosures ? (
          <details className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <summary className="cursor-pointer list-none">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Registrar cierre</p>
                  <p className="text-xs text-slate-500">Cancela sesiones programadas en el rango y hace que futuras generaciones nazcan canceladas.</p>
                </div>
                <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">Director / deportes</span>
              </div>
            </summary>
            <form action={createAttendanceClosureAction} className="mt-4 grid gap-3 md:grid-cols-6">
              <label className="text-sm font-medium">
                Campus
                <select name="campus_id" defaultValue={defaultClosureCampusId} className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950">
                  {context.isDirector ? <option value="">Todos los campus</option> : null}
                  {data.campuses.map((campus) => (
                    <option key={campus.id} value={campus.id}>{campus.name}</option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-medium">
                Inicio
                <input name="starts_on" type="date" defaultValue={`${data.selectedMonth}-01`} required className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950" />
              </label>
              <label className="text-sm font-medium">
                Fin
                <input name="ends_on" type="date" defaultValue={`${data.selectedMonth}-01`} required className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950" />
              </label>
              <label className="text-sm font-medium">
                Motivo
                <select name="reason_code" defaultValue="rain" className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950">
                  <option value="rain">Lluvia</option>
                  <option value="holiday">Festivo</option>
                  <option value="vacation">Vacaciones</option>
                  <option value="event">Evento</option>
                  <option value="other">Otro</option>
                </select>
              </label>
              <label className="text-sm font-medium md:col-span-2">
                Titulo
                <input name="title" placeholder="Ej. Lluvia Linda Vista" required className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950" />
              </label>
              <label className="text-sm font-medium md:col-span-5">
                Notas
                <input name="notes" placeholder="Opcional: contexto operativo" className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950" />
              </label>
              <div className="flex items-end">
                <button className="w-full rounded-md bg-portoBlue px-4 py-2 text-sm font-semibold text-white hover:bg-portoDark">Guardar cierre</button>
              </div>
            </form>
          </details>
        ) : null}

        <section className="grid gap-3 md:grid-cols-4">
          <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900">
            <p className="text-xs uppercase tracking-wide text-slate-500">Mes</p>
            <p className="text-xl font-bold text-slate-900 dark:text-slate-100">{monthTitle(data.selectedMonth)}</p>
            <p className="text-xs text-slate-500">{selectedCampus?.name ?? "Todos los campus"}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900">
            <p className="text-xs uppercase tracking-wide text-slate-500">Sesiones</p>
            <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{data.totals.total}</p>
          </div>
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 dark:border-emerald-900/50 dark:bg-emerald-950/20">
            <p className="text-xs uppercase tracking-wide text-emerald-700 dark:text-emerald-200">Tomadas</p>
            <p className="text-2xl font-bold text-emerald-900 dark:text-emerald-100">{data.totals.completed}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-900">
            <p className="text-xs uppercase tracking-wide text-slate-500">Canceladas</p>
            <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{data.totals.cancelled}</p>
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div className="mb-3 grid grid-cols-7 gap-2 text-center text-xs font-semibold uppercase tracking-wide text-slate-500">
            <span>Lun</span>
            <span>Mar</span>
            <span>Mie</span>
            <span>Jue</span>
            <span>Vie</span>
            <span>Sab</span>
            <span>Dom</span>
          </div>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-7">
            {Array.from({ length: leadingBlankDays }, (_, index) => (
              <div key={`blank-${index}`} className="hidden rounded-lg border border-transparent md:block" />
            ))}
            {data.days.map((day) => (
              <details
                key={day.date}
                className={`min-h-32 rounded-lg border p-3 transition ${day.isToday ? "border-portoBlue bg-blue-50 dark:border-blue-700 dark:bg-blue-950/20" : "border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-950/40"}`}
              >
                <summary className="cursor-pointer list-none">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-slate-500">{day.weekdayLabel}</p>
                      <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{day.dayOfMonth}</p>
                    </div>
                    {day.total > 0 ? (
                      <span className="rounded-full border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200">
                        {day.total}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1">
                    {day.closures.map((closure) => (
                      <span key={closure.id} className="rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-800">
                        {CLOSURE_REASON_LABELS[closure.reasonCode] ?? closure.reasonCode}
                      </span>
                    ))}
                    {day.scheduled > 0 ? <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] text-amber-800">Pend: {day.scheduled}</span> : null}
                    {day.completed > 0 ? <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-800">Tom: {day.completed}</span> : null}
                    {day.cancelled > 0 ? <span className="rounded-full border border-slate-300 bg-white px-2 py-0.5 text-[11px] text-slate-600">Canc: {day.cancelled}</span> : null}
                    {day.total === 0 ? <span className="text-xs text-slate-400">Sin sesiones</span> : null}
                  </div>
                </summary>

                {day.closures.length > 0 ? (
                  <div className="mt-3 space-y-2 border-t border-slate-200 pt-3 dark:border-slate-700">
                    {day.closures.map((closure) => (
                      <div key={closure.id} className="rounded-md border border-rose-200 bg-rose-50 p-2 text-xs text-rose-900">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold">{closure.title}</span>
                          <span className="rounded-full border border-rose-300 bg-white px-2 py-0.5 font-semibold">
                            {CLOSURE_REASON_LABELS[closure.reasonCode] ?? closure.reasonCode}
                          </span>
                        </div>
                        <p className="mt-1 text-rose-800">{closure.campusName}</p>
                        {closure.notes ? <p className="mt-1 text-rose-800">{closure.notes}</p> : null}
                      </div>
                    ))}
                  </div>
                ) : null}

                {day.sessions.length > 0 ? (
                  <div className="mt-3 space-y-2 border-t border-slate-200 pt-3 dark:border-slate-700">
                    {day.sessions.map((session) => (
                      <Link
                        key={session.id}
                        href={`/attendance/sessions/${session.id}`}
                        className="block rounded-md border border-slate-200 bg-white p-2 text-xs hover:border-portoBlue dark:border-slate-700 dark:bg-slate-900"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-slate-900 dark:text-slate-100">{session.startTime}</span>
                          <span className={`rounded-full border px-2 py-0.5 font-semibold ${STATUS_STYLES[session.status] ?? STATUS_STYLES.scheduled}`}>
                            {STATUS_LABELS[session.status] ?? session.status}
                          </span>
                        </div>
                        <p className="mt-1 font-medium text-slate-800 dark:text-slate-100">{session.sourceName}</p>
                        <p className="text-slate-500 dark:text-slate-400">
                          {session.campusName} | {ATTENDANCE_SESSION_TYPE_LABELS[session.sessionType] ?? session.sessionType}
                        </p>
                        <p className="text-slate-500 dark:text-slate-400">
                          {session.sourceType === "training_group" ? "Grupo" : "Equipo"} | Coach {session.coachName ?? "-"}
                        </p>
                      </Link>
                    ))}
                  </div>
                ) : null}
              </details>
            ))}
          </div>
        </section>
      </div>
    </PageShell>
  );
}
