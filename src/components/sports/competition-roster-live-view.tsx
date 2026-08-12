"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { CompetitionRosterLiveControls } from "@/components/sports/competition-roster-live-controls";
import type { CompetitionRosterLiveViewData } from "@/lib/queries/competition-rosters";
import { moveCompetitionRosterMemberInlineAction } from "@/server/actions/competition-rosters";
import {
  formatCampusCompetitionTeamName,
  formatCompetitionSquadDisplay,
} from "@/lib/training-groups/shared";

type Props = {
  active: boolean;
  tournamentId: string | null;
  campusId: string;
  program: string | null;
  availablePrograms: string[];
};

type ScopedProps = Omit<Props, "program" | "availablePrograms"> & {
  program: string;
};

const PROGRAM_ORDER = ["futbol_para_todos", "selectivo", "little_dragons"];

function programLabel(program: string) {
  if (program === "futbol_para_todos") return "Futbol Para Todos";
  if (program === "selectivo") return "Selectivos";
  if (program === "little_dragons") return "Little Dragons";
  return program;
}

function orderedPrograms(programs: string[]) {
  return [...new Set(programs)].sort((left, right) => {
    const leftIndex = PROGRAM_ORDER.indexOf(left);
    const rightIndex = PROGRAM_ORDER.indexOf(right);
    if (leftIndex === -1 && rightIndex === -1) return left.localeCompare(right, "es-MX");
    if (leftIndex === -1) return 1;
    if (rightIndex === -1) return -1;
    return leftIndex - rightIndex;
  });
}

function kindLabel(kind: string) {
  if (kind === "azul") return "Azul";
  if (kind === "blanco") return "Blanco";
  if (kind === "custom") return "Especial";
  return "Equipo";
}

function getSquadBirthYear(squad: CompetitionRosterLiveViewData["squads"][number]) {
  const categoryYears = squad.categoryLabel?.match(/(?:19|20)\d{2}/g)?.map(Number) ?? [];
  const memberYears = squad.members.flatMap((member) => member.birthYear == null ? [] : [member.birthYear]);
  return Math.max(...categoryYears, ...memberYears, 0);
}

function sortMembers(squad: CompetitionRosterLiveViewData["squads"][number]) {
  return [...squad.members].sort((left, right) => left.playerName.localeCompare(right.playerName, "es-MX"));
}

export function CompetitionRosterLiveView({
  active,
  tournamentId,
  campusId,
  program,
  availablePrograms,
}: Props) {
  if (!active) return null;
  if (!tournamentId) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-8 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-950/40 dark:text-slate-300">
        Esta competencia todavia no tiene una configuracion de torneo para organizar equipos.
      </div>
    );
  }

  if (program) {
    return (
      <CompetitionRosterProgramView
        active
        tournamentId={tournamentId}
        campusId={campusId}
        program={program}
      />
    );
  }

  const programs = orderedPrograms(availablePrograms);
  if (programs.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-8 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-950/40 dark:text-slate-300">
        No hay programas elegibles para mostrar equipos en esta competencia.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-100">
        Mostrando todos los equipos del campus. La edicion y las excepciones permanecen separadas por programa.
      </div>
      {programs.map((currentProgram) => (
        <section key={currentProgram} className="space-y-3" aria-labelledby={`teams-${currentProgram}`}>
          <div className="border-b border-slate-300 pb-2 dark:border-slate-700">
            <h3 id={`teams-${currentProgram}`} className="text-lg font-semibold text-slate-950 dark:text-slate-50">
              {programLabel(currentProgram)}
            </h3>
          </div>
          <CompetitionRosterProgramView
            active
            tournamentId={tournamentId}
            campusId={campusId}
            program={currentProgram}
          />
        </section>
      ))}
    </div>
  );
}

