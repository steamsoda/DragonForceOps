"use client";

import { useFormStatus } from "react-dom";
import { createWeeklyCallupFromLiveCompetitionRosterAction } from "@/server/actions/competition-rosters";

type Props = {
  tournamentId: string;
  campusId: string;
  program: string;
  defaultWeekStart: string;
  totalPending: number;
  squadCount: number;
  canPrepare: boolean;
};

function SubmitButton({ disabled }: { disabled: boolean }) {
  const status = useFormStatus();
  return (
    <button
      type="submit"
      disabled={disabled || status.pending}
      className="min-h-10 rounded-md bg-portoBlue px-4 py-2 text-sm font-semibold text-white disabled:cursor-wait disabled:opacity-60"
    >
      {status.pending ? "Preparando convocatoria..." : "Preparar convocatoria"}
    </button>
  );
}

export function CompetitionRosterSnapshotPanel(props: Props) {
  const rosterReady = props.totalPending === 0 && props.squadCount > 0;
  const exportHref = `/api/exports/competition-roster-live?tournament=${encodeURIComponent(props.tournamentId)}&campus=${encodeURIComponent(props.campusId)}&program=${encodeURIComponent(props.program)}`;

  return (
    <section className="rounded-md border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="font-semibold text-slate-950 dark:text-slate-50">Plantel actual</h2>
          <p className="mt-1 max-w-3xl text-sm text-slate-600 dark:text-slate-300">
            El Excel usa los equipos actuales. Al preparar una convocatoria, Invicta guarda automaticamente la copia historica utilizada.
          </p>
          {!rosterReady ? (
            <p className="mt-2 text-sm font-medium text-amber-700 dark:text-amber-300">
              {props.squadCount === 0
                ? "Todavia no hay equipos con jugadores."
                : `Hay ${props.totalPending} jugadores confirmados pendientes por asignar.`}
            </p>
          ) : null}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <a
            href={exportHref}
            className="min-h-10 rounded-md border border-slate-300 bg-white px-4 py-2 text-center text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-200"
          >
            Exportar equipos actuales
          </a>
          {props.canPrepare && props.program !== "little_dragons" ? (
            <form
              action={createWeeklyCallupFromLiveCompetitionRosterAction}
              className="flex flex-col gap-2 sm:flex-row sm:items-end"
              onSubmit={(event) => {
                if (!window.confirm("Se preparara la convocatoria con los equipos actuales. ¿Continuar?")) {
                  event.preventDefault();
                }
              }}
            >
              <input type="hidden" name="tournamentId" value={props.tournamentId} />
              <input type="hidden" name="campusId" value={props.campusId} />
              <input type="hidden" name="program" value={props.program} />
              <label className="text-xs font-semibold uppercase text-slate-500">
                Lunes de la semana
                <input
                  name="weekStart"
                  type="date"
                  defaultValue={props.defaultWeekStart}
                  required
                  disabled={!rosterReady}
                  className="mt-1 block min-h-10 rounded-md border border-slate-300 px-3 text-sm normal-case disabled:bg-slate-100 dark:border-slate-600 dark:bg-slate-950"
                />
              </label>
              <SubmitButton disabled={!rosterReady} />
            </form>
          ) : null}
        </div>
      </div>
    </section>
  );
}
