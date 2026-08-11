"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { CompetitionRosterLiveControls } from "@/components/sports/competition-roster-live-controls";
import type { CompetitionRosterLiveViewData } from "@/lib/queries/competition-rosters";
import {
  formatCompetitionSquadDisplay,
} from "@/lib/training-groups/shared";

type Props = {
  active: boolean;
  tournamentId: string | null;
  campusId: string;
  program: string | null;
};

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

export function CompetitionRosterLiveView({ active, tournamentId, campusId, program }: Props) {
  const [data, setData] = useState<CompetitionRosterLiveViewData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async (signal?: AbortSignal) => {
    if (!active || !tournamentId || !program) return;
    const query = new URLSearchParams({ tournament: tournamentId, campus: campusId, program });
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/sports-signups/teams?${query.toString()}`, {
        cache: "no-store",
        signal,
      });
      if (!response.ok) throw new Error("No se pudieron cargar los equipos.");
      setData(await response.json() as CompetitionRosterLiveViewData);
    } catch (nextError) {
      if (signal?.aborted) return;
      setError(nextError instanceof Error ? nextError.message : "No se pudieron cargar los equipos.");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [active, tournamentId, campusId, program]);

  useEffect(() => {
    if (!active || !tournamentId || !program) return;
    const controller = new AbortController();
    void loadData(controller.signal);

    return () => controller.abort();
  }, [active, tournamentId, program, loadData]);

  if (!active) return null;
  if (!program) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-8 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-950/40 dark:text-slate-300">
        Selecciona Futbol Para Todos, Selectivos o Little Dragons para ver sus equipos.
      </div>
    );
  }
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

      {data.squads.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-8 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-950/40 dark:text-slate-300">
          Los equipos se crearán automáticamente cuando existan inscripciones confirmadas en este programa.
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
          {[...data.squads]
            .sort((left, right) => {
              const yearDifference = getSquadBirthYear(right) - getSquadBirthYear(left);
              return yearDifference || left.name.localeCompare(right.name, "es-MX");
            })
            .map((squad) => {
              const display = formatCompetitionSquadDisplay({
                name: squad.name,
                program: data.program,
                categoryLabel: squad.categoryLabel,
                kind: squad.kind,
              });
              return (
            <article key={squad.id} className="overflow-hidden rounded-md border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-950">
              <header className="border-b border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800/70">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-slate-950 dark:text-slate-50">
                      {display.title}
                    </h3>
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
                {squad.members.map((member, index) => (
                  <div key={`${squad.id}-${member.enrollmentId}`} className="grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-2 px-4 py-2 text-sm">
                    <span className="text-xs text-slate-400">{index + 1}</span>
                    <span className="font-medium text-slate-900 dark:text-slate-100">{member.playerName}</span>
                    <span className="text-xs text-slate-500">{member.birthYear ?? "-"}</span>
                  </div>
                ))}
              </div>
            </article>
              );
            })}
        </div>
      )}

      {data.canManage ? (
        <CompetitionRosterLiveControls data={data} onChanged={() => loadData()} />
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
