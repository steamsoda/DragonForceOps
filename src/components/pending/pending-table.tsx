"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { updateContactadoAction } from "@/server/actions/enrollments";

export type PendingRow = {
  enrollmentId: string;
  playerId: string;
  playerName: string;
  campusName: string;
  campusCode: string;
  teamName: string;
  primaryPhone: string | null;
  balance: number;
  dueDate: string | null;
  overdueDays: number;
  contactadoAt: string | null;
  contactNotes: string | null;
};

type PendingTableProps = {
  rows: PendingRow[];
};

function formatMoney(value: number) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(value);
}

function formatDate(value: string | null) {
  if (!value) return "-";
  const [y, m, d] = value.split("-");
  return d ? `${d}/${m}/${y}` : value;
}

function ContactCell({ enrollmentId, initialContacted, initialNotes }: {
  enrollmentId: string;
  initialContacted: boolean;
  initialNotes: string | null;
}) {
  const [contacted, setContacted] = useState(initialContacted);
  const [notes, setNotes] = useState(initialNotes ?? "");
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    setSaved(false);
    startTransition(async () => {
      const result = await updateContactadoAction(enrollmentId, contacted, notes);
      if (result.ok) setSaved(true);
    });
  }

  return (
    <div className="space-y-1.5 min-w-[180px]">
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={contacted}
          onChange={(e) => { setContacted(e.target.checked); setSaved(false); }}
          className="h-4 w-4 rounded border-slate-300 text-portoBlue focus:ring-portoBlue"
        />
        <span className="text-xs font-medium text-slate-700 dark:text-slate-300">Contactado</span>
      </label>
      {contacted && (
        <textarea
          value={notes}
          onChange={(e) => { setNotes(e.target.value); setSaved(false); }}
          placeholder="Notas de la llamada…"
          rows={2}
          className="w-full rounded border border-slate-300 dark:border-slate-600 px-2 py-1 text-xs bg-white dark:bg-slate-800 resize-none"
        />
      )}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={isPending}
          className="rounded bg-portoBlue px-2.5 py-1 text-xs font-medium text-white hover:bg-portoDark disabled:opacity-50"
        >
          {isPending ? "…" : "Guardar"}
        </button>
        {saved && <span className="text-xs text-emerald-600">✓</span>}
      </div>
    </div>
  );
}

export function PendingTable({ rows }: PendingTableProps) {
  return (
    <div className="overflow-x-auto rounded-md border border-slate-200 dark:border-slate-700">
      <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700 text-sm">
        <thead className="bg-slate-50 dark:bg-slate-800 text-left text-xs uppercase tracking-wide text-slate-600 dark:text-slate-400">
          <tr>
            <th className="px-3 py-2">Jugador</th>
            <th className="px-3 py-2">Campus</th>
            <th className="px-3 py-2">Equipo</th>
            <th className="px-3 py-2">Telefono</th>
            <th className="px-3 py-2">Saldo</th>
            <th className="px-3 py-2">Vence</th>
            <th className="px-3 py-2">Dias vencidos</th>
            <th className="px-3 py-2">Contacto</th>
            <th className="px-3 py-2">Acciones</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {rows.length === 0 ? (
            <tr>
              <td className="px-3 py-4 text-slate-600 dark:text-slate-400" colSpan={9}>
                No hay inscripciones pendientes con los filtros actuales.
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={row.enrollmentId} className={row.contactadoAt ? "bg-emerald-50/40 dark:bg-emerald-950/20" : undefined}>
                <td className="px-3 py-2">
                  <Link href={`/players/${row.playerId}`} className="text-portoBlue hover:underline">
                    {row.playerName}
                  </Link>
                </td>
                <td className="px-3 py-2">
                  {row.campusName} ({row.campusCode})
                </td>
                <td className="px-3 py-2">{row.teamName}</td>
                <td className="px-3 py-2">{row.primaryPhone ?? "-"}</td>
                <td className="px-3 py-2 font-medium">{formatMoney(row.balance)}</td>
                <td className="px-3 py-2">{formatDate(row.dueDate)}</td>
                <td className="px-3 py-2">{row.overdueDays}</td>
                <td className="px-3 py-2">
                  <ContactCell
                    enrollmentId={row.enrollmentId}
                    initialContacted={row.contactadoAt !== null}
                    initialNotes={row.contactNotes}
                  />
                </td>
                <td className="px-3 py-2">
                  <div className="flex gap-3">
                    {row.primaryPhone ? (
                      <a href={`tel:${row.primaryPhone}`} className="text-portoBlue hover:underline">
                        Llamar
                      </a>
                    ) : (
                      <span className="text-slate-400">Sin telefono</span>
                    )}
                    <Link href={`/enrollments/${row.enrollmentId}/charges`} className="text-portoBlue hover:underline">
                      Abrir cuenta
                    </Link>
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
