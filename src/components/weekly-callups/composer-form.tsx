"use client";

import { useActionState, useMemo, useRef, useState } from "react";
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

type ComposerRow = {
  tournamentId: string;
  matchDate: string;
  arrivalTime: string;
  venue: string;
  opponent: string;
  isRest: boolean;
};

type ClientError = NonNullable<WeeklyCallupComposerState>;

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

function validateComposer(weekStart: string, rows: Record<string, ComposerRow>): ClientError | null {
  if (!isMonday(weekStart)) {
    return { ok: false, message: "Selecciona el lunes que inicia la semana de la convocatoria." };
  }

  const rowErrors: Record<string, string> = {};
  let selectedCount = 0;
  for (const [groupId, row] of Object.entries(rows)) {
    const hasAnyGameValue = Boolean(row.matchDate || row.arrivalTime || row.venue.trim() || row.opponent.trim());
    if (!row.tournamentId && (row.isRest || hasAnyGameValue)) {
      rowErrors[groupId] = "Selecciona un torneo para este grupo o limpia los datos capturados.";
      continue;
    }
    if (!row.tournamentId) continue;
    selectedCount += 1;
    if (row.isRest) continue;

    const missing = [
      !row.matchDate ? "fecha" : "",
      !row.arrivalTime ? "hora de cita" : "",
      !row.venue.trim() ? "sede" : "",
      !row.opponent.trim() ? "rival" : "",
    ].filter(Boolean);
    if (missing.length > 0) {
      rowErrors[groupId] = `Completa: ${missing.join(", ")}.`;
      continue;
    }
    if (!dateWithinWeek(row.matchDate, weekStart)) {
      rowErrors[groupId] = "La fecha del partido debe estar entre el lunes y domingo de la semana elegida.";
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
}: {
  campusId: string;
  program: "selectivo" | "futbol_para_todos";
  currentWeekStart: string;
  groups: ComposerGroup[];
  tournaments: ComposerTournament[];
}) {
  const initialRows = useMemo(
    () => Object.fromEntries(groups.map((group) => [group.id, {
      tournamentId: "",
      matchDate: "",
      arrivalTime: "",
      venue: "",
      opponent: "",
      isRest: false,
    }])),
    [groups],
  );
  const [weekStart, setWeekStart] = useState(currentWeekStart);
  const [rows, setRows] = useState<Record<string, ComposerRow>>(initialRows);
  const [clientError, setClientError] = useState<ClientError | null>(null);
  const [serverState, formAction, isPending] = useActionState(createWeeklyCallupComposerAction, null);
  const alertRef = useRef<HTMLDivElement>(null);
  const error = clientError ?? serverState;

  function updateRow(groupId: string, patch: Partial<ComposerRow>) {
    setRows((current) => ({ ...current, [groupId]: { ...current[groupId], ...patch } }));
    setClientError(null);
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
              setWeekStart(event.target.value);
              setClientError(null);
            }}
            required
            className="min-h-10 rounded-md border border-slate-300 bg-white px-3 dark:border-slate-600 dark:bg-slate-950"
          />
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
            {groups.map((group) => {
              const row = rows[group.id];
              const rowError = error?.rowErrors?.[group.id];
              return (
                <tr key={group.id} className={`align-top ${rowError ? "bg-rose-50" : "odd:bg-white even:bg-slate-50/70"}`}>
                  <td className="px-3 py-2">
                    <input type="hidden" name="groupId" value={group.id} />
                    <strong className="block text-portoBlue">{group.name}</strong>
                    <span className="text-xs text-slate-500">Cat. {group.categoryLabel}</span>
                    {rowError ? <p className="mt-2 max-w-52 text-xs font-semibold text-rose-700">{rowError}</p> : null}
                  </td>
                  <td className="px-3 py-2">{group.primaryCoachName}</td>
                  <td className="px-3 py-2">
                    <select
                      name={`tournamentId:${group.id}`}
                      value={row.tournamentId}
                      onChange={(event) => updateRow(group.id, { tournamentId: event.target.value })}
                      aria-invalid={Boolean(rowError)}
                      className="min-h-9 w-56 rounded border border-slate-300 bg-white px-2"
                    >
                      <option value="">Omitir grupo</option>
                      {tournaments.map((tournament) => <option key={tournament.id} value={tournament.id}>{tournament.name}</option>)}
                    </select>
                  </td>
                  <td className="px-3 py-2"><input type="date" name={`matchDate:${group.id}`} value={row.matchDate} onChange={(event) => updateRow(group.id, { matchDate: event.target.value })} disabled={row.isRest} className="min-h-9 w-36 rounded border border-slate-300 px-2 disabled:bg-slate-100" /></td>
                  <td className="px-3 py-2"><input type="time" name={`arrivalTime:${group.id}`} value={row.arrivalTime} onChange={(event) => updateRow(group.id, { arrivalTime: event.target.value })} disabled={row.isRest} className="min-h-9 w-28 rounded border border-slate-300 px-2 disabled:bg-slate-100" /></td>
                  <td className="px-3 py-2"><input name={`venue:${group.id}`} value={row.venue} onChange={(event) => updateRow(group.id, { venue: event.target.value })} disabled={row.isRest} placeholder="Sede" className="min-h-9 w-36 rounded border border-slate-300 px-2 disabled:bg-slate-100" /></td>
                  <td className="px-3 py-2"><input name={`opponent:${group.id}`} value={row.opponent} onChange={(event) => updateRow(group.id, { opponent: event.target.value })} disabled={row.isRest} placeholder="Rival" className="min-h-9 w-36 rounded border border-slate-300 px-2 disabled:bg-slate-100" /></td>
                  <td className="px-3 py-3 text-center"><input type="checkbox" name={`isRest:${group.id}`} checked={row.isRest} onChange={(event) => updateRow(group.id, { isRest: event.target.checked })} value="yes" className="h-4 w-4" /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
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
