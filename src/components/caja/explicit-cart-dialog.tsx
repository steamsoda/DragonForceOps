"use client";

import { useEffect, useRef, useState } from "react";
import { Printer, X } from "lucide-react";
import { checkoutCajaCartAction, reviewExplicitCajaCartAction, acknowledgeExplicitCajaCartAction } from "@/server/actions/caja";
import { quoteExplicitCheckout, prepareExplicitCheckout, type ExplicitCheckoutSnapshot,
  type ExplicitCheckoutReceipt, type ExplicitCheckoutCommand } from "@/lib/finance/explicit-checkout";
import { parseCreditAmount } from "@/lib/finance/explicit-credit";
import { printExplicitCheckoutReceipt } from "@/lib/printer";
import { getPrintStatus, isPrintPending, isPrinterBusy, subscribePrintStatus } from "@/lib/printer-attempts";
import { createCheckoutTrace } from "@/lib/perf/checkout-timing";
import { useReadOnly } from "@/components/auth/read-only-controls";
import { saveCartRecovery, clearCartRecovery } from "@/lib/finance/explicit-cart-recovery";
import type { SavedCheckout } from "./checkout-receipt-panel";

function message(code: string) {
  const messages: Record<string, string> = {
    checkout_changed: "Los cargos o el credito cambiaron. Actualiza y revisa el cobro.",
    checkout_request_conflict: "Esta operacion ya tiene otros datos. Consulta el comprobante antes de continuar.",
    credit_source_requires_review: "Administracion debe revisar el origen del credito antes de utilizarlo.",
    prior_month_arrears: "La mensualidad agregada y las mensualidades anteriores deben quedar cubiertas.",
    payment_total_mismatch: "Los pagos deben coincidir exactamente con el dinero por recibir.",
    forbidden: "No tienes permiso para guardar este cobro.",
    checkout_uncertain: "No pudimos confirmar el resultado. Reintenta esta misma operacion sin cambiar los datos.",
    checkout_in_progress: "Ya existe un cobro pendiente de confirmar. Vuelve a abrir la cuenta para recuperar su resultado antes de cobrar de nuevo.",
  };
  return messages[code] ?? "No se pudo preparar el cobro. Revisa los importes o actualiza los cargos.";
}

