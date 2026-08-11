"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  createWeeklyCallupComposerAction,
  type WeeklyCallupComposerState,
} from "@/server/actions/weekly-callups";

type ComposerGroup = {
  id: string;
  name: string;
  categoryLabel: string;
  primaryCoachName: string;
};

type ComposerTournament = {
  id: string;
  name: string;
};

type ComposerGame = {
  sourceCoachGameId: string | null;
  matchDate: string;
  arrivalTime: string;
  venue: string;
  opponent: string;
};

type ComposerRow = {
  tournamentId: string;
  games: ComposerGame[];
  isRest: boolean;
};

type CoachScheduleDefault = {
  tournamentId: string;
  isRest: boolean;
  notes: string;
  coachName: string;
  games: Array<{ id: string; matchDate: string; arrivalTime: string; venue: string; opponent: string }>;
};

type ClientError = NonNullable<WeeklyCallupComposerState>;

const EMPTY_GAME: ComposerGame = { sourceCoachGameId: null, matchDate: "", arrivalTime: "", venue: "", opponent: "" };

function isMonday(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.getUTCDay() === 1;
}

function dateWithinWeek(value: string, weekStart: string) {
  const date = new Date(`${value}T12:00:00Z`);
  const start = new Date(`${weekStart}T12:00:00Z`);
  if (Number.isNaN(date.getTime()) || Number.isNaN(start.getTime())) return false;
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  return date >= start && date <= end;
}

function rowSummary(row: ComposerRow, tournaments: ComposerTournament[]) {
  if (!row.tournamentId) return "Grupo omitido";
  const tournament = tournaments.find((option) => option.id === row.tournamentId)?.name ?? "Torneo seleccionado";
  if (row.isRest) return `${tournament} | Descanso`;
  const completedGames = row.games.filter((game) => game.matchDate && game.arrivalTime && game.venue.trim() && game.opponent.trim());
  if (completedGames.length === 0) return `${tournament} | Partido pendiente`;
  return `${tournament} | ${completedGames.length} ${completedGames.length === 1 ? "partido" : "partidos"}`;
}

function validateComposer(weekStart: string, rows: Record<string, ComposerRow>): ClientError | null {
  if (!isMonday(weekStart)) {
    return { ok: false, message: "Selecciona el lunes que inicia la semana de la convocatoria." };
  }

  const rowErrors: Record<string, string> = {};
  let selectedCount = 0;
  for (const [groupId, row] of Object.entries(rows)) {
    const hasAnyGameValue = row.games.some((game) =>
      Boolean(game.matchDate || game.arrivalTime || game.venue.trim() || game.opponent.trim()),
    );
    if (!row.tournamentId && (row.isRest || hasAnyGameValue)) {
      rowErrors[groupId] = "Selecciona un torneo para este grupo o limpia los datos capturados.";
      continue;
    }
    if (!row.tournamentId) continue;
    selectedCount += 1;
    if (row.isRest) continue;

    for (const [gameIndex, game] of row.games.entries()) {
      const missing = [
        !game.matchDate ? "fecha" : "",
        !game.arrivalTime ? "hora de cita" : "",
        !game.venue.trim() ? "sede" : "",
        !game.opponent.trim() ? "rival" : "",
      ].filter(Boolean);
      if (missing.length > 0) {
        rowErrors[groupId] = `Partido ${gameIndex + 1}: completa ${missing.join(", ")}.`;
        break;
      }
      if (!dateWithinWeek(game.matchDate, weekStart)) {
        rowErrors[groupId] = `Partido ${gameIndex + 1}: la fecha debe estar entre el lunes y domingo de la semana elegida.`;
        break;
      }
    }
  }

  if (Object.keys(rowErrors).length > 0) {
    return { ok: false, message: "Revisa los grupos marcados antes de preparar la convocatoria.", rowErrors };
  }
  if (selectedCount === 0) {
    return { ok: false, message: "Selecciona al menos un torneo. Los grupos con 'Omitir grupo' no se incluyen." };
  }
  return null;
}

