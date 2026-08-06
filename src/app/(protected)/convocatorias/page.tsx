import Link from "next/link";
import { redirect } from "next/navigation";
import { PageShell } from "@/components/ui/page-shell";
import { getWeeklyCallupsFoundationData } from "@/lib/queries/weekly-callups";
import { createWeeklyCallupSnapshotAction } from "@/server/actions/weekly-callups";

type SearchParams = Promise<{ err?: string; ok?: string }>;

const ERROR_MESSAGES: Record<string, string> = {
  invalid_snapshot_settings: "Selecciona campus, torneo, programa y un lunes valido.",
  invalid_tournament: "El torneo ya no esta activo para ese campus.",
  snapshot_already_exists: "Ya existe un borrador para ese torneo, programa y semana.",
  paid_roster_unavailable: "No se pudo leer el plantel pagado del torneo.",
  no_matching_paid_players: "No hay jugadores pagados con un grupo activo de ese programa.",
  snapshot_create_failed: "No se pudo crear el borrador congelado.",
};

function programLabel(program: string) {
  return program === "selectivo" ? "Selectivos" : "Futbol Para Todos";
}

function statusLabel(status: string) {
  if (status === "ready") return "Listo";
  if (status === "shared") return "Compartido";
  return "Borrador";
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
            Borrador creado con el plantel pagado congelado.
          </p>
        ) : null}

        <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <div>
            <h2 className="text-base font-semibold">Crear borrador semanal</h2>
            <p className="text-sm text-slate-500">
              Guarda una fotografia del plantel pagado y su grupo actual. Cambios posteriores no alteran este borrador.
            </p>
          </div>
          <form action={createWeeklyCallupSnapshotAction} className="grid gap-3 lg:grid-cols-[1fr_1.5fr_1fr_1fr_auto] lg:items-end">
            <label className="space-y-1 text-sm font-medium">
              <span>Campus</span>
              <select name="campusId" defaultValue={data.defaultCampusId} required className="min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 dark:border-slate-600 dark:bg-slate-950">
                {data.campuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}
              </select>
            </label>
            <label className="space-y-1 text-sm font-medium">
              <span>Torneo</span>
              <select name="tournamentId" required className="min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 dark:border-slate-600 dark:bg-slate-950">
                <option value="">Selecciona torneo</option>
                {data.tournaments.map((tournament) => {
                  const campus = data.campuses.find((candidate) => candidate.id === tournament.campusId);
                  return <option key={tournament.id} value={tournament.id}>{campus?.name ?? "Campus"} | {tournament.name}</option>;
                })}
              </select>
            </label>
            <label className="space-y-1 text-sm font-medium">
              <span>Programa</span>
              <select name="program" defaultValue="futbol_para_todos" required className="min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 dark:border-slate-600 dark:bg-slate-950">
                <option value="futbol_para_todos">Futbol Para Todos</option>
                <option value="selectivo">Selectivos</option>
              </select>
            </label>
            <label className="space-y-1 text-sm font-medium">
              <span>Lunes de la semana</span>
              <input name="weekStart" type="date" defaultValue={data.currentWeekStart} required className="min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 dark:border-slate-600 dark:bg-slate-950" />
            </label>
            <button className="min-h-10 rounded-md bg-portoBlue px-4 py-2 text-sm font-semibold text-white">
              Crear borrador
            </button>
          </form>
        </section>

        <section className="space-y-3">
          <div>
            <h2 className="text-lg font-semibold">Borradores guardados</h2>
            <p className="text-sm text-slate-500">Base congelada para la edicion de partidos y la imagen en los siguientes pases.</p>
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
                  <Link href={`/convocatorias/${callup.id}`} className="block min-h-10 rounded-md bg-portoBlue px-4 py-2 text-center text-sm font-semibold text-white">
                    Abrir borrador
                  </Link>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </PageShell>
  );
}
