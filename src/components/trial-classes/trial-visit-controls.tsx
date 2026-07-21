"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { printTrialClassTicket, type TrialClassTicketData } from "@/lib/printer";
import { recordTrialVisitAction } from "@/server/actions/trial-classes";
import type { TrialSession } from "@/lib/queries/trial-classes";

const ERROR_LABELS = {
  debug_read_only: "El modo debug es solo lectura.",
  unauthorized: "No tienes permiso para registrar esta llegada.",
  invalid_session: "La sesion ya no esta disponible para hoy.",
  limit_reached: "Ya se registraron las tres clases de prueba.",
  save_failed: "No se pudo registrar la llegada.",
};

export function TrialCheckInControl({
  prospectId,
  preferredTrainingGroupId,
  sessions,
  visitCount,
  printerName,
}: {
  prospectId: string;
  preferredTrainingGroupId: string;
  sessions: TrialSession[];
  visitCount: number;
  printerName: string;
}) {
  const matchingSession = sessions.find((session) => session.trainingGroupId === preferredTrainingGroupId);
  const [sessionId, setSessionId] = useState(matchingSession?.id ?? sessions[0]?.id ?? "");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  if (visitCount >= 3) {
    return <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800">3/3 clases completadas</p>;
  }
  if (sessions.length === 0) {
    return <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">No hay sesiones generadas para hoy en este campus.</p>;
  }

  function checkIn() {
    if (!sessionId) return;
    setMessage(null);
    startTransition(async () => {
      const result = await recordTrialVisitAction({ prospectId, attendanceSessionId: sessionId, note });
      if (!result.ok) {
        setMessage(ERROR_LABELS[result.error]);
        return;
      }
      try {
        await printTrialClassTicket(printerName, result.ticket);
        setMessage(result.duplicate ? "La llegada ya existia. Se reimprimio el pase." : "Llegada guardada y pase impreso.");
        setNote("");
      } catch {
        setMessage("La llegada quedo guardada, pero no se pudo imprimir. Usa Reimprimir pase.");
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-2 rounded-lg border border-blue-200 bg-blue-50/60 p-3 dark:border-blue-900 dark:bg-blue-950/20">
      <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
        Sesion de hoy
        <select value={sessionId} onChange={(event) => setSessionId(event.target.value)} className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900">
          {sessions.map((session) => (
            <option key={session.id} value={session.id}>{session.startTime} - {session.endTime} | {session.groupName}</option>
          ))}
        </select>
      </label>
      <input value={note} onChange={(event) => setNote(event.target.value)} maxLength={2000} placeholder="Nota de esta visita (opcional)" className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900" />
      <button type="button" onClick={checkIn} disabled={isPending || !sessionId} className="w-full rounded-md bg-portoBlue px-4 py-2 text-sm font-semibold text-white hover:bg-portoDark disabled:cursor-wait disabled:opacity-60">
        {isPending ? "Guardando llegada..." : `Registrar llegada ${visitCount + 1}/3 e imprimir`}
      </button>
      {message ? <p className="text-xs font-medium text-slate-700 dark:text-slate-200">{message}</p> : null}
    </div>
  );
}

export function TrialTicketReprintButton({ printerName, ticket }: { printerName: string; ticket: TrialClassTicketData }) {
  const [isPending, setIsPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  async function reprint() {
    setIsPending(true);
    setMessage(null);
    try {
      await printTrialClassTicket(printerName, ticket);
      setMessage("Pase reimpreso.");
    } catch {
      setMessage("No se pudo imprimir el pase.");
    } finally {
      setIsPending(false);
    }
  }
  return (
    <span className="inline-flex items-center gap-2">
      <button type="button" onClick={reprint} disabled={isPending} className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium hover:border-portoBlue disabled:opacity-60">
        {isPending ? "Imprimiendo..." : "Reimprimir pase"}
      </button>
      {message ? <span className="text-xs text-slate-500">{message}</span> : null}
    </span>
  );
}
