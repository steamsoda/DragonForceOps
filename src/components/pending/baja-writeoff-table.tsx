"use client";

import { useState } from "react";
import Link from "next/link";
import { batchVoidBajaChargesAction } from "@/server/actions/billing";

type BajaRow = {
  enrollmentId: string;
  playerId: string;
  playerName: string;
  campusName: string;
  enrollmentStatus: "ended" | "cancelled";
  endDate: string | null;
  dropoutReason: string | null;
  pendingChargeCount: number;
  pendingTotal: number;
};

const DROPOUT_LABELS: Record<string, string> = {
  coach_capability: "Falta de capacidad del entrenador",
  exercise_difficulty: "Dificultad para realizar los ejercicios",
  financial: "Financiero",
  training_quality: "Falta de calidad en el entrenamiento",
  school_disorganization: "Desorganización de la escuela",
  facility_safety: "Falta de seguridad en instalaciones",
  transport: "Incompatibilidad de transportes",
  family_health: "Salud de familiares",
  player_health: "Salud del alumno",
  schedule_conflict: "Incompatibilidad de horarios",
  coach_communication: "Comunicación del entrenador",
  wants_competition: "Quiere pasar a competición",
  lack_of_information: "Falta de información",
  pedagogy: "Falta de pedagogía",
  moved_to_competition_club: "Cambio a club de competición",
  player_coach_relationship: "Relación alumno–entrenador",
  unattractive_exercises: "Ejercicios poco atractivos",
  moved_residence: "Cambio de residencia",
  school_performance_punishment: "Castigo por rendimiento escolar",
  home_behavior_punishment: "Castigo por comportamiento en casa",
  personal: "Motivos personales",
  distance: "Distancia / logística",
  parent_work: "Trabajo del padre o madre",
  injury: "Lesión",
  dislikes_football: "No le gusta el fútbol",
  lost_contact: "Sin contacto con los padres",
  low_peer_attendance: "Poca asistencia de compañeros",
  changed_sport: "Cambio de deporte",
  did_not_return: "Ya no regresó",
  temporary_leave: "Baja temporal — piensa regresar",
  moved_to_another_academy: "Cambio a otra academia",
  school_schedule_conflict: "Complicaciones horario escolar",
  coach_change: "Cambio de profe",
  cold_weather: "Clima frío",
  other: "Otros"
};

const fmt = (n: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(n);

export function BajaWriteoffTable({ rows }: { rows: BajaRow[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState(false);

  const allIds = rows.map((r) => r.enrollmentId);
  const allSelected = allIds.length > 0 && allIds.every((id) => selected.has(id));

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(allIds));
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const selectedRows = rows.filter((r) => selected.has(r.enrollmentId));
  const totalCharges = selectedRows.reduce((s, r) => s + r.pendingChargeCount, 0);
  const totalAmount = selectedRows.reduce((s, r) => s + r.pendingTotal, 0);

  if (rows.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-slate-300 dark:border-slate-600 p-6 text-center text-sm text-slate-400">
        No hay bajas con cargos pendientes.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {/* Table */}
      <div className="overflow-x-auto rounded-md border border-slate-200 dark:border-slate-700">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
              <th className="px-3 py-2 w-8">
                <input type="checkbox" checked={allSelected} onChange={toggleAll} className="cursor-pointer" />
              </th>
              <th className="px-3 py-2">Alumno</th>
              <th className="px-3 py-2">Campus</th>
              <th className="px-3 py-2">Estatus</th>
              <th className="px-3 py-2">Fecha baja</th>
              <th className="px-3 py-2">Motivo</th>
              <th className="px-3 py-2 text-right">Cargos</th>
              <th className="px-3 py-2 text-right">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {rows.map((row) => (
              <tr
                key={row.enrollmentId}
                className={`transition-colors ${selected.has(row.enrollmentId) ? "bg-red-50 dark:bg-red-950/20" : "hover:bg-slate-50 dark:hover:bg-slate-800/50"}`}
              >
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    checked={selected.has(row.enrollmentId)}
                    onChange={() => toggle(row.enrollmentId)}
                    className="cursor-pointer"
                  />
                </td>
                <td className="px-3 py-2 font-medium">
                  <Link href={`/players/${row.playerId}`} className="text-blue-600 hover:underline dark:text-blue-400">
                    {row.playerName}
                  </Link>
                </td>
                <td className="px-3 py-2 text-slate-600 dark:text-slate-400">{row.campusName}</td>
                <td className="px-3 py-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    row.enrollmentStatus === "ended"
                      ? "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300"
                      : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                  }`}>
                    {row.enrollmentStatus === "ended" ? "Baja" : "Cancelado"}
                  </span>
                </td>
                <td className="px-3 py-2 text-slate-600 dark:text-slate-400">
                  {row.endDate ?? "—"}
                </td>
                <td className="px-3 py-2 text-slate-600 dark:text-slate-400 max-w-[200px] truncate" title={row.dropoutReason ? (DROPOUT_LABELS[row.dropoutReason] ?? row.dropoutReason) : ""}>
                  {row.dropoutReason ? (DROPOUT_LABELS[row.dropoutReason] ?? row.dropoutReason) : <span className="text-slate-400">—</span>}
                </td>
                <td className="px-3 py-2 text-right text-slate-600 dark:text-slate-400">{row.pendingChargeCount}</td>
                <td className="px-3 py-2 text-right font-medium text-red-600 dark:text-red-400">{fmt(row.pendingTotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Write-off form */}
      {selected.size > 0 && (
        <form
          action={async (fd) => {
            setPending(true);
            await batchVoidBajaChargesAction(fd);
          }}
          className="rounded-lg border-2 border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/20 p-4 space-y-3"
        >
          {/* Pass selected enrollment IDs */}
          {[...selected].map((id) => (
            <input key={id} type="hidden" name="enrollment_ids" value={id} />
          ))}

          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-semibold text-red-800 dark:text-red-200">
                Anular cargos de {selected.size} {selected.size === 1 ? "baja" : "bajas"}
              </p>
              <p className="text-sm text-red-700 dark:text-red-300 mt-0.5">
                {totalCharges} {totalCharges === 1 ? "cargo" : "cargos"} · {fmt(totalAmount)} en total
              </p>
            </div>
          </div>

          <label className="block space-y-1 text-sm">
            <span className="font-medium text-red-800 dark:text-red-200">Motivo de anulación (requerido)</span>
            <textarea
              name="reason"
              required
              rows={2}
              placeholder="Ej: Baja confirmada — saldo incobrable"
              className="w-full rounded-md border border-red-300 dark:border-red-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
            />
          </label>

          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60 transition-colors"
          >
            {pending ? "Anulando…" : `Anular ${totalCharges} ${totalCharges === 1 ? "cargo" : "cargos"}`}
          </button>
        </form>
      )}
    </div>
  );
}
