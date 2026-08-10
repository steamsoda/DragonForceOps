"use client";

import { useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import type {
  CompetitionRosterHelperCandidate,
  CompetitionRosterManualHelper,
  CompetitionRosterOrganizerPlayer,
} from "@/lib/queries/competition-rosters";
import {
  setCompetitionRosterExclusionAction,
  setCompetitionRosterManualMemberAction,
} from "@/server/actions/competition-rosters";

function SubmitButton({ pendingLabel, label, tone = "primary" }: {
  pendingLabel: string;
  label: string;
  tone?: "primary" | "danger" | "neutral";
}) {
  const { pending } = useFormStatus();
  const toneClass = tone === "danger"
    ? "border-rose-300 bg-white text-rose-700 hover:bg-rose-50"
    : tone === "neutral"
      ? "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
      : "border-portoBlue bg-portoBlue text-white hover:bg-portoDark";
  return (
    <button
      type="submit"
      disabled={pending}
      className={`min-h-10 rounded-md border px-4 py-2 text-sm font-semibold disabled:cursor-wait disabled:opacity-60 ${toneClass}`}
    >
      {pending ? pendingLabel : label}
    </button>
  );
}

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export function CompetitionRosterExceptionsEditor({
  tournamentId,
  campusId,
  program,
  paidCandidates,
  excludedPlayers,
  activeSquads,
  helperCandidates,
  manualHelpers,
}: {
  tournamentId: string;
  campusId: string;
  program: string;
  paidCandidates: CompetitionRosterOrganizerPlayer[];
  excludedPlayers: CompetitionRosterOrganizerPlayer[];
  activeSquads: Array<{ id: string; name: string }>;
  helperCandidates: CompetitionRosterHelperCandidate[];
  manualHelpers: CompetitionRosterManualHelper[];
}) {
  const [excludeSearch, setExcludeSearch] = useState("");
  const [selectedPaidId, setSelectedPaidId] = useState("");
  const [helperSearch, setHelperSearch] = useState("");
  const [selectedHelperId, setSelectedHelperId] = useState("");
  const availablePaid = useMemo(
    () => paidCandidates.filter((player) => !player.isExcluded),
    [paidCandidates],
  );
  const paidMatches = useMemo(() => {
    const needle = normalize(excludeSearch.trim());
    if (!needle) return [];
    return availablePaid.filter((player) => normalize(player.playerName).includes(needle)).slice(0, 8);
  }, [availablePaid, excludeSearch]);
  const helperMatches = useMemo(() => {
    const needle = normalize(helperSearch.trim());
    if (!needle) return [];
    return helperCandidates.filter((player) =>
      normalize(`${player.playerName} ${player.trainingGroupName} ${player.birthYear ?? ""}`).includes(needle),
    ).slice(0, 10);
  }, [helperCandidates, helperSearch]);
  const selectedPaid = availablePaid.find((player) => player.enrollmentId === selectedPaidId) ?? null;
  const selectedHelper = helperCandidates.find((player) => player.enrollmentId === selectedHelperId) ?? null;

  return (
    <details className="overflow-hidden rounded-md border border-amber-200 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/20">
      <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-amber-950 marker:text-amber-500 dark:text-amber-100">
        Excepciones deportivas: excluir confirmados o agregar refuerzos
      </summary>
      <div className="grid gap-5 border-t border-amber-200 p-4 lg:grid-cols-2 dark:border-amber-900">
        <section className="space-y-3">
          <div>
            <h3 className="font-semibold text-slate-950 dark:text-slate-50">Excluir jugador confirmado</h3>
            <p className="text-xs text-slate-600 dark:text-slate-300">
              Conserva su pago e inscripcion al torneo, pero lo retira de los equipos activos.
            </p>
          </div>
          <input
            type="search"
            value={excludeSearch}
            onChange={(event) => {
              setExcludeSearch(event.target.value);
              setSelectedPaidId("");
            }}
            placeholder="Buscar jugador confirmado..."
            className="min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm dark:border-slate-600 dark:bg-slate-950"
          />
          {paidMatches.length > 0 && !selectedPaid ? (
            <div className="divide-y divide-slate-200 rounded-md border border-slate-200 bg-white dark:divide-slate-700 dark:border-slate-700 dark:bg-slate-950">
              {paidMatches.map((player) => (
                <button
                  key={player.enrollmentId}
                  type="button"
                  onClick={() => {
                    setSelectedPaidId(player.enrollmentId);
                    setExcludeSearch(player.playerName);
                  }}
                  className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  <span>{player.playerName}</span><span className="text-xs text-slate-500">Cat. {player.birthYear ?? "-"}</span>
                </button>
              ))}
            </div>
          ) : null}
          {selectedPaid ? (
            <form
              action={setCompetitionRosterExclusionAction}
              className="space-y-3 rounded-md border border-rose-200 bg-white p-3 dark:border-rose-900 dark:bg-slate-950"
              onSubmit={(event) => {
                if (!window.confirm(`Excluir a ${selectedPaid.playerName} del roster? Su pago permanecera confirmado.`)) {
                  event.preventDefault();
                }
              }}
            >
              <input type="hidden" name="tournamentId" value={tournamentId} />
              <input type="hidden" name="campusId" value={campusId} />
              <input type="hidden" name="program" value={program} />
              <input type="hidden" name="enrollmentId" value={selectedPaid.enrollmentId} />
              <input type="hidden" name="excluded" value="true" />
              <p className="text-sm font-semibold">{selectedPaid.playerName} · Cat. {selectedPaid.birthYear ?? "-"}</p>
              <input name="reason" required minLength={3} maxLength={240} placeholder="Motivo deportivo obligatorio" className="min-h-10 w-full rounded-md border border-slate-300 px-3 text-sm dark:border-slate-600 dark:bg-slate-900" />
              <SubmitButton label="Excluir del roster" pendingLabel="Excluyendo..." tone="danger" />
            </form>
          ) : null}
          {excludedPlayers.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase text-slate-500">Excluidos actuales</p>
              {excludedPlayers.map((player) => (
                <form key={player.enrollmentId} action={setCompetitionRosterExclusionAction} className="flex flex-col gap-2 rounded-md border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-950 sm:flex-row sm:items-center">
                  <input type="hidden" name="tournamentId" value={tournamentId} />
                  <input type="hidden" name="campusId" value={campusId} />
                  <input type="hidden" name="program" value={program} />
                  <input type="hidden" name="enrollmentId" value={player.enrollmentId} />
                  <input type="hidden" name="excluded" value="false" />
                  <div className="min-w-0 flex-1 text-sm"><strong>{player.playerName}</strong><p className="truncate text-xs text-slate-500">{player.exclusionReason}</p></div>
                  <input name="reason" required minLength={3} maxLength={240} placeholder="Motivo para reintegrar" className="min-h-10 rounded-md border border-slate-300 px-3 text-sm dark:border-slate-600 dark:bg-slate-900" />
                  <SubmitButton label="Reintegrar" pendingLabel="Reintegrando..." tone="neutral" />
                </form>
              ))}
            </div>
          ) : null}
        </section>

        <section className="space-y-3">
          <div>
            <h3 className="font-semibold text-slate-950 dark:text-slate-50">Agregar refuerzo manual</h3>
            <p className="text-xs text-slate-600 dark:text-slate-300">
              Agrega un jugador activo del mismo campus sin crear un pago ni cambiar su grupo de entrenamiento.
            </p>
          </div>
          {activeSquads.length > 0 ? (
            <form
              action={setCompetitionRosterManualMemberAction}
              className="space-y-3 rounded-md border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-950"
              onSubmit={(event) => {
                if (!selectedHelper || !window.confirm(`Agregar a ${selectedHelper.playerName} como refuerzo manual?`)) {
                  event.preventDefault();
                }
              }}
            >
              <input type="hidden" name="tournamentId" value={tournamentId} />
              <input type="hidden" name="campusId" value={campusId} />
              <input type="hidden" name="program" value={program} />
              <input type="hidden" name="enrollmentId" value={selectedHelperId} />
              <input type="hidden" name="added" value="true" />
              <select name="squadId" required defaultValue="" className="min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm dark:border-slate-600 dark:bg-slate-900">
                <option value="" disabled>Selecciona equipo destino</option>
                {activeSquads.map((squad) => <option key={squad.id} value={squad.id}>{squad.name}</option>)}
              </select>
              <input
                type="search"
                value={helperSearch}
                onChange={(event) => {
                  setHelperSearch(event.target.value);
                  setSelectedHelperId("");
                }}
                placeholder="Buscar jugador activo del campus..."
                className="min-h-10 w-full rounded-md border border-slate-300 px-3 text-sm dark:border-slate-600 dark:bg-slate-900"
              />
              {helperMatches.length > 0 && !selectedHelper ? (
                <div className="max-h-56 divide-y divide-slate-200 overflow-y-auto rounded-md border border-slate-200 dark:divide-slate-700 dark:border-slate-700">
                  {helperMatches.map((player) => (
                    <button
                      key={player.enrollmentId}
                      type="button"
                      onClick={() => {
                        setSelectedHelperId(player.enrollmentId);
                        setHelperSearch(player.playerName);
                      }}
                      className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
                    >
                      <strong>{player.playerName}</strong>
                      <span className="ml-2 text-xs text-slate-500">Cat. {player.birthYear ?? "-"} · {player.trainingGroupName}</span>
                    </button>
                  ))}
                </div>
              ) : null}
              {selectedHelper ? <p className="text-sm text-emerald-700">Seleccionado: {selectedHelper.playerName} · {selectedHelper.trainingGroupName}</p> : null}
              <input name="reason" required minLength={3} maxLength={240} placeholder="Motivo del refuerzo obligatorio" className="min-h-10 w-full rounded-md border border-slate-300 px-3 text-sm dark:border-slate-600 dark:bg-slate-900" />
              <SubmitButton label="Agregar refuerzo" pendingLabel="Agregando..." />
            </form>
          ) : (
            <p className="rounded-md border border-dashed border-slate-300 p-3 text-sm text-slate-500">Crea por lo menos un equipo antes de agregar refuerzos.</p>
          )}
          {manualHelpers.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase text-slate-500">Refuerzos actuales</p>
              {manualHelpers.map((helper) => (
                <form key={`${helper.squadId}:${helper.enrollmentId}`} action={setCompetitionRosterManualMemberAction} className="flex flex-col gap-2 rounded-md border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-950 sm:flex-row sm:items-center">
                  <input type="hidden" name="tournamentId" value={tournamentId} />
                  <input type="hidden" name="campusId" value={campusId} />
                  <input type="hidden" name="program" value={program} />
                  <input type="hidden" name="squadId" value={helper.squadId} />
                  <input type="hidden" name="enrollmentId" value={helper.enrollmentId} />
                  <input type="hidden" name="added" value="false" />
                  <div className="min-w-0 flex-1 text-sm"><strong>{helper.playerName}</strong><p className="truncate text-xs text-slate-500">{helper.squadName} · {helper.reason}</p></div>
                  <input name="reason" required minLength={3} maxLength={240} placeholder="Motivo para retirar" className="min-h-10 rounded-md border border-slate-300 px-3 text-sm dark:border-slate-600 dark:bg-slate-900" />
                  <SubmitButton label="Retirar" pendingLabel="Retirando..." tone="danger" />
                </form>
              ))}
            </div>
          ) : null}
        </section>
      </div>
    </details>
  );
}
