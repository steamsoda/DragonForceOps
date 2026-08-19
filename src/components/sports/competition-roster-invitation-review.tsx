"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import type { CompetitionRosterLiveViewData } from "@/lib/queries/competition-rosters";
import type { CompetitionSignupPlayerRow } from "@/lib/queries/sports-signups";
import { formatCampusCompetitionTeamName, formatCompetitionSquadDisplay } from "@/lib/training-groups/shared";
import { assignCompetitionRosterInvitedMemberInlineAction } from "@/server/actions/competition-rosters";

type Props = {
  tournamentId: string | null;
  campusId: string;
  campusName: string;
  availablePrograms: string[];
  reviewPlayers: CompetitionSignupPlayerRow[];
  expanded: boolean;
  onOpenTeams: () => void;
};

type DestinationSquad = CompetitionRosterLiveViewData["squads"][number] & {
  program: string;
  programLabel: string;
};

type ProgramData = CompetitionRosterLiveViewData & { program: string };

function destinationName(campusName: string, squad: DestinationSquad) {
  const display = formatCompetitionSquadDisplay({
    name: squad.name,
    program: squad.program,
    categoryLabel: squad.categoryLabel,
    kind: squad.kind,
    sourceGroupCount: squad.sourceGroupNames.length,
  });
  return formatCampusCompetitionTeamName(campusName, display.title);
}

