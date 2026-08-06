import Link from "next/link";
import { notFound } from "next/navigation";
import { WeeklyCallupPngExportButton } from "@/components/weekly-callups/png-export-button";
import { WeeklyCallupDeleteButton } from "@/components/weekly-callups/delete-button";
import { WeeklyCallupSubmitButton } from "@/components/weekly-callups/submit-button";
import { PageShell } from "@/components/ui/page-shell";
import { getWeeklyCallupDetail } from "@/lib/queries/weekly-callups";
import {
  addWeeklyCallupManualExceptionAction,
  deleteWeeklyCallupAction,
  deleteWeeklyCallupGameAction,
  moveWeeklyCallupCategoryAction,
  moveWeeklyCallupGameAction,
  refreshWeeklyCallupRosterAction,
  saveWeeklyCallupGameAction,
  toggleWeeklyCallupPlayerAction,
  toggleWeeklyCallupRestAction,
} from "@/server/actions/weekly-callups";

type PageProps = {
  params: Promise<{ callupId: string }>;
  searchParams: Promise<{ err?: string; ok?: string; compare?: string; exceptions?: string }>;
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
  invalid_game_move: "El partido ya esta en ese extremo.",
  invalid_status: "El estado solicitado no es valido.",
  empty_callup: "La convocatoria no tiene categorias.",
  incomplete_categories: "Cada categoria debe tener al menos un partido completo o estar marcada como Descansa.",
  invalid_manual_exception: "Selecciona un jugador y captura un motivo de al menos 5 caracteres.",
  paid_roster_unavailable: "No se pudo consultar el plantel pagado actual. No se hizo ningun cambio.",
  player_now_paid_refresh_roster: "Este jugador ya aparece como pagado. Actualiza el plantel en lugar de agregar una excepcion.",
  invalid_manual_exception_player: "El jugador ya no tiene una inscripcion activa valida para este campus.",
  manual_exception_group_mismatch: "El jugador no tiene un grupo activo compatible con esta convocatoria.",
  player_already_in_callup: "El jugador ya forma parte de esta convocatoria.",
  confirm_roster_refresh: "Confirma que revisaste los cambios antes de actualizar el plantel.",
};

const OK_MESSAGES: Record<string, string> = {
  game_saved: "Partido guardado.",
  game_deleted: "Partido eliminado.",
  rest_updated: "Estado de la categoria actualizado.",
  roster_updated: "Plantel actualizado.",
  category_moved: "Orden de categorias actualizado.",
  game_moved: "Orden de partidos actualizado.",
  manual_exception_added: "Excepcion sin pago agregada y registrada en auditoria.",
  roster_refreshed: "Plantel pagado actualizado. Partidos, descansos y excepciones manuales se conservaron.",
  composer_created: "Convocatoria preparada. Revisa jugadores, agrega partidos adicionales y genera la imagen.",
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
  if (status === "shared") return "Compartida";
  return "Lista";
}

