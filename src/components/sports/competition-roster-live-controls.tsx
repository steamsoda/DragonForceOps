"use client";

import { useMemo, useState, useTransition } from "react";
import type { CompetitionRosterLiveViewData } from "@/lib/queries/competition-rosters";
import {
  assignPendingCompetitionRosterSplitMemberAction,
  setCompetitionRosterExclusionInlineAction,
  setCompetitionRosterManualMemberInlineAction,
  type CompetitionRosterInlineActionResult,
} from "@/server/actions/competition-rosters";

type Props = {
  data: CompetitionRosterLiveViewData;
  onChanged: () => Promise<void>;
};

function ActionButton({ children, disabled, tone = "primary" }: {
  children: React.ReactNode;
  disabled: boolean;
  tone?: "primary" | "danger" | "neutral";
}) {
  const classes = tone === "danger"
    ? "border-rose-300 bg-white text-rose-700 hover:bg-rose-50"
    : tone === "neutral"
      ? "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
      : "border-portoBlue bg-portoBlue text-white hover:bg-portoDark";
  return (
    <button type="submit" disabled={disabled} className={`min-h-9 rounded-md border px-3 py-1.5 text-sm font-semibold disabled:cursor-wait disabled:opacity-50 ${classes}`}>
      {children}
    </button>
  );
}

