import Link from "next/link";
import { notFound } from "next/navigation";
import { WeeklyCallupSubmitButton } from "@/components/weekly-callups/submit-button";
import { PageShell } from "@/components/ui/page-shell";
import { getWeeklyCallupDetail } from "@/lib/queries/weekly-callups";
import {
  deleteWeeklyCallupGameAction,
  moveWeeklyCallupCategoryAction,
  saveWeeklyCallupGameAction,
  setWeeklyCallupStatusAction,
  toggleWeeklyCallupPlayerAction,
  toggleWeeklyCallupRestAction,
} from "@/server/actions/weekly-callups";

type PageProps = {
  params: Promise<{ callupId: string }>;
  searchParams: Promise<{ err?: string; ok?: string }>;
};

const ERROR_MESSAGES: Record<string, string> = {
  invalid_callup: "La convocatoria no es valida.",
  invalid_category: "La categoria no pertenece a esta convocatoria.",
  invalid_game: "Captura una fecha de esta semana, hora de cita, sede y rival.",
  category_is_resting: "Quita Descansa antes de agregar un partido.",
  remove_games_before_rest: "Elimina los partidos de esta categoria antes de marcar Descansa.",
  invalid_player: "El jugador no pertenece a esta categoria.",
  invalid_roster_status: "El estado del jugador no es valido.",
  invalid_category_move: "La categoria ya esta en ese extremo.",
  invalid_status: "El estado solicitado no es valido.",
  empty_callup: "La convocatoria no tiene categorias.",
  incomplete_categories: "Cada categoria debe tener al menos un partido completo o estar marcada como Descansa.",
};