export default async function WeeklyCallupEditorPage({ params, searchParams }: PageProps) {
  const [{ callupId }, query] = await Promise.all([params, searchParams]);
  const showComparison = query.compare === "1";
  const showExceptions = query.exceptions === "1";
  const callup = await getWeeklyCallupDetail(callupId, {
    includeComparison: showComparison,
    includeCandidates: showExceptions,
  });
  if (!callup) notFound();

  const includedTotal = callup.categories.reduce(
    (total, category) => total + category.players.filter((player) => player.rosterStatus === "included").length,
    0,
  );
  const comparisonChangeTotal = callup.rosterComparison
    ? callup.rosterComparison.added.length + callup.rosterComparison.removed.length + callup.rosterComparison.moved.length
    : 0;
  const tournamentNames = [...new Set(callup.categories.map((category) => category.tournamentName))];
  const isMixedTournament = tournamentNames.length > 1;
  const packetTitle = isMixedTournament ? "Convocatoria semanal" : tournamentNames[0] ?? callup.tournamentName;
  const pngData = {
    tournamentName: packetTitle,
    campusName: callup.campusName,
    program: callup.program,
    weekStart: callup.weekStart,
    weekEnd: callup.weekEnd,
    categories: callup.categories.map((category) => ({
      id: category.id,
      categoryLabel: category.categoryLabel,
      trainingGroupName: category.trainingGroupName,
      tournamentName: category.tournamentName,
      coachNames: category.coachNames,
      isRest: category.isRest,
      games: category.games.map((game) => ({
        matchDate: game.matchDate,
        arrivalTime: game.arrivalTime,
        venue: game.venue,
        opponent: game.opponent,
      })),
      players: category.players
        .filter((player) => player.rosterStatus === "included")
        .map((player) => ({ id: player.id, playerName: player.playerName })),
    })),
  };

  return (
    <PageShell
      wide
      title={packetTitle}
      subtitle={`${callup.campusName} | ${programLabel(callup.program)} | ${formatDate(callup.weekStart)} al ${formatDate(callup.weekEnd)}`}
    >
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href="/convocatorias" className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-portoBlue">
            Volver a convocatorias
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <WeeklyCallupPngExportButton data={pngData} />
            {!isMixedTournament ? <Link href={`/convocatorias/${callup.id}${showComparison ? "" : "?compare=1"}`} className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-portoBlue">{showComparison ? "Cerrar comparacion" : "Comparar plantel actual"}</Link> : null}
            {callup.canManageExceptions ? (
              <Link
                href={`/convocatorias/${callup.id}${showExceptions ? "" : "?exceptions=1"}`}
                className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900"
              >
                {showExceptions ? "Cerrar excepciones" : "Agregar excepcion"}
              </Link>
            ) : null}
            {callup.canDeleteCallup ? (
              <form action={deleteWeeklyCallupAction}>
                <input type="hidden" name="callupId" value={callup.id} />
                <WeeklyCallupDeleteButton />
              </form>
            ) : null}
          </div>
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

        {showComparison && !isMixedTournament && callup.rosterComparison ? (
          <section className="space-y-4 rounded-lg border border-blue-200 bg-blue-50/40 p-4">
            <div>
              <h2 className="text-lg font-semibold text-portoBlue">Comparacion con pagos actuales</h2>
              <p className="text-sm text-slate-600">
                Esta consulta no cambia pagos ni la convocatoria. Revisa las diferencias antes de actualizar el plantel guardado.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-4">
              <div className="rounded-md border border-slate-200 bg-white p-3"><p className="text-xs uppercase text-slate-500">Pagados actuales</p><p className="text-xl font-semibold">{callup.rosterComparison.currentPaidCount}</p></div>
              <div className="rounded-md border border-emerald-200 bg-white p-3"><p className="text-xs uppercase text-slate-500">Nuevos</p><p className="text-xl font-semibold text-emerald-700">{callup.rosterComparison.added.length}</p></div>
              <div className="rounded-md border border-rose-200 bg-white p-3"><p className="text-xs uppercase text-slate-500">Ya no pagados</p><p className="text-xl font-semibold text-rose-700">{callup.rosterComparison.removed.length}</p></div>
              <div className="rounded-md border border-amber-200 bg-white p-3"><p className="text-xs uppercase text-slate-500">Cambiaron de grupo</p><p className="text-xl font-semibold text-amber-700">{callup.rosterComparison.moved.length}</p></div>
            </div>
            {comparisonChangeTotal === 0 ? (
              <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">El plantel congelado coincide con los pagos actuales.</p>
            ) : (
              <div className="grid gap-3 lg:grid-cols-3">
                <div className="rounded-md border border-emerald-200 bg-white p-3">
                  <h3 className="font-semibold text-emerald-800">Agregar</h3>
                  <ul className="mt-2 space-y-1 text-sm">{callup.rosterComparison.added.map((player) => <li key={player.enrollmentId}>{player.playerName} <span className="text-slate-500">({player.categoryLabel})</span></li>)}</ul>
                  {callup.rosterComparison.added.length === 0 ? <p className="mt-2 text-sm text-slate-500">Ninguno.</p> : null}
                </div>
                <div className="rounded-md border border-rose-200 bg-white p-3">
                  <h3 className="font-semibold text-rose-800">Retirar del plantel pagado</h3>
                  <ul className="mt-2 space-y-1 text-sm">{callup.rosterComparison.removed.map((player) => <li key={player.enrollmentId}>{player.playerName} <span className="text-slate-500">({player.categoryLabel})</span></li>)}</ul>
                  {callup.rosterComparison.removed.length === 0 ? <p className="mt-2 text-sm text-slate-500">Ninguno.</p> : null}
                </div>
                <div className="rounded-md border border-amber-200 bg-white p-3">
                  <h3 className="font-semibold text-amber-800">Mover de categoria</h3>
                  <ul className="mt-2 space-y-1 text-sm">{callup.rosterComparison.moved.map((move) => <li key={move.enrollmentId}>{move.playerName}: <span className="text-slate-500">{move.previousCategoryLabel} a {move.categoryLabel}</span></li>)}</ul>
                  {callup.rosterComparison.moved.length === 0 ? <p className="mt-2 text-sm text-slate-500">Ninguno.</p> : null}
                </div>
              </div>
            )}
            {comparisonChangeTotal > 0 ? (
              <form action={refreshWeeklyCallupRosterAction} className="space-y-3 rounded-md border border-amber-300 bg-amber-50 p-3">
                <input type="hidden" name="callupId" value={callup.id} />
                <p className="text-sm text-amber-950">
                  La actualizacion conserva partidos, descansos, orden, exclusiones existentes y excepciones manuales. Solo sincroniza el plantel pagado.
                </p>
                <label className="flex items-start gap-2 text-sm font-medium text-amber-950">
                  <input required type="checkbox" name="confirmRefresh" value="yes" className="mt-1 h-4 w-4" />
                  Revise los jugadores que se agregaran, retiraran o moveran.
                </label>
                <WeeklyCallupSubmitButton label="Actualizar plantel congelado" pendingLabel="Actualizando plantel..." />
              </form>
            ) : null}
          </section>
        ) : null}
        {showComparison && !isMixedTournament && !callup.rosterComparison ? (
          <p className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            No se pudo consultar el plantel pagado actual. El plantel congelado no fue modificado.
          </p>
        ) : null}

        {showExceptions && callup.canManageExceptions ? (
          <section className="space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-4">
            <div>
              <h2 className="text-lg font-semibold text-amber-950">Excepcion sin pago</h2>
              <p className="text-sm text-amber-900">Solo directores. Incluye al jugador en esta convocatoria sin crear pagos, cargos ni inscripciones de torneo.</p>
            </div>
            {callup.manualCandidates.length > 0 ? (
              <form action={addWeeklyCallupManualExceptionAction} className="grid gap-3 lg:grid-cols-[1fr_1fr_auto] lg:items-end">
                <input type="hidden" name="callupId" value={callup.id} />
                <label className="space-y-1 text-sm font-medium"><span>Jugador activo</span><select required name="enrollmentId" defaultValue="" className="min-h-10 w-full rounded-md border border-amber-300 bg-white px-3"><option value="" disabled>Selecciona jugador</option>{callup.manualCandidates.map((player) => <option key={player.enrollmentId} value={player.enrollmentId}>{player.playerName} | Cat. {player.birthYear ?? "-"} | {player.trainingGroupName}</option>)}</select></label>
                <label className="space-y-1 text-sm font-medium"><span>Motivo obligatorio</span><input required minLength={5} maxLength={500} name="reason" placeholder="Ej. Autorizado por direccion para esta jornada" className="min-h-10 w-full rounded-md border border-amber-300 bg-white px-3" /></label>
                <WeeklyCallupSubmitButton label="Agregar excepcion" pendingLabel="Agregando..." />
              </form>
            ) : (
              <p className="rounded-md border border-amber-200 bg-white px-3 py-2 text-sm text-slate-600">No hay jugadores activos disponibles para agregar como excepcion.</p>
            )}
          </section>
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
                    <p className="text-sm font-medium text-slate-700">{category.tournamentName}</p>
                    <p className="text-sm text-slate-600">Coach: {category.coachNames}</p>
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
                            <div className="mb-2 flex items-center justify-between gap-2">
                              <p className="text-xs font-semibold uppercase text-slate-500">Partido {gameIndex + 1}</p>
                              <div className="flex items-center gap-1">
                                <form action={moveWeeklyCallupGameAction}>
                                  <input type="hidden" name="callupId" value={callup.id} />
                                  <input type="hidden" name="categoryId" value={category.id} />
                                  <input type="hidden" name="gameId" value={game.id} />
                                  <input type="hidden" name="direction" value="up" />
                                  <button disabled={gameIndex === 0} title="Subir partido" className="min-h-8 rounded-md border border-slate-300 px-2 text-xs font-semibold disabled:opacity-30">Subir</button>
                                </form>
                                <form action={moveWeeklyCallupGameAction}>
                                  <input type="hidden" name="callupId" value={callup.id} />
                                  <input type="hidden" name="categoryId" value={category.id} />
                                  <input type="hidden" name="gameId" value={game.id} />
                                  <input type="hidden" name="direction" value="down" />
                                  <button disabled={gameIndex === category.games.length - 1} title="Bajar partido" className="min-h-8 rounded-md border border-slate-300 px-2 text-xs font-semibold disabled:opacity-30">Bajar</button>
                                </form>
                              </div>
                            </div>
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
                              <p className="text-xs text-slate-500">
                                Cat. {player.birthYear ?? "-"}
                                {player.eligibilitySource === "bundle" ? " | Combo" : ""}
                                {player.eligibilitySource === "manual_unpaid" ? " | Excepcion sin pago" : ""}
                              </p>
                              {player.eligibilitySource === "manual_unpaid" && player.manualReason ? (
                                <p className="mt-1 text-xs text-amber-800">Motivo: {player.manualReason}</p>
                              ) : null}
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
