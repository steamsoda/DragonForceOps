"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Printer, RefreshCw } from "lucide-react";
import { loadPendingOperations, resolvePendingOperation } from "@/server/actions/operation-resolution";
import { operationResolutionError, type PendingOperations, type OperationResolution } from "@/lib/finance/operation-resolution";
import type { ExplicitCheckoutReceipt } from "@/lib/finance/explicit-checkout";
import type { CreditReceipt } from "@/lib/finance/explicit-credit";
import { printCreditReceipt, printExplicitCheckoutReceipt } from "@/lib/printer";

export function PendingOperationsPanel({ enrollmentId, printerName, readOnly, onBack, onBusyChange, onResolved }: {
  enrollmentId: string; printerName: string; readOnly: boolean; onBack: () => void; onBusyChange: (busy: boolean) => void; onResolved?: () => void;
}) {
  const [data, setData] = useState<PendingOperations | null>(null);
  const [selected, setSelected] = useState("");
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [working, setWorking] = useState(false);
  const [serverReadOnly, setServerReadOnly] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<OperationResolution | null>(null);
  const busy = useRef(false);
  const choice = data?.pending.find(row => `${row.kind}:${row.requestId}` === selected);
  useEffect(() => { onBusyChange(working); return () => onBusyChange(false); }, [working, onBusyChange]);
  const date = (value: string) => new Date(value).toLocaleString("es-MX", { timeZone: "America/Monterrey" });
  async function reload() {
    if (busy.current) return;
    busy.current = true; setWorking(true); setError(null); setSelected(""); setConfirmed(false); setReason("");
    try {
      const response: Awaited<ReturnType<typeof loadPendingOperations>> = readOnly
        ? await fetch(`/api/director-readonly/caja?mode=operations&enrollmentId=${encodeURIComponent(enrollmentId)}`, { cache: "no-store" })
          .then(result => { if (!result.ok) throw new Error("Operations unavailable"); return result.json(); })
        : await loadPendingOperations(enrollmentId);
      if (response.ok) { setData(response.data); setServerReadOnly(response.readOnly); }
      else { setData(null); setError(operationResolutionError(response.code)); }
    } catch { setData(null); setError(operationResolutionError("unavailable")); }
    finally { busy.current = false; setWorking(false); }
  }
  useEffect(() => { void reload(); }, [enrollmentId]);
  async function resolve() {
    if (busy.current || !choice || !confirmed || readOnly || serverReadOnly) return;
    busy.current = true; setWorking(true); setError(null);
    try {
      const response = await resolvePendingOperation({ enrollmentId, kind: choice.kind, requestId: choice.requestId, reason, confirmed: true });
      if (response.ok) {
        setResult(response.result); setData(previous => previous ? { ...previous, pending: previous.pending.filter(row => row !== choice) } : previous);
        setSelected(""); setConfirmed(false); setReason("");
        try { onResolved?.(); } catch { /* Audit and result remain committed. */ }
      } else { setError(operationResolutionError(response.code)); setConfirmed(false); }
    } catch { setError(operationResolutionError("unavailable")); setConfirmed(false); }
    finally { busy.current = false; setWorking(false); }
  }
  async function print(saved: OperationResolution) {
    if (busy.current || !saved.receipt || readOnly || serverReadOnly) return;
    busy.current = true; setWorking(true);
    try {
      if (saved.kind === "cart") await printExplicitCheckoutReceipt(printerName, saved.receipt as ExplicitCheckoutReceipt);
      else await printCreditReceipt(printerName, saved.receipt as CreditReceipt);
    } catch { setError("La resolucion esta guardada. No se pudo imprimir el comprobante."); }
    finally { busy.current = false; setWorking(false); }
  }
  return <section className="space-y-3" aria-busy={working}>
    <div className="flex items-center justify-between gap-2">
      <h3 className="font-semibold">Operaciones pendientes</h3>
      <div className="flex gap-2"><button type="button" onClick={onBack} disabled={working} title="Volver" aria-label="Volver" className="p-2"><ArrowLeft size={18} /></button>
        <button type="button" onClick={() => void reload()} disabled={working} title="Actualizar operaciones" aria-label="Actualizar operaciones" className="p-2"><RefreshCw size={18} /></button></div>
    </div>
    {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
    {working && <p role="status" className="text-sm">Procesando...</p>}
    {result && <p role="status" className="text-sm text-emerald-700">{result.outcome === "receipt_recovered" ? "Comprobante recuperado. No se repitio el cobro." : "Intento sin registro cerrado. No se modificaron pagos ni credito."}</p>}
    {result?.receipt && <button type="button" disabled={working || readOnly || serverReadOnly} onClick={() => void print(result)} className="inline-flex items-center gap-2 rounded border px-3 py-2 text-sm"><Printer size={16} />Imprimir comprobante recuperado</button>}
    {data?.pending.map(row => <label key={`${row.kind}:${row.requestId}`} className="flex gap-3 border-b py-3 text-sm">
      <input type="radio" name="pending-operation" checked={selected === `${row.kind}:${row.requestId}`} disabled={working}
        onChange={() => { setSelected(`${row.kind}:${row.requestId}`); setConfirmed(false); setReason(""); setResult(null); }} />
      <span className="min-w-0 break-words"><strong>{row.kind === "cart" ? "Cobro de Caja" : "Aplicacion de credito"}</strong>
        <span className="block">{row.actorEmail}</span><span className="block text-xs text-slate-500">{date(row.createdAt)}</span>
        <span className="block">{row.committed ? "Registro guardado" : "Sin registro confirmado"}</span>
        <span className="block break-all text-xs text-slate-500">{row.requestId}</span></span>
    </label>)}
    {data?.pending.length === 0 && <p className="text-sm">Sin operaciones pendientes.</p>}
    {choice && <div className="space-y-3">
      {!choice.canResolve && <p className="text-sm text-amber-800">Intento reciente. Espera dos minutos desde su inicio y actualiza.</p>}
      <label className="block text-sm">Motivo<textarea value={reason} maxLength={500} disabled={working || readOnly || serverReadOnly}
        onChange={event => setReason(event.target.value)} className="mt-1 min-h-20 w-full rounded border p-2" /></label>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={confirmed} disabled={working || readOnly || serverReadOnly}
        onChange={event => setConfirmed(event.target.checked)} />Revise la operacion con el operador. Si no existe un registro guardado, autorizo cerrar este intento sin efectuar un cobro.</label>
      <button type="button" disabled={working || readOnly || serverReadOnly || !confirmed || reason.trim().length < 8 || !choice.canResolve}
        onClick={() => void resolve()} className="rounded bg-portoBlue px-3 py-2 text-sm text-white disabled:opacity-40">{choice.committed ? "Recuperar comprobante" : "Cerrar intento sin registro"}</button>
    </div>}
    {!!data?.history.length && <details><summary className="cursor-pointer text-sm">Resoluciones anteriores</summary>
      {data.history.map(row => <div key={`${row.kind}:${row.requestId}`} className="border-b py-3 text-sm">
        <p>{date(row.resolvedAt)}</p><p className="break-words">{row.reason}</p>
        <p>{row.result.outcome === "receipt_recovered" ? "Comprobante recuperado" : "Intento sin registro cerrado"}</p>
        {row.result.receipt && <button type="button" disabled={working || readOnly || serverReadOnly} title="Reimprimir comprobante" aria-label="Reimprimir comprobante" onClick={() => void print(row.result)} className="p-2"><Printer size={18} /></button>}
      </div>)}
    </details>}
  </section>;
}
