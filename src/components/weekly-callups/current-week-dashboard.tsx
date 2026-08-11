"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { downloadWeeklyCallupPng } from "@/components/weekly-callups/png-export-button";
import type {
  WeeklyCallupListRow,
  WeeklyCallupsFoundationData,
  WeeklyCallupProgram,
} from "@/lib/queries/weekly-callups";
import type { WeeklyCallupPngData } from "@/lib/weekly-callups/png-layout";
import {
  createWeeklyCallupComposerAction,
  type WeeklyCallupComposerState,
} from "@/server/actions/weekly-callups";

type Props = {
  data: WeeklyCallupsFoundationData;
  selectedCampusId: string;
  selectedProgram: WeeklyCallupProgram;
  canManageSchedules: boolean;
};

const PROGRAMS: Array<{ value: WeeklyCallupProgram; label: string }> = [
  { value: "selectivo", label: "Selectivos" },
  { value: "futbol_para_todos", label: "Futbol Para Todos" },
];

function weekDetails(weekStart: string) {
  const start = new Date(`${weekStart}T12:00:00Z`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  const thursday = new Date(start);
  thursday.setUTCDate(thursday.getUTCDate() + 3);
  const yearStart = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1));
  const weekNumber = Math.ceil((((thursday.getTime() - yearStart.getTime()) / 86_400_000) + 1) / 7);
  const formatter = new Intl.DateTimeFormat("es-MX", { timeZone: "UTC", day: "numeric", month: "short" });
  return { weekNumber, range: `${formatter.format(start)} - ${formatter.format(end)}` };
}

