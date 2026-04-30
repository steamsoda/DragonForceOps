"use client";

import { useMemo, useState } from "react";
import type { AttendanceRosterPlayer } from "@/lib/queries/attendance";
import { saveAttendanceSessionAction } from "@/server/actions/attendance";

const STATUS_META = {
  present: { label: "Presente", short: "P", className: "border-emerald-300 bg-emerald-50 text-emerald-800" },
  absent: { label: "Ausente", short: "A", className: "border-rose-300 bg-rose-50 text-rose-800" },
  injury: { label: "Lesion", short: "L", className: "border-sky-300 bg-sky-50 text-sky-800" },
  justified: { label: "Justificada", short: "J", className: "border-slate-300 bg-slate-50 text-slate-700" },
} as const;

type Status = keyof typeof STATUS_META;

function nextStatus(current: Status) {
  return current === "absent" ? "present" : "absent";
}

export function AttendanceRecorder({
  sessionId,
  roster,
  sessionNotes,
  disabled,
}: {
  sessionId: string;
  roster: AttendanceRosterPlayer[];
  sessionNotes: string | null;
  disabled: boolean;
}) {
  const initial = useMemo(
    () => Object.fromEntries(roster.map((player) => [player.enrollmentId, player.currentStatus])),
    [roster]
  );
  const [statuses, setStatuses] = useState<Record<string, Status>>(initial);

  const presentCount = Object.values(statuses).filter((status) => status !== "absent").length;

  return (
    <form action={saveAttendanceSessionAction.bind(null, sessionId)} className="space-y-4">
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900">
        <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
          {presentCount}/{roster.length} cuentan como asistencia
        </p>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Marca ausentes conforme recorres la lista. Guarda al final de la pagina.
        </p>
      </div>

      <div className="grid gap-3">
        {roster.map((player) => {
          const status = statuses[player.enrollmentId] ?? "present";
          const meta = STATUS_META[status];
          const isIncident = player.source === "incident";
          return (
            <div
              key={player.enrollmentId}
              className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900"
            >
              <input type="hidden" name={`status:${player.enrollmentId}`} value={status} />
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => setStatuses((current) => ({ ...current, [player.enrollmentId]: nextStatus(status) }))}
                  className={`flex min-h-16 flex-1 items-center justify-between rounded-lg border px-4 py-3 text-left transition ${meta.className} disabled:cursor-not-allowed disabled:opacity-70`}
                >
                  <span>
                    <span className="block text-base font-semibold">{player.playerName}</span>
                    <span className="block text-xs opacity-80">
                      Cat. {player.birthYear ?? "-"}{isIncident ? " | prellenado por incidente" : ""}
                    </span>
                  </span>
                  <span className="rounded-full border border-current px-3 py-1 text-sm font-bold">{meta.short}</span>
                </button>

                {isIncident ? (
                  <div className="flex gap-2">
                    {(["injury", "justified"] as Status[]).map((option) => (
                      <button
                        key={option}
                        type="button"
                        disabled={disabled}
                        onClick={() => setStatuses((current) => ({ ...current, [player.enrollmentId]: option }))}
                        className="rounded-md border border-slate-300 px-3 py-2 text-xs font-medium hover:bg-slate-50 disabled:opacity-60 dark:border-slate-600 dark:hover:bg-slate-800"
                      >
                        {STATUS_META[option].label}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
              {player.incidentNote ? (
                <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                  Incidente: {player.incidentNote}
                </p>
              ) : null}
              <label className="mt-3 block text-xs font-medium text-slate-500 dark:text-slate-400">
                Nota opcional
                <input
                  name={`note:${player.enrollmentId}`}
                  defaultValue={player.note ?? ""}
                  disabled={disabled}
                  className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
                  placeholder="Observacion breve"
                />
              </label>
            </div>
          );
        })}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <label className="block text-sm font-semibold text-slate-800 dark:text-slate-100">
          Notas generales de la sesion
          <textarea
            name="session_notes"
            defaultValue={sessionNotes ?? ""}
            disabled={disabled}
            rows={3}
            className="mt-2 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
            placeholder="Ej. Entrenamiento reducido por lluvia, trabajo fisico, observaciones generales."
          />
        </label>
      </div>

      <div className="sticky bottom-3 z-10 flex flex-col gap-2 rounded-xl border border-blue-200 bg-white/95 p-3 shadow-lg backdrop-blur dark:border-blue-900 dark:bg-slate-950/95 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
          Listo para guardar: {presentCount}/{roster.length} cuentan como asistencia
        </p>
        <button
          type="submit"
          disabled={disabled || roster.length === 0}
          className="rounded-md bg-portoBlue px-5 py-3 text-sm font-semibold text-white hover:bg-portoDark disabled:cursor-not-allowed disabled:opacity-50"
        >
          Guardar asistencia
        </button>
      </div>
    </form>
  );
}
