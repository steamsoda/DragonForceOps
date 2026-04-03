"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import {
  markUniformDeliveredAction,
  markUniformOrderedAction,
  type UniformOrder,
} from "@/server/actions/uniforms";

const TYPE_LABELS: Record<string, string> = {
  training: "Entrenamiento",
  game: "Juego",
};

const STATUS_LABELS: Record<string, string> = {
  pending_order: "Pendiente por pedir",
  ordered: "Pedido al proveedor",
  delivered: "Entregado",
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

export function UniformOrdersSection({
  enrollmentId,
  initialOrders,
}: {
  enrollmentId: string;
  initialOrders: UniformOrder[];
}) {
  const [orders, setOrders] = useState<UniformOrder[]>(initialOrders);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleOrdered(orderId: string) {
    setError(null);
    startTransition(async () => {
      const result = await markUniformOrderedAction(orderId);
      if (!result.ok) {
        setError("No se pudo marcar como pedido.");
        return;
      }
      setOrders((prev) =>
        prev.map((order) =>
          order.id === orderId
            ? { ...order, status: "ordered", orderedAt: new Date().toISOString() }
            : order
        )
      );
    });
  }

  function handleDelivered(orderId: string) {
    setError(null);
    startTransition(async () => {
      const result = await markUniformDeliveredAction(orderId);
      if (!result.ok) {
        setError("No se pudo marcar como entregado.");
        return;
      }
      setOrders((prev) =>
        prev.map((order) =>
          order.id === orderId
            ? { ...order, status: "delivered", deliveredAt: new Date().toISOString() }
            : order
        )
      );
    });
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Uniformes</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Los registros de uniformes se crean automaticamente cuando un uniforme queda totalmente pagado.
          </p>
        </div>
        <Link
          href="/uniforms"
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          Ver panel
        </Link>
      </div>

      {error ? (
        <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
      ) : null}

      {orders.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Sin uniformes registrados para esta inscripcion.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-slate-200 dark:border-slate-700">
          <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700 text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800 text-left text-xs uppercase tracking-wide text-slate-600 dark:text-slate-400">
              <tr>
                <th className="px-3 py-2">Tipo</th>
                <th className="px-3 py-2">Talla</th>
                <th className="px-3 py-2">Estado</th>
                <th className="px-3 py-2">Vendida</th>
                <th className="px-3 py-2">Pedido</th>
                <th className="px-3 py-2">Entregado</th>
                <th className="px-3 py-2">Cuenta</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {orders.map((order) => (
                <tr key={order.id}>
                  <td className="px-3 py-2 font-medium">{TYPE_LABELS[order.uniformType]}</td>
                  <td className="px-3 py-2 text-slate-600 dark:text-slate-400">{order.size ?? "-"}</td>
                  <td className="px-3 py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        order.status === "delivered"
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                          : order.status === "ordered"
                          ? "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300"
                          : "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                      }`}
                    >
                      {STATUS_LABELS[order.status]}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-slate-600 dark:text-slate-400">{formatDateTime(order.soldAt)}</td>
                  <td className="px-3 py-2 text-slate-600 dark:text-slate-400">{formatDateTime(order.orderedAt)}</td>
                  <td className="px-3 py-2 text-slate-600 dark:text-slate-400">{formatDateTime(order.deliveredAt)}</td>
                  <td className="px-3 py-2">
                    <Link href={`/enrollments/${enrollmentId}/charges`} className="text-xs text-portoBlue hover:underline">
                      Ver cuenta
                    </Link>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-2">
                      {order.status === "pending_order" ? (
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => handleOrdered(order.id)}
                          className="rounded-md border border-sky-300 px-2 py-1 text-xs font-medium text-sky-700 hover:bg-sky-50 disabled:opacity-50"
                        >
                          Marcar pedido
                        </button>
                      ) : null}
                      {order.status !== "delivered" ? (
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => handleDelivered(order.id)}
                          className="rounded-md border border-emerald-300 px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
                        >
                          Marcar entregado
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
