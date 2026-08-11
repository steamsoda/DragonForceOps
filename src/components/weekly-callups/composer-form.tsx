"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  createWeeklyCallupComposerAction,
  type WeeklyCallupComposerState,
} from "@/server/actions/weekly-callups";

type ComposerSquad = {
  id: string;
  trainingGroupId: string;
  squadId: string;
  fixedTournamentId: string;
  name: string;
  categoryLabel: string;
  sourceGroupNames: string[];
  primaryCoachName: string;
};

type ComposerTournament = { id: string; name: string };

type CoachScheduleDefault = {
  tournamentId: string;
  isRest: boolean;
  notes: string;
  coachName: string;
  games: Array<{ id: string; matchDate: string; arrivalTime: string; venue: string; opponent: string }>;
};

function isMonday(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.getUTCDay() === 1;
}

export function WeeklyCallupComposerForm({
  campusId,
  program,
  currentWeekStart,
  groups,
  tournaments,
  coachScheduleDefaults = {},
}: {
  campusId: string;
  program: "selectivo" | "futbol_para_todos";
  currentWeekStart: string;
  groups: ComposerSquad[];
  tournaments: ComposerTournament[];
  coachScheduleDefaults?: Record<string, CoachScheduleDefault>;
}) {
  const router = useRouter();
  const [weekStart, setWeekStart] = useState(currentWeekStart);
  const [state, action, pending] = useActionState(createWeeklyCallupComposerAction, null);
  const alertRef = useRef<HTMLDivElement>(null);
  const missing = groups.filter((group) => !coachScheduleDefaults[group.id]);
  const complete = groups.length > 0 && missing.length === 0;

  useEffect(() => {
    if (state) alertRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [state]);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="campusId" value={campusId} />
      <input type="hidden" name="program" value={program} />
      {groups.map((group) => <input key={group.id} type="hidden" name="squadId" value={group.squadId} />)}

      {state ? (
        <div ref={alertRef} role="alert" aria-live="polite" className="rounded-md border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          <p className="font-semibold">No se pudo preparar la convocatoria.</p>
          <p className="mt-1">{state.message}</p>
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
              const nextWeek = event.target.value;
              setWeekStart(nextWeek);
              if (isMonday(nextWeek)) {
                router.replace(`/convocatorias?campus=${encodeURIComponent(campusId)}&program=${encodeURIComponent(program)}&week=${encodeURIComponent(nextWeek)}`);
              }
            }}
            required
            className="min-h-10 rounded-md border border-slate-300 bg-white px-3 dark:border-slate-600 dark:bg-slate-950"
          />
        </label>
        <div className={`rounded-full border px-3 py-2 text-sm font-semibold ${complete ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-rose-300 bg-rose-50 text-rose-700"}`}>
          {complete ? `${groups.length}/${groups.length} equipos listos` : `${missing.length} ${missing.length === 1 ? "equipo pendiente" : "equipos pendientes"}`}
        </div>
      </div>

      <div className="divide-y divide-slate-200 overflow-hidden rounded-md border border-slate-200">
        {groups.map((group) => {
          const report = coachScheduleDefaults[group.id];
          const tournamentName = tournaments.find((option) => option.id === group.fixedTournamentId)?.name ?? "Torneo asignado";
          return (
            <article key={group.id} className={`grid gap-3 px-4 py-3 md:grid-cols-[minmax(220px,1.2fr)_minmax(180px,0.8fr)_minmax(260px,1.3fr)] ${report ? "bg-white" : "bg-rose-50"}`}>
              <div>
                <h3 className="font-semibold text-portoBlue">{group.name}</h3>
                <p className="text-xs text-slate-500">Cat. {group.categoryLabel}</p>
                {group.sourceGroupNames.length > 1 ? <p className="text-xs text-slate-500">Origen: {group.sourceGroupNames.join(", ")}</p> : null}
              </div>
              <div>
                <p className="text-sm font-medium">{group.primaryCoachName}</p>
                <p className="text-xs text-slate-500">{tournamentName}</p>
              </div>
              <div>
                {report ? (
                  <>
                    <span className="inline-flex rounded-full border border-emerald-300 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">Listo</span>
                    <p className="mt-1 text-sm font-medium">{report.isRest ? "Descansa esta semana" : `${report.games.length} ${report.games.length === 1 ? "partido reportado" : "partidos reportados"}`}</p>
                    <p className="text-xs text-slate-500">Reportado por {report.coachName}</p>
                  </>
                ) : (
                  <>
                    <span className="inline-flex rounded-full border border-rose-300 bg-white px-2 py-1 text-xs font-semibold text-rose-700">Pendiente</span>
                    <p className="mt-1 text-sm text-rose-700">Falta reportar partido o marcar Descansa.</p>
                  </>
                )}
              </div>
            </article>
          );
        })}
        {groups.length === 0 ? <p className="p-6 text-center text-sm text-slate-500">No hay equipos activos para esta seleccion.</p> : null}
      </div>

      {!complete && groups.length > 0 ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          La convocatoria se habilita cuando todos los equipos visibles tienen partidos reportados o descanso confirmado.
        </p>
      ) : null}

      <div className="flex justify-end">
        <button disabled={!complete || pending} className="min-h-11 rounded-md bg-portoBlue px-5 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">
          {pending ? "Congelando convocatoria..." : "Preparar convocatoria"}
        </button>
      </div>
    </form>
  );
}
