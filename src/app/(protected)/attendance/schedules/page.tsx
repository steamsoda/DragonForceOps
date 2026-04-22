import { PageShell } from "@/components/ui/page-shell";
import { requireAttendanceWriteContext } from "@/lib/auth/permissions";
import { listAttendanceScheduleTemplates } from "@/lib/queries/attendance";
import { createAttendanceScheduleAction, updateAttendanceScheduleAction } from "@/server/actions/attendance";

const DAYS = [
  [1, "Lunes"],
  [2, "Martes"],
  [3, "Miercoles"],
  [4, "Jueves"],
  [5, "Viernes"],
  [6, "Sabado"],
  [7, "Domingo"],
] as const;

type SearchParams = Promise<{ ok?: string; err?: string }>;

export default async function AttendanceSchedulesPage({ searchParams }: { searchParams: SearchParams }) {
  await requireAttendanceWriteContext("/unauthorized");
  const params = await searchParams;
  const data = await listAttendanceScheduleTemplates();

  return (
    <PageShell title="Horarios de asistencia" subtitle="Plantillas semanales para generar entrenamientos futuros." wide>
      <div className="space-y-5">
        {params.err ? (
          <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">Error: {params.err}</div>
        ) : null}
        {params.ok ? (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">Cambios guardados.</div>
        ) : null}

        {data.canManageSchedules ? (
          <form action={createAttendanceScheduleAction} className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900 md:grid-cols-5">
            <label className="text-sm font-medium md:col-span-2">
              Equipo de clases
              <select name="team_id" required className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950">
                {data.classTeams.map((team) => (
                  <option key={team.id} value={team.id}>{team.campusName} | {team.name}</option>
                ))}
              </select>
            </label>
            <label className="text-sm font-medium">
              Dia
              <select name="day_of_week" defaultValue="1" className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950">
                {DAYS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
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
              Vigente desde
              <input name="effective_start" type="date" required className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950" />
            </label>
            <div className="flex items-end md:col-span-4">
              <button className="rounded-md bg-portoBlue px-4 py-2 text-sm font-semibold text-white hover:bg-portoDark">Agregar horario</button>
            </div>
          </form>
        ) : (
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
            Puedes consultar horarios, pero solo directores y Director Deportivo pueden modificarlos.
          </div>
        )}

        <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
          <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-700">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-900">
              <tr>
                <th className="px-3 py-2">Equipo</th>
                <th className="px-3 py-2">Dia</th>
                <th className="px-3 py-2">Horario</th>
                <th className="px-3 py-2">Vigencia</th>
                <th className="px-3 py-2">Estado</th>
                <th className="px-3 py-2">Accion</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {data.templates.map((template) => (
                <tr key={template.id}>
                  <td className="px-3 py-2">
                    <p className="font-medium">{template.teamName}</p>
                    <p className="text-xs text-slate-500">{template.campusName} | Coach {template.coachName ?? "-"}</p>
                  </td>
                  {data.canManageSchedules ? (
                    <td className="px-3 py-2" colSpan={5}>
                      <form action={updateAttendanceScheduleAction.bind(null, template.id)} className="grid gap-2 md:grid-cols-6">
                        <select name="day_of_week" defaultValue={template.dayOfWeek} className="rounded-md border border-slate-300 bg-white px-2 py-1 dark:border-slate-600 dark:bg-slate-950">
                          {DAYS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                        </select>
                        <input name="start_time" type="time" defaultValue={template.startTime} className="rounded-md border border-slate-300 bg-white px-2 py-1 dark:border-slate-600 dark:bg-slate-950" />
                        <input name="end_time" type="time" defaultValue={template.endTime} className="rounded-md border border-slate-300 bg-white px-2 py-1 dark:border-slate-600 dark:bg-slate-950" />
                        <input name="effective_end" type="date" defaultValue={template.effectiveEnd ?? ""} className="rounded-md border border-slate-300 bg-white px-2 py-1 dark:border-slate-600 dark:bg-slate-950" />
                        <label className="flex items-center gap-2 text-xs">
                          <input type="checkbox" name="is_active" value="1" defaultChecked={template.isActive} />
                          Activo
                        </label>
                        <button className="rounded-md border border-slate-300 px-3 py-1 font-medium hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800">Guardar</button>
                      </form>
                    </td>
                  ) : (
                    <>
                      <td className="px-3 py-2">{DAYS.find(([value]) => value === template.dayOfWeek)?.[1] ?? template.dayOfWeek}</td>
                      <td className="px-3 py-2">{template.startTime} - {template.endTime}</td>
                      <td className="px-3 py-2">{template.effectiveStart} - {template.effectiveEnd ?? "Actual"}</td>
                      <td className="px-3 py-2">{template.isActive ? "Activo" : "Inactivo"}</td>
                      <td className="px-3 py-2">Solo lectura</td>
                    </>
                  )}
                </tr>
              ))}
              {data.templates.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-slate-500">No hay horarios registrados.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </PageShell>
  );
}
