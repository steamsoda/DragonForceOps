import { PageShell } from "@/components/ui/page-shell";
import { requireAttendanceWriteContext } from "@/lib/auth/permissions";
import { listAttendanceScheduleTemplates } from "@/lib/queries/attendance";
import { createAttendanceScheduleAction, createBulkAttendanceSchedulesAction, updateAttendanceScheduleAction } from "@/server/actions/attendance";
import { getMonterreyDateString } from "@/lib/time";

const DAYS = [
  [1, "Lunes"],
  [2, "Martes"],
  [3, "Miercoles"],
  [4, "Jueves"],
  [5, "Viernes"],
  [6, "Sabado"],
  [7, "Domingo"],
] as const;

type SearchParams = Promise<{ ok?: string; err?: string; count?: string }>;

export default async function AttendanceSchedulesPage({ searchParams }: { searchParams: SearchParams }) {
  await requireAttendanceWriteContext("/unauthorized");
  const params = await searchParams;
  const data = await listAttendanceScheduleTemplates();
  const bulkCreatedCount = params.ok === "bulk_created" ? Number(params.count ?? "0") : null;
  const defaultDate = getMonterreyDateString();

  return (
    <PageShell title="Horarios de asistencia" subtitle="Plantillas semanales para generar entrenamientos futuros." wide>
      <div className="space-y-5">
        {params.err ? (
          <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">Error: {params.err}</div>
        ) : null}
        {params.ok ? (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            {params.ok === "bulk_created" ? `Horarios creados: ${bulkCreatedCount ?? 0}.` : "Cambios guardados."}
          </div>
        ) : null}

        {data.canManageSchedules ? (
          <div className="grid gap-4">
            <form action={createBulkAttendanceSchedulesAction} className="grid gap-3 rounded-lg border border-emerald-200 bg-emerald-50/60 p-4 dark:border-emerald-900/40 dark:bg-emerald-950/20 md:grid-cols-[1fr_1fr_2fr_auto]">
              <label className="text-sm font-medium">
                Campus
                <select name="campus_id" required className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950">
                  {data.campuses.map((campus) => (
                    <option key={campus.id} value={campus.id}>{campus.name}</option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-medium">
                Vigente desde
                <input name="effective_start" type="date" required defaultValue={defaultDate} className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950" />
              </label>
              <fieldset className="text-sm font-medium">
                <legend>Dias semanales</legend>
                <div className="mt-2 flex flex-wrap gap-2">
                  {DAYS.map(([value, label], index) => (
                    <label key={value} className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs dark:border-slate-600 dark:bg-slate-950">
                      <input type="checkbox" name="day_of_week" value={value} defaultChecked={index < 2} />
                      {label}
                    </label>
                  ))}
                </div>
                <p className="mt-2 text-xs font-normal text-slate-500 dark:text-slate-400">
                  Crea los horarios faltantes para todos los grupos activos con horario en ese campus.
                </p>
              </fieldset>
              <div className="flex items-end">
                <button className="w-full rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700">
                  Crear horarios del campus
                </button>
              </div>
            </form>

            <form action={createAttendanceScheduleAction} className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900 md:grid-cols-5">
              <label className="text-sm font-medium md:col-span-2">
                Grupo de entrenamiento
                <select name="training_group_id" required className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950">
                  {data.trainingGroups.map((group) => (
                    <option key={group.id} value={group.id}>{group.campusName} | {group.name}</option>
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
                <input name="effective_start" type="date" required defaultValue={defaultDate} className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950" />
              </label>
              <div className="flex items-end md:col-span-4">
                <button className="rounded-md bg-portoBlue px-4 py-2 text-sm font-semibold text-white hover:bg-portoDark">Agregar horario</button>
              </div>
            </form>
          </div>
        ) : (
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
            Puedes consultar horarios, pero solo directores y Director Deportivo pueden modificarlos.
          </div>
        )}

        <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
          <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-700">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-900">
              <tr>
                <th className="px-3 py-2">Grupo / equipo</th>
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
                    <p className="text-xs text-slate-500">{template.campusName} | {template.sourceType === "training_group" ? "Grupo" : "Equipo"} | Coach {template.coachName ?? "-"}</p>
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
