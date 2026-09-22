"use client";

import { useState } from "react";
import { Printer } from "lucide-react";
import { useReadOnly } from "@/components/auth/read-only-controls";
import { chargeOperationReceiptSchema } from "@/lib/finance/charge-operation-receipt";
import { printChargeOperationReceipt } from "@/lib/printer";

export function PrintChargeOperationButton({ enrollmentId, chargeId, printerName }: {
  enrollmentId: string; chargeId: string; printerName: string;
}) {
  const readOnly = useReadOnly();
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  async function print() {
    if (busy || readOnly) return;
    setBusy(true); setError(null);
    try {
      const response = await fetch(`/api/charge-operation-receipt?enrollmentId=${encodeURIComponent(enrollmentId)}&chargeId=${encodeURIComponent(chargeId)}`, { cache: "no-store" });
      if (response.status === 404) throw new Error("Esta operación anterior no tiene un comprobante guardado.");
      if (!response.ok) throw new Error("No se pudo cargar el comprobante. Puedes intentar imprimirlo de nuevo.");
      const receipt = chargeOperationReceiptSchema.parse(await response.json());
      try { await printChargeOperationReceipt(printerName, receipt); }
      catch { throw new Error("No se pudo imprimir. La operación ya está registrada; reintenta solo la impresión."); }
    } catch (err) { setError(err instanceof Error ? err.message : "No se pudo cargar el comprobante."); }
    finally { setBusy(false); }
  }
  return <div className="min-w-0 space-y-1">
    <button type="button" disabled={busy || readOnly} onClick={print}
      className="inline-flex max-w-full items-center gap-1 rounded-md border border-slate-300 px-2 py-1.5 text-xs disabled:opacity-50">
      <Printer size={14} className="shrink-0" /><span>{busy ? "Imprimiendo..." : "Imprimir comprobante"}</span>
    </button>
    {error && <p role="alert" className="max-w-sm text-xs text-rose-700">{error}</p>}
  </div>;
}
