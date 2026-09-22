"use client";

import { useEffect, useRef, useState } from "react";
import { Printer, RefreshCw, X } from "lucide-react";
import { useReadOnly } from "@/components/auth/read-only-controls";
import { loadExplicitCredit, confirmExplicitCredit, acknowledgeExplicitCredit } from "@/server/actions/explicit-credit";
import { printCreditReceipt } from "@/lib/printer";
import { PendingOperationsPanel } from "@/components/caja/pending-operations";
import { creditCommandSchema, creditErrorMessage, parseCreditAmount,
  type CreditCommand, type CreditReceipt, type CreditWorkspace } from "@/lib/finance/explicit-credit";

// Shared by Caja and historical enrollment accounts; all writes require review.
export function ExplicitCreditPanel(props: { enrollmentId: string; printerName: string; onApplied?: () => void; onRecoveryResolved?: () => void }) {
  return <CreditPanel key={props.enrollmentId} {...props} />;
}

function CreditPanel({ enrollmentId, printerName, onApplied, onRecoveryResolved }: { enrollmentId: string; printerName: string; onApplied?: () => void; onRecoveryResolved?: () => void }) {
  const readOnly = useReadOnly();
  const dialog = useRef<HTMLDialogElement>(null);
  const busy = useRef(false);
  const attempt = useRef<CreditCommand | null>(null);
  const [open, setOpen] = useState(false);
  const [working, setWorking] = useState(false);
  const [workspace, setWorkspace] = useState<CreditWorkspace | null>(null);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [phase, setPhase] = useState<"edit" | "review" | "receipt" | "operations">("edit");
  const [receipt, setReceipt] = useState<CreditReceipt | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const money = (value: number) => new Intl.NumberFormat("es-MX", { style: "currency",
    currency: (phase === "receipt" ? receipt?.currency : workspace?.currency) ?? "MXN" }).format(value);
  const locked = readOnly || workspace?.readOnly === true || workspace?.recoveryBlocked === true;
  useEffect(() => { if (open) dialog.current?.showModal(); else dialog.current?.close(); }, [open]);

  async function reload() {
    if (busy.current || uncertain) return;
    busy.current = true; setWorking(true); setError(null);
    try {
      const result: Awaited<ReturnType<typeof loadExplicitCredit>> = readOnly
        ? await fetch(`/api/director-readonly/caja?mode=credit&enrollmentId=${encodeURIComponent(enrollmentId)}`, { cache: "no-store" })
          .then(response => { if (!response.ok) throw new Error("Credit unavailable"); return response.json(); })
        : await loadExplicitCredit(enrollmentId);
      if (!result.ok) { setError(creditErrorMessage(result.code)); setNeedsRefresh(true); return; }
      setWorkspace(result.workspace); setAmounts({}); setPhase("edit"); setReceipt(null);
      setNeedsRefresh(false); attempt.current = null;
      if (result.workspace.recovery && !result.workspace.readOnly) {
        const command = result.workspace.recovery;
        attempt.current = command;
        setWorkspace({ ...result.workspace, availableCredit: command.expectedAvailable,
          charges: result.workspace.charges.map(charge => ({ ...charge,
            pending: command.selection.find(line => line.chargeId === charge.id)?.expectedPending ?? charge.pending })) });
        setAmounts(Object.fromEntries(command.selection.map(line => [line.chargeId, line.amount.toFixed(2)])));
        setPhase("review"); setUncertain(true); setError(creditErrorMessage("uncertain"));
      } else if (result.workspace.recoveryBlocked) setError(creditErrorMessage("credit_in_progress"));
    } catch { setError(creditErrorMessage("load_failed")); setNeedsRefresh(true); }
    finally { busy.current = false; setWorking(false); }
  }
  function close() { if (!busy.current && !working && !uncertain) setOpen(false); }
  const chosen = (workspace?.charges ?? []).filter((charge) => amounts[charge.id] !== undefined);
  const selection = chosen.map((charge) => ({ chargeId: charge.id,
    amount: parseCreditAmount(amounts[charge.id]) ?? -1, expectedPending: charge.pending }));
  const total = Math.round(selection.reduce((sum, line) => sum + Math.max(0, line.amount), 0) * 100) / 100;
  const valid = workspace && creditCommandSchema.safeParse({ enrollmentId,
    requestId: "00000000-0000-4000-8000-000000000000", expectedAvailable: workspace.availableCredit, selection }).success;
  function review() {
    if (!valid || working || needsRefresh || !workspace) return;
    attempt.current = { enrollmentId, requestId: crypto.randomUUID(), expectedAvailable: workspace.availableCredit, selection };
    setError(null); setPhase("review");
  }
  async function submit() {
    if (busy.current || locked || needsRefresh || !attempt.current) return;
    busy.current = true; setWorking(true); setError(null);
    try {
      const result = await confirmExplicitCredit(attempt.current, workspace?.actorId ?? "");
      if (!result.ok) {
        const unresolved = result.uncertain === true || ["forbidden", "credit_request_conflict"].includes(result.code);
        setUncertain(unresolved);
        setNeedsRefresh(!unresolved); setError(creditErrorMessage(result.code)); return;
      }
      setUncertain(false); setReceipt(result.receipt); setPhase("receipt");
      try { await acknowledgeExplicitCredit(enrollmentId, result.receipt.operationId); } catch { /* Keep durable recovery if acknowledgement is lost. */ }
      // Refresh failures do not invalidate a committed credit application.
      try { onApplied?.(); } catch { /* Saved receipt is still valid. */ }
    } catch { setUncertain(true); setError(creditErrorMessage("uncertain")); }
    finally { busy.current = false; setWorking(false); }
  }
  async function print() {
    if (!receipt || locked || busy.current) return;
    busy.current = true; setWorking(true); setError(null);
    try { await printCreditReceipt(printerName, receipt); }
    catch { setError("No se pudo imprimir. La aplicacion de credito esta guardada; puedes reimprimirla."); }
    finally { busy.current = false; setWorking(false); }
  }
  return <>
    <button type="button" className="rounded border border-slate-300 px-3 py-2 text-sm" onClick={() => { setOpen(true); void reload(); }}>Credito de la cuenta</button>
    <dialog ref={dialog} aria-labelledby="explicit-credit-title" onCancel={(event) => { event.preventDefault(); close(); }}
      className="m-auto w-[calc(100%-2rem)] max-w-2xl max-h-[90dvh] overflow-y-auto rounded-lg border border-slate-200 bg-white p-0 text-slate-900 shadow-xl backdrop:bg-black/40 dark:bg-slate-950 dark:text-slate-100">
      <header className="flex items-start justify-between gap-3 border-b border-slate-200 p-4">
        <div className="min-w-0"><h2 id="explicit-credit-title" className="text-lg font-semibold">Credito de la cuenta</h2>
          <p className="break-words text-sm">{phase === "receipt" ? receipt?.playerName : workspace?.playerName}</p>
          <p className="text-xs text-slate-500">{phase === "receipt" ? receipt?.campusName : workspace?.campusName}</p></div>
        <button type="button" aria-label="Cerrar" title="Cerrar" disabled={working || uncertain} onClick={close} className="shrink-0 p-2 disabled:opacity-40"><X size={18} /></button>
      </header>
      <div className="space-y-4 p-4" aria-busy={working}>
        {error && <p role="alert" className="rounded border border-rose-300 bg-rose-50 p-3 text-sm text-rose-900">{error}</p>}
        {working && <p role="status" className="text-sm">Procesando...</p>}
        {phase !== "receipt" && phase !== "operations" && workspace && <>
          <dl className="grid grid-cols-2 gap-4 border-b border-slate-200 pb-3 text-sm">
            <div><dt>Credito disponible</dt><dd className="text-lg font-semibold">{money(workspace.availableCredit)}</dd></div>
            <div><dt>Cargos pendientes</dt><dd className="text-lg font-semibold">{money(workspace.charges.reduce((sum, charge) => sum + charge.pending, 0))}</dd></div>
          </dl>
          {workspace.legacyReview > 0 && <p className="text-sm text-amber-800">Saldo historico en revision: {money(workspace.legacyReview)}</p>}
          {phase === "edit" ? <>
            <div className="max-h-72 overflow-y-auto divide-y divide-slate-200">
              {workspace.charges.map((charge) => <div key={charge.id} className="grid grid-cols-[minmax(0,1fr)_7rem] items-center gap-3 py-3">
                <label className="flex min-w-0 items-start gap-2">
                  <input type="checkbox" className="mt-1" checked={amounts[charge.id] !== undefined} disabled={!charge.eligible || working || needsRefresh}
                    onChange={(event) => setAmounts((previous) => { const next = { ...previous }; if (event.target.checked) next[charge.id] = "0.00"; else delete next[charge.id]; return next; })} />
                  <span className="min-w-0 break-words text-sm">{charge.description}<span className="block text-xs text-slate-500">Pendiente: {money(charge.pending)}{!charge.eligible && " · No admite credito"}</span></span>
                </label>
                <input aria-label={`Credito para ${charge.description}`} inputMode="decimal" value={amounts[charge.id] ?? ""}
                  disabled={amounts[charge.id] === undefined || working || needsRefresh} onChange={(event) => setAmounts({ ...amounts, [charge.id]: event.target.value })}
                  className="w-full rounded border border-slate-300 bg-transparent px-2 py-2 text-right text-sm disabled:opacity-40" />
              </div>)}
              {workspace.charges.length === 0 && <p className="py-3 text-sm">Sin cargos pendientes.</p>}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-3">
              <p className="text-sm">Credito seleccionado: <strong>{money(total)}</strong></p>
              <button type="button" disabled={!valid || working || needsRefresh} onClick={review} className="rounded bg-portoBlue px-4 py-2 text-sm text-white disabled:opacity-40">Revisar aplicacion</button>
            </div>
            {workspace.receipts.length > 0 && <details><summary className="cursor-pointer text-sm">Aplicaciones anteriores</summary>
              <ul className="mt-2 divide-y divide-slate-200">{workspace.receipts.map((saved) => <li key={saved.operationId}>
                <button type="button" className="w-full py-3 text-left text-sm" onClick={() => { setReceipt(saved); setPhase("receipt"); setError(null); }}>
                  {new Date(saved.occurredAt).toLocaleString("es-MX", { timeZone: "America/Monterrey" })} · {money(saved.creditApplied)}
                </button></li>)}</ul></details>}
          </> : <>
            <h3 className="font-semibold">Confirmar aplicacion</h3>
            {chosen.map((charge) => <div key={charge.id} className="flex justify-between gap-3 text-sm"><span className="min-w-0 break-words">{charge.description}</span><strong className="shrink-0">{money(parseCreditAmount(amounts[charge.id]) ?? 0)}</strong></div>)}
            <dl className="space-y-2 border-t border-slate-200 pt-3 text-sm">
              <div className="flex justify-between"><dt>Credito a utilizar</dt><dd>{money(total)}</dd></div>
              <div className="flex justify-between"><dt>Credito restante</dt><dd>{money(workspace.availableCredit - total)}</dd></div>
              <div className="flex justify-between"><dt>Dinero recibido</dt><dd>{money(0)}</dd></div>
            </dl>
            <div className="flex flex-wrap justify-end gap-3">
              <button type="button" disabled={working || uncertain || needsRefresh} onClick={() => { setPhase("edit"); attempt.current = null; }} className="rounded border px-3 py-2 text-sm disabled:opacity-40">Volver</button>
              <button type="button" disabled={working || locked || needsRefresh} onClick={() => void submit()} className="rounded bg-portoBlue px-4 py-2 text-sm text-white disabled:opacity-40">{uncertain ? "Reintentar misma operacion" : "Confirmar aplicacion"}</button>
            </div>
          </>}
        </>}
        {phase === "receipt" && receipt && <>
          <h3 className="font-semibold">Comprobante de credito</h3>
          <p className="text-sm">{new Date(receipt.occurredAt).toLocaleString("es-MX", { timeZone: "America/Monterrey" })}</p>
          <p className="break-all text-xs text-slate-500">{receipt.operationId}</p>
          {receipt.lines.map((line) => <div key={line.chargeId} className="border-b border-slate-200 pb-2 text-sm">
            <p className="break-words">{line.description}</p><p>Credito aplicado: {money(line.creditApplied)}</p><p>Pendiente del cargo: {money(line.pendingAfter)}</p>
          </div>)}
          <p className="text-sm">Dinero recibido: <strong>{money(receipt.moneyReceived)}</strong></p>
          <p className="text-sm">Credito utilizado: <strong>{money(receipt.creditApplied)}</strong></p>
          <p className="text-sm">Credito restante: {money(receipt.creditRemaining)}</p>
          <p className="text-sm">Cargos pendientes: {money(receipt.pendingChargesTotal)}</p>
          <button type="button" aria-label="Imprimir comprobante" title="Imprimir comprobante" disabled={working || locked} onClick={() => void print()} className="rounded border p-2 disabled:opacity-40"><Printer size={20} /></button>
        </>}
        {phase === "operations" && <PendingOperationsPanel enrollmentId={enrollmentId} printerName={printerName} readOnly={readOnly || workspace?.readOnly === true}
          onBack={() => void reload()} onBusyChange={setWorking} onResolved={onRecoveryResolved} />}
        {phase !== "operations" && workspace?.canResolvePending && <button type="button" disabled={working || uncertain} onClick={() => { setError(null); setPhase("operations"); }} className="rounded border px-3 py-2 text-sm disabled:opacity-40">Operaciones pendientes</button>}
        {phase !== "operations" && !uncertain && <button type="button" onClick={() => void reload()} disabled={working} className="inline-flex items-center gap-2 text-sm disabled:opacity-40"><RefreshCw size={16} />Actualizar cuenta</button>}
      </div>
    </dialog>
  </>;
}
