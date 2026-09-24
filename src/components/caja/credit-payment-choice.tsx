"use client";

import { WriteButton } from "@/components/auth/read-only-controls";

export function CreditPaymentChoice({ available, currency, disabled, onChoose }: {
  available: number | null; currency: string; disabled: boolean; onChoose: () => void;
}) {
  const resolved = available !== null && Number.isFinite(available) && available >= 0;
  const usable = resolved && available > 0;
  return <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-3 dark:border-slate-700">
    <p className="text-sm text-slate-600 dark:text-slate-400" aria-live="polite">
      Crédito disponible: <strong>{resolved
        ? new Intl.NumberFormat("es-MX", { style: "currency", currency }).format(available)
        : "Por confirmar"}</strong>
    </p>
    <WriteButton type="button" disabled={disabled || !usable} onClick={onChoose}
      className="rounded border border-portoBlue px-3 py-2 text-sm font-semibold text-portoBlue disabled:border-slate-300 disabled:bg-slate-100 disabled:text-slate-500 dark:disabled:border-slate-700 dark:disabled:bg-slate-800">
      Usar crédito
    </WriteButton>
  </div>;
}
