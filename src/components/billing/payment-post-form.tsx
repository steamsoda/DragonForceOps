"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { PrintReceiptButton } from "@/components/caja/print-receipt-button";
import type { EnrollmentPaymentResult } from "@/server/actions/payments";

type PaymentPostFormProps = {
  currentBalance: number;
  currency: string;
  action: (formData: FormData) => Promise<EnrollmentPaymentResult>;
  printerName: string;
};

const ERROR_LABELS: Record<string, string> = {
  invalid_form: "Los datos del pago son inválidos.",
  unauthenticated: "Tu sesión no es válida.",
  enrollment_not_found: "Inscripción no encontrada.",
  no_pending_charges: "No hay cargos pendientes.",
  payment_insert_failed: "No se pudo registrar el pago. Intenta de nuevo.",
  allocation_insert_failed: "No se pudieron guardar las asignaciones. Intenta de nuevo.",
};

function formatMoney(amount: number, currency: string) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency }).format(amount);
}

export function PaymentPostForm({ currentBalance, currency, action, printerName }: PaymentPostFormProps) {
  const defaultAmount = currentBalance > 0 ? currentBalance.toFixed(2) : "";
  const router = useRouter();
  const refreshed = useRef(false);

  const [state, formAction, isPending] = useActionState(
    async (_prev: EnrollmentPaymentResult | null, formData: FormData) => action(formData),
    null
  );

  useEffect(() => {
    if (state?.ok && !refreshed.current) {
      refreshed.current = true;
      router.refresh();
    }
  }, [state, router]);

  if (state?.ok) {
    return (
      <div className="rounded-md border border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/20 p-4 space-y-3">
        <p className="text-sm font-medium text-emerald-800 dark:text-emerald-200">
          Pago registrado — {formatMoney(state.receipt.amount, state.receipt.currency)}
        </p>
        <PrintReceiptButton data={state.receipt} printerName={printerName} autoPrint />
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-3 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
      <p className="text-sm font-medium text-slate-800 dark:text-slate-200">Registrar pago</p>
      {state?.ok === false && (
        <div className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-800 dark:bg-rose-950/20 dark:text-rose-300">
          {ERROR_LABELS[state.error] ?? "Ocurrió un error. Intenta de nuevo."}
        </div>
      )}
      {currentBalance > 0 ? (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Saldo pendiente:{" "}
          <span className="font-semibold text-rose-600">{formatMoney(currentBalance, currency)}</span>. El monto
          esta pre-llenado; ajusta si es un pago parcial.
        </p>
      ) : (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          No hay saldo pendiente. Un pago aqui generara un credito en la cuenta.
        </p>
      )}
      <div className="grid gap-3 md:grid-cols-3">
        <label className="space-y-1 text-sm">
          <span className="font-medium text-slate-700 dark:text-slate-300">Monto del pago</span>
          <input
            type="number"
            name="amount"
            step="0.01"
            min="0.01"
            required
            defaultValue={defaultAmount}
            className="w-full rounded-md border border-slate-300 dark:border-slate-600 px-3 py-2"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-medium text-slate-700 dark:text-slate-300">Metodo de pago</span>
          <select name="method" required className="w-full rounded-md border border-slate-300 dark:border-slate-600 px-3 py-2">
            <option value="cash">Efectivo</option>
            <option value="transfer">Transferencia</option>
            <option value="card">Tarjeta</option>
            <option value="stripe_360player">Stripe 360Player</option>
            <option value="other">Otro</option>
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-medium text-slate-700 dark:text-slate-300">Notas (opcional)</span>
          <input
            type="text"
            name="notes"
            placeholder="Referencia, folio, etc."
            className="w-full rounded-md border border-slate-300 dark:border-slate-600 px-3 py-2"
          />
        </label>
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Los cargos pendientes se cubren automaticamente del mas antiguo al mas reciente.
      </p>
      <button
        type="submit"
        disabled={isPending}
        className="rounded-md bg-portoBlue px-4 py-2 text-sm font-medium text-white hover:bg-portoDark disabled:opacity-60"
      >
        {isPending ? "Registrando…" : "Registrar pago"}
      </button>
    </form>
  );
}
