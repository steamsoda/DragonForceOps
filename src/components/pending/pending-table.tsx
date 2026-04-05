"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { updatePendingFollowUpAction } from "@/server/actions/enrollments";
import type { PendingFollowUpStatus } from "@/lib/queries/enrollments";

export type PendingRow = {
  enrollmentId: string;
  playerId: string;
  playerName: string;
  birthYear: number | null;
  campusName: string;
  campusCode: string;
  teamName: string;
  primaryPhone: string | null;
  balance: number;
  dueDate: string | null;
  overdueDays: number;
  followUpStatus: PendingFollowUpStatus;
  followUpAt: string | null;
  followUpNote: string | null;
  promiseDate: string | null;
};

type PendingTableProps = {
  rows: PendingRow[];
};

const STATUS_OPTIONS: Array<{ value: PendingFollowUpStatus; label: string }> = [
  { value: "uncontacted", label: "No contactado" },
  { value: "no_answer", label: "No contesta" },
  { value: "contacted", label: "Contactado" },
  { value: "promise_to_pay", label: "Promesa de pago" },
  { value: "will_not_return", label: "No regresara" },
];

const STATUS_LABELS: Record<PendingFollowUpStatus, string> = {
  uncontacted: "No contactado",
  no_answer: "No contesta",
  contacted: "Contactado",
  promise_to_pay: "Promesa de pago",
  will_not_return: "No regresara",
};

const STATUS_STYLES: Record<PendingFollowUpStatus, string> = {
  uncontacted: "border-slate-200 bg-white dark:bg-slate-900",
  no_answer: "border-amber-200 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-950/20",
  contacted: "border-blue-200 bg-blue-50/40 dark:border-blue-800 dark:bg-blue-950/20",
  promise_to_pay: "border-emerald-200 bg-emerald-50/40 dark:border-emerald-800 dark:bg-emerald-950/20",
  will_not_return: "border-rose-200 bg-rose-50/40 dark:border-rose-800 dark:bg-rose-950/20",
};

function formatMoney(value: number) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(value);
}

function formatDate(value: string | null) {
  if (!value) return "-";
  const [y, m, d] = value.split("-");
  return d ? `${d}/${m}/${y}` : value;
}

function formatDateTime(value: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString("es-MX", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Mexico_City",
  });
}

function statusPill(status: PendingFollowUpStatus) {
  const base = "rounded-full px-2 py-0.5 text-xs font-medium";
  switch (status) {
    case "no_answer":
      return `${base} bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300`;
    case "contacted":
      return `${base} bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300`;
    case "promise_to_pay":
      return `${base} bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300`;
    case "will_not_return":
      return `${base} bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300`;
    default:
      return `${base} bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300`;
  }
}