function CompetitionRosterProgramView({ active, tournamentId, campusId, program }: ScopedProps) {
  const [data, setData] = useState<CompetitionRosterLiveViewData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [draggedMember, setDraggedMember] = useState<{ sourceSquadId: string; enrollmentId: string } | null>(null);
  const [dropTargetSquadId, setDropTargetSquadId] = useState<string | null>(null);
  const [movingEnrollmentId, setMovingEnrollmentId] = useState<string | null>(null);
  const [moveNotice, setMoveNotice] = useState<{ tone: "success" | "error" | "saving"; message: string } | null>(null);

  const loadData = useCallback(async (signal?: AbortSignal, background = false) => {
    if (!active || !tournamentId) return;
    const query = new URLSearchParams({ tournament: tournamentId, campus: campusId, program });
    if (!background) {
      setLoading(true);
      setError(null);
    }
    try {
      const response = await fetch(`/api/sports-signups/teams?${query.toString()}`, {
        cache: "no-store",
        signal,
      });
      if (!response.ok) throw new Error("No se pudieron cargar los equipos.");
      setData(await response.json() as CompetitionRosterLiveViewData);
    } catch (nextError) {
      if (signal?.aborted) return;
      if (!background) {
        setError(nextError instanceof Error ? nextError.message : "No se pudieron cargar los equipos.");
      }
    } finally {
      if (!signal?.aborted && !background) setLoading(false);
    }
  }, [active, tournamentId, campusId, program]);

  useEffect(() => {
    if (!active || !tournamentId || !program) return;
    const controller = new AbortController();
    void loadData(controller.signal);

    return () => controller.abort();
  }, [active, tournamentId, program, loadData]);

  if (!active) return null;
  if (!tournamentId) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-8 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-950/40 dark:text-slate-300">
        Esta competencia todavia no tiene una configuracion de torneo para organizar equipos.
      </div>
    );
  }
  if (loading) {
    return <div className="rounded-xl border border-slate-200 bg-white px-4 py-8 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-950">Cargando equipos...</div>;
  }
  if (error || !data) {
    return <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-700">{error ?? "No se encontraron equipos."}</div>;
  }

  const sortedSquads = [...data.squads].sort((left, right) => {
    const yearDifference = getSquadBirthYear(right) - getSquadBirthYear(left);
    return yearDifference || left.name.localeCompare(right.name, "es-MX");
  });
  const getTeamName = (squad: CompetitionRosterLiveViewData["squads"][number]) => {
    const display = formatCompetitionSquadDisplay({
      name: squad.name,
      program: data.program,
      categoryLabel: squad.categoryLabel,
      kind: squad.kind,
      sourceGroupCount: squad.sourceGroupNames.length,
    });
    return formatCampusCompetitionTeamName(data.campusName, display.title);
  };
  const moveMember = async (params: {
    sourceSquadId: string;
    destinationSquadId: string;
    enrollmentId: string;
  }) => {
    if (movingEnrollmentId || params.sourceSquadId === params.destinationSquadId) return;
    const sourceSquad = data.squads.find((squad) => squad.id === params.sourceSquadId);
    const destinationSquad = data.squads.find((squad) => squad.id === params.destinationSquadId);
    const member = sourceSquad?.members.find((candidate) => candidate.enrollmentId === params.enrollmentId);
    if (!sourceSquad || !destinationSquad || !member) {
      setMoveNotice({ tone: "error", message: "El jugador o el equipo ya cambio. Actualiza la vista." });
      return;
    }
    if (destinationSquad.members.some((candidate) => candidate.enrollmentId === params.enrollmentId)) {
      setMoveNotice({ tone: "error", message: "El jugador ya pertenece al equipo de destino." });
      return;
    }

    const previousData = data;
    setMovingEnrollmentId(params.enrollmentId);
    setMoveNotice({ tone: "saving", message: `Moviendo a ${member.playerName}...` });
    setData({
      ...data,
      squads: data.squads.map((squad) => {
        if (squad.id === params.sourceSquadId) {
          return { ...squad, members: squad.members.filter((candidate) => candidate.enrollmentId !== params.enrollmentId) };
        }
        if (squad.id === params.destinationSquadId) {
          return { ...squad, members: [...squad.members, member].sort((left, right) => left.playerName.localeCompare(right.playerName, "es-MX")) };
        }
        return squad;
      }),
    });

    const result = await moveCompetitionRosterMemberInlineAction({
      tournamentId: data.tournamentId,
      campusId: data.campusId,
      program: data.program,
      ...params,
    });
    if (!result.ok) {
      setData(previousData);
      setMoveNotice({ tone: "error", message: result.message });
      setMovingEnrollmentId(null);
      return;
    }

    setMoveNotice({ tone: "success", message: result.message });
    setMovingEnrollmentId(null);
    await loadData(undefined, true);
  };

  const organizerHref = `/sports-signups/squads?tournament=${encodeURIComponent(data.tournamentId)}&campus=${encodeURIComponent(data.campusId)}&program=${encodeURIComponent(data.program)}`;
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-md border border-slate-200 bg-white p-4 md:flex-row md:items-center md:justify-between dark:border-slate-700 dark:bg-slate-950">
        <div className="flex flex-wrap gap-2 text-sm">
          <span className="rounded-full border border-slate-300 px-3 py-1">{data.totalConfirmed} confirmados</span>
          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-emerald-800">{data.totalAssigned} en equipos</span>
          {data.totalPending > 0 ? (
            <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-amber-800">{data.totalPending} pendientes</span>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {data.canManage && data.squads.length > 1 ? (
            <button
              type="button"
              onClick={() => {
                setEditMode((current) => !current);
                setDraggedMember(null);
                setDropTargetSquadId(null);
                setMoveNotice(null);
              }}
              className={editMode
                ? "rounded-md border border-portoBlue bg-blue-50 px-4 py-2 text-sm font-semibold text-portoBlue"
                : "rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200"}
            >
              {editMode ? "Cerrar edicion" : "Editar jugadores"}
            </button>
          ) : null}
          <a
            href={`/api/exports/competition-roster-live?tournament=${encodeURIComponent(data.tournamentId)}&campus=${encodeURIComponent(data.campusId)}&program=${encodeURIComponent(data.program)}`}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200"
          >
            Exportar equipos
          </a>
          <Link href={organizerHref} className="rounded-md bg-portoBlue px-4 py-2 text-sm font-semibold text-white hover:bg-portoDark">
            Administrar excepciones
          </Link>
        </div>
      </div>

      {moveNotice ? (
        <div
          role="status"
          className={moveNotice.tone === "error"
            ? "rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
            : moveNotice.tone === "success"
              ? "rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
              : "rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800"}
        >
          {moveNotice.message}
        </div>
      ) : null}

      {data.squads.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-8 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-950/40 dark:text-slate-300">
          Los equipos se crearán automáticamente cuando existan inscripciones confirmadas en este programa.
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
          {sortedSquads.map((squad) => {
              const display = formatCompetitionSquadDisplay({
                name: squad.name,
                program: data.program,
                categoryLabel: squad.categoryLabel,
                kind: squad.kind,
                sourceGroupCount: squad.sourceGroupNames.length,
              });
              const teamName = formatCampusCompetitionTeamName(data.campusName, display.title);
              const canDrop = editMode
                && draggedMember !== null
                && draggedMember.sourceSquadId !== squad.id
                && !squad.members.some((member) => member.enrollmentId === draggedMember.enrollmentId);
              return (
            <article
              key={squad.id}
              onDragOver={(event) => {
                if (!canDrop) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                setDropTargetSquadId(squad.id);
              }}
              onDragLeave={() => setDropTargetSquadId((current) => current === squad.id ? null : current)}
              onDrop={(event) => {
                event.preventDefault();
                if (!canDrop || !draggedMember) return;
                const move = { ...draggedMember, destinationSquadId: squad.id };
                setDraggedMember(null);
                setDropTargetSquadId(null);
                void moveMember(move);
              }}
              className={dropTargetSquadId === squad.id && canDrop
                ? "overflow-hidden rounded-md border-2 border-portoBlue bg-blue-50/40 dark:bg-blue-950/20"
                : "overflow-hidden rounded-md border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-950"}
            >
              <header className="border-b border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800/70">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-slate-950 dark:text-slate-50">
                      {teamName}
                    </h3>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      Profesor: {squad.professorNames.join(", ") || "Sin asignar"}
                    </p>
                    {squad.sourceGroupNames.length > 1 ? (
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        Combina {squad.sourceGroupNames.length} grupos de entrenamiento
                      </p>
                    ) : null}
                  </div>
                  <span className="rounded-full border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-200">
                    {kindLabel(squad.kind)} · {squad.members.length}
                  </span>
                </div>
              </header>
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {sortMembers(squad).map((member, index) => {
                  const destinations = sortedSquads.filter((candidate) =>
                    candidate.id !== squad.id
                    && !candidate.members.some((existing) => existing.enrollmentId === member.enrollmentId),
                  );
                  return (
                  <div
                    key={`${squad.id}-${member.enrollmentId}`}
                    draggable={editMode && movingEnrollmentId === null}
                    onDragStart={(event) => {
                      if (!editMode || movingEnrollmentId) {
                        event.preventDefault();
                        return;
                      }
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData("text/plain", member.enrollmentId);
                      setDraggedMember({ sourceSquadId: squad.id, enrollmentId: member.enrollmentId });
                    }}
                    onDragEnd={() => {
                      setDraggedMember(null);
                      setDropTargetSquadId(null);
                    }}
                    className={editMode
                      ? "grid cursor-grab grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-2 px-4 py-2 text-sm active:cursor-grabbing"
                      : "grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-2 px-4 py-2 text-sm"}
                  >
                    <span className="text-xs text-slate-400">{index + 1}</span>
                    <span className="min-w-0 font-medium text-slate-900 dark:text-slate-100">
                      <span className="block truncate">{member.playerName}</span>
                      {editMode ? <span className="mt-0.5 block text-xs font-normal text-slate-500">{member.birthYear ?? "-"}</span> : null}
                    </span>
                    {editMode ? (
                      <select
                        aria-label={`Mover a ${member.playerName}`}
                        value=""
                        disabled={movingEnrollmentId !== null || destinations.length === 0}
                        onChange={(event) => {
                          if (!event.target.value) return;
                          void moveMember({
                            sourceSquadId: squad.id,
                            destinationSquadId: event.target.value,
                            enrollmentId: member.enrollmentId,
                          });
                        }}
                        className="max-w-44 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-700 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-200"
                      >
                        <option value="">Mover a...</option>
                        {destinations.map((destination) => (
                          <option key={destination.id} value={destination.id}>{getTeamName(destination)}</option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-xs text-slate-500">{member.birthYear ?? "-"}</span>
                    )}
                  </div>
                  );
                })}
              </div>
            </article>
              );
            })}
        </div>
      )}

      {data.canManage ? (
        <CompetitionRosterLiveControls data={data} onChanged={() => loadData(undefined, true)} />
      ) : data.pendingPlayers.length > 0 ? (
        <section className="rounded-md border border-amber-300 bg-amber-50 p-4 text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
          <h3 className="font-semibold">Pendientes por asignar</h3>
          <p className="mt-1 text-sm">Estos jugadores requieren una decisión Azul/Blanco o una revisión de grupo.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {data.pendingPlayers.map((player) => (
              <span key={player.enrollmentId} className="rounded-full border border-amber-300 bg-white px-3 py-1 text-sm dark:border-amber-700 dark:bg-slate-950">
                {player.playerName} · {player.trainingGroupName ?? "Sin grupo"}
              </span>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
