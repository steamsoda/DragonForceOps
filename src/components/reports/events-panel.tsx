"use client";

import { useState, useTransition } from "react";
import {
  createAcademyEventAction,
  toggleEventDoneAction,
  deleteAcademyEventAction,
  type AcademyEvent
} from "@/server/actions/events";

type Campus = { id: string; name: string };

type Props = {
  events: AcademyEvent[];
  month: string; // "YYYY-MM"
  campuses: Campus[];
};

function fmtDate(d: string) {
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

function fmtCost(n: number) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(n);
}

export function EventsPanel({ events, month, campuses }: Props) {
  const [showForm, setShowForm] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleCreate(formData: FormData) {
    startTransition(async () => {
      await createAcademyEventAction(month, formData);
      setShowForm(false);
    });
  }

  function handleToggle(event: AcademyEvent) {
    startTransition(async () => {
      await toggleEventDoneAction(event.id, !event.isDone, event.actualDate);
    });
  }

  function handleDelete(eventId: string) {
    if (!confirm("¿Eliminar este evento?")) return;
    startTransition(async () => {
      await deleteAcademyEventAction(eventId);
    });
  }

  return (
    <div className="space-y-4">

      {/* Event list */}
      {events.length === 0 && !showForm && (
        <p className="text-sm text-slate-400">Sin eventos registrados para este mes.</p>
      )}

      {events.length > 0 && (
        <div className="rounded-md border border-slate-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2 text-left">Evento</th>
                <th className="px-3 py-2 text-left">Fecha propuesta</th>
                <th className="px-3 py-2 text-left">Fecha realización</th>
                <th className="px-3 py-2 text-right">Participantes</th>
                <th className="px-3 py-2 text-right">Costo</th>
                <th className="px-3 py-2 text-center">Estado</th>
                <th className="px-3 py-2 text-center">Eval.</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {events.map((ev) => (
                <tr key={ev.id} className={ev.isDone ? "bg-emerald-50/40" : ""}>
                  <td className="px-3 py-2">
                    <p className="font-medium text-slate-800">{ev.title}</p>
                    {ev.description && (
                      <p className="text-xs text-slate-400 mt-0.5">{ev.description}</p>
                    )}
                    {ev.notes && (
                      <p className="text-xs text-slate-400 italic mt-0.5">{ev.notes}</p>
                    )}
                  </td>
                  <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{fmtDate(ev.proposedDate)}</td>
                  <td className="px-3 py-2 text-slate-600 whitespace-nowrap">
                    {ev.actualDate ? fmtDate(ev.actualDate) : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-3 py-2 text-right text-slate-700">
                    {ev.participantCount ?? <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-3 py-2 text-right text-slate-700">
                    {ev.cost != null ? fmtCost(ev.cost) : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <button
                      onClick={() => handleToggle(ev)}
                      disabled={isPending}
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        ev.isDone
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-amber-100 text-amber-700"
                      }`}
                    >
                      {ev.isDone ? "Realizado" : "Pendiente"}
                    </button>
                  </td>
                  <td className="px-3 py-2 text-center text-slate-600">
                    {ev.evaluation != null ? `${ev.evaluation}/5` : <span className="text-slate-300">—</span>}
                    {ev.satisfactionAvg != null && (
                      <span className="block text-xs text-slate-400">enc: {ev.satisfactionAvg}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      onClick={() => handleDelete(ev.id)}
                      disabled={isPending}
                      className="text-xs text-rose-400 hover:text-rose-600"
                    >
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add form */}
      {showForm ? (
        <form
          action={handleCreate}
          className="rounded-md border border-slate-200 bg-white p-4 space-y-3"
        >
          <p className="text-sm font-medium text-slate-700">Nuevo evento</p>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="block text-xs text-slate-500 mb-1">Nombre del evento *</label>
              <input
                name="title"
                required
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                placeholder="Ej. Open Day, Road Show…"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs text-slate-500 mb-1">Descripción</label>
              <input
                name="description"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                placeholder="Descripción breve del evento"
              />
            </div>

            <div>
              <label className="block text-xs text-slate-500 mb-1">Fecha propuesta *</label>
              <input
                type="date"
                name="proposed_date"
                required
                defaultValue={`${month}-01`}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs text-slate-500 mb-1">Fecha de realización</label>
              <input
                type="date"
                name="actual_date"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs text-slate-500 mb-1">Estado</label>
              <select name="is_done" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
                <option value="false">Pendiente</option>
                <option value="true">Realizado</option>
              </select>
            </div>

            <div>
              <label className="block text-xs text-slate-500 mb-1">Campus</label>
              <select name="campus_id" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
                <option value="">Ambos campus</option>
                {campuses.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs text-slate-500 mb-1">Importe a cobrar (MXN)</label>
              <input
                type="number"
                name="cost"
                min="0"
                step="0.01"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                placeholder="Opcional"
              />
            </div>

            <div>
              <label className="block text-xs text-slate-500 mb-1">Nº de participantes</label>
              <input
                type="number"
                name="participant_count"
                min="0"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                placeholder="Opcional"
              />
            </div>

            <div>
              <label className="block text-xs text-slate-500 mb-1">Evaluación (1–5)</label>
              <select name="evaluation" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
                <option value="">—</option>
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs text-slate-500 mb-1">Media encuesta satisfacción</label>
              <input
                type="number"
                name="satisfaction_avg"
                min="1"
                max="5"
                step="0.1"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                placeholder="Ej. 4.2"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs text-slate-500 mb-1">Notas adicionales</label>
              <input
                name="notes"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                placeholder="Opcional"
              />
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={isPending}
              className="rounded-md bg-portoBlue px-4 py-2 text-sm font-medium text-white hover:bg-portoDark disabled:opacity-50"
            >
              {isPending ? "Guardando…" : "Guardar evento"}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded-md border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50"
            >
              Cancelar
            </button>
          </div>
        </form>
      ) : (
        <button
          onClick={() => setShowForm(true)}
          className="rounded-md border border-dashed border-slate-300 px-4 py-2 text-sm text-slate-500 hover:border-portoBlue hover:text-portoBlue"
        >
          + Agregar evento
        </button>
      )}
    </div>
  );
}
