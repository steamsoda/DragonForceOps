"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { Player360PostingRow, PostingMode } from "@/lib/queries/360player-posting";
import { post360PlayerMonthlyBatchAction } from "@/server/actions/360player-posting";

function money(amount: number | null, currency = "MXN") {
  if (amount === null) return "-";
  return amount.toLocaleString("es-MX", { style: "currency", currency });
}

type PostingSelectionTableProps = {
  rows: Player360PostingRow[];
  campusId: string | null;
  campusName: string;
  month: string;
  periodLabel: string;
  mode: PostingMode;
  defaultPaidAt: string;
};

export function PostingSelectionTable({
  rows,
  campusId,
  campusName,
  month,
  periodLabel,
  mode,
  defaultPaidAt,
}: PostingSelectionTableProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmedPlayers, setConfirmedPlayers] = useState(false);
  const eligibleRows = rows.filter((row) => row.status === "eligible");
  const selectedRows = useMemo(
    () => eligibleRows.filter((row) => selectedIds.has(row.chargeId)),
    [eligibleRows, selectedIds]
  );
  const selectedTotal = selectedRows.reduce((sum, row) => sum + (row.selectedAmount ?? 0), 0);

  function toggleRow(row: Player360PostingRow) {
    if (row.status !== "eligible") return;
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(row.chargeId)) {
        next.delete(row.chargeId);
      } else {
        next.add(row.chargeId);
      }
      return next;
    });
  }

  function openConfirmation() {
    if (selectedRows.length === 0) return;
    setConfirmedPlayers(false);
    setConfirmOpen(true);
  }

  return (
    <form action={post360PlayerMonthlyBatchAction} className="space-y-4">
      <input type="hidden" name="campus" value={campusId ?? ""} />
      <input type="hidden" name="month" value={month} />
      <input type="hidden" name="mode" value={mode} />

      <section className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-100">
        <div className="grid gap-3 md:grid-cols-[1fr_220px_auto] md:items-end">
          <div>
            <p className="font-semibold">Registro de pagos 360Player</p>
            <p className="mt-1">
              {campusName} | {periodLabel} | {mode === "early" ? "pago temprano" : "pago tardio"}.
              Selecciona solo jugadores confirmados como pagados en 360Player.
            </p>
          </div>
          <label className="text-sm font-medium">
            Fecha real del pago
            <input
              name="paidAt"
              type="datetime-local"
              defaultValue={defaultPaidAt}
              className="mt-1 block w-full rounded-md border border-amber-300 bg-white px-3 py-2 text-sm text-slate-900"
            />
          </label>
          <button
            type="button"
            disabled={selectedRows.length === 0}
            onClick={openConfirmation}
            className="rounded-md bg-portoBlue px-4 py-2 text-sm font-semibold text-white hover:bg-portoDark disabled:cursor-not-allowed disabled:opacity-50"
          >
            Registrar pagos 360Player
          </button>
        </div>
        <p className="mt-3 text-xs">
          Seleccionados: {selectedRows.length} | Total a registrar: {money(selectedTotal)}
        </p>
      </section>

      <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
        <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-700">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-900">
            <tr>
              <th className="px-3 py-2">Sel</th>
              <th className="px-3 py-2">Jugador</th>
              <th className="px-3 py-2">Cargo actual</th>
              <th className="px-3 py-2">Temprano</th>
              <th className="px-3 py-2">Tardio</th>
              <th className="px-3 py-2">Accion</th>
              <th className="px-3 py-2">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {rows.map((row) => {
              const selected = selectedIds.has(row.chargeId);
              return (
                <tr
                  key={row.chargeId}
                  role={row.status === "eligible" ? "button" : undefined}
                  tabIndex={row.status === "eligible" ? 0 : undefined}
                  onClick={() => toggleRow(row)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      toggleRow(row);
                    }
                  }}
                  className={
                    row.status === "eligible"
                      ? selected
                        ? "cursor-pointer bg-blue-50 dark:bg-blue-950/20"
                        : "cursor-pointer bg-white hover:bg-slate-50 dark:bg-slate-950 dark:hover:bg-slate-900"
                      : "bg-slate-50 text-slate-500 dark:bg-slate-900/60"
                  }
                >
                  <td className="px-3 py-2 align-top">
                    <input
                      type="checkbox"
                      name="chargeId"
                      value={row.chargeId}
                      disabled={row.status !== "eligible"}
                      checked={selected}
                      onChange={() => toggleRow(row)}
                      onClick={(event) => event.stopPropagation()}
                      aria-label={`Seleccionar pago 360Player de ${row.playerName}`}
                    />
                  </td>
                  <td className="px-3 py-2 align-top">
                    <Link
                      href={`/players/${row.playerId}`}
                      onClick={(event) => event.stopPropagation()}
                      className="font-semibold text-portoBlue hover:underline"
                    >
                      {row.playerName}
                    </Link>
                    <p className="text-xs text-slate-500">
                      {row.publicPlayerId ?? "-"} | Cat. {row.birthYear ?? "-"} | {row.campusName}
                    </p>
                    {row.priorMonthlyPendingAmount > 0.009 ? (
                      <p className="mt-1 text-xs font-semibold text-rose-700">
                        Mensualidades anteriores pendientes: {money(row.priorMonthlyPendingAmount, row.currency)}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 align-top">
                    <p className="font-semibold">{money(row.chargeAmount, row.currency)}</p>
                    <p className="text-xs text-slate-500">Pendiente {money(row.pendingAmount, row.currency)}</p>
                  </td>
                  <td className="px-3 py-2 align-top">{money(row.earlyAmount, row.currency)}</td>
                  <td className="px-3 py-2 align-top">{money(row.lateAmount, row.currency)}</td>
                  <td className="max-w-xs px-3 py-2 align-top text-xs">{row.actionLabel}</td>
                  <td className="px-3 py-2 align-top">
                    {row.status === "eligible" ? (
                      <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800">
                        Pendiente de pago
                      </span>
                    ) : (
                      <span className="text-xs text-slate-500">{row.reason}</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-slate-500">
                  No hay mensualidades pendientes con estos filtros.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {confirmOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-xl rounded-lg border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-700 dark:bg-slate-950">
            <h2 className="text-lg font-semibold">Confirmar pagos 360Player</h2>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              Vas a registrar {selectedRows.length} pago(s) de 360Player por {money(selectedTotal)} para {campusName},
              {` ${periodLabel}`}, modo {mode === "early" ? "temprano" : "tardio"}.
            </p>
            <div className="mt-4 max-h-48 overflow-y-auto rounded-md border border-slate-200 dark:border-slate-700">
              {selectedRows.map((row) => (
                <div key={row.chargeId} className="flex items-center justify-between border-b border-slate-100 px-3 py-2 text-sm last:border-b-0 dark:border-slate-800">
                  <span>{row.playerName}</span>
                  <span className="font-semibold">{money(row.selectedAmount, row.currency)}</span>
                </div>
              ))}
            </div>
            <label className="mt-4 flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={confirmedPlayers}
                onChange={(event) => setConfirmedPlayers(event.target.checked)}
                className="mt-1"
              />
              <span>Jugadores confirmados en 360Player.</span>
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-900"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={!confirmedPlayers}
                className="rounded-md bg-portoBlue px-4 py-2 text-sm font-semibold text-white hover:bg-portoDark disabled:cursor-not-allowed disabled:opacity-50"
              >
                Marcar como pagados
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </form>
  );
}
