"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { refundPaymentAction } from "@/server/actions/billing";

function formatMoney(amount: number, currency: string) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency }).format(amount);
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("es-MX", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Monterrey",
  });
}

function getMethodLabel(method: string) {
  switch (method) {
    case "cash":
      return "Efectivo";
    case "transfer":
      return "Transferencia";
    case "card":
      return "Tarjeta";
    case "stripe_360player":
      return "360Player";
    case "other":
      return "Otro";
    default:
      return method;
  }
}

function getErrorMessage(code: string) {
  const messages: Record<string, string> = {
    unauthorized: "No tienes permiso para reembolsar este pago.",
    refund_reason_required: "Debes capturar el motivo del reembolso.",
    refunded_at_required: "Debes capturar la fecha y hora real del reembolso.",
    invalid_refund_method: "Selecciona el m\u00e9todo real del reembolso.",
    invalid_refund_date: "La fecha del reembolso no es v\u00e1lida.",
    payment_already_refunded: "Este pago ya fue reembolsado.",
    payment_not_posted: "Solo se pueden reembolsar pagos vigentes.",
    payment_has_no_allocations: "Este pago ya no tiene cargos aplicados.",
    unauthenticated: "Tu sesi\u00f3n expir\u00f3. Inicia sesi\u00f3n de nuevo.",
    debug_read_only: "El modo de solo lectura bloquea cambios.",
  };
  return messages[code] ?? "No se pudo registrar el reembolso.";
}

export function PaymentRefundPanel({
  enrollmentId,
  payment,
  returnTo,
}: {
  enrollmentId: string;
  returnTo: string;
  payment: {
    id: string;
    amount: number;
    currency: string;
    paidAt: string;
    method: string;
    notes: string | null;
  };
}) {
  const router = useRouter();
  const [refundMethod, setRefundMethod] = useState(payment.method);
  const [refundedAt, setRefundedAt] = useState("");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submitRefund() {
    setErrorMessage(null);

    startTransition(async () => {
      const formData = new FormData();
      formData.set("refundMethod", refundMethod);
      formData.set("refundedAt", refundedAt);
      formData.set("reason", reason);
      if (notes.trim()) formData.set("notes", notes.trim());

      const result = await refundPaymentAction(enrollmentId, payment.id, formData);
      if (!result.ok) {
        setErrorMessage(getErrorMessage(result.error));
        return;
      }

      const joiner = returnTo.includes("?") ? "&" : "?";
      router.push(`${returnTo}${joiner}ok=payment_refunded`);
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
        <div className="space-y-2">
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Pago a reembolsar</p>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {formatDateTime(payment.paidAt)} \u00b7 {getMethodLabel(payment.method)}
          </p>
          <p className="text-xl font-semibold text-slate-900 dark:text-slate-100">
            {formatMoney(payment.amount, payment.currency)}
          </p>
          {payment.notes ? <p className="text-sm text-slate-500 dark:text-slate-400">{payment.notes}</p> : null}
        </div>
      </section>

      {errorMessage ? (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-200">
          {errorMessage}
        </div>
      ) : null}

      <section className="space-y-4 rounded-xl border border-amber-200 bg-amber-50/70 p-5 dark:border-amber-800 dark:bg-amber-950/20">
        <div className="space-y-1">
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Registrar reembolso real</h3>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            Esto registra la devoluci\u00f3n del dinero en la fecha real del reembolso. El pago original sigue existiendo y el saldo vuelve a abrirse.
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span className="font-medium text-slate-700 dark:text-slate-300">M\u00e9todo del reembolso</span>
            <select
              value={refundMethod}
              onChange={(event) => setRefundMethod(event.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-slate-900"
            >
              <option value="cash">Efectivo</option>
              <option value="transfer">Transferencia</option>
              <option value="card">Tarjeta</option>
              <option value="stripe_360player">360Player</option>
              <option value="other">Otro</option>
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium text-slate-700 dark:text-slate-300">Fecha y hora del reembolso</span>
            <input
              type="datetime-local"
              value={refundedAt}
              onChange={(event) => setRefundedAt(event.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-slate-900"
            />
          </label>
        </div>

        <label className="block space-y-1 text-sm">
          <span className="font-medium text-slate-700 dark:text-slate-300">Motivo</span>
          <input
            type="text"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Ej: devoluci\u00f3n real al padre, error operativo, cambio cancelado..."
            className="w-full rounded-md border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-slate-900"
          />
        </label>

        <label className="block space-y-1 text-sm">
          <span className="font-medium text-slate-700 dark:text-slate-300">Notas (opcional)</span>
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={3}
            className="w-full rounded-md border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-slate-900"
          />
        </label>

        <button
          type="button"
          disabled={isPending || !reason || !refundedAt}
          onClick={submitRefund}
          className="rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
        >
          {isPending ? "Registrando..." : "Registrar reembolso"}
        </button>
      </section>
    </div>
  );
}
