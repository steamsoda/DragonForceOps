"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, CheckCircle2, Printer } from "lucide-react";
import type { ExplicitCheckoutReceipt } from "@/lib/finance/explicit-checkout";
import { acknowledgeExplicitCajaCartAction } from "@/server/actions/caja";
import { clearCartRecovery } from "@/lib/finance/explicit-cart-recovery";
import { printExplicitCheckoutReceipt } from "@/lib/printer";
import { getPrintStatus, isPrintPending, isPrinterBusy, subscribePrintStatus } from "@/lib/printer-attempts";
import { useReadOnly } from "@/components/auth/read-only-controls";

export type SavedCheckout = { receipt: ExplicitCheckoutReceipt; actorId: string; recovered: boolean; traceId: string };

export function CheckoutReceiptPanel({ saved, printerName, onBack, onNext }: {
  saved: SavedCheckout; printerName: string; onBack: () => void; onNext?: () => void;
}) {
  const { receipt, actorId, traceId, recovered } = saved;
  const readOnly = useReadOnly();
  const mounted = useRef(true), confirmed = useRef(false), ackAttempt = useRef(0), autoStarted = useRef(false);
  const [ack, setAck] = useState<"pending" | "unconfirmed" | "done">("pending");
  const [, refresh] = useState(0);
  const fmt = (value: number) => new Intl.NumberFormat("es-MX", { style: "currency", currency: receipt.currency }).format(value);
  const methods: Record<string, string> = { cash: "Efectivo", card: "Tarjeta", transfer: "Transferencia", stripe_360player: "360Player", other: "Otro" };
  async function acknowledge() {
    if (readOnly) return;
    const attempt = ++ackAttempt.current;
    if (mounted.current) setAck("pending");
    const timer = setTimeout(() => { if (mounted.current && !confirmed.current && ackAttempt.current === attempt) setAck("unconfirmed"); }, 10000);
    try {
      const result = await acknowledgeExplicitCajaCartAction(receipt.enrollmentId, receipt.operationId, traceId);
      if (result.ok) {
        confirmed.current = true;
        try { clearCartRecovery(actorId, receipt.enrollmentId, receipt.operationId); } catch { /* Retain safe original-request recovery. */ }
        if (mounted.current) setAck("done");
      } else if (mounted.current && !confirmed.current && ackAttempt.current === attempt) setAck("unconfirmed");
    } catch { if (mounted.current && !confirmed.current && ackAttempt.current === attempt) setAck("unconfirmed"); }
    finally { clearTimeout(timer); }
  }
  async function print(manual = true) {
    if (readOnly || isPrintPending(receipt.operationId) || isPrinterBusy(printerName)) return;
    if (manual && (recovered || getPrintStatus(receipt.operationId) !== "idle")
      && !window.confirm("El pago ya esta guardado. Revisa si el comprobante ya salio; reimprimir puede generar otra copia. Continuar?")) return;
    try { await printExplicitCheckoutReceipt(printerName, receipt, traceId); } catch { /* Registry retains pending and late results across navigation. */ }
  }
  useEffect(() => {
    mounted.current = true;
    const unsubscribe = subscribePrintStatus(() => refresh(value => value + 1));
    void acknowledge();
    if (!autoStarted.current && !recovered && !readOnly && getPrintStatus(receipt.operationId) === "idle"
      && !receipt.payments.some(payment => payment.method === "stripe_360player")) {
      autoStarted.current = true; void print(false);
    }
    return () => { mounted.current = false; unsubscribe(); };
  }, []);
  const status = getPrintStatus(receipt.operationId);
  return <section className="mx-auto w-full max-w-3xl space-y-5" aria-label="Comprobante del pago">
    <div className="border-y border-emerald-300 bg-emerald-50 px-5 py-7 text-center text-emerald-900">
      <CheckCircle2 aria-hidden="true" className="mx-auto mb-3" size={40} />
      <h2 className="text-2xl font-bold">Pago registrado</h2>
      <p className="mt-2 text-3xl font-bold">{fmt(receipt.moneyReceived)}</p>
      <p className="mt-2 break-words font-medium">{receipt.playerName}</p>
      <p className="text-sm">Categoria: {receipt.birthYear ?? "no registrada"} · {receipt.campusName}</p>
    </div>
    <div className="space-y-3 px-1 text-sm">
      {receipt.lines.map(line => <div key={line.key} className="flex justify-between gap-4 border-b pb-2">
        <span className="min-w-0 break-words">{line.description}</span><strong className="shrink-0">{fmt(line.moneyReceived + line.creditApplied)}</strong>
      </div>)}
      {receipt.payments.map(payment => <div key={payment.id} className="flex flex-wrap justify-between gap-2">
        <span>{methods[payment.method] ?? payment.method} · {fmt(payment.amount)}</span><span className="break-all text-slate-600">{payment.folio ?? "Sin folio"}</span>
      </div>)}
      {receipt.creditApplied > 0 && <p>Credito utilizado: <strong>{fmt(receipt.creditApplied)}</strong></p>}
      {receipt.creditRemaining > 0 && <p>Credito disponible: {fmt(receipt.creditRemaining)}</p>}
      {receipt.pendingChargesTotal > 0 && <p>Pendiente: {fmt(receipt.pendingChargesTotal)}</p>}
      <p role="status" className="text-slate-600">{status === "printing" ? "Pago guardado. Enviando comprobante..."
        : status === "unknown" ? "Impresion sin confirmar. Revisa la impresora antes de reimprimir."
        : status === "failed" ? "Pago guardado. No se confirmo la impresion."
        : status === "sent" ? "Comprobante enviado a la impresora."
        : isPrinterBusy(printerName) ? "Hay otra impresion pendiente. Este comprobante esta guardado."
        : recovered ? "Comprobante recuperado. No se imprimio automaticamente." : "Comprobante guardado."}</p>
      {ack !== "done" && <div className="text-xs text-amber-800" role="status">
        {ack === "pending" ? "Confirmando cierre de la operacion..." : "Pago guardado. Cierre pendiente; no vuelvas a cobrar."}
        {ack === "unconfirmed" && <button type="button" disabled={readOnly} onClick={() => void acknowledge()} className="ml-2 underline">Reintentar confirmacion</button>}
      </div>}
    </div>
    <div className="flex flex-wrap gap-3">
      <button type="button" disabled={readOnly || isPrintPending(receipt.operationId) || isPrinterBusy(printerName)} onClick={() => void print()} className="flex items-center justify-center gap-2 rounded border px-4 py-3 text-sm disabled:opacity-40"><Printer size={16} />Imprimir comprobante</button>
      <button type="button" onClick={onBack} className="flex flex-1 items-center justify-center gap-2 rounded border border-portoBlue px-4 py-3 text-sm font-semibold text-portoBlue"><ArrowLeft size={16} />Regresar al alumno</button>
      {onNext && <button type="button" onClick={onNext} className="flex flex-1 items-center justify-center gap-2 rounded bg-portoBlue px-4 py-3 text-sm font-semibold text-white">Siguiente alumno<ArrowRight size={16} /></button>}
    </div>
  </section>;
}