function updatedLabel(value: string | undefined) {
  if (!value) return "Sin reporte";
  return new Intl.DateTimeFormat("es-MX", {
    timeZone: "America/Monterrey",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function DirectPngButton({ callupId }: { callupId: string }) {
  const [state, setState] = useState<"idle" | "working" | "error">("idle");

  async function download() {
    setState("working");
    try {
      const response = await fetch(`/api/weekly-callups/${encodeURIComponent(callupId)}/png-data`, {
        cache: "no-store",
      });
      if (!response.ok) throw new Error("weekly_callup_png_data_failed");
      await downloadWeeklyCallupPng(await response.json() as WeeklyCallupPngData);
      setState("idle");
    } catch (error) {
      console.error("direct weekly callup PNG export failed", error);
      setState("error");
    }
  }

  return (
    <button
      type="button"
      onClick={() => void download()}
      disabled={state === "working"}
      className="min-h-9 rounded-md bg-emerald-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
    >
      {state === "working" ? "Generando..." : state === "error" ? "Reintentar PNG" : "Descargar PNG"}
    </button>
  );
}

function CurrentWeekCard({
  campus,
  program,
  groups,
  reports,
  callup,
  weekStart,
  selected,
  onSelect,
  canManageSchedules,
}: {
  campus: { id: string; name: string };
  program: { value: WeeklyCallupProgram; label: string };
  groups: WeeklyCallupsFoundationData["scheduleUnits"];
  reports: WeeklyCallupsFoundationData["coachScheduleDefaults"];
  callup: WeeklyCallupListRow | undefined;
  weekStart: string;
  selected: boolean;
  onSelect: () => void;
  canManageSchedules: boolean;
}) {
  const [state, action, pending] = useActionState<WeeklyCallupComposerState, FormData>(
    createWeeklyCallupComposerAction,
    null,
  );
  const reported = groups.filter((group) => Boolean(reports[group.id])).length;
  const pendingCount = groups.length - reported;
  const complete = groups.length > 0 && pendingCount === 0;
  const detailHref = `/convocatorias?campus=${encodeURIComponent(campus.id)}&program=${program.value}&week=${weekStart}&detail=horarios#detalle-horarios`;

  return (
    <article className={`rounded-md border transition-colors ${selected ? "border-portoBlue bg-blue-50" : "border-slate-200 bg-white hover:border-slate-400"}`}>
      <button type="button" onClick={onSelect} className="w-full p-3 text-left">
        <div className="flex items-start justify-between gap-2">
          <div><p className="font-semibold">{campus.name}</p><p className="text-xs text-slate-500">{program.label}</p></div>
          <span className={`h-3 w-3 rounded-full ${complete ? "bg-emerald-500" : "bg-rose-500"}`} aria-label={complete ? "Completo" : "Pendiente"} />
        </div>
        <div className="mt-3 flex items-end justify-between gap-2">
          <p className="text-2xl font-semibold">{reported}<span className="text-sm font-normal text-slate-500">/{groups.length}</span></p>
          <p className={`text-xs font-semibold ${pendingCount ? "text-rose-700" : "text-emerald-700"}`}>
            {groups.length === 0 ? "Sin equipos" : pendingCount ? `${pendingCount} pendientes` : "Reportes completos"}
          </p>
        </div>
      </button>

      <div className="border-t border-slate-200 p-2">
        {callup ? (
          <div className="grid grid-cols-2 gap-2">
            <DirectPngButton callupId={callup.id} />
            {canManageSchedules ? <Link href={detailHref} className="min-h-9 rounded-md border border-portoBlue px-3 py-2 text-center text-xs font-semibold text-portoBlue">
              Ver detalle
            </Link> : <Link href={`/convocatorias/${callup.id}`} className="min-h-9 rounded-md border border-portoBlue px-3 py-2 text-center text-xs font-semibold text-portoBlue">Abrir convocatoria</Link>}
          </div>
        ) : complete ? (
          <div className={`grid gap-2 ${canManageSchedules ? "grid-cols-2" : ""}`}>
          <form action={action} className="space-y-2">
            <input type="hidden" name="campusId" value={campus.id} />
            <input type="hidden" name="program" value={program.value} />
            <input type="hidden" name="weekStart" value={weekStart} />
            {groups.map((group) => <input key={group.squadId} type="hidden" name="squadId" value={group.squadId} />)}
            <button type="submit" disabled={pending} className="min-h-9 w-full rounded-md bg-portoBlue px-3 py-2 text-xs font-semibold text-white disabled:opacity-60">
              {pending ? "Preparando..." : "Preparar convocatoria"}
            </button>
            {state ? <p role="alert" className="text-xs font-medium text-rose-700">{state.message}</p> : null}
          </form>
          {canManageSchedules ? <Link href={detailHref} className="min-h-9 rounded-md border border-portoBlue px-3 py-2 text-center text-xs font-semibold text-portoBlue">Ver detalle</Link> : null}
          </div>
        ) : (
          <div className="grid gap-2">
            <p className="min-h-9 rounded-md bg-slate-100 px-3 py-2 text-center text-xs font-semibold text-slate-500">{groups.length === 0 ? "Sin equipos configurados" : "Faltan reportes"}</p>
            {canManageSchedules && groups.length ? <Link href={detailHref} className="min-h-9 rounded-md border border-portoBlue px-3 py-2 text-center text-xs font-semibold text-portoBlue">Ver detalle</Link> : null}
          </div>
        )}
      </div>
    </article>
  );
}

export function CurrentWeekDashboard({ data, selectedCampusId, selectedProgram, canManageSchedules }: Props) {
  const [selection, setSelection] = useState({ campusId: selectedCampusId, program: selectedProgram });
  const week = weekDetails(data.currentWeekStart);
  const tournamentById = new Map(data.tournaments.map((tournament) => [tournament.id, tournament.name]));
  const currentCallups = data.callups.filter((callup) => callup.weekStart === data.currentWeekStart);

  function select(campusId: string, program: WeeklyCallupProgram) {
    setSelection({ campusId, program });
    const query = new URLSearchParams(window.location.search);
    query.set("campus", campusId);
    query.set("program", program);
    query.set("week", data.currentWeekStart);
    window.history.replaceState(null, "", `/convocatorias?${query.toString()}`);
  }

  const rows = data.scheduleUnits
    .filter((group) => group.campusId === selection.campusId && group.program === selection.program)
    .map((group) => {
      const report = data.coachScheduleDefaults[group.id];
      return {
        ...group,
        report,
        campusName: data.campuses.find((campus) => campus.id === group.campusId)?.name ?? "Campus",
        tournamentName: tournamentById.get(report?.tournamentId ?? group.fixedTournamentId) ?? "Torneo",
      };
    })
    .sort((a, b) => {
      const reportOrder = Number(Boolean(a.report)) - Number(Boolean(b.report));
      if (reportOrder !== 0) return reportOrder;
      return b.categoryLabel.localeCompare(a.categoryLabel, "es", { numeric: true })
        || a.name.localeCompare(b.name, "es");
    });

  return (
    <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase text-portoBlue">Control de esta semana</p>
          <h2 className="text-xl font-semibold">Semana {week.weekNumber} <span className="font-normal text-slate-500">| {week.range}</span></h2>
          <p className="text-sm text-slate-500">Selecciona una tarjeta para revisar sus equipos. Rojo requiere seguimiento; verde confirma reporte o descanso.</p>
        </div>
        <span className="rounded-full border border-slate-300 px-3 py-1 text-xs font-medium">Actualiza automaticamente</span>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {data.campuses.flatMap((campus) => PROGRAMS.map((program) => {
          const groups = data.scheduleUnits.filter((group) => group.campusId === campus.id && group.program === program.value);
          const callup = currentCallups.find((row) => row.campusId === campus.id && row.program === program.value);
          return (
            <CurrentWeekCard
              key={`${campus.id}:${program.value}`}
              campus={campus}
              program={program}
              groups={groups}
              reports={data.coachScheduleDefaults}
              callup={callup}
              weekStart={data.currentWeekStart}
              selected={campus.id === selection.campusId && program.value === selection.program}
              onSelect={() => select(campus.id, program.value)}
              canManageSchedules={canManageSchedules}
            />
          );
        }))}
      </div>

      <div className="overflow-x-auto rounded-md border border-slate-200">
        <table className="min-w-[960px] w-full border-collapse text-sm">
          <thead className="bg-slate-100 text-left text-xs uppercase text-slate-600">
            <tr><th className="px-3 py-2">Estado</th><th className="px-3 py-2">Profesor</th><th className="px-3 py-2">Equipo</th><th className="px-3 py-2">Campus / programa</th><th className="px-3 py-2">Torneo</th><th className="px-3 py-2 text-center">Partidos</th><th className="px-3 py-2">Ultima actualizacion</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {rows.map((row) => (
              <tr key={row.id} className={row.report ? "bg-emerald-50/40" : "bg-rose-50/60"}>
                <td className="px-3 py-2"><span className={`inline-flex items-center gap-2 rounded-full border px-2 py-1 text-xs font-semibold ${row.report ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-rose-300 bg-rose-50 text-rose-800"}`}><span className={`h-2 w-2 rounded-full ${row.report ? "bg-emerald-500" : "bg-rose-500"}`} />{row.report ? (row.report.isRest ? "Descanso" : "Reportado") : "Pendiente"}</span></td>
                <td className="px-3 py-2"><span className="font-medium">{row.primaryCoachName}</span>{row.auxiliaryCoachNames.length ? <span className="block text-xs text-slate-500">Aux. {row.auxiliaryCoachNames.join(", ")}</span> : null}{row.report && row.report.coachName !== row.primaryCoachName ? <span className="block text-xs text-slate-500">Reporto: {row.report.coachName}</span> : null}</td>
                <td className="px-3 py-2"><span className="font-medium text-portoBlue">{row.name}</span><span className="block text-xs text-slate-500">Cat. {row.categoryLabel}</span></td>
                <td className="px-3 py-2">{row.campusName}<span className="block text-xs text-slate-500">{PROGRAMS.find((program) => program.value === row.program)?.label}</span></td>
                <td className="px-3 py-2">{row.report?.isRest ? "Descanso" : row.tournamentName}</td>
                <td className="px-3 py-2 text-center font-semibold">{row.report?.games.length ?? 0}</td>
                <td className="px-3 py-2 text-xs text-slate-600">{updatedLabel(row.report?.updatedAt)}</td>
              </tr>
            ))}
            {rows.length === 0 ? <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-slate-500">No hay equipos activos para esta seleccion.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
