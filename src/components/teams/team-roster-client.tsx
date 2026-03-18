"use client";

import { useState, useTransition } from "react";
import {
  transferPlayerAction,
  addRefuerzoAction,
  clearNewArrivalAction,
  removeRefuerzoAction,
} from "@/server/actions/teams";
import type { RosterPlayer, TeamListItem } from "@/lib/queries/teams";

// ── Types ─────────────────────────────────────────────────────────────────────

type Props = {
  teamId: string;
  roster: RosterPlayer[];
  allTeams: TeamListItem[];
  isDirector: boolean;
};

// ── Main component ────────────────────────────────────────────────────────────

export function TeamRosterClient({ teamId, roster, allTeams, isDirector }: Props) {
  const [players, setPlayers] = useState<RosterPlayer[]>(roster);
  const [transferFor, setTransferFor] = useState<RosterPlayer | null>(null);
  const [refuerzoFor, setRefuerzoFor] = useState<RosterPlayer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Filter teams for transfer (exclude current team)
  const transferTargets = allTeams.filter((t) => t.id !== teamId && t.isActive);
  // Filter teams for refuerzo (exclude teams player is already on)
  const playerTeamIds = new Set([teamId]);
  const refuerzoTargets = allTeams.filter((t) => !playerTeamIds.has(t.id) && t.isActive);

  function handleClearNewArrival(player: RosterPlayer) {
    setError(null);
    startTransition(async () => {
      const result = await clearNewArrivalAction(player.assignmentId, player.playerId, teamId);
      if (!result.ok) { setError("Error al actualizar. Intenta de nuevo."); return; }
      setPlayers((prev) => prev.map((p) => p.assignmentId === player.assignmentId ? { ...p, isNewArrival: false } : p));
    });
  }

  function handleRemoveRefuerzo(player: RosterPlayer) {
    setError(null);
    startTransition(async () => {
      const result = await removeRefuerzoAction(player.assignmentId, player.playerId, teamId);
      if (!result.ok) { setError("Error al remover refuerzo. Intenta de nuevo."); return; }
      setPlayers((prev) => prev.filter((p) => p.assignmentId !== player.assignmentId));
    });
  }

  if (players.length === 0) {
    return <p className="text-sm text-slate-500 dark:text-slate-400 py-2">Sin jugadores asignados a este equipo.</p>;
  }

  return (
    <div className="space-y-3">
      {error && <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

      <div className="overflow-x-auto rounded-md border border-slate-200 dark:border-slate-700">
        <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700 text-sm">
          <thead className="bg-slate-50 dark:bg-slate-800 text-left text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
            <tr>
              <th className="px-3 py-2">Jugador</th>
              <th className="px-3 py-2">Desde</th>
              <th className="px-3 py-2">Días</th>
              <th className="px-3 py-2">Estado</th>
              {isDirector && <th className="px-3 py-2">Acciones</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {players.map((player) => (
              <tr key={player.assignmentId} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                <td className="px-3 py-2">
                  <a href={`/players/${player.playerId}`} className="font-medium text-slate-900 dark:text-slate-100 hover:text-portoBlue hover:underline">
                    {player.playerName}
                  </a>
                  <p className="text-xs text-slate-400">{new Date(player.birthDate).getFullYear()}</p>
                </td>
                <td className="px-3 py-2 text-slate-600 dark:text-slate-400">
                  {new Date(player.startDate).toLocaleDateString("es-MX")}
                </td>
                <td className="px-3 py-2 text-slate-600 dark:text-slate-400">{player.daysOnTeam}</td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-1">
                    {player.isNewArrival && (
                      <span className="rounded-full bg-amber-100 dark:bg-amber-900/40 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300">Nuevo</span>
                    )}
                    {player.role === "refuerzo" && (
                      <span className="rounded-full bg-violet-100 dark:bg-violet-900/40 px-2 py-0.5 text-xs font-medium text-violet-700 dark:text-violet-300">Refuerzo</span>
                    )}
                    {!player.isNewArrival && player.role !== "refuerzo" && (
                      <span className="text-slate-400 text-xs">—</span>
                    )}
                  </div>
                </td>
                {isDirector && (
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1.5">
                      {player.isNewArrival && (
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => handleClearNewArrival(player)}
                          className="rounded border border-amber-300 px-2 py-0.5 text-xs font-medium text-amber-700 hover:bg-amber-50 disabled:opacity-50"
                        >
                          Confirmar
                        </button>
                      )}
                      {player.role !== "refuerzo" && (
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => { setTransferFor(player); setRefuerzoFor(null); }}
                          className="rounded border border-slate-300 dark:border-slate-600 px-2 py-0.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:border-portoBlue hover:text-portoBlue"
                        >
                          Transferir
                        </button>
                      )}
                      {player.role === "refuerzo" && (
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => handleRemoveRefuerzo(player)}
                          className="rounded border border-slate-300 dark:border-slate-600 px-2 py-0.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:border-rose-400 hover:text-rose-600"
                        >
                          Quitar
                        </button>
                      )}
                      {player.role !== "refuerzo" && (
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => { setRefuerzoFor(player); setTransferFor(null); }}
                          className="rounded border border-slate-300 dark:border-slate-600 px-2 py-0.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:border-violet-400 hover:text-violet-600"
                        >
                          + Refuerzo
                        </button>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Transfer form */}
      {transferFor && (
        <form
          action={transferPlayerAction}
          className="rounded-md border border-portoBlue bg-blue-50 dark:bg-blue-950/20 p-4 space-y-3"
        >
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
            Transferir a <span className="text-portoBlue">{transferFor.playerName}</span>
          </p>
          <input type="hidden" name="enrollmentId" value={transferFor.enrollmentId} />
          <input type="hidden" name="playerId" value={transferFor.playerId} />
          <input type="hidden" name="fromTeamId" value={teamId} />
          <label className="block space-y-1 text-sm">
            <span className="font-medium text-slate-700 dark:text-slate-300">Nuevo equipo</span>
            <select name="newTeamId" required className="w-full rounded-md border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm bg-white dark:bg-slate-900">
              <option value="">Seleccionar equipo...</option>
              {transferTargets.map((t) => (
                <option key={t.id} value={t.id}>{t.name} ({t.campusName})</option>
              ))}
            </select>
          </label>
          <div className="flex gap-2">
            <button type="submit" disabled={isPending} className="rounded-md bg-portoBlue px-3 py-1.5 text-sm font-medium text-white hover:bg-portoDark disabled:opacity-50">
              {isPending ? "Guardando…" : "Confirmar transferencia"}
            </button>
            <button type="button" onClick={() => setTransferFor(null)} className="rounded-md border border-slate-300 dark:border-slate-600 px-3 py-1.5 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800">
              Cancelar
            </button>
          </div>
        </form>
      )}

      {/* Refuerzo form */}
      {refuerzoFor && (
        <form
          action={addRefuerzoAction}
          className="rounded-md border border-violet-400 bg-violet-50 dark:bg-violet-950/20 p-4 space-y-3"
        >
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
            Agregar <span className="text-violet-700 dark:text-violet-400">{refuerzoFor.playerName}</span> como refuerzo
          </p>
          <input type="hidden" name="enrollmentId" value={refuerzoFor.enrollmentId} />
          <input type="hidden" name="playerId" value={refuerzoFor.playerId} />
          <input type="hidden" name="fromTeamId" value={teamId} />
          <label className="block space-y-1 text-sm">
            <span className="font-medium text-slate-700 dark:text-slate-300">Equipo destino</span>
            <select name="teamId" required className="w-full rounded-md border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm bg-white dark:bg-slate-900">
              <option value="">Seleccionar equipo...</option>
              {refuerzoTargets.map((t) => (
                <option key={t.id} value={t.id}>{t.name} ({t.campusName})</option>
              ))}
            </select>
          </label>
          <div className="flex gap-2">
            <button type="submit" disabled={isPending} className="rounded-md bg-violet-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50">
              {isPending ? "Guardando…" : "Agregar como refuerzo"}
            </button>
            <button type="button" onClick={() => setRefuerzoFor(null)} className="rounded-md border border-slate-300 dark:border-slate-600 px-3 py-1.5 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800">
              Cancelar
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
