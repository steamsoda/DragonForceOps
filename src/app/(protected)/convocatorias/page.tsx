import Link from "next/link";
import { redirect } from "next/navigation";
import { PageShell } from "@/components/ui/page-shell";
import { WeeklyCallupDeleteButton } from "@/components/weekly-callups/delete-button";
import { getWeeklyCallupsFoundationData } from "@/lib/queries/weekly-callups";
import { createWeeklyCallupComposerAction, deleteWeeklyCallupAction } from "@/server/actions/weekly-callups";

type SearchParams = Promise<{ err?: string; ok?: string; campus?: string; program?: string }>;

const ERROR_MESSAGES: Record<string, string> = {
  invalid_snapshot_settings: "Selecciona campus, torneo, programa y un lunes valido.",
  invalid_tournament: "El torneo ya no esta activo para ese campus.",
  snapshot_already_exists: "Ya existe una convocatoria para ese torneo, programa y semana.",
  paid_roster_unavailable: "No se pudo leer el plantel pagado del torneo.",
  no_matching_paid_players: "No hay jugadores pagados con un grupo activo de ese programa.",
  snapshot_create_failed: "No se pudo crear la convocatoria.",
  invalid_composer_settings: "Selecciona campus, programa y un lunes valido.",
  empty_composer: "Selecciona al menos un torneo para preparar la convocatoria.",
  invalid_composer_game: "Cada grupo seleccionado necesita partido completo o marcar Descansa.",
  composer_already_exists: "Ya existe una convocatoria para ese campus, programa y semana.",
  invalid_composer_source: "Un grupo o torneo seleccionado ya no esta disponible.",
  ambiguous_composer_roster: "Hay jugadores con mas de un grupo activo. Corrige esas asignaciones antes de continuar.",
  composer_create_failed: "No se pudo preparar la convocatoria.",
};

function programLabel(program: string) {
  return program === "selectivo" ? "Selectivos" : "Futbol Para Todos";
}