export function ExplicitCartDialog({ actorId, enrollmentId, form, printerName, onClose, onSaved, onComplete }: {
  actorId: string; enrollmentId: string; form: FormData; printerName: string; onClose: () => void; onSaved: (traceId?: string) => void;
  onComplete?: (saved: SavedCheckout) => void;
}) {
  const readOnly = useReadOnly();
  const fast = form.get("checkoutMode") === "fast";
  const dialog = useRef<HTMLDialogElement>(null), busy = useRef(false), attempt = useRef<FormData | null>(null);
  const autoPrinted = useRef(false);
  const recovered = useRef(form.has("recoverySnapshot")), saveAttempted = useRef(false), mounted = useRef(true);
  const trace = useRef(createCheckoutTrace(form.get("diagnosticTraceId")));
  const ackAttempt = useRef(0), ackConfirmed = useRef(false);
  const [ackState, setAckState] = useState<"pending" | "unconfirmed" | "done">("pending");
  const [, updatePrint] = useState(0);
  const [snapshot, setSnapshot] = useState<ExplicitCheckoutSnapshot | null>(null);
  const [credit, setCredit] = useState<Record<string, string>>({});
  const [first, setFirst] = useState(String(form.get("amount") ?? ""));
  const [second, setSecond] = useState(String(form.get("amount2") ?? ""));
  const [error, setError] = useState<string | null>(null), [saving, setSaving] = useState(false);
  const [phase, setPhase] = useState<"edit" | "confirm" | "uncertain" | "saved">("edit");
  const [receipt, setReceipt] = useState<ExplicitCheckoutReceipt | null>(null);
  const [reload, setReload] = useState(0);
  const split = form.has("amount2");
  useEffect(() => {
    mounted.current = true;
    const unsubscribe = subscribePrintStatus(() => updatePrint(value => value + 1));
    return () => { mounted.current = false; unsubscribe(); };
  }, []);
  useEffect(() => { if (!fast && !dialog.current?.open) dialog.current?.showModal(); }, []);
  useEffect(() => {
    let alive = true; setSnapshot(null); setError(null); setCredit({});
    if (form.has("recoverySnapshot") && reload === 0) {
      const recovered = JSON.parse(String(form.get("recoverySnapshot"))) as ExplicitCheckoutSnapshot;
      const command = JSON.parse(String(form.get("explicitCommand"))) as ExplicitCheckoutCommand;
      attempt.current = form;
      setSnapshot(recovered);
      setCredit(Object.fromEntries(command.creditSelection.map(item => [item.key, String(item.amount)])));
      setFirst(String(command.payments[0]?.amount ?? "")); setSecond(String(command.payments[1]?.amount ?? ""));
      setPhase("uncertain"); setError(message("checkout_uncertain"));
      return;
    }
    if (fast) {
      try {
        const displayed = JSON.parse(String(form.get("displayedSnapshot"))) as ExplicitCheckoutSnapshot;
        quoteExplicitCheckout(displayed);
        attempt.current = form; setSnapshot(displayed);
      } catch { setError(message("checkout_changed")); }
      return;
    }
    const reviewed = new FormData(); form.forEach((value, key) => reviewed.set(key, value));
    reviewed.set("diagnosticTraceId", trace.current.id);
    trace.current.run("review", () => reviewExplicitCajaCartAction(enrollmentId, reviewed)).then(result => {
      if (!alive) return;
      if (result.ok) setSnapshot(result.snapshot); else setError(message(result.error));
    }).catch(() => { if (alive) setError(message("checkout_review_failed")); });
    return () => { alive = false; };
  }, [enrollmentId, form, reload]);
  useEffect(() => {
    if (fast && snapshot && !saveAttempted.current && !recovered.current && !readOnly) void save();
  }, [snapshot]);
  let quote: ReturnType<typeof quoteExplicitCheckout> | null = null;
  const selection = Object.entries(credit).flatMap(([key, value]) => value.trim() === "" || parseCreditAmount(value) === 0 ? [] : [{ key, amount: parseCreditAmount(value) ?? NaN }]);
  try { if (snapshot) quote = quoteExplicitCheckout(snapshot, selection); } catch { /* Invalid inputs keep confirmation disabled. */ }
  const due = quote?.moneyDue;
  useEffect(() => {
    if (due == null || phase !== "edit") return;
    if (!split || due === 0) { setFirst(due.toFixed(2)); setSecond(""); return; }
    const entered = parseCreditAmount(String(form.get("amount") ?? "")) ?? 0;
    const next = entered > 0 && entered < due ? entered : Math.round(due * 50) / 100;
    setFirst(next.toFixed(2)); setSecond((due - next).toFixed(2));
  }, [due, split, form, phase]);
  const fmt = (value: number) => new Intl.NumberFormat("es-MX", { style: "currency", currency: snapshot?.currency ?? "MXN" }).format(value);
  const locked = saving || phase === "uncertain" || phase === "confirm";
  const methodNames: Record<string, string> = { cash: "Efectivo", card: "Tarjeta", transfer: "Transferencia", stripe_360player: "360Player", other: "Otro" };
  useEffect(() => {
    if (receipt && !autoPrinted.current && !recovered.current && getPrintStatus(receipt.operationId) === "idle"
      && !receipt.payments.some(payment => payment.method === "stripe_360player")) {
      autoPrinted.current = true; void print(false);
    }
  }, [receipt]);
  function review() {
    if (!snapshot || !quote || busy.current) return;
    try {
      const payments: ExplicitCheckoutCommand["payments"] = quote.moneyDue === 0 ? [] : [
        { method: String(form.get("method")) as ExplicitCheckoutCommand["payments"][number]["method"], amount: parseCreditAmount(first) ?? NaN },
        ...(split ? [{ method: String(form.get("method2")) as ExplicitCheckoutCommand["payments"][number]["method"], amount: parseCreditAmount(second) ?? NaN }] : []),
      ];
      const plan = prepareExplicitCheckout(snapshot, { requestId: crypto.randomUUID(), creditSelection: selection, payments });
      const next = new FormData(); form.forEach((value, key) => next.set(key, value));
      next.set("checkoutActorId", actorId);
      next.set("diagnosticTraceId", trace.current.id);
      next.set("explicitCommand", JSON.stringify(plan.command)); attempt.current = next;
      setError(null); setPhase("confirm");
    } catch { setError(message("payment_total_mismatch")); }
  }
  async function save() {
    if (readOnly || busy.current || !attempt.current || !snapshot) return;
    try { saveCartRecovery(actorId, enrollmentId, attempt.current, snapshot); }
    catch { setError("No se pudo guardar la recuperacion del cobro en este navegador. No se envio un nuevo cobro; conserva esta ventana y reintenta."); return; }
    busy.current = true; setSaving(true); setError(null);
    if (saveAttempted.current) recovered.current = true;
    saveAttempted.current = true;
    try {
      const result = await trace.current.run("save_response", () => checkoutCajaCartAction(enrollmentId, attempt.current!));
      if (result.ok) {
        recovered.current ||= result.recovered;
        void trace.current.run("saved_ui", () => new Promise<void>(resolve => requestAnimationFrame(() => resolve())));
        try { onSaved(trace.current.id); } catch { /* A refresh cannot change a committed receipt. */ }
        if (onComplete) {
          onComplete({ receipt: result.receipt, actorId, recovered: recovered.current, traceId: trace.current.id });
        } else {
          setReceipt(result.receipt); setPhase("saved");
          void acknowledge(result.receipt.operationId);
        }
      } else {
        const unresolved = result.uncertain || result.error === "checkout_request_conflict" || result.error === "forbidden";
        if (!unresolved) clearCartRecovery(actorId, enrollmentId);
        setError(message(result.error)); setPhase(unresolved ? "uncertain" : "edit");
        if (!unresolved) { attempt.current = null; if (!fast) { setSnapshot(null); setReload(n => n + 1); } }
      }
    } catch { setError(message("checkout_uncertain")); setPhase("uncertain"); }
    finally { busy.current = false; setSaving(false); }
  }
  async function acknowledge(requestId: string) {
    const current = ++ackAttempt.current;
    if (mounted.current) setAckState("pending");
    const timer = setTimeout(() => {
      if (mounted.current && !ackConfirmed.current && ackAttempt.current === current) setAckState("unconfirmed");
    }, 10000);
    try {
      const result = await acknowledgeExplicitCajaCartAction(enrollmentId, requestId, trace.current.id);
      if (result.ok) {
        ackConfirmed.current = true;
        try { clearCartRecovery(actorId, enrollmentId, requestId); } catch { /* Safe original-request recovery can remain. */ }
        if (mounted.current) setAckState("done");
      } else if (mounted.current && !ackConfirmed.current && ackAttempt.current === current) setAckState("unconfirmed");
    } catch {
      if (mounted.current && !ackConfirmed.current && ackAttempt.current === current) setAckState("unconfirmed");
    } finally { clearTimeout(timer); }
  }
  async function print(manual = true) {
    if (!receipt || readOnly || isPrintPending(receipt.operationId)) return;
    if (manual && (recovered.current || getPrintStatus(receipt.operationId) !== "idle")
      && !window.confirm("El cobro ya esta guardado. Verifica si el comprobante ya salio: reimprimir puede generar otra copia. Continuar?")) return;
    try { await printExplicitCheckoutReceipt(printerName, receipt, trace.current.id); }
    catch { /* Independent printer status retains late completion outside the dialog. */ }
  }
  const printStatus = receipt ? getPrintStatus(receipt.operationId) : "idle";
  if (fast) return <section className="mx-auto max-w-3xl space-y-5 border-y py-8" aria-busy={saving}>
    <h2 className="text-xl font-semibold">{phase === "uncertain" ? "Pago pendiente de confirmar" : error ? "Revisa el cobro" : "Procesando pago..."}</h2>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {phase === "uncertain" ? <button type="button" disabled={saving || readOnly} onClick={() => void save()} className="rounded bg-portoBlue px-4 py-3 text-white disabled:opacity-40">{saving ? "Confirmando..." : "Reintentar mismo cobro"}</button>
      : error && !saving && <button type="button" onClick={onClose} className="rounded border px-4 py-3">Regresar al alumno</button>}
  </section>;
  return <dialog ref={dialog} onCancel={event => { event.preventDefault(); if (!saving && phase !== "uncertain") onClose(); }}
    className="w-[calc(100%-2rem)] max-w-2xl max-h-[90dvh] overflow-y-auto rounded-lg border border-slate-200 p-0 backdrop:bg-black/40">
    <div className="flex items-center justify-between border-b px-5 py-4"><h2 className="text-lg font-semibold">{receipt ? "Cobro registrado" : "Revisar cobro"}</h2>
      <button type="button" title="Cerrar" aria-label="Cerrar" disabled={saving || phase === "uncertain"} onClick={onClose} className="p-2 disabled:opacity-40"><X size={18} /></button></div>
    <div className="space-y-4 p-5">
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {!snapshot && !error && <p>Cargando cargos...</p>}
      {receipt ? <>
        {ackState !== "done" && <div role="status" className="text-sm text-amber-800">
          <p>{ackState === "pending" ? "Cobro guardado. Confirmando cierre de la operacion..." : "Cobro guardado. Cierre pendiente de confirmar; no vuelvas a cobrar."}</p>
          {ackState === "unconfirmed" && <button type="button" disabled={readOnly} onClick={() => void acknowledge(receipt.operationId)} className="mt-2 rounded border px-3 py-2">Reintentar confirmacion</button>}
        </div>}
        <p className="text-sm">Operacion: {receipt.operationId}</p>
        {receipt.lines.map(line => <div key={line.key} className="border-b pb-2 text-sm"><p className="font-medium">{line.description}</p><p>Dinero: {fmt(line.moneyReceived)} · Credito: {fmt(line.creditApplied)} · Pendiente: {fmt(line.pendingAfter)}</p></div>)}
        <p>Dinero recibido: <strong>{fmt(receipt.moneyReceived)}</strong></p><p>Credito utilizado: {fmt(receipt.creditApplied)}</p>
        <p>Credito disponible: {fmt(receipt.creditRemaining)}</p><p>Cargos pendientes: {fmt(receipt.pendingChargesTotal)}</p>
        <p role="status" className="text-sm">{printStatus === "printing" ? "Cobro guardado. Enviando comprobante..."
          : printStatus === "unknown" ? "Cobro guardado. Impresion sin confirmar; revisa la impresora antes de reimprimir."
          : printStatus === "failed" ? "Cobro guardado. No se confirmo la impresion."
          : printStatus === "sent" ? "Comprobante enviado a la impresora." : isPrinterBusy(printerName) ? "Cobro guardado. Hay otra impresion pendiente en esta impresora." : recovered.current ? "Cobro recuperado. Verifica el comprobante antes de reimprimir." : ""}</p>
        <button type="button" disabled={readOnly || isPrintPending(receipt.operationId) || isPrinterBusy(printerName)} onClick={() => void print()} className="flex items-center gap-2 rounded border px-4 py-2 disabled:opacity-40"><Printer size={16} />Imprimir comprobante</button>
      </> : <>
        {snapshot && <><p className="text-sm">Credito disponible: <strong>{fmt(snapshot.availableCredit)}</strong></p>
          <div className="space-y-3">{snapshot.lines.map(line => <div key={line.key} className="grid grid-cols-[minmax(0,1fr)_7rem] items-center gap-3 border-b pb-3">
            <div className="min-w-0 text-sm"><p className="break-words font-medium">{line.description}</p><p>Por cubrir: {fmt(line.due)}</p>{!line.creditAllowed && <p>Sin credito</p>}</div>
            <label className="text-xs">Usar credito<input aria-label={`Credito para ${line.description}`} type="text" inputMode="decimal" value={credit[line.key] ?? ""}
              disabled={locked || !line.creditAllowed} onChange={event => setCredit(old => ({ ...old, [line.key]: event.target.value }))}
              className="mt-1 w-full rounded border p-2 text-sm disabled:bg-slate-100" placeholder="0.00" /></label>
          </div>)}</div>
          {quote && <><p>Credito elegido: {fmt(quote.creditApplied)}</p><p className="font-semibold">Dinero por recibir: {fmt(quote.moneyDue)}</p>
            {quote.moneyDue > 0 && <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="text-sm">{methodNames[String(form.get("method"))] ?? "Pago"}<input aria-label="Primer pago" inputMode="decimal" value={first} disabled={locked} onChange={e => setFirst(e.target.value)} className="mt-1 w-full rounded border p-2" /></label>
              {split && <label className="text-sm">{methodNames[String(form.get("method2"))] ?? "Segundo pago"}<input aria-label="Segundo pago" inputMode="decimal" value={second} disabled={locked} onChange={e => setSecond(e.target.value)} className="mt-1 w-full rounded border p-2" /></label>}
            </div>}
          </>}
        </>}
        <div className="flex flex-wrap justify-end gap-2">
          {phase === "edit" && <button type="button" disabled={saving} onClick={() => setReload(n => n + 1)} className="rounded border px-3 py-2">Actualizar cargos</button>}
          {phase === "confirm" && <button type="button" disabled={saving} onClick={() => setPhase("edit")} className="rounded border px-3 py-2">Volver</button>}
          <button type="button" disabled={!quote || saving || readOnly} onClick={phase === "edit" ? review : save} className="rounded bg-portoBlue px-4 py-2 text-white disabled:opacity-40">
            {saving ? "Guardando..." : phase === "uncertain" ? "Reintentar mismo cobro" : phase === "confirm" ? "Confirmar cobro" : "Revisar importes"}
          </button>
        </div>
      </>}
    </div>
  </dialog>;
}