export function CompetitionRosterInvitationReview({
  tournamentId,
  campusId,
  campusName,
  availablePrograms,
  reviewPlayers,
  expanded,
  onOpenTeams,
}: Props) {
  const [programData, setProgramData] = useState<ProgramData[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [destinationByEnrollment, setDestinationByEnrollment] = useState<Record<string, string>>({});
  const [reasonByEnrollment, setReasonByEnrollment] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [savingEnrollmentId, setSavingEnrollmentId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const loadData = useCallback(async (signal?: AbortSignal) => {
    if (!tournamentId || reviewPlayers.length === 0 || availablePrograms.length === 0) {
      setProgramData([]);
      return;
    }

    setLoading(true);
    setLoadError(null);
    try {
      const results = await Promise.all(availablePrograms.map(async (program) => {
        const query = new URLSearchParams({ tournament: tournamentId, campus: campusId, program });
        const response = await fetch(`/api/sports-signups/teams?${query.toString()}`, {
          cache: "no-store",
          signal,
        });
        if (!response.ok) throw new Error("No se pudieron consultar los equipos del torneo.");
        return await response.json() as ProgramData;
      }));
      setProgramData(results);
    } catch (error) {
      if (signal?.aborted) return;
      setLoadError(error instanceof Error ? error.message : "No se pudieron consultar los equipos del torneo.");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [availablePrograms, campusId, reviewPlayers.length, tournamentId]);

  useEffect(() => {
    const controller = new AbortController();
    void loadData(controller.signal);
    return () => controller.abort();
  }, [loadData]);

  const destinations = useMemo<DestinationSquad[]>(
    () => programData.flatMap((data) => data.squads.map((squad) => ({
      ...squad,
      program: data.program,
      programLabel: data.programLabel,
    }))).sort((left, right) => {
      const leftYear = Math.max(...(left.categoryLabel?.match(/(?:19|20)\d{2}/g)?.map(Number) ?? [0]));
      const rightYear = Math.max(...(right.categoryLabel?.match(/(?:19|20)\d{2}/g)?.map(Number) ?? [0]));
      return rightYear - leftYear || destinationName(campusName, left).localeCompare(destinationName(campusName, right), "es-MX");
    }),
    [campusName, programData],
  );
  const reviewedInvitationIds = useMemo(
    () => new Set(programData.flatMap((data) => data.squads.flatMap((squad) => squad.members
      .filter((member) => member.source === "manual")
      .map((member) => member.enrollmentId)))),
    [programData],
  );
  const provisionalSquadByEnrollment = useMemo(() => {
    const result = new Map<string, DestinationSquad>();
    for (const squad of destinations) {
      for (const member of squad.members) {
        if (member.source === "paid" && !result.has(member.enrollmentId)) {
          result.set(member.enrollmentId, squad);
        }
      }
    }
    return result;
  }, [destinations]);
  const unresolvedPlayers = useMemo(
    () => reviewPlayers.filter((player) => !reviewedInvitationIds.has(player.enrollmentId)),
    [reviewPlayers, reviewedInvitationIds],
  );
  const canManage = programData.some((data) => data.canManage);

  if (reviewPlayers.length === 0 || (!loading && !loadError && unresolvedPlayers.length === 0)) return null;

  if (!expanded) {
    return (
      <div className="mb-5 flex flex-col gap-3 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 md:flex-row md:items-center md:justify-between dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100">
        <div>
          <p className="font-semibold">
            {loading ? "Revisando registros pagados..." : `${unresolvedPlayers.length} invitado(s) pendiente(s) de equipo`}
          </p>
          <p className="mt-1 text-xs">El pago está confirmado. El grupo de entrenamiento no se modificará.</p>
        </div>
        <button type="button" onClick={onOpenTeams} className="rounded-md bg-amber-700 px-4 py-2 font-semibold text-white hover:bg-amber-800">
          Revisar invitados
        </button>
      </div>
    );
  }

  return (
    <section className="mb-5 space-y-4 rounded-md border border-amber-300 bg-amber-50 p-4 text-amber-950 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-100">
      <div>
        <h3 className="font-semibold">Invitados pendientes de equipo</h3>
        <p className="mt-1 text-sm">
          Estos jugadores pagaron correctamente, pero están fuera de las reglas normales del torneo. Asígnalos sin cambiar su grupo de entrenamiento.
        </p>
      </div>

      {message ? (
        <div role="status" className={message.tone === "success"
          ? "rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-800"
          : "rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700"}>
          {message.text}
        </div>
      ) : null}
      {loadError ? <div className="rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700">{loadError}</div> : null}
      {loading ? <p className="text-sm">Consultando equipos disponibles...</p> : null}

      {!loading && unresolvedPlayers.length > 0 ? (
        <div className="space-y-3">
          {unresolvedPlayers.map((player) => {
            const provisionalSquad = provisionalSquadByEnrollment.get(player.enrollmentId) ?? null;
            const destinationId = destinationByEnrollment[player.enrollmentId] ?? provisionalSquad?.id ?? "";
            const selectedDestination = destinations.find((squad) => squad.id === destinationId) ?? null;
            const reason = reasonByEnrollment[player.enrollmentId] ?? "";
            const disabled = isPending || !canManage || !selectedDestination || reason.trim().length < 3;

            return (
              <article key={player.enrollmentId} className="rounded-md border border-amber-200 bg-white p-3 dark:border-amber-800 dark:bg-slate-950">
                <div className="grid gap-3 xl:grid-cols-[minmax(15rem,1fr)_minmax(15rem,1fr)_minmax(15rem,1fr)_auto] xl:items-end">
                  <div>
                    <p className="font-semibold text-slate-950 dark:text-slate-50">{player.playerName}</p>
                    <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                      Cat. {player.birthYear ?? "-"} · {player.trainingGroupLabel || "Sin grupo"}
                    </p>
                    <p className="mt-1 text-xs font-medium text-emerald-700">Pago confirmado</p>
                    {provisionalSquad ? (
                      <p className="mt-1 text-xs text-amber-800">
                        Ubicacion provisional: {destinationName(campusName, provisionalSquad)}
                      </p>
                    ) : null}
                  </div>
                  <label className="text-xs font-semibold uppercase text-slate-600 dark:text-slate-300">
                    Equipo destino
                    <select
                      value={destinationId}
                      onChange={(event) => setDestinationByEnrollment((current) => ({ ...current, [player.enrollmentId]: event.target.value }))}
                      className="mt-1 min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm font-normal normal-case text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                    >
                      <option value="">Selecciona equipo</option>
                      {destinations.map((squad) => (
                        <option key={squad.id} value={squad.id}>
                          {destinationName(campusName, squad)} · {squad.programLabel}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-xs font-semibold uppercase text-slate-600 dark:text-slate-300">
                    Motivo
                    <input
                      value={reason}
                      minLength={3}
                      maxLength={240}
                      onChange={(event) => setReasonByEnrollment((current) => ({ ...current, [player.enrollmentId]: event.target.value }))}
                      placeholder="Ej. Invitado por Director Deportivo"
                      className="mt-1 min-h-10 w-full rounded-md border border-slate-300 px-3 text-sm font-normal normal-case text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                    />
                  </label>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => {
                      if (!selectedDestination || !tournamentId) return;
                      const teamName = destinationName(campusName, selectedDestination);
                      const confirmed = window.confirm(
                        `Asignar a ${player.playerName} como invitado en ${teamName}?\n\nSu grupo de entrenamiento, inscripción, asistencia y pago no cambiarán.`,
                      );
                      if (!confirmed) return;
                      setMessage(null);
                      setSavingEnrollmentId(player.enrollmentId);
                      startTransition(() => {
                        void assignCompetitionRosterInvitedMemberInlineAction({
                          tournamentId,
                          campusId,
                          program: selectedDestination.program,
                          squadId: selectedDestination.id,
                          enrollmentId: player.enrollmentId,
                          reason: reason.trim(),
                        }).then(async (result) => {
                          if (!result.ok) {
                            setMessage({ tone: "error", text: result.message });
                            setSavingEnrollmentId(null);
                            return;
                          }
                          setMessage({ tone: "success", text: `${player.playerName} fue asignado como invitado a ${teamName}.` });
                          setDestinationByEnrollment((current) => ({ ...current, [player.enrollmentId]: "" }));
                          setReasonByEnrollment((current) => ({ ...current, [player.enrollmentId]: "" }));
                          await loadData();
                          window.dispatchEvent(new Event("competition-rosters-refreshed"));
                          setSavingEnrollmentId(null);
                        });
                      });
                    }}
                    className="min-h-10 rounded-md bg-portoBlue px-4 py-2 text-sm font-semibold text-white hover:bg-portoDark disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {savingEnrollmentId === player.enrollmentId ? "Asignando..." : "Asignar invitado"}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      ) : null}

      {!loading && destinations.length === 0 ? (
        <p className="rounded-md border border-dashed border-amber-300 px-3 py-2 text-sm">
          Todavía no existen equipos de destino. Actualiza o crea los equipos del torneo antes de asignar invitados.
        </p>
      ) : null}
      {!loading && !canManage && unresolvedPlayers.length > 0 ? (
        <p className="text-xs font-medium">Se requiere un Director Deportivo, Director Admin o Super Admin para asignar el equipo.</p>
      ) : null}
    </section>
  );
}