function statusLabel(status: string) {
  if (status === "shared") return "Compartido";
  return "Lista";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-MX", {
    timeZone: "UTC",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T12:00:00Z`));
}

export default async function WeeklyCallupsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const data = await getWeeklyCallupsFoundationData();
  if (!data) redirect("/unauthorized");
  const selectedCampusId = data.campuses.some((campus) => campus.id === params.campus)
    ? params.campus!
    : data.defaultCampusId;
  const selectedProgram = params.program === "selectivo" ? "selectivo" : "futbol_para_todos";
  const visibleGroups = data.groups.filter(
    (group) => group.campusId === selectedCampusId && group.program === selectedProgram,
  );
  const tournamentOptions = data.tournaments.filter((tournament) => tournament.campusId === selectedCampusId);
  const selectionHref = (campusId: string, program: string) =>
    `/convocatorias?campus=${encodeURIComponent(campusId)}&program=${encodeURIComponent(program)}`;

  return (
    <PageShell
      wide
      title="Convocatorias"
      subtitle="Prepara los planteles semanales para WhatsApp a partir de inscripciones de torneo pagadas."
    >
      <div className="space-y-5">
        {params.err ? (
          <p className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            {ERROR_MESSAGES[params.err] ?? "No se pudo completar la accion."}
          </p>
        ) : null}
        {params.ok === "snapshot_created" ? (
          <p className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            Convocatoria preparada con el plantel pagado.
          </p>
        ) : null}
        {params.ok === "callup_deleted" ? (
          <p className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            Convocatoria eliminada. Los pagos e inscripciones de torneo no cambiaron.
          </p>
        ) : null}

        <section className="space-y-5 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <div>
            <h2 className="text-base font-semibold">Preparar convocatoria semanal</h2>
            <p className="text-sm text-slate-500">
              Elige campus y programa. Despues captura el torneo y partido de cada grupo en una sola lista.
            </p>
          </div>
          <div className="space-y-4">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase text-slate-500">Campus</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {data.campuses.map((campus) => (
                  <Link key={campus.id} href={selectionHref(campus.id, selectedProgram)} className={`min-h-14 rounded-md border px-4 py-4 text-center font-semibold ${campus.id === selectedCampusId ? "border-portoBlue bg-blue-50 text-portoBlue" : "border-slate-300 bg-white text-slate-700"}`}>
                    {campus.name}
                  </Link>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold uppercase text-slate-500">Programa</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {[{ value: "selectivo", label: "Selectivos" }, { value: "futbol_para_todos", label: "Futbol Para Todos" }].map((program) => (
                  <Link key={program.value} href={selectionHref(selectedCampusId, program.value)} className={`min-h-14 rounded-md border px-4 py-4 text-center font-semibold ${program.value === selectedProgram ? "border-portoBlue bg-blue-50 text-portoBlue" : "border-slate-300 bg-white text-slate-700"}`}>
                    {program.label}
                  </Link>
                ))}
              </div>
            </div>
          </div>

          <form action={createWeeklyCallupComposerAction} className="space-y-4">
            <input type="hidden" name="campusId" value={selectedCampusId} />
            <input type="hidden" name="program" value={selectedProgram} />
            <div className="flex flex-wrap items-end justify-between gap-3">
              <label className="space-y-1 text-sm font-medium">
                <span>Lunes de la semana</span>
                <input name="weekStart" type="date" defaultValue={data.currentWeekStart} required className="min-h-10 rounded-md border border-slate-300 bg-white px-3 dark:border-slate-600 dark:bg-slate-950" />
              </label>
              <p className="text-xs text-slate-500">Deja Torneo vacio para omitir un grupo esta semana.</p>
            </div>
            <div className="overflow-x-auto rounded-md border border-slate-200">
              <table className="min-w-[1180px] w-full border-collapse text-sm">
                <thead className="bg-slate-100 text-left text-xs uppercase text-slate-600">
                  <tr>
                    <th className="px-3 py-2">Grupo</th><th className="px-3 py-2">Coach principal</th><th className="px-3 py-2">Torneo</th><th className="px-3 py-2">Fecha</th><th className="px-3 py-2">Hora cita</th><th className="px-3 py-2">Sede</th><th className="px-3 py-2">Rival</th><th className="px-3 py-2 text-center">Descansa</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {visibleGroups.map((group) => (
                    <tr key={group.id} className="align-top odd:bg-white even:bg-slate-50/70">
                      <td className="px-3 py-2"><input type="hidden" name="groupId" value={group.id} /><strong className="block text-portoBlue">{group.name}</strong><span className="text-xs text-slate-500">Cat. {group.categoryLabel}</span></td>
                      <td className="px-3 py-2">{group.primaryCoachName}</td>
                      <td className="px-3 py-2"><select name={`tournamentId:${group.id}`} defaultValue="" className="min-h-9 w-56 rounded border border-slate-300 bg-white px-2"><option value="">Omitir grupo</option>{tournamentOptions.map((tournament) => <option key={tournament.id} value={tournament.id}>{tournament.name}</option>)}</select></td>
                      <td className="px-3 py-2"><input type="date" name={`matchDate:${group.id}`} className="min-h-9 w-36 rounded border border-slate-300 px-2" /></td>
                      <td className="px-3 py-2"><input type="time" name={`arrivalTime:${group.id}`} className="min-h-9 w-28 rounded border border-slate-300 px-2" /></td>
                      <td className="px-3 py-2"><input name={`venue:${group.id}`} placeholder="Sede" className="min-h-9 w-36 rounded border border-slate-300 px-2" /></td>
                      <td className="px-3 py-2"><input name={`opponent:${group.id}`} placeholder="Rival" className="min-h-9 w-36 rounded border border-slate-300 px-2" /></td>
                      <td className="px-3 py-3 text-center"><input type="checkbox" name={`isRest:${group.id}`} value="yes" className="h-4 w-4" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {visibleGroups.length === 0 ? <p className="p-6 text-center text-sm text-slate-500">No hay grupos activos para esta seleccion.</p> : null}
            </div>
            <div className="flex justify-end">
              <button disabled={visibleGroups.length === 0} className="min-h-11 rounded-md bg-portoBlue px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">Preparar convocatoria</button>
            </div>
          </form>
        </section>

        <section className="space-y-3">
          <div>
            <h2 className="text-lg font-semibold">Convocatorias guardadas</h2>
            <p className="text-sm text-slate-500">Puedes abrir, modificar, volver a descargar o eliminar una convocatoria anterior.</p>
          </div>
          {data.callups.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">Todavia no hay convocatorias guardadas.</p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {data.callups.map((callup) => (
                <article key={callup.id} className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold text-portoBlue">{callup.tournamentName}</h3>
                      <p className="text-sm text-slate-600">{callup.campusName} | {programLabel(callup.program)}</p>
                    </div>
                    <span className="rounded-full border border-slate-300 px-2 py-1 text-xs font-medium">{statusLabel(callup.status)}</span>
                  </div>
                  <dl className="grid grid-cols-3 gap-2 text-sm">
                    <div><dt className="text-xs uppercase text-slate-500">Semana</dt><dd className="font-medium">{formatDate(callup.weekStart)}</dd></div>
                    <div><dt className="text-xs uppercase text-slate-500">Categorias</dt><dd className="font-medium">{callup.categoryCount}</dd></div>
                    <div><dt className="text-xs uppercase text-slate-500">Jugadores</dt><dd className="font-medium">{callup.playerCount}</dd></div>
                  </dl>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Link href={`/convocatorias/${callup.id}`} className="block min-h-10 rounded-md bg-portoBlue px-4 py-2 text-center text-sm font-semibold text-white">
                      Abrir convocatoria
                    </Link>
                    {data.canDeleteCallups ? (
                      <form action={deleteWeeklyCallupAction}>
                        <input type="hidden" name="callupId" value={callup.id} />
                        <WeeklyCallupDeleteButton />
                      </form>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </PageShell>
  );
}
