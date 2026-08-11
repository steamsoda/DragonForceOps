import Link from "next/link";
import { redirect } from "next/navigation";
import { PageShell } from "@/components/ui/page-shell";
import { WeeklyCallupDeleteButton } from "@/components/weekly-callups/delete-button";
import { CoachScheduleForm } from "@/components/weekly-callups/coach-schedule-form";
import { CoachScheduleLiveRefresh } from "@/components/weekly-callups/live-refresh";
import { CurrentWeekDashboard } from "@/components/weekly-callups/current-week-dashboard";
import { getPermissionContext } from "@/lib/auth/permissions";
import { getDebugViewContext } from "@/lib/auth/debug-view";
import { getCoachSchedulePageData } from "@/lib/queries/coach-schedules";
import { getWeeklyCallupsFoundationData, type WeeklyCallupListRow } from "@/lib/queries/weekly-callups";
import { deleteWeeklyCallupAction } from "@/server/actions/weekly-callups";

type SearchParams = Promise<{ err?: string; ok?: string; campus?: string; program?: string; week?: string }>;

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

function SavedCallupCards({ callups, canDelete }: { callups: WeeklyCallupListRow[]; canDelete: boolean }) {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {callups.map((callup) => (
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
            {canDelete ? (
              <form action={deleteWeeklyCallupAction}>
                <input type="hidden" name="callupId" value={callup.id} />
                <WeeklyCallupDeleteButton />
              </form>
            ) : null}
          </div>
        </article>
      ))}
    </div>
  );
}

export default async function WeeklyCallupsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const permission = await getPermissionContext();
  if (permission?.isCoach && !permission.isDirector && !permission.isSportsDirector && !permission.isFrontDesk) {
    const debugContext = await getDebugViewContext();
    const coachData = await getCoachSchedulePageData(params.week);
    if (!coachData) redirect("/unauthorized");
    return (
      <PageShell wide title="Mis horarios" subtitle="Reporta los partidos de la semana solo para tus grupos asignados.">
        <div className="space-y-5">
          {debugContext?.isReadOnly ? (
            <p className="rounded-md border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
              Modo de prueba de coach: en Preview puedes guardar y actualizar solamente estos horarios. El resto del modo Ver como permanece en solo lectura.
            </p>
          ) : null}
          <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div><h2 className="font-semibold">Coach {coachData.coachName}</h2><p className="text-sm text-slate-500">No modifica planteles, pagos, asistencias ni inscripciones.</p></div>
              <form className="flex items-end gap-2">
                <label className="text-sm font-medium">Lunes de la semana<input name="week" type="date" defaultValue={coachData.selectedWeekStart} className="mt-1 block min-h-10 rounded-md border border-slate-300 px-3" /></label>
                <button className="min-h-10 rounded-md border border-portoBlue px-4 py-2 text-sm font-semibold text-portoBlue">Ver semana</button>
              </form>
            </div>
          </section>
          {coachData.groups.length ? coachData.groups.map((group) => (
            <CoachScheduleForm key={`${coachData.selectedWeekStart}:${group.id}`} group={group} weekStart={coachData.selectedWeekStart} tournaments={coachData.tournaments} />
          )) : <p className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">No tienes grupos activos asignados. Un Super Admin debe revisar tu vinculacion y los coaches del grupo.</p>}
        </div>
      </PageShell>
    );
  }
  const data = await getWeeklyCallupsFoundationData(params.week);
  if (!data) redirect("/unauthorized");
  const selectedCampusId = data.campuses.some((campus) => campus.id === params.campus)
    ? params.campus!
    : data.defaultCampusId;
  const selectedProgram = params.program === "selectivo" ? "selectivo" : "futbol_para_todos";
  const previousCallups = data.callups.filter((callup) => callup.weekStart !== data.currentWeekStart);

  return (
    <PageShell
      wide
      title="Convocatorias"
      subtitle="Prepara los planteles semanales para WhatsApp a partir de inscripciones de torneo pagadas."
    >
      <div className="space-y-5">
        <CoachScheduleLiveRefresh />
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

        <CurrentWeekDashboard
          data={data}
          selectedCampusId={selectedCampusId}
          selectedProgram={selectedProgram}
        />

        {previousCallups.length ? (
          <details className="rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
            <summary className="cursor-pointer list-none px-4 py-4 font-semibold text-portoBlue">
              Convocatorias anteriores <span className="ml-2 rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-600">{previousCallups.length}</span>
              <span className="ml-2 text-xs font-normal text-slate-500">Abrir historial</span>
            </summary>
            <div className="border-t border-slate-200 p-4">
              <SavedCallupCards callups={previousCallups} canDelete={data.canDeleteCallups} />
            </div>
          </details>
        ) : data.callups.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">Todavia no hay convocatorias guardadas.</p>
        ) : null}
      </div>
    </PageShell>
  );
}
