"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import {
  bulkMarkUniformOrderedAction,
  markUniformDeliveredAction,
  markUniformOrderedAction,
  type UniformOrderStatus,
} from "@/server/actions/uniforms";

type UniformDashboardRow = {
  id: string;
  playerId: string;
  enrollmentId: string;
  chargeId: string | null;
  playerName: string;
  playerHref: string;
  campusName: string;
  birthYear: number | null;
  uniformTypeLabel: string;
  size: string | null;
  status: UniformOrderStatus;
  statusLabel: string;
  soldAt: string | null;
  orderedAt: string | null;
  deliveredAt: string | null;
  notes: string | null;
  chargeDescription: string | null;
  paymentId: string | null;
  folio: string | null;
};

type UniformDashboardSection = {
  key: "sold_week" | "pending_order" | "ordered" | "pending_delivery" | "delivered_week";
  title: string;
  rows: UniformDashboardRow[];
};

function formatDateTime(value: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("es-MX", {
    timeZone: "America/Monterrey",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function statusPillClass(status: UniformOrderStatus) {
  if (status === "delivered") return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300";
  if (status === "ordered") return "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300";
  return "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300";
}

export function UniformsDashboard({
  counts,
  sections,
}: {
  counts: {
    soldWeek: number;
    pendingOrder: number;
    ordered: number;
    pendingDelivery: number;
    deliveredWeek: number;
  };
  sections: UniformDashboardSection[];
}) {
  const router = useRouter();
  const [selectedPendingIds, setSelectedPendingIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const selectablePendingIds = useMemo(
    () => sections.find((section) => section.key === "pending_order")?.rows.map((row) => row.id) ?? [],
    [sections]
  );

  function togglePending(id: string) {
    setSelectedPendingIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllPending() {
    setSelectedPendingIds(new Set(selectablePendingIds));
  }

  function clearPendingSelection() {
    setSelectedPendingIds(new Set());
  }

  function runAction(action: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError("No se pudo actualizar el flujo de uniformes. Intenta de nuevo.");
        return;
      }
      router.refresh();
    });
  }

  function handleBulkMarkOrdered() {
    if (selectedPendingIds.size === 0) return;
    runAction(async () => {
      const result = await bulkMarkUniformOrderedAction(Array.from(selectedPendingIds));
      if (result.ok) {
        clearPendingSelection();
        return { ok: true };
      }
      return result;
    });
  }

  return (
    <div className="space-y-6">
      {error ? (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-800 dark:bg-rose-950/20 dark:text-rose-300">
          {error}
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="Vendidos esta semana" value={counts.soldWeek} tone="slate" />
        <MetricCard label="Pendientes por pedir" value={counts.pendingOrder} tone="amber" />
        <MetricCard label="Pedidos al proveedor" value={counts.ordered} tone="sky" />
        <MetricCard label="Pendientes por entregar" value={counts.pendingDelivery} tone="violet" />
        <MetricCard label="Entregados esta semana" value={counts.deliveredWeek} tone="emerald" />
      </div>

      {sections.map((section) => (
        <section key={section.key} className="space-y-3 rounded-lg border border-slate-200 p-4 dark:border-slate-700">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{section.title}</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {section.rows.length} registro{section.rows.length !== 1 ? "s" : ""}
              </p>
            </div>
            {section.key === "pending_order" && section.rows.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={selectAllPending}
                  className="rounded-md border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  Seleccionar todos
                </button>
                <button
                  type="button"
                  onClick={clearPendingSelection}
                  className="rounded-md border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  Limpiar
                </button>
                <button
                  type="button"
                  disabled={selectedPendingIds.size === 0 || isPending}
                  onClick={handleBulkMarkOrdered}
                  className="rounded-md bg-portoBlue px-3 py-2 text-xs font-semibold text-white hover:bg-portoDark disabled:opacity-50"
                >
                  Marcar seleccionados como pedido
                </button>
              </div>
            ) : null}
          </div>

          {section.rows.length === 0 ? (
            <div className="rounded-md border border-dashed border-slate-200 px-4 py-5 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
              No hay registros en esta cola.
            </div>
          ) : (
            <>
              <div className="space-y-3 md:hidden">
                {section.rows.map((row) => (
                  <div key={row.id} className="space-y-3 rounded-md border border-slate-200 px-4 py-4 dark:border-slate-700">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <Link href={row.playerHref} className="text-base font-semibold text-portoBlue hover:underline">
                          {row.playerName}
                        </Link>
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                          {row.campusName} | Cat. {row.birthYear ?? "-"} | {row.uniformTypeLabel}
                        </p>
                      </div>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusPillClass(row.status)}`}>
                        {row.statusLabel}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <Info label="Talla" value={row.size ?? "-"} />
                      <Info label="Cargo" value={row.chargeDescription ?? "-"} />
                      <Info label="Vendida" value={formatDateTime(row.soldAt)} />
                      <Info label="Pedido" value={formatDateTime(row.orderedAt)} />
                      <Info label="Entregado" value={formatDateTime(row.deliveredAt)} />
                      <Info label="Folio" value={row.folio ?? "-"} />
                    </div>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Notas: {row.notes ?? "-"}</p>
                    <div className="flex flex-wrap gap-2">
                      <Link
                        href={`/enrollments/${row.enrollmentId}/charges`}
                        className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
                      >
                        Ver cuenta
                      </Link>
                      {row.paymentId ? (
                        <Link
                          href={`/receipts?payment=${encodeURIComponent(row.paymentId)}`}
                          className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
                        >
                          Ver recibo
                        </Link>
                      ) : null}
                      {section.key === "pending_order" ? (
                        <label className="flex items-center gap-2 rounded-md border border-slate-300 px-3 py-1.5 text-xs dark:border-slate-600">
                          <input
                            type="checkbox"
                            checked={selectedPendingIds.has(row.id)}
                            onChange={() => togglePending(row.id)}
                          />
                          Seleccionar
                        </label>
                      ) : null}
                      {row.status === "pending_order" ? (
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => runAction(() => markUniformOrderedAction(row.id))}
                          className="rounded-md bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
                        >
                          Marcar como pedido
                        </button>
                      ) : null}
                      {row.status !== "delivered" ? (
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => runAction(() => markUniformDeliveredAction(row.id))}
                          className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                        >
                          Marcar como entregado
                        </button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>

              <div className="hidden overflow-x-auto md:block">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:text-slate-400">
                      {section.key === "pending_order" ? <th className="px-3 py-2">Sel.</th> : null}
                      <th className="px-3 py-2">Jugador</th>
                      <th className="px-3 py-2">Campus</th>
                      <th className="px-3 py-2">Cat.</th>
                      <th className="px-3 py-2">Tipo</th>
                      <th className="px-3 py-2">Talla</th>
                      <th className="px-3 py-2">Estado</th>
                      <th className="px-3 py-2">Vendida</th>
                      <th className="px-3 py-2">Pedido</th>
                      <th className="px-3 py-2">Entregado</th>
                      <th className="px-3 py-2">Folio</th>
                      <th className="px-3 py-2">Cuenta</th>
                      <th className="px-3 py-2">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {section.rows.map((row) => (
                      <tr key={row.id}>
                        {section.key === "pending_order" ? (
                          <td className="px-3 py-2">
                            <input
                              type="checkbox"
                              checked={selectedPendingIds.has(row.id)}
                              onChange={() => togglePending(row.id)}
                            />
                          </td>
                        ) : null}
                        <td className="px-3 py-2">
                          <div className="space-y-0.5">
                            <Link href={row.playerHref} className="font-medium text-portoBlue hover:underline">
                              {row.playerName}
                            </Link>
                            <p className="text-xs text-slate-400">{row.chargeDescription ?? "-"}</p>
                          </div>
                        </td>
                        <td className="px-3 py-2">{row.campusName}</td>
                        <td className="px-3 py-2">{row.birthYear ?? "-"}</td>
                        <td className="px-3 py-2">{row.uniformTypeLabel}</td>
                        <td className="px-3 py-2">{row.size ?? "-"}</td>
                        <td className="px-3 py-2">
                          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusPillClass(row.status)}`}>
                            {row.statusLabel}
                          </span>
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">{formatDateTime(row.soldAt)}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{formatDateTime(row.orderedAt)}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{formatDateTime(row.deliveredAt)}</td>
                        <td className="px-3 py-2">
                          {row.paymentId ? (
                            <Link href={`/receipts?payment=${encodeURIComponent(row.paymentId)}`} className="text-portoBlue hover:underline">
                              {row.folio ?? "Ver recibo"}
                            </Link>
                          ) : (
                            row.folio ?? "-"
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <Link href={`/enrollments/${row.enrollmentId}/charges`} className="text-portoBlue hover:underline">
                            Ver cuenta
                          </Link>
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap gap-2">
                            {row.status === "pending_order" ? (
                              <button
                                type="button"
                                disabled={isPending}
                                onClick={() => runAction(() => markUniformOrderedAction(row.id))}
                                className="rounded-md bg-sky-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
                              >
                                Marcar pedido
                              </button>
                            ) : null}
                            {row.status !== "delivered" ? (
                              <button
                                type="button"
                                disabled={isPending}
                                onClick={() => runAction(() => markUniformDeliveredAction(row.id))}
                                className="rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                              >
                                Entregar
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      ))}
    </div>
  );
}

function MetricCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "slate" | "amber" | "sky" | "violet" | "emerald";
}) {
  const toneClass =
    tone === "amber"
      ? "border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/20"
      : tone === "sky"
      ? "border-sky-200 bg-sky-50 dark:border-sky-800 dark:bg-sky-950/20"
      : tone === "violet"
      ? "border-violet-200 bg-violet-50 dark:border-violet-800 dark:bg-violet-950/20"
      : tone === "emerald"
      ? "border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/20"
      : "border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800";

  return (
    <div className={`rounded-md border p-4 ${toneClass}`}>
      <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-slate-900 dark:text-slate-100">{value}</p>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-slate-400">{label}</p>
      <p>{value}</p>
    </div>
  );
}