function FollowUpCell({
  row,
  compact = false,
  onSaved,
}: {
  row: PendingRow;
  compact?: boolean;
  onSaved: (next: Partial<PendingRow>) => void;
}) {
  const [status, setStatus] = useState<PendingFollowUpStatus>(row.followUpStatus);
  const [note, setNote] = useState(row.followUpNote ?? "");
  const [promiseDate, setPromiseDate] = useState(row.promiseDate ?? "");
  const [followUpAt, setFollowUpAt] = useState(row.followUpAt);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    setSaved(false);
    setError(null);
    startTransition(async () => {
      const result = await updatePendingFollowUpAction(row.enrollmentId, status, note, promiseDate);
      if (!result.ok) {
        setError(
          result.error === "promise_date_required"
            ? "Captura la fecha de promesa."
            : result.error === "invalid_promise_date"
              ? "La fecha prometida no es valida."
              : "No se pudo guardar."
        );
        return;
      }

      const nextFollowUpAt = status === "uncontacted" ? null : new Date().toISOString();
      const nextNote = status === "uncontacted" ? null : note.trim() || null;
      const nextPromiseDate = status === "promise_to_pay" ? promiseDate : null;

      setFollowUpAt(nextFollowUpAt);
      onSaved({
        followUpStatus: status,
        followUpAt: nextFollowUpAt,
        followUpNote: nextNote,
        promiseDate: nextPromiseDate,
      });
      setSaved(true);
    });
  }

  const isPromise = status === "promise_to_pay";
  const isNoReturn = status === "will_not_return";

  return (
    <div className={`space-y-2 ${compact ? "" : "min-w-0"}`}>
      <select
        value={status}
        onChange={(e) => {
          const nextStatus = e.target.value as PendingFollowUpStatus;
          setStatus(nextStatus);
          if (nextStatus !== "promise_to_pay") setPromiseDate("");
          setSaved(false);
          setError(null);
        }}
        className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-xs dark:border-slate-600 dark:bg-slate-800"
      >
        {STATUS_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>

      {isPromise ? (
        <label className="block space-y-1 text-xs">
          <span className="text-slate-500 dark:text-slate-400">Fecha prometida</span>
          <input
            type="date"
            value={promiseDate}
            onChange={(e) => {
              setPromiseDate(e.target.value);
              setSaved(false);
              setError(null);
            }}
            className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-xs dark:border-slate-600 dark:bg-slate-800"
          />
        </label>
      ) : null}

      <textarea
        value={note}
        onChange={(e) => {
          setNote(e.target.value);
          setSaved(false);
          setError(null);
        }}
        placeholder="Notas del seguimiento..."
        rows={compact ? 2 : 3}
        className="w-full resize-none rounded border border-slate-300 bg-white px-2 py-1.5 text-xs dark:border-slate-600 dark:bg-slate-800"
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={isPending}
          className="rounded bg-portoBlue px-2.5 py-1 text-xs font-medium text-white hover:bg-portoDark disabled:opacity-50"
        >
          {isPending ? "..." : "Guardar"}
        </button>
        {isNoReturn ? (
          <Link
            href={`/players/${row.playerId}/enrollments/${row.enrollmentId}/edit`}
            className="rounded border border-rose-300 px-2.5 py-1 text-xs font-medium text-rose-700 hover:bg-rose-50 dark:border-rose-800 dark:text-rose-300 dark:hover:bg-rose-950/20"
          >
            Ir a baja
          </Link>
        ) : null}
        {saved ? <span className="text-xs text-emerald-600">OK</span> : null}
      </div>

      {status !== "uncontacted" ? (
        <div className="space-y-0.5 text-[11px] text-slate-500 dark:text-slate-400">
          <p>Estado actual: {STATUS_LABELS[status]}</p>
          {status === "promise_to_pay" && promiseDate ? <p>Promesa: {formatDate(promiseDate)}</p> : null}
          {followUpAt ? <p>Ultima actualizacion: {formatDateTime(followUpAt)}</p> : null}
        </div>
      ) : null}

      {error ? <p className="text-xs text-rose-600">{error}</p> : null}
    </div>
  );
}

