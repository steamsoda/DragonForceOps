"use client";

import { useFormStatus } from "react-dom";
import {
  captureCompetitionRosterSnapshotAction,
  createWeeklyCallupFromCompetitionSnapshotAction,
} from "@/server/actions/competition-rosters";

type Props = {
  tournamentId: string;
  campusId: string;
  program: string;
  tournamentName: string;
  programLabel: string;
  defaultWeekStart: string;
  totalPending: number;
  squadCount: number;
  latestSnapshot: { id: string; label: string; capturedAt: string } | null;
};

function SubmitButton({ idle, pending, tone = "primary" }: { idle: string; pending: string; tone?: "primary" | "secondary" }) {
  const status = useFormStatus();
  return (
    <button
      type="submit"
      disabled={status.pending}
      className={tone === "primary"
        ? "min-h-10 rounded-md bg-portoBlue px-4 py-2 text-sm font-semibold text-white disabled:cursor-wait disabled:opacity-60"
        : "min-h-10 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 disabled:cursor-wait disabled:opacity-60 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-200"}
    >
      {status.pending ? pending : idle}
    </button>
  );
}

function formatCapturedAt(value: string) {
  return new Intl.DateTimeFormat("es-MX", {
    timeZone: "America/Monterrey",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function CompetitionRosterSnapshotPanel(props: Props) {
  const canCapture = props.totalPending === 0 && props.squadCount > 0;
  const defaultLabel = `${props.tournamentName} - ${props.programLabel}`;

  return (
    <section className="rounded-md border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="font-semibold text-slate-950 dark:text-slate-50">Aprobar plantel</h2>
          <p className="mt-1 max-w-3xl text-sm text-slate-600 dark:text-slate-300">
            Guarda una copia historica de los equipos actuales. Despues puedes exportarla o usarla como base de una convocatoria semanal.
          </p>
        </div>
        {props.latestSnapshot ? (
          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
            Ultima: {formatCapturedAt(props.latestSnapshot.capturedAt)}
          </span>
        ) : null}
      </div>

      {!canCapture ? (
        <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          {props.squadCount === 0
            ? "Crea por lo menos un equipo con jugadores antes de aprobar el plantel."
            : `Todavia hay ${props.totalPending} jugadores confirmados sin equipo. Asignalos o registra su exclusion antes de aprobar.`}
        </div>
      ) : (
        <form
          action={captureCompetitionRosterSnapshotAction}
          className="mt-4 grid gap-3 lg:grid-cols-[minmax(240px,1fr)_minmax(280px,2fr)_auto] lg:items-end"
          onSubmit={(event) => {
            if (!window.confirm("Se guardara una copia historica del plantel actual. Los cambios posteriores no modificaran esta copia. ¿Continuar?")) {
              event.preventDefault();
            }
          }}
        >
          <input type="hidden" name="tournamentId" value={props.tournamentId} />
          <input type="hidden" name="campusId" value={props.campusId} />
          <input type="hidden" name="program" value={props.program} />
          <label className="text-sm font-medium text-slate-700 dark:text-slate-200">
            Nombre de la copia
            <input name="label" defaultValue={defaultLabel} minLength={3} maxLength={100} required className="mt-1 min-h-10 w-full rounded-md border border-slate-300 px-3 dark:border-slate-600 dark:bg-slate-950" />
          </label>
          <label className="text-sm font-medium text-slate-700 dark:text-slate-200">
            Nota opcional
            <input name="notes" maxLength={500} placeholder="Ej. Plantel aprobado para jornada 1" className="mt-1 min-h-10 w-full rounded-md border border-slate-300 px-3 dark:border-slate-600 dark:bg-slate-950" />
          </label>
          <SubmitButton idle="Aprobar y guardar copia" pending="Guardando copia..." />
        </form>
      )}

      {props.latestSnapshot ? (
        <div className="mt-5 border-t border-slate-200 pt-4 dark:border-slate-700">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-950 dark:text-slate-50">{props.latestSnapshot.label}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Esta copia no cambia aunque despues muevas jugadores o ajustes los equipos.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <a
                href={`/api/exports/competition-roster-snapshot?snapshot=${encodeURIComponent(props.latestSnapshot.id)}`}
                className="min-h-10 rounded-md border border-slate-300 bg-white px-4 py-2 text-center text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-200"
              >
                Exportar Excel
              </a>
              {props.program !== "little_dragons" ? (
                <form action={createWeeklyCallupFromCompetitionSnapshotAction} className="flex flex-col gap-2 sm:flex-row sm:items-end">
                  <input type="hidden" name="tournamentId" value={props.tournamentId} />
                  <input type="hidden" name="campusId" value={props.campusId} />
                  <input type="hidden" name="program" value={props.program} />
                  <input type="hidden" name="snapshotId" value={props.latestSnapshot.id} />
                  <label className="text-xs font-semibold uppercase text-slate-500">
                    Lunes de la semana
                    <input name="weekStart" type="date" defaultValue={props.defaultWeekStart} required className="mt-1 block min-h-10 rounded-md border border-slate-300 px-3 text-sm normal-case dark:border-slate-600 dark:bg-slate-950" />
                  </label>
                  <SubmitButton idle="Preparar convocatoria" pending="Preparando..." tone="secondary" />
                </form>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