export function CompetitionRosterLiveControls({ data, onChanged }: Props) {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [excludeEnrollmentId, setExcludeEnrollmentId] = useState("");
  const [excludeReason, setExcludeReason] = useState("");
  const [reinstateEnrollmentId, setReinstateEnrollmentId] = useState("");
  const [reinstateReason, setReinstateReason] = useState("");
  const [helperSquadId, setHelperSquadId] = useState("");
  const [helperEnrollmentId, setHelperEnrollmentId] = useState("");
  const [helperReason, setHelperReason] = useState("");
  const [removeHelperKey, setRemoveHelperKey] = useState("");
  const [removeHelperReason, setRemoveHelperReason] = useState("");

  const selectedHelper = useMemo(
    () => data.manualHelpers.find((helper) => `${helper.squadId}:${helper.enrollmentId}` === removeHelperKey) ?? null,
    [data.manualHelpers, removeHelperKey],
  );

  function run(action: () => Promise<CompetitionRosterInlineActionResult>, afterSuccess?: () => void) {
    setMessage(null);
    startTransition(() => {
      void action().then(async (result) => {
        setMessage({ tone: result.ok ? "ok" : "error", text: result.message });
        if (!result.ok) return;
        afterSuccess?.();
        await onChanged();
      });
    });
  }

  return (
    <div className="space-y-4">
      {message ? (
        <div className={`rounded-md border px-4 py-3 text-sm ${message.tone === "ok" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-700"}`}>
          {message.text}
        </div>
      ) : null}

      {data.pendingPlayers.length > 0 ? (
        <section className="rounded-md border border-amber-300 bg-amber-50 p-4 text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
          <h3 className="font-semibold">Pendientes por asignar</h3>
          <p className="mt-1 text-sm">Asigna los nuevos registros de un grupo dividido directamente a Azul o Blanco.</p>
          <div className="mt-3 divide-y divide-amber-200 overflow-hidden rounded-md border border-amber-200 bg-white dark:divide-amber-900 dark:border-amber-900 dark:bg-slate-950">
            {data.pendingPlayers.map((player) => (
              <div key={player.enrollmentId} className="flex flex-col gap-3 px-3 py-3 md:flex-row md:items-center">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{player.playerName}</p>
                  <p className="text-xs text-amber-800 dark:text-amber-200">Cat. {player.birthYear ?? "-"} | {player.trainingGroupName ?? "Sin grupo"}</p>
                </div>
                {player.eligibleSquads.length === 2 ? (
                  <div className="flex gap-2">
                    {player.eligibleSquads.map((squad) => (
                      <button
                        key={squad.id}
                        type="button"
                        disabled={isPending}
                        onClick={() => {
                          if (!window.confirm(`Asignar a ${player.playerName} en ${squad.name}?`)) return;
                          run(() => assignPendingCompetitionRosterSplitMemberAction({
                            tournamentId: data.tournamentId,
                            campusId: data.campusId,
                            program: data.program,
                            enrollmentId: player.enrollmentId,
                            squadId: squad.id,
                          }));
                        }}
                        className={squad.kind === "azul"
                          ? "min-h-9 rounded-md border border-blue-300 bg-blue-50 px-3 py-1.5 text-sm font-semibold text-blue-800 hover:bg-blue-100 disabled:opacity-50"
                          : "min-h-9 rounded-md border border-slate-400 bg-white px-3 py-1.5 text-sm font-semibold text-slate-800 hover:bg-slate-100 disabled:opacity-50"}
                      >
                        {squad.kind === "azul" ? "Azul" : "Blanco"}
                      </button>
                    ))}
                  </div>
                ) : (
                  <span className="text-xs font-medium text-amber-800 dark:text-amber-200">Requiere revisar grupo o estructura</span>
                )}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <details className="overflow-hidden rounded-md border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-950">
        <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-slate-900 marker:text-slate-400 dark:text-slate-100">
          Excepciones: excluir, reintegrar o agregar refuerzo
        </summary>
        <div className="grid gap-4 border-t border-slate-200 p-4 xl:grid-cols-2 dark:border-slate-700">
          <form className="space-y-3 rounded-md border border-slate-200 p-3 dark:border-slate-700" onSubmit={(event) => {
            event.preventDefault();
            const player = data.exceptionCandidates.find((candidate) => candidate.enrollmentId === excludeEnrollmentId);
            if (!player || !window.confirm(`Excluir a ${player.playerName}? Su pago e inscripcion permanecen intactos.`)) return;
            run(() => setCompetitionRosterExclusionInlineAction({ tournamentId: data.tournamentId, campusId: data.campusId, program: data.program, enrollmentId: excludeEnrollmentId, reason: excludeReason, excluded: true }), () => {
              setExcludeEnrollmentId("");
              setExcludeReason("");
            });
          }}>
            <div><h4 className="font-semibold">Excluir confirmado</h4><p className="text-xs text-slate-500">Solo lo retira del roster deportivo.</p></div>
            <select required value={excludeEnrollmentId} onChange={(event) => setExcludeEnrollmentId(event.target.value)} className="min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm dark:border-slate-600 dark:bg-slate-900">
              <option value="">Selecciona jugador</option>
              {data.exceptionCandidates.map((player) => <option key={player.enrollmentId} value={player.enrollmentId}>{player.playerName} | Cat. {player.birthYear ?? "-"}</option>)}
            </select>
            <input required minLength={3} maxLength={240} value={excludeReason} onChange={(event) => setExcludeReason(event.target.value)} placeholder="Motivo deportivo" className="min-h-10 w-full rounded-md border border-slate-300 px-3 text-sm dark:border-slate-600 dark:bg-slate-900" />
            <ActionButton disabled={isPending} tone="danger">{isPending ? "Guardando..." : "Excluir"}</ActionButton>
          </form>

          <form className="space-y-3 rounded-md border border-slate-200 p-3 dark:border-slate-700" onSubmit={(event) => {
            event.preventDefault();
            run(() => setCompetitionRosterExclusionInlineAction({ tournamentId: data.tournamentId, campusId: data.campusId, program: data.program, enrollmentId: reinstateEnrollmentId, reason: reinstateReason, excluded: false }), () => {
              setReinstateEnrollmentId("");
              setReinstateReason("");
            });
          }}>
            <div><h4 className="font-semibold">Reintegrar excluido</h4><p className="text-xs text-slate-500">Regresa como pendiente para asignacion automatica o Azul/Blanco.</p></div>
            <select required value={reinstateEnrollmentId} onChange={(event) => setReinstateEnrollmentId(event.target.value)} className="min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm dark:border-slate-600 dark:bg-slate-900">
              <option value="">Selecciona excluido</option>
              {data.excludedPlayers.map((player) => <option key={player.enrollmentId} value={player.enrollmentId}>{player.playerName} | {player.exclusionReason}</option>)}
            </select>
            <input required minLength={3} maxLength={240} value={reinstateReason} onChange={(event) => setReinstateReason(event.target.value)} placeholder="Motivo para reintegrar" className="min-h-10 w-full rounded-md border border-slate-300 px-3 text-sm dark:border-slate-600 dark:bg-slate-900" />
            <ActionButton disabled={isPending} tone="neutral">{isPending ? "Guardando..." : "Reintegrar"}</ActionButton>
          </form>

          <form className="space-y-3 rounded-md border border-slate-200 p-3 dark:border-slate-700" onSubmit={(event) => {
            event.preventDefault();
            run(() => setCompetitionRosterManualMemberInlineAction({ tournamentId: data.tournamentId, campusId: data.campusId, program: data.program, squadId: helperSquadId, enrollmentId: helperEnrollmentId, reason: helperReason, added: true }), () => {
              setHelperEnrollmentId("");
              setHelperReason("");
            });
          }}>
            <div><h4 className="font-semibold">Agregar refuerzo</h4><p className="text-xs text-slate-500">No crea pago ni cambia su grupo de entrenamiento.</p></div>
            <select required value={helperSquadId} onChange={(event) => setHelperSquadId(event.target.value)} className="min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm dark:border-slate-600 dark:bg-slate-900">
              <option value="">Equipo destino</option>
              {data.squads.map((squad) => <option key={squad.id} value={squad.id}>{squad.name}</option>)}
            </select>
            <select required value={helperEnrollmentId} onChange={(event) => setHelperEnrollmentId(event.target.value)} className="min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm dark:border-slate-600 dark:bg-slate-900">
              <option value="">Jugador activo del campus</option>
              {data.helperCandidates.map((player) => <option key={player.enrollmentId} value={player.enrollmentId}>{player.playerName} | {player.trainingGroupName}</option>)}
            </select>
            <input required minLength={3} maxLength={240} value={helperReason} onChange={(event) => setHelperReason(event.target.value)} placeholder="Motivo del refuerzo" className="min-h-10 w-full rounded-md border border-slate-300 px-3 text-sm dark:border-slate-600 dark:bg-slate-900" />
            <ActionButton disabled={isPending}>{isPending ? "Guardando..." : "Agregar refuerzo"}</ActionButton>
          </form>

          <form className="space-y-3 rounded-md border border-slate-200 p-3 dark:border-slate-700" onSubmit={(event) => {
            event.preventDefault();
            if (!selectedHelper) return;
            run(() => setCompetitionRosterManualMemberInlineAction({ tournamentId: data.tournamentId, campusId: data.campusId, program: data.program, squadId: selectedHelper.squadId, enrollmentId: selectedHelper.enrollmentId, reason: removeHelperReason, added: false }), () => {
              setRemoveHelperKey("");
              setRemoveHelperReason("");
            });
          }}>
            <div><h4 className="font-semibold">Retirar refuerzo</h4><p className="text-xs text-slate-500">Retira solamente su membresia manual.</p></div>
            <select required value={removeHelperKey} onChange={(event) => setRemoveHelperKey(event.target.value)} className="min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm dark:border-slate-600 dark:bg-slate-900">
              <option value="">Selecciona refuerzo actual</option>
              {data.manualHelpers.map((helper) => <option key={`${helper.squadId}:${helper.enrollmentId}`} value={`${helper.squadId}:${helper.enrollmentId}`}>{helper.playerName} | {helper.squadName}</option>)}
            </select>
            <input required minLength={3} maxLength={240} value={removeHelperReason} onChange={(event) => setRemoveHelperReason(event.target.value)} placeholder="Motivo para retirar" className="min-h-10 w-full rounded-md border border-slate-300 px-3 text-sm dark:border-slate-600 dark:bg-slate-900" />
            <ActionButton disabled={isPending || !selectedHelper} tone="danger">{isPending ? "Guardando..." : "Retirar refuerzo"}</ActionButton>
          </form>
        </div>
      </details>
    </div>
  );
}