const OK_MESSAGES: Record<string, string> = {
  game_saved: "Partido guardado.",
  game_deleted: "Partido eliminado.",
  rest_updated: "Estado de la categoria actualizado.",
  roster_updated: "Plantel actualizado.",
  category_moved: "Orden de categorias actualizado.",
  marked_ready: "Convocatoria marcada como lista.",
  reopened: "Convocatoria reabierta como borrador.",
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-MX", {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T12:00:00Z`));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("es-MX", {
    timeZone: "America/Monterrey",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function programLabel(program: string) {
  return program === "selectivo" ? "Selectivos" : "Futbol Para Todos";
}

function statusLabel(status: string) {
  if (status === "ready") return "Lista";
  if (status === "shared") return "Compartida";
  return "Borrador";
}

export default async function WeeklyCallupEditorPage({ params, searchParams }: PageProps) {
  const [{ callupId }, query] = await Promise.all([params, searchParams]);
  const callup = await getWeeklyCallupDetail(callupId);
  if (!callup) notFound();

  const includedTotal = callup.categories.reduce(
    (total, category) => total + category.players.filter((player) => player.rosterStatus === "included").length,
    0,
  );

  return (
    <PageShell
      wide
      title={callup.tournamentName}
      subtitle={`${callup.campusName} | ${programLabel(callup.program)} | ${formatDate(callup.weekStart)} al ${formatDate(callup.weekEnd)}`}
    >
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href="/convocatorias" className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-portoBlue">
            Volver a convocatorias
          </Link>
          <form action={setWeeklyCallupStatusAction}>
            <input type="hidden" name="callupId" value={callup.id} />
            <input type="hidden" name="status" value={callup.status === "ready" ? "draft" : "ready"} />
            <WeeklyCallupSubmitButton
              label={callup.status === "ready" ? "Reabrir borrador" : "Marcar como lista"}
              pendingLabel="Validando..."
            />
          </form>
        </div>

        {query.err ? (
          <p className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            {ERROR_MESSAGES[query.err] ?? "No se pudo completar la accion."}
          </p>
        ) : null}
        {query.ok ? (
          <p className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            {OK_MESSAGES[query.ok] ?? "Cambio guardado."}
          </p>
        ) : null}

        <section className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase text-slate-500">Estado</p>
            <p className="mt-1 text-xl font-semibold text-portoBlue">{statusLabel(callup.status)}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase text-slate-500">Plantel incluido</p>
            <p className="mt-1 text-xl font-semibold">{includedTotal} jugadores</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase text-slate-500">Plantel congelado</p>
            <p className="mt-1 text-sm font-medium">{formatDateTime(callup.snapshotAt)}</p>
          </div>
        </section>

        <p className="text-sm text-slate-500">
          Agrega uno o mas partidos por categoria. Excluir a un jugador solo cambia esta convocatoria; no modifica pagos, inscripciones ni grupos.
        </p>

        <div className="space-y-4">
          {callup.categories.map((category, categoryIndex) => {
            const included = category.players.filter((player) => player.rosterStatus === "included");
            const excluded = category.players.filter((player) => player.rosterStatus === "excluded");
            return (
              <section key={category.id} className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
                <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3">
                  <div>
                    <h2 className="text-lg font-semibold text-portoBlue">{category.categoryLabel} - {category.trainingGroupName}</h2>
                    <p className="text-sm text-slate-500">{included.length} incluidos | {excluded.length} excluidos | {category.games.length} partidos</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <form action={moveWeeklyCallupCategoryAction}>
                      <input type="hidden" name="callupId" value={callup.id} />
                      <input type="hidden" name="categoryId" value={category.id} />
                      <input type="hidden" name="direction" value="up" />
                      <button disabled={categoryIndex === 0} title="Subir categoria" className="h-9 w-9 rounded-md border border-slate-300 text-lg disabled:opacity-30">↑</button>
                    </form>
                    <form action={moveWeeklyCallupCategoryAction}>
                      <input type="hidden" name="callupId" value={callup.id} />
                      <input type="hidden" name="categoryId" value={category.id} />
                      <input type="hidden" name="direction" value="down" />
                      <button disabled={categoryIndex === callup.categories.length - 1} title="Bajar categoria" className="h-9 w-9 rounded-md border border-slate-300 text-lg disabled:opacity-30">↓</button>
                    </form>
                    <form action={toggleWeeklyCallupRestAction}>
                      <input type="hidden" name="callupId" value={callup.id} />
                      <input type="hidden" name="categoryId" value={category.id} />
                      <input type="hidden" name="isRest" value={category.isRest ? "false" : "true"} />
                      <WeeklyCallupSubmitButton
                        label={category.isRest ? "Quitar Descansa" : "Marcar Descansa"}
                        className={category.isRest
                          ? "min-h-9 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900 disabled:opacity-60"
                          : "min-h-9 rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-60"}
                      />
                    </form>
                  </div>
                </header>

                <div className="grid gap-5 p-4 xl:grid-cols-[1.35fr_1fr]">
                  <div className="space-y-3">
                    <h3 className="font-semibold">Partidos</h3>
                    {category.isRest ? (
                      <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-6 text-center font-semibold text-amber-900">DESCANSA</div>
                    ) : (
                      <>
                        {category.games.map((game, gameIndex) => (
                          <div key={game.id} className="rounded-md border border-slate-200 p-3">
                            <p className="mb-2 text-xs font-semibold uppercase text-slate-500">Partido {gameIndex + 1}</p>
                            <form action={saveWeeklyCallupGameAction} className="grid gap-2 sm:grid-cols-2">
                              <input type="hidden" name="callupId" value={callup.id} />
                              <input type="hidden" name="categoryId" value={category.id} />
                              <input type="hidden" name="gameId" value={game.id} />
                              <label className="space-y-1 text-xs font-medium"><span>Fecha</span><input required type="date" name="matchDate" defaultValue={game.matchDate} min={callup.weekStart} max={callup.weekEnd} className="min-h-9 w-full rounded-md border border-slate-300 px-2" /></label>
                              <label className="space-y-1 text-xs font-medium"><span>Hora de cita</span><input required type="time" name="arrivalTime" defaultValue={game.arrivalTime} className="min-h-9 w-full rounded-md border border-slate-300 px-2" /></label>
                              <label className="space-y-1 text-xs font-medium"><span>Sede</span><input required name="venue" defaultValue={game.venue} className="min-h-9 w-full rounded-md border border-slate-300 px-2" /></label>
                              <label className="space-y-1 text-xs font-medium"><span>Rival</span><input required name="opponent" defaultValue={game.opponent} className="min-h-9 w-full rounded-md border border-slate-300 px-2" /></label>
                              <div className="sm:col-span-2"><WeeklyCallupSubmitButton label="Guardar partido" /></div>
                            </form>
                            <form action={deleteWeeklyCallupGameAction} className="mt-2">
                              <input type="hidden" name="callupId" value={callup.id} />
                              <input type="hidden" name="categoryId" value={category.id} />
                              <input type="hidden" name="gameId" value={game.id} />
                              <WeeklyCallupSubmitButton label="Eliminar partido" pendingLabel="Eliminando..." className="min-h-8 rounded-md border border-rose-300 px-3 py-1 text-xs font-semibold text-rose-700 disabled:opacity-60" />
                            </form>
                          </div>
                        ))}
                        <form action={saveWeeklyCallupGameAction} className="grid gap-2 rounded-md border border-dashed border-slate-300 bg-slate-50 p-3 sm:grid-cols-2">
                          <input type="hidden" name="callupId" value={callup.id} />
                          <input type="hidden" name="categoryId" value={category.id} />
                          <p className="text-xs font-semibold uppercase text-slate-500 sm:col-span-2">Agregar partido</p>
                          <label className="space-y-1 text-xs font-medium"><span>Fecha</span><input required type="date" name="matchDate" min={callup.weekStart} max={callup.weekEnd} className="min-h-9 w-full rounded-md border border-slate-300 bg-white px-2" /></label>
                          <label className="space-y-1 text-xs font-medium"><span>Hora de cita</span><input required type="time" name="arrivalTime" className="min-h-9 w-full rounded-md border border-slate-300 bg-white px-2" /></label>
                          <label className="space-y-1 text-xs font-medium"><span>Sede</span><input required name="venue" className="min-h-9 w-full rounded-md border border-slate-300 bg-white px-2" /></label>
                          <label className="space-y-1 text-xs font-medium"><span>Rival</span><input required name="opponent" className="min-h-9 w-full rounded-md border border-slate-300 bg-white px-2" /></label>
                          <div className="sm:col-span-2"><WeeklyCallupSubmitButton label="Agregar partido" /></div>
                        </form>
                      </>
                    )}
                  </div>

                  <div className="space-y-3">
                    <h3 className="font-semibold">Plantel congelado</h3>
                    <div className="max-h-[34rem] divide-y divide-slate-200 overflow-y-auto rounded-md border border-slate-200">
                      {category.players.map((player) => {
                        const isIncluded = player.rosterStatus === "included";
                        return (
                          <div key={player.id} className={`flex items-center justify-between gap-3 px-3 py-2 text-sm ${isIncluded ? "bg-white" : "bg-slate-50 text-slate-400"}`}>
                            <div className="min-w-0">
                              <p className={`truncate font-medium ${isIncluded ? "text-slate-900" : "line-through"}`}>{player.playerName}</p>
                              <p className="text-xs text-slate-500">Cat. {player.birthYear ?? "-"}{player.eligibilitySource === "bundle" ? " | Combo" : ""}</p>
                            </div>
                            <form action={toggleWeeklyCallupPlayerAction}>
                              <input type="hidden" name="callupId" value={callup.id} />
                              <input type="hidden" name="categoryId" value={category.id} />
                              <input type="hidden" name="playerRowId" value={player.id} />
                              <input type="hidden" name="rosterStatus" value={isIncluded ? "excluded" : "included"} />
                              <WeeklyCallupSubmitButton
                                label={isIncluded ? "Excluir" : "Restaurar"}
                                className={isIncluded
                                  ? "min-h-8 rounded-md border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-600 disabled:opacity-60"
                                  : "min-h-8 rounded-md border border-emerald-300 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800 disabled:opacity-60"}
                              />
                            </form>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </PageShell>
  );
}
