"use client";

import { useState, useTransition } from "react";
import {
  createUniformOrderAction,
  markUniformDeliveredAction,
  type UniformOrder,
} from "@/server/actions/uniforms";

const SIZES = ["XCH JR", "CH JR", "M JR", "G JR", "XL JR", "CH", "M", "G", "XL"];

const TYPE_LABELS: Record<string, string> = {
  training: "Entrenamiento",
  game: "Juego",
};

export function UniformOrdersSection({
  playerId,
  enrollmentId,
  initialOrders,
}: {
  playerId: string;
  enrollmentId: string;
  initialOrders: UniformOrder[];
}) {
  const [orders, setOrders] = useState<UniformOrder[]>(initialOrders);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await createUniformOrderAction(playerId, enrollmentId, fd);
      if (!result.ok) {
        setError("Error al registrar el pedido. Intenta de nuevo.");
        return;
      }
      // Refresh orders from server
      const { getUniformOrdersAction } = await import("@/server/actions/uniforms");
      const updated = await getUniformOrdersAction(enrollmentId);
      setOrders(updated);
      setShowForm(false);
    });
  }

  function handleDeliver(orderId: string) {
    setError(null);
    startTransition(async () => {
      const result = await markUniformDeliveredAction(orderId, playerId);
      if (!result.ok) {
        setError("Error al marcar como entregado.");
        return;
      }
      setOrders((prev) =>
        prev.map((o) =>
          o.id === orderId
            ? { ...o, status: "delivered" as const, deliveredAt: new Date().toISOString() }
            : o
        )
      );
    });
  }

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Uniformes</h2>
        {!showForm && (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="rounded-md bg-portoBlue px-3 py-1.5 text-sm font-medium text-white hover:bg-portoDark"
          >
            + Registrar pedido
          </button>
        )}
      </div>

      {error && (
        <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
      )}

      {showForm && (
        <form
          onSubmit={handleCreate}
          className="rounded-md border border-portoBlue bg-blue-50 dark:bg-blue-950/20 p-4 space-y-3"
        >
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">Nuevo pedido de uniforme</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm">
              <span className="font-medium text-slate-700 dark:text-slate-300">Tipo</span>
              <select
                name="uniformType"
                required
                className="w-full rounded-md border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm"
              >
                <option value="training">Entrenamiento</option>
                <option value="game">Juego</option>
              </select>
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium text-slate-700 dark:text-slate-300">Talla</span>
              <select
                name="size"
                className="w-full rounded-md border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm"
              >
                <option value="">Sin especificar</option>
                {SIZES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </label>
          </div>
          <label className="block space-y-1 text-sm">
            <span className="font-medium text-slate-700 dark:text-slate-300">Notas (opcional)</span>
            <input
              type="text"
              name="notes"
              placeholder="Ej. urgente, portero..."
              className="w-full rounded-md border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm"
            />
          </label>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={isPending}
              className="rounded-md bg-portoBlue px-4 py-2 text-sm font-medium text-white hover:bg-portoDark disabled:opacity-50"
            >
              {isPending ? "Guardando…" : "Registrar pedido"}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded-md border border-slate-300 dark:border-slate-600 px-4 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      {orders.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">Sin pedidos de uniforme registrados.</p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-slate-200 dark:border-slate-700">
          <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700 text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800 text-left text-xs uppercase tracking-wide text-slate-600 dark:text-slate-400">
              <tr>
                <th className="px-3 py-2">Tipo</th>
                <th className="px-3 py-2">Talla</th>
                <th className="px-3 py-2">Estado</th>
                <th className="px-3 py-2">Fecha pedido</th>
                <th className="px-3 py-2">Entregado</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {orders.map((order) => (
                <tr key={order.id}>
                  <td className="px-3 py-2 font-medium">{TYPE_LABELS[order.uniformType]}</td>
                  <td className="px-3 py-2 text-slate-600 dark:text-slate-400">{order.size ?? "-"}</td>
                  <td className="px-3 py-2">
                    {order.status === "delivered" ? (
                      <span className="rounded-full bg-emerald-100 dark:bg-emerald-900/40 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">Entregado</span>
                    ) : (
                      <span className="rounded-full bg-amber-100 dark:bg-amber-900/40 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300">Pedido</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-slate-600 dark:text-slate-400">
                    {new Date(order.orderedAt).toLocaleDateString("es-MX")}
                  </td>
                  <td className="px-3 py-2 text-slate-600 dark:text-slate-400">
                    {order.deliveredAt ? new Date(order.deliveredAt).toLocaleDateString("es-MX") : "-"}
                  </td>
                  <td className="px-3 py-2">
                    {order.status === "ordered" && (
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => handleDeliver(order.id)}
                        className="rounded-md border border-emerald-300 px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
                      >
                        Marcar entregado
                      </button>
                    )}
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
