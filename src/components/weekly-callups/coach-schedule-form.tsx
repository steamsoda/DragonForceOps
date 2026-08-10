"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { CoachScheduleGroup } from "@/lib/queries/coach-schedules";
import { saveCoachScheduleAction } from "@/server/actions/coach-schedules";

type GameDraft = { matchDate: string; arrivalTime: string; venue: string; opponent: string };

const EMPTY_GAME: GameDraft = { matchDate: "", arrivalTime: "", venue: "", opponent: "" };

function formatSavedAt(value: string) {
  return new Intl.DateTimeFormat("es-MX", {
    timeZone: "America/Monterrey",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatMatchDate(value: string) {
  return new Intl.DateTimeFormat("es-MX", {
    timeZone: "UTC",
    weekday: "short",
    day: "2-digit",
    month: "short",
  }).format(new Date(`${value}T12:00:00Z`));
}

export function CoachScheduleForm({
  group,
  weekStart,
  tournaments,
}: {
  group: CoachScheduleGroup;
  weekStart: string;
  tournaments: Array<{ id: string; campusId: string; name: string }>;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(saveCoachScheduleAction, null);
  const [tournamentId, setTournamentId] = useState(group.report?.tournamentId ?? "");
  const [isRest, setIsRest] = useState(group.report?.isRest ?? false);
  const [notes, setNotes] = useState(group.report?.notes ?? "");
  const [games, setGames] = useState<GameDraft[]>(group.report?.games.length ? group.report.games : [{ ...EMPTY_GAME }]);
  const options = tournaments.filter((tournament) => tournament.campusId === group.campusId);
  const savedReport = state?.ok ? state.report : group.report;
  const savedAt = state?.ok ? state.savedAt : group.report?.updatedAt;
  const savedTournament = options.find((tournament) => tournament.id === savedReport?.tournamentId);

  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [router, state]);

  function updateGame(index: number, patch: Partial<GameDraft>) {
    setGames((current) => current.map((game, gameIndex) => gameIndex === index ? { ...game, ...patch } : game));
  }

  return (
    <form action={action} className="space-y-3 rounded-md border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <input type="hidden" name="trainingGroupId" value={group.id} />
      <input type="hidden" name="weekStart" value={weekStart} />
      <input type="hidden" name="games" value={JSON.stringify(isRest ? [] : games)} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-portoBlue">{group.name}</h2>
          <p className="text-xs text-slate-500">{group.campusName} | Cat. {group.categoryLabel} | {group.program === "selectivo" ? "Selectivo" : "Futbol Para Todos"}</p>
        </div>
        {savedReport ? <span className="rounded-full border border-emerald-300 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">Horario reportado</span> : <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700">Pendiente</span>}
      </div>
      {savedReport ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-950">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="font-semibold">Reporte enviado a administracion</p>
              <p className="text-xs text-emerald-800">
                {savedTournament?.name ?? "Torneo reportado"}
                {savedAt ? ` | Actualizado ${formatSavedAt(savedAt)}` : ""}
              </p>
            </div>
            <span className="text-xs font-medium text-emerald-800">Puedes corregirlo y volver a guardar.</span>
          </div>
          {savedReport.isRest ? (
            <p className="mt-2 font-medium">Descansa esta semana.</p>
          ) : (
            <ul className="mt-2 grid gap-1 sm:grid-cols-2 xl:grid-cols-3">
              {savedReport.games.map((game, index) => (
                <li key={`${game.matchDate}:${game.arrivalTime}:${index}`} className="rounded border border-emerald-200 bg-white/70 px-2 py-1.5">
                  <span className="font-medium">{formatMatchDate(game.matchDate)} | {game.arrivalTime}</span>
                  <span className="block text-xs">{game.venue} | vs {game.opponent}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-[minmax(14rem,1fr)_auto] sm:items-end">
        <label className="text-sm font-medium">Torneo
          <select name="tournamentId" value={tournamentId} onChange={(event) => setTournamentId(event.target.value)} required className="mt-1 block min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 dark:border-slate-600 dark:bg-slate-950">
            <option value="">Selecciona torneo</option>
            {options.map((tournament) => <option key={tournament.id} value={tournament.id}>{tournament.name}</option>)}
          </select>
        </label>
        <label className="flex min-h-10 items-center gap-2 rounded-md border border-slate-300 px-3 text-sm font-medium">
          <input type="checkbox" name="isRest" value="yes" checked={isRest} onChange={(event) => setIsRest(event.target.checked)} /> Descansa esta semana
        </label>
      </div>
      {!isRest ? (
        <div className="space-y-2">
          {games.map((game, index) => (
            <div key={index} className="grid gap-2 rounded-md bg-slate-50 p-3 sm:grid-cols-[9rem_8rem_1fr_1fr_auto] dark:bg-slate-950">
              <label className="text-xs font-medium">Fecha<input type="date" value={game.matchDate} onChange={(event) => updateGame(index, { matchDate: event.target.value })} className="mt-1 min-h-9 w-full rounded border border-slate-300 px-2" /></label>
              <label className="text-xs font-medium">Hora cita<input type="time" value={game.arrivalTime} onChange={(event) => updateGame(index, { arrivalTime: event.target.value })} className="mt-1 min-h-9 w-full rounded border border-slate-300 px-2" /></label>
              <label className="text-xs font-medium">Sede<input value={game.venue} onChange={(event) => updateGame(index, { venue: event.target.value })} placeholder="Sede" className="mt-1 min-h-9 w-full rounded border border-slate-300 px-2" /></label>
              <label className="text-xs font-medium">Rival<input value={game.opponent} onChange={(event) => updateGame(index, { opponent: event.target.value })} placeholder="Rival" className="mt-1 min-h-9 w-full rounded border border-slate-300 px-2" /></label>
              <button type="button" title="Quitar partido" disabled={games.length === 1} onClick={() => setGames((current) => current.filter((_, gameIndex) => gameIndex !== index))} className="self-end rounded border border-slate-300 px-3 py-2 text-sm disabled:opacity-40">Quitar</button>
            </div>
          ))}
          {games.length < 3 ? <button type="button" onClick={() => setGames((current) => [...current, { ...EMPTY_GAME }])} className="rounded border border-portoBlue px-3 py-2 text-sm font-medium text-portoBlue">Agregar partido</button> : null}
        </div>
      ) : null}
      <label className="block text-sm font-medium">Nota opcional
        <textarea name="notes" value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={500} rows={2} className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2" placeholder="Indicacion breve para administracion" />
      </label>
      {state ? <p className={`rounded-md border px-3 py-2 text-sm ${state.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-800"}`}>{state.message}</p> : null}
      <div className="flex justify-end"><button disabled={pending || !tournamentId} className="min-h-10 rounded-md bg-portoBlue px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{pending ? "Guardando..." : savedReport ? "Actualizar reporte" : "Reportar horario"}</button></div>
    </form>
  );
}
