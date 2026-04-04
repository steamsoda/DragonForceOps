"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  bulkMarkUniformOrderedAction,
  markUniformDeliveredAction,
  markUniformOrderedAction,
  type BulkUniformOrderMutationResult,
  type UniformOrderMutationResult,
  type UniformOrderStatus,
} from "@/server/actions/uniforms";

type UniformDashboardRow = {
  id: string;
  playerId: string;
  enrollmentId: string;
  chargeId: string | null;
  playerName: string;
  playerHref: string;
  campusId: string;
  campusName: string;
  campusCode: string | null;
  birthYear: number | null;
  uniformType: "training" | "game";
  uniformTypeLabel: string;
  size: string | null;
  isGoalkeeper: boolean;
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

type QueueKey = "all" | "sold_week" | "pending_order" | "ordered" | "pending_delivery" | "delivered_week";
type UniformTypeFilter = "" | "training" | "game";

type UniformDashboardSection = {
  key: Exclude<QueueKey, "all">;
  title: string;
  rows: UniformDashboardRow[];
};

type UniformPendingSummaryCampus = {
  campusId: string;
  campusName: string;
  items: Array<{
    key: string;
    label: string;
    count: number;
  }>;
};

const QUEUE_OPTIONS: Array<{ value: QueueKey; label: string }> = [
  { value: "all", label: "Todas las colas" },
  { value: "sold_week", label: "Vendidos esta semana" },
  { value: "pending_order", label: "Pendientes por pedir" },
  { value: "ordered", label: "Pedidos al proveedor" },
  { value: "pending_delivery", label: "Pendientes por entregar" },
  { value: "delivered_week", label: "Entregados esta semana" },
];

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

function inRange(value: string | null, start: string, end: string) {
  if (!value) return false;
  return value >= start && value < end;
}

function statusPillClass(status: UniformOrderStatus) {
  if (status === "delivered") return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300";
  if (status === "ordered") return "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300";
  return "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300";
}

function getStatusLabel(status: UniformOrderStatus) {
  if (status === "pending_order") return "Pendiente por pedir";
  if (status === "ordered") return "Pedido al proveedor";
  return "Entregado";
}

function buildUniformsUrl(filters: {
  campusId: string;
  type: UniformTypeFilter;
  queue: QueueKey;
}) {
  const search = new URLSearchParams();
  if (filters.campusId && filters.campusId !== "all") search.set("campus", filters.campusId);
  if (filters.type) search.set("type", filters.type);
  if (filters.queue !== "all") search.set("queue", filters.queue);
  const query = search.toString();
  return query ? `/uniforms?${query}` : "/uniforms";
}

function deriveDashboardState({
  rows,
  campuses,
  selectedCampusId,
  selectedType,
  selectedQueue,
  week,
}: {
  rows: UniformDashboardRow[];
  campuses: Array<{ id: string; name: string }>;
  selectedCampusId: string;
  selectedType: UniformTypeFilter;
  selectedQueue: QueueKey;
  week: { start: string; end: string };
}) {
  const scopedRows = rows
    .filter((row) => selectedCampusId === "all" || row.campusId === selectedCampusId)
    .filter((row) => !selectedType || row.uniformType === selectedType);

  const soldWeek = scopedRows
    .filter((row) => inRange(row.soldAt, week.start, week.end))
    .sort((a, b) => (b.soldAt ?? "").localeCompare(a.soldAt ?? ""));
  const pendingOrder = scopedRows
    .filter((row) => row.status === "pending_order")
    .sort((a, b) => (a.soldAt ?? "").localeCompare(b.soldAt ?? ""));
  const ordered = scopedRows
    .filter((row) => row.status === "ordered")
    .sort((a, b) => (a.orderedAt ?? a.soldAt ?? "").localeCompare(b.orderedAt ?? b.soldAt ?? ""));
  const pendingDelivery = scopedRows
    .filter((row) => row.status !== "delivered")
    .sort((a, b) => {
      const aDate = a.orderedAt ?? a.soldAt ?? "";
      const bDate = b.orderedAt ?? b.soldAt ?? "";
      return aDate.localeCompare(bDate);
    });
  const deliveredWeek = scopedRows
    .filter((row) => inRange(row.deliveredAt, week.start, week.end))
    .sort((a, b) => (b.deliveredAt ?? "").localeCompare(a.deliveredAt ?? ""));

  const allSections: UniformDashboardSection[] = [
    { key: "sold_week", title: "Vendidos esta semana", rows: soldWeek },
    { key: "pending_order", title: "Pendientes por pedir", rows: pendingOrder },
    { key: "ordered", title: "Pedidos al proveedor", rows: ordered },
    { key: "pending_delivery", title: "Pendientes por entregar", rows: pendingDelivery },
    { key: "delivered_week", title: "Entregados esta semana", rows: deliveredWeek },
  ];

  const sections =
    selectedQueue === "all" ? allSections : allSections.filter((section) => section.key === selectedQueue);

  const pendingOrderSummary: UniformPendingSummaryCampus[] = campuses
    .map((campus) => {
      const itemMap = new Map<string, { label: string; count: number }>();
      for (const row of pendingOrder.filter((item) => item.campusId === campus.id)) {
        const sizeLabel = row.size?.trim() || "Sin talla";
        const label = row.isGoalkeeper
          ? `${row.uniformTypeLabel} Portero ${sizeLabel}`
          : `${row.uniformTypeLabel} ${sizeLabel}`;
        const key = `${row.uniformType}|${row.isGoalkeeper ? "portero" : "normal"}|${sizeLabel}`;
        const current = itemMap.get(key);
        if (current) current.count += 1;
        else itemMap.set(key, { label, count: 1 });
      }

      return {
        campusId: campus.id,
        campusName: campus.name,
        items: Array.from(itemMap.entries())
          .map(([key, value]) => ({ key, label: value.label, count: value.count }))
          .sort((a, b) => a.label.localeCompare(b.label, "es-MX")),
      };
    })
    .filter((campus) => campus.items.length > 0);

  return {
    counts: {
      soldWeek: soldWeek.length,
      pendingOrder: pendingOrder.length,
      ordered: ordered.length,
      pendingDelivery: pendingDelivery.length,
      deliveredWeek: deliveredWeek.length,
    },
    pendingOrderSummary,
    sections,
  };
}

function applyMutationToRows(
  rows: UniformDashboardRow[],
  mutation: { orderId: string; nextStatus: UniformOrderStatus; orderedAt?: string | null; deliveredAt?: string | null }
) {
  return rows.map((row) => {
    if (row.id !== mutation.orderId) return row;
    return {
      ...row,
      status: mutation.nextStatus,
      statusLabel: getStatusLabel(mutation.nextStatus),
      orderedAt: mutation.orderedAt === undefined ? row.orderedAt : mutation.orderedAt,
      deliveredAt: mutation.deliveredAt === undefined ? row.deliveredAt : mutation.deliveredAt,
    };
  });
}

export function UniformsDashboard({
  campuses,
  initialSelectedCampusId,
  initialSelectedType,
  initialSelectedQueue,
  week,
  rows,
}: {
  campuses: Array<{ id: string; name: string }>;
  initialSelectedCampusId: string;
  initialSelectedType: UniformTypeFilter;
  initialSelectedQueue: QueueKey;
  week: { start: string; end: string };
  rows: UniformDashboardRow[];
}) {
  const [allRows, setAllRows] = useState(rows);
  const [selectedCampusId, setSelectedCampusId] = useState(initialSelectedCampusId);
  const [selectedType, setSelectedType] = useState<UniformTypeFilter>(initialSelectedType);
  const [selectedQueue, setSelectedQueue] = useState<QueueKey>(initialSelectedQueue);
  const [selectedPendingIds, setSelectedPendingIds] = useState<Set<string>>(new Set());
  const [pendingMutationIds, setPendingMutationIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const dashboard = useMemo(
    () =>
      deriveDashboardState({
        rows: allRows,
        campuses,
        selectedCampusId,
        selectedType,
        selectedQueue,
        week,
      }),
    [allRows, campuses, selectedCampusId, selectedType, selectedQueue, week]
  );

  const selectablePendingIds = useMemo(
    () =>
      dashboard.sections.find((section) => section.key === "pending_order")?.rows.map((row) => row.id) ?? [],
    [dashboard.sections]
  );

  function syncUrl(next: { campusId: string; type: UniformTypeFilter; queue: QueueKey }) {
    if (typeof window === "undefined") return;
    window.history.replaceState(null, "", buildUniformsUrl(next));
  }

  function updateFilters(next: Partial<{ campusId: string; type: UniformTypeFilter; queue: QueueKey }>) {
    const filters = {
      campusId: next.campusId ?? selectedCampusId,
      type: next.type ?? selectedType,
      queue: next.queue ?? selectedQueue,
    };
    setSelectedCampusId(filters.campusId);
    setSelectedType(filters.type);
    setSelectedQueue(filters.queue);
    setSelectedPendingIds(new Set());
    syncUrl(filters);
  }

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

  async function runOptimisticMutation(
    orderIds: string[],
    optimisticMutations: Array<{
      orderId: string;
      nextStatus: UniformOrderStatus;
      orderedAt?: string | null;
      deliveredAt?: string | null;
    }>,
    action: () => Promise<UniformOrderMutationResult | BulkUniformOrderMutationResult>
  ) {
    const previousRows = allRows;
    const nextRows = optimisticMutations.reduce((rowsAcc, mutation) => applyMutationToRows(rowsAcc, mutation), previousRows);
    setError(null);
    setPendingMutationIds((prev) => new Set([...prev, ...orderIds]));
    setAllRows(nextRows);

    const result = await action();
    if (!result.ok) {
      setAllRows(previousRows);
      setError("No se pudo actualizar el flujo de uniformes. Intenta de nuevo.");
      setPendingMutationIds((prev) => {
        const next = new Set(prev);
        orderIds.forEach((id) => next.delete(id));
        return next;
      });
      return;
    }

    if ("updates" in result) {
      const updates = result.updates;
      setAllRows((current) =>
        updates.reduce(
          (rowsAcc, update) =>
            applyMutationToRows(rowsAcc, {
              orderId: update.orderId,
              nextStatus: update.nextStatus,
              orderedAt: update.orderedAt,
              deliveredAt: update.deliveredAt,
            }),
          current
        )
      );
    } else {
      setAllRows((current) =>
        applyMutationToRows(current, {
          orderId: result.orderId,
          nextStatus: result.nextStatus,
          orderedAt: result.orderedAt,
          deliveredAt: result.deliveredAt,
        })
      );
    }

    setPendingMutationIds((prev) => {
      const next = new Set(prev);
      orderIds.forEach((id) => next.delete(id));
      return next;
    });
  }

  async function handleSingleMarkOrdered(orderId: string) {
    const timestamp = new Date().toISOString();
    await runOptimisticMutation(
      [orderId],
      [{ orderId, nextStatus: "ordered", orderedAt: timestamp, deliveredAt: null }],
      () => markUniformOrderedAction(orderId)
    );
  }

  async function handleSingleDeliver(orderId: string) {
    const timestamp = new Date().toISOString();
    await runOptimisticMutation(
      [orderId],
      [{ orderId, nextStatus: "delivered", deliveredAt: timestamp }],
      () => markUniformDeliveredAction(orderId)
    );
  }

  async function handleBulkMarkOrdered() {
    if (selectedPendingIds.size === 0) return;
    const ids = Array.from(selectedPendingIds);
    const timestamp = new Date().toISOString();
    clearPendingSelection();
    await runOptimisticMutation(
      ids,
      ids.map((orderId) => ({ orderId, nextStatus: "ordered" as const, orderedAt: timestamp, deliveredAt: null })),
      () => bulkMarkUniformOrderedAction(ids)
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-3 rounded-md border border-slate-200 p-3 dark:border-slate-700">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => updateFilters({ campusId: "all" })}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
              selectedCampusId === "all"
                ? "bg-portoBlue text-white"
                : "border border-slate-300 text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
            }`}
          >
            Todos
          </button>
          {campuses.map((campus) => (
            <button
              key={campus.id}
              type="button"
              onClick={() => updateFilters({ campusId: campus.id })}
              className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
                selectedCampusId === campus.id
                  ? "bg-portoBlue text-white"
                  : "border border-slate-300 text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
              }`}
            >
              {campus.name}
            </button>
          ))}
        </div>

        <div className="grid gap-3 xl:grid-cols-[220px_260px_auto]">
          <select
            value={selectedType}
            onChange={(event) => updateFilters({ type: event.target.value as UniformTypeFilter })}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-600"
          >
            <option value="">Todos los tipos</option>
            <option value="training">Entrenamiento</option>
            <option value="game">Juego</option>
          </select>
          <select
            value={selectedQueue}
            onChange={(event) => updateFilters({ queue: event.target.value as QueueKey })}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-600"
          >
            {QUEUE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => updateFilters({ campusId: "all", type: "", queue: "all" })}
              className="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Limpiar
            </button>
          </div>
        </div>
      </div>

      {error ? (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-800 dark:bg-rose-950/20 dark:text-rose-300">
          {error}
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="Vendidos esta semana" value={dashboard.counts.soldWeek} tone="slate" />
        <MetricCard label="Pendientes por pedir" value={dashboard.counts.pendingOrder} tone="amber" />
        <MetricCard label="Pedidos al proveedor" value={dashboard.counts.ordered} tone="sky" />
        <MetricCard label="Pendientes por entregar" value={dashboard.counts.pendingDelivery} tone="violet" />
        <MetricCard label="Entregados esta semana" value={dashboard.counts.deliveredWeek} tone="emerald" />
      </div>

      <section className="space-y-3 rounded-lg border border-slate-200 p-4 dark:border-slate-700">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Resumen por pedir</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Lista operativa de uniformes pendientes por pedir al proveedor.
          </p>
        </div>
        {dashboard.pendingOrderSummary.length === 0 ? (
          <div className="rounded-md border border-dashed border-slate-200 px-4 py-5 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
            No hay uniformes pendientes por pedir con los filtros actuales.
          </div>
        ) : (
          <div className="grid gap-3 xl:grid-cols-2">
            {dashboard.pendingOrderSummary.map((campus) => (
              <div key={campus.campusId} className="rounded-md border border-slate-200 p-4 dark:border-slate-700">
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{campus.campusName}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {campus.items.map((item) => (
                    <span
                      key={item.key}
                      className={`rounded-full px-3 py-1 text-sm font-medium ${
                        item.label.includes("Portero")
                          ? "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300"
                          : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200"
                      }`}
                    >
                      {item.label} x{item.count}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {dashboard.sections.map((section) => (
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
                  disabled={selectedPendingIds.size === 0}
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
                  <MobileUniformRow
                    key={row.id}
                    row={row}
                    sectionKey={section.key}
                    isSelected={selectedPendingIds.has(row.id)}
                    isMutating={pendingMutationIds.has(row.id)}
                    onTogglePending={togglePending}
                    onMarkOrdered={handleSingleMarkOrdered}
                    onDeliver={handleSingleDeliver}
                  />
                ))}
              </div>

              <DesktopUniformTable
                section={section}
                selectedPendingIds={selectedPendingIds}
                pendingMutationIds={pendingMutationIds}
                onTogglePending={togglePending}
                onMarkOrdered={handleSingleMarkOrdered}
                onDeliver={handleSingleDeliver}
              />
            </>
          )}
        </section>
      ))}
    </div>
  );
}

function MobileUniformRow({
  row,
  sectionKey,
  isSelected,
  isMutating,
  onTogglePending,
  onMarkOrdered,
  onDeliver,
}: {
  row: UniformDashboardRow;
  sectionKey: UniformDashboardSection["key"];
  isSelected: boolean;
  isMutating: boolean;
  onTogglePending: (id: string) => void;
  onMarkOrdered: (id: string) => void;
  onDeliver: (id: string) => void;
}) {
  return (
    <div
      className={`space-y-3 rounded-md border px-4 py-4 dark:border-slate-700 ${
        row.isGoalkeeper ? "border-violet-300 bg-violet-50/50 dark:bg-violet-950/10" : "border-slate-200"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <Link href={row.playerHref} className="text-base font-semibold text-portoBlue hover:underline">
            {row.playerName}
          </Link>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {row.campusName} | Cat. {row.birthYear ?? "-"} | {row.uniformTypeLabel}
          </p>
          <div className="flex flex-wrap gap-2 text-xs">
            <DescriptorPill label={`Talla ${row.size ?? "Sin talla"}`} />
            {row.isGoalkeeper ? <DescriptorPill label="Portero" tone="violet" /> : null}
          </div>
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
        {sectionKey === "pending_order" ? (
          <label className="flex items-center gap-2 rounded-md border border-slate-300 px-3 py-1.5 text-xs dark:border-slate-600">
            <input type="checkbox" checked={isSelected} onChange={() => onTogglePending(row.id)} />
            Seleccionar
          </label>
        ) : null}
        {row.status === "pending_order" ? (
          <button
            type="button"
            disabled={isMutating}
            onClick={() => onMarkOrdered(row.id)}
            className="rounded-md bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
          >
            Marcar como pedido
          </button>
        ) : null}
        {row.status !== "delivered" ? (
          <button
            type="button"
            disabled={isMutating}
            onClick={() => onDeliver(row.id)}
            className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            Marcar como entregado
          </button>
        ) : null}
      </div>
    </div>
  );
}

function DesktopUniformTable({
  section,
  selectedPendingIds,
  pendingMutationIds,
  onTogglePending,
  onMarkOrdered,
  onDeliver,
}: {
  section: UniformDashboardSection;
  selectedPendingIds: Set<string>;
  pendingMutationIds: Set<string>;
  onTogglePending: (id: string) => void;
  onMarkOrdered: (id: string) => void;
  onDeliver: (id: string) => void;
}) {
  return (
    <div className="hidden overflow-x-auto md:block">
      <table className="w-full min-w-[1120px] text-sm">
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
            <tr key={row.id} className={row.isGoalkeeper ? "bg-violet-50/60 dark:bg-violet-950/10" : undefined}>
              {section.key === "pending_order" ? (
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    checked={selectedPendingIds.has(row.id)}
                    onChange={() => onTogglePending(row.id)}
                  />
                </td>
              ) : null}
              <td className="px-3 py-2">
                <div className="space-y-1">
                  <Link href={row.playerHref} className="font-medium text-portoBlue hover:underline">
                    {row.playerName}
                  </Link>
                  <div className="flex flex-wrap gap-1.5">
                    <DescriptorPill label={`Talla ${row.size ?? "Sin talla"}`} />
                    {row.isGoalkeeper ? <DescriptorPill label="Portero" tone="violet" /> : null}
                  </div>
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
                      disabled={pendingMutationIds.has(row.id)}
                      onClick={() => onMarkOrdered(row.id)}
                      className="rounded-md bg-sky-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
                    >
                      Marcar pedido
                    </button>
                  ) : null}
                  {row.status !== "delivered" ? (
                    <button
                      type="button"
                      disabled={pendingMutationIds.has(row.id)}
                      onClick={() => onDeliver(row.id)}
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
  );
}

function DescriptorPill({
  label,
  tone = "slate",
}: {
  label: string;
  tone?: "slate" | "violet";
}) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
        tone === "violet"
          ? "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300"
          : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
      }`}
    >
      {label}
    </span>
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
