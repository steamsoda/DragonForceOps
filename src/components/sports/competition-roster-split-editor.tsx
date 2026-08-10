"use client";

import { useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { createOrSyncSplitCompetitionSquadsAction } from "@/server/actions/competition-rosters";

type SplitPlayer = {
  enrollmentId: string;
  playerName: string;
  birthYear: number | null;
  assignedSquads: Array<{ kind: "single" | "azul" | "blanco" | "custom" }>;
};

function SplitSubmitButton({ disabled, exists }: { disabled: boolean; exists: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className="min-h-10 rounded-md bg-portoBlue px-4 py-2 text-sm font-semibold text-white hover:bg-portoDark disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? "Guardando division..." : exists ? "Actualizar Azul y Blanco" : "Crear Azul y Blanco"}
    </button>
  );
}

export function CompetitionRosterSplitEditor({
  tournamentId,
  campusId,
  trainingGroupId,
  program,
  players,
  exists,
}: {
  tournamentId: string;
  campusId: string;
  trainingGroupId: string;
  program: string;
  players: SplitPlayer[];
  exists: boolean;
}) {
  const initialBlanco = useMemo(
    () => players.filter((player) => player.assignedSquads.some((squad) => squad.kind === "blanco")).map((player) => player.enrollmentId),
    [players],
  );
  const [blancoIds, setBlancoIds] = useState<Set<string>>(() => new Set(initialBlanco));
  const blancoCount = blancoIds.size;
  const azulCount = players.length - blancoCount;
  const invalid = blancoCount === 0 || azulCount === 0;

  function togglePlayer(enrollmentId: string) {
    setBlancoIds((current) => {
      const next = new Set(current);
      if (next.has(enrollmentId)) next.delete(enrollmentId);
      else next.add(enrollmentId);
      return next;
    });
  }

  function splitAlternating() {
    setBlancoIds(new Set(players.filter((_, index) => index % 2 === 1).map((player) => player.enrollmentId)));
  }

  return (
    <details className="border-t border-slate-200 bg-slate-50/70 dark:border-slate-700 dark:bg-slate-950/30" open={exists || undefined}>
      <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-portoBlue marker:text-slate-400 dark:text-sky-300">
        {exists ? "Editar division Azul / Blanco" : "Dividir este grupo en Azul / Blanco"}
      </summary>
      <form
        action={createOrSyncSplitCompetitionSquadsAction}
        className="space-y-4 border-t border-slate-200 px-4 py-4 dark:border-slate-700"
        onSubmit={(event) => {
          if (invalid || !window.confirm(`Guardar division: Azul ${azulCount} jugadores y Blanco ${blancoCount} jugadores?`)) {
            event.preventDefault();
          }
        }}
      >
        <input type="hidden" name="tournamentId" value={tournamentId} />
        <input type="hidden" name="campusId" value={campusId} />
        <input type="hidden" name="trainingGroupId" value={trainingGroupId} />
        <input type="hidden" name="program" value={program} />

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-slate-950 dark:text-slate-50">
              Azul: {azulCount} | Blanco: {blancoCount}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Los jugadores sin marcar quedan en Azul. Marca únicamente quienes van a Blanco.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={splitAlternating} className="rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200">
              Repartir alternado
            </button>
            <button type="button" onClick={() => setBlancoIds(new Set())} className="rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200">
              Reiniciar en Azul
            </button>
          </div>
        </div>

        <div className="overflow-hidden rounded-md border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
          {players.map((player) => {
            const isBlanco = blancoIds.has(player.enrollmentId);
            return (
              <label key={player.enrollmentId} className="grid cursor-pointer grid-cols-[1fr_auto] items-center gap-3 border-b border-slate-100 px-3 py-2 last:border-b-0 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/60">
                <span>
                  <span className="block text-sm font-medium text-slate-950 dark:text-slate-50">{player.playerName}</span>
                  <span className="block text-xs text-slate-500">Cat. {player.birthYear ?? "-"}</span>
                </span>
                <span className="flex items-center gap-2 text-sm font-medium">
                  <span className={isBlanco ? "text-slate-400" : "text-blue-700 dark:text-blue-300"}>Azul</span>
                  <input
                    type="checkbox"
                    name="blancoEnrollmentId"
                    value={player.enrollmentId}
                    checked={isBlanco}
                    onChange={() => togglePlayer(player.enrollmentId)}
                    className="h-4 w-4 accent-slate-700"
                  />
                  <span className={isBlanco ? "text-slate-950 dark:text-white" : "text-slate-400"}>Blanco</span>
                </span>
              </label>
            );
          })}
        </div>

        {invalid ? (
          <p className="text-sm font-medium text-amber-700 dark:text-amber-300">
            Azul y Blanco necesitan por lo menos un jugador cada uno.
          </p>
        ) : null}
        <div className="flex justify-end">
          <SplitSubmitButton disabled={invalid} exists={exists} />
        </div>
      </form>
    </details>
  );
}