export function WeeklyCallupComposerForm({
  campusId,
  program,
  currentWeekStart,
  groups,
  tournaments,
  coachScheduleDefaults = {},
}: {
  campusId: string;
  program: "selectivo" | "futbol_para_todos";
  currentWeekStart: string;
  groups: ComposerGroup[];
  tournaments: ComposerTournament[];
  coachScheduleDefaults?: Record<string, CoachScheduleDefault>;
}) {
  const router = useRouter();
  const initialRows = useMemo(
    () => Object.fromEntries(groups.map((group) => {
      const reported = coachScheduleDefaults[group.id];
      return [group.id, {
        tournamentId: reported?.tournamentId ?? "",
        games: reported?.games.length ? reported.games.map((game) => ({ sourceCoachGameId: game.id, matchDate: game.matchDate, arrivalTime: game.arrivalTime, venue: game.venue, opponent: game.opponent })) : [{ ...EMPTY_GAME }],
        isRest: reported?.isRest ?? false,
      }];
    })),
    [coachScheduleDefaults, groups],
  );
  const [weekStart, setWeekStart] = useState(currentWeekStart);
  const [rows, setRows] = useState<Record<string, ComposerRow>>(initialRows);
  const [dirtyGroupIds, setDirtyGroupIds] = useState<Set<string>>(() => new Set());
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null);
  const [clientError, setClientError] = useState<ClientError | null>(null);
  const [serverState, formAction, isPending] = useActionState(createWeeklyCallupComposerAction, null);
  const alertRef = useRef<HTMLDivElement>(null);
  const error = clientError ?? serverState;

  useEffect(() => {
    setRows((current) => Object.fromEntries(groups.map((group) => [
      group.id,
      dirtyGroupIds.has(group.id) ? current[group.id] ?? initialRows[group.id] : initialRows[group.id],
    ])));
  }, [dirtyGroupIds, groups, initialRows]);

  useEffect(() => {
    const firstErrorGroupId = Object.keys(error?.rowErrors ?? {})[0];
    if (firstErrorGroupId) setExpandedGroupId(firstErrorGroupId);
  }, [error]);

  function markDirty(groupId: string) {
    setDirtyGroupIds((current) => new Set(current).add(groupId));
  }

  function updateRow(groupId: string, patch: Partial<ComposerRow>) {
    setRows((current) => ({ ...current, [groupId]: { ...current[groupId], ...patch } }));
    markDirty(groupId);
    setClientError(null);
  }

  function updateGame(groupId: string, gameIndex: number, patch: Partial<ComposerGame>) {
    const row = rows[groupId];
    updateRow(groupId, {
      games: row.games.map((game, index) => index === gameIndex ? { ...game, ...patch } : game),
    });
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    const validation = validateComposer(weekStart, rows);
    if (!validation) {
      setClientError(null);
      return;
    }
    event.preventDefault();
    setClientError(validation);
    window.requestAnimationFrame(() => alertRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }));
  }

  return (
    <form action={formAction} onSubmit={handleSubmit} className="space-y-4">
      <input type="hidden" name="campusId" value={campusId} />
      <input type="hidden" name="program" value={program} />
      {error ? (
        <div ref={alertRef} role="alert" aria-live="polite" className="rounded-md border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          <p className="font-semibold">No se pudo preparar la convocatoria.</p>
          <p className="mt-1">{error.message}</p>
          <p className="mt-1 text-xs">Tus datos siguen guardados en esta pantalla.</p>
        </div>
      ) : null}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <label className="space-y-1 text-sm font-medium">
          <span>Lunes de la semana</span>
          <input
            name="weekStart"
            type="date"
            value={weekStart}
            onChange={(event) => {
              const nextWeek = event.target.value;
              setWeekStart(nextWeek);
              setClientError(null);
              if (isMonday(nextWeek)) {
                router.replace(`/convocatorias?campus=${encodeURIComponent(campusId)}&program=${encodeURIComponent(program)}&week=${encodeURIComponent(nextWeek)}`);
              }
            }}
            required
            className="min-h-10 rounded-md border border-slate-300 bg-white px-3 dark:border-slate-600 dark:bg-slate-950"
          />
        </label>
        <p className="text-xs text-slate-500">Deja Torneo vacio para omitir un grupo esta semana.</p>
      </div>
      <div className="divide-y divide-slate-200 overflow-hidden rounded-md border border-slate-200">
        {groups.map((group) => {
          const row = rows[group.id];
          const rowError = error?.rowErrors?.[group.id];
          const reported = coachScheduleDefaults[group.id];
          const expanded = expandedGroupId === group.id;
          return (
            <div key={group.id} className={rowError ? "bg-rose-50" : expanded ? "bg-blue-50/40" : "bg-white"}>
              <input type="hidden" name="groupId" value={group.id} />
              <input type="hidden" name={`games:${group.id}`} value={JSON.stringify(row.isRest ? [] : row.games)} />
              {!expanded ? <input type="hidden" name={`tournamentId:${group.id}`} value={row.tournamentId} /> : null}
              {!expanded && row.isRest ? <input type="hidden" name={`isRest:${group.id}`} value="yes" /> : null}

              <div className="grid min-h-16 items-center gap-2 px-3 py-2 sm:grid-cols-[minmax(180px,1.1fr)_minmax(160px,0.9fr)_minmax(220px,1.4fr)_auto]">
                <div>
                  <strong className="text-portoBlue">{group.name}</strong>
                  <span className="ml-2 text-xs text-slate-500">Cat. {group.categoryLabel}</span>
                </div>
                <div className="text-sm">
                  <span className="font-medium">{group.primaryCoachName}</span>
                  {reported ? <span className="block text-xs font-semibold text-emerald-700">Reportado por {reported.coachName}</span> : <span className="block text-xs text-slate-500">Sin reporte del coach</span>}
                </div>
                <div>
                  <p className={`text-sm font-medium ${row.tournamentId ? "text-slate-800" : "text-slate-500"}`}>{rowSummary(row, tournaments)}</p>
                  {reported?.notes ? <p className="truncate text-xs text-slate-500" title={reported.notes}>{reported.notes}</p> : null}
                  {rowError ? <p className="mt-1 text-xs font-semibold text-rose-700">{rowError}</p> : null}
                </div>
                <button
                  type="button"
                  onClick={() => setExpandedGroupId(expanded ? null : group.id)}
                  aria-expanded={expanded}
                  className="min-h-9 rounded-md border border-portoBlue px-3 py-2 text-sm font-semibold text-portoBlue"
                >
                  {expanded ? "Cerrar" : "Editar"}
                </button>
              </div>

              {expanded ? (
                <div className="space-y-3 border-t border-blue-100 px-3 py-3">
                  <div className="grid gap-3 md:grid-cols-[minmax(240px,1fr)_auto] md:items-end">
                    <label className="text-sm font-medium">
                      Torneo
                      <select
                        name={`tournamentId:${group.id}`}
                        value={row.tournamentId}
                        onChange={(event) => updateRow(group.id, { tournamentId: event.target.value })}
                        aria-invalid={Boolean(rowError)}
                        className="mt-1 min-h-10 w-full rounded-md border border-slate-300 bg-white px-3"
                      >
                        <option value="">Omitir grupo</option>
                        {tournaments.map((tournament) => <option key={tournament.id} value={tournament.id}>{tournament.name}</option>)}
                      </select>
                    </label>
                    <label className="flex min-h-10 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium">
                      <input type="checkbox" name={`isRest:${group.id}`} checked={row.isRest} onChange={(event) => updateRow(group.id, { isRest: event.target.checked })} value="yes" className="h-4 w-4" />
                      Descansa esta semana
                    </label>
                  </div>

                  {!row.isRest ? row.games.map((game, index) => (
                    <div key={index} className="grid gap-2 rounded-md border border-slate-200 bg-white p-3 md:grid-cols-[auto_150px_120px_1fr_1fr_auto] md:items-end">
                      <span className="pb-2 text-xs font-semibold uppercase text-slate-500">Partido {index + 1}</span>
                      <label className="text-xs font-medium text-slate-600">Fecha<input type="date" value={game.matchDate} onChange={(event) => updateGame(group.id, index, { matchDate: event.target.value })} className="mt-1 block min-h-9 w-full rounded border border-slate-300 px-2" /></label>
                      <label className="text-xs font-medium text-slate-600">Hora cita<input type="time" value={game.arrivalTime} onChange={(event) => updateGame(group.id, index, { arrivalTime: event.target.value })} className="mt-1 block min-h-9 w-full rounded border border-slate-300 px-2" /></label>
                      <label className="text-xs font-medium text-slate-600">Sede<input value={game.venue} onChange={(event) => updateGame(group.id, index, { venue: event.target.value })} placeholder="Sede" className="mt-1 block min-h-9 w-full rounded border border-slate-300 px-2" /></label>
                      <label className="text-xs font-medium text-slate-600">Rival<input value={game.opponent} onChange={(event) => updateGame(group.id, index, { opponent: event.target.value })} placeholder="Rival" className="mt-1 block min-h-9 w-full rounded border border-slate-300 px-2" /></label>
                      {row.games.length > 1 ? <button type="button" title="Quitar partido" onClick={() => updateRow(group.id, { games: row.games.filter((_, gameIndex) => gameIndex !== index) })} className="min-h-9 rounded border border-slate-300 px-3 text-xs">Quitar</button> : <span />}
                    </div>
                  )) : <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">Este grupo queda marcado como descanso; no se guardaran partidos.</p>}

                  {!row.isRest && row.games.length < 3 ? <button type="button" onClick={() => updateRow(group.id, { games: [...row.games, { ...EMPTY_GAME }] })} className="rounded-md border border-portoBlue px-3 py-2 text-sm font-medium text-portoBlue">+ Agregar partido</button> : null}
                </div>
              ) : null}
            </div>
          );
        })}
        {groups.length === 0 ? <p className="p-6 text-center text-sm text-slate-500">No hay grupos activos para esta seleccion.</p> : null}
      </div>
      <div className="flex justify-end">
        <button disabled={groups.length === 0 || isPending} className="min-h-11 rounded-md bg-portoBlue px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">
          {isPending ? "Validando convocatoria..." : "Preparar convocatoria"}
        </button>
      </div>
    </form>
  );
}