function PendingDesktopRow({
  row,
  onSaved,
}: {
  row: PendingRow;
  onSaved: (next: Partial<PendingRow>) => void;
}) {
  return (
    <div className={`rounded-lg border px-4 py-4 dark:border-slate-700 ${STATUS_STYLES[row.followUpStatus]}`}>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1.2fr)_minmax(340px,1.9fr)_auto]">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/players/${row.playerId}`} className="text-base font-semibold text-portoBlue hover:underline">
              {row.playerName}
            </Link>
            <span className={statusPill(row.followUpStatus)}>{STATUS_LABELS[row.followUpStatus]}</span>
          </div>
          <div className="grid gap-1 text-sm text-slate-600 dark:text-slate-400">
            <p>
              <span className="font-medium text-slate-700 dark:text-slate-200">Cat.</span> {row.birthYear ?? "-"}
            </p>
            <p>
              <span className="font-medium text-slate-700 dark:text-slate-200">Campus</span> {row.campusName} ({row.campusCode})
            </p>
            <p>
              <span className="font-medium text-slate-700 dark:text-slate-200">Equipo</span> {row.teamName}
            </p>
          </div>
        </div>

        <div className="grid gap-2 text-sm">
          <div className="rounded-md border border-slate-200 bg-white/70 px-3 py-2 dark:border-slate-700 dark:bg-slate-900/60">
            <p className="text-[11px] uppercase tracking-wide text-slate-400">Telefono</p>
            <p className="font-medium text-slate-700 dark:text-slate-200">{row.primaryPhone ?? "-"}</p>
          </div>
          <div className="rounded-md border border-slate-200 bg-white/70 px-3 py-2 dark:border-slate-700 dark:bg-slate-900/60">
            <p className="text-[11px] uppercase tracking-wide text-slate-400">Saldo</p>
            <p className="font-semibold text-slate-900 dark:text-slate-100">{formatMoney(row.balance)}</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-md border border-slate-200 bg-white/70 px-3 py-2 dark:border-slate-700 dark:bg-slate-900/60">
              <p className="text-[11px] uppercase tracking-wide text-slate-400">Vence</p>
              <p className="text-slate-700 dark:text-slate-200">{formatDate(row.dueDate)}</p>
            </div>
            <div className="rounded-md border border-slate-200 bg-white/70 px-3 py-2 dark:border-slate-700 dark:bg-slate-900/60">
              <p className="text-[11px] uppercase tracking-wide text-slate-400">Dias vencidos</p>
              <p className="text-slate-700 dark:text-slate-200">{row.overdueDays}</p>
            </div>
          </div>
        </div>

        <div className="rounded-md border border-slate-200 bg-white/70 p-3 dark:border-slate-700 dark:bg-slate-900/60">
          <p className="mb-2 text-[11px] uppercase tracking-wide text-slate-400">Seguimiento</p>
          <FollowUpCell row={row} onSaved={onSaved} />
        </div>

        <div className="flex flex-row gap-3 xl:flex-col xl:items-stretch">
          {row.primaryPhone ? (
            <a
              href={`tel:${row.primaryPhone}`}
              className="rounded-md border border-slate-300 px-3 py-2 text-center text-sm font-medium text-portoBlue hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800"
            >
              Llamar
            </a>
          ) : (
            <span className="rounded-md border border-slate-200 px-3 py-2 text-center text-sm text-slate-400 dark:border-slate-700">
              Sin telefono
            </span>
          )}
          <Link
            href={`/enrollments/${row.enrollmentId}/charges`}
            className="rounded-md border border-slate-300 px-3 py-2 text-center text-sm font-medium text-portoBlue hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800"
          >
            Abrir cuenta
          </Link>
        </div>
      </div>
    </div>
  );
}

export function PendingTable({ rows }: PendingTableProps) {
  const [localRows, setLocalRows] = useState(rows);

  function handleRowSaved(enrollmentId: string, next: Partial<PendingRow>) {
    setLocalRows((current) =>
      current.map((row) => (row.enrollmentId === enrollmentId ? { ...row, ...next } : row))
    );
  }

  if (localRows.length === 0) {
    return (
      <div className="rounded-md border border-slate-200 px-4 py-5 text-sm text-slate-600 dark:border-slate-700 dark:text-slate-400">
        No hay inscripciones pendientes con los filtros actuales.
      </div>
    );
  }

  return (
    <>
      <div className="space-y-3 md:hidden">
        {localRows.map((row) => (
          <div
            key={row.enrollmentId}
            className={`space-y-3 rounded-md border px-4 py-4 dark:border-slate-700 ${STATUS_STYLES[row.followUpStatus]}`}
          >
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Link href={`/players/${row.playerId}`} className="text-base font-semibold text-portoBlue hover:underline">
                  {row.playerName}
                </Link>
                <span className={statusPill(row.followUpStatus)}>{STATUS_LABELS[row.followUpStatus]}</span>
              </div>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Cat. {row.birthYear ?? "-"} | {row.campusName} ({row.campusCode})
              </p>
              <p className="text-sm text-slate-500 dark:text-slate-400">Equipo: {row.teamName}</p>
              <p className="text-sm text-slate-500 dark:text-slate-400">Telefono: {row.primaryPhone ?? "-"}</p>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-400">Saldo</p>
                <p className="font-medium">{formatMoney(row.balance)}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-400">Vence</p>
                <p>{formatDate(row.dueDate)}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-400">Dias vencidos</p>
                <p>{row.overdueDays}</p>
              </div>
            </div>

            <FollowUpCell row={row} compact onSaved={(next) => handleRowSaved(row.enrollmentId, next)} />

            <div className="flex flex-wrap gap-3 text-sm">
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
          </div>
        ))}
      </div>

      <div className="hidden space-y-3 md:block">
        {localRows.map((row) => (
          <PendingDesktopRow
            key={row.enrollmentId}
            row={row}
            onSaved={(next) => handleRowSaved(row.enrollmentId, next)}
          />
        ))}
      </div>
    </>
  );
}
