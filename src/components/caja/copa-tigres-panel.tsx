"use client";

import { useEffect, useState, useTransition } from "react";
import { getCopaTigresOptionsAction, payCopaTigresAction, type CopaTigresOption } from "@/server/actions/copa-tigres";
import { copaTigresPaymentOptions } from "@/lib/payments/copa-tigres";
import type { CajaPaymentResult } from "@/server/actions/caja";

export function CopaTigresPanel({ enrollmentId, operatorCampusId, readOnly, onSuccess }: {
  enrollmentId: string; operatorCampusId: string; readOnly: boolean;
  onSuccess: (receipt: Extract<CajaPaymentResult, { ok: true }>) => void;
}) {
  const [rows, setRows] = useState<CopaTigresOption[]>([]);
  const [error, setError] = useState("");
  const [choice, setChoice] = useState<{ row: CopaTigresOption; amount: number; requestId: string } | null>(null);
  const [method, setMethod] = useState("");
  const [pending, startTransition] = useTransition();
  useEffect(() => {
    let cancelled = false;
    setRows([]);
    setChoice(null);
    setError("");
    getCopaTigresOptionsAction(enrollmentId).then((value) => { if (!cancelled) setRows(value); })
      .catch(() => { if (!cancelled) setError("No se pudo cargar Copa Tigres. Recarga la cuenta."); });
    return () => { cancelled = true; };
  }, [enrollmentId]);
  if (!rows.length && !error) return null;
  return <section className="space-y-3 border-y border-slate-200 py-4 dark:border-slate-700">
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    {rows.map((row) => <div key={row.productId} className="flex flex-wrap items-center justify-between gap-3">
      <div><h3 className="font-semibold">{row.name}</h3>
        <p className="text-sm">{row.paid === 1250 ? "Pagado" : row.paid === 600 ? "Reservado - pendiente $650" : "Inscripcion $1,250"}</p>
      </div>
      <div className="flex flex-wrap gap-2">{copaTigresPaymentOptions(row.paid).map((amount) =>
        <button key={amount} type="button" disabled={readOnly || pending || !!choice}
          className="rounded border border-blue-700 px-3 py-2 text-sm text-blue-700 disabled:opacity-40"
          onClick={() => { setError(""); setMethod(""); setChoice({ row, amount, requestId: crypto.randomUUID() }); }}>
          {amount === 600 ? "Reservar $600" : amount === 650 ? "Liquidar $650" : "Pago completo $1,250"}
        </button>)}</div>
    </div>)}
    {choice && <div role="dialog" aria-label="Confirmar pago Copa Tigres" className="flex flex-wrap items-end gap-3 rounded border p-4">
      <div><p className="mb-2 font-medium">{choice.row.name}: ${choice.amount} MXN</p>
        <p className="mb-2 text-sm">Saldo del torneo despues del pago: ${choice.row.pending - choice.amount}. Sin aplicar credito.</p>
        <label className="text-sm">Metodo de pago
          <select disabled={pending} value={method} onChange={(event) => setMethod(event.target.value)} className="ml-2 rounded border p-2">
            <option value="">Seleccionar</option><option value="cash">Efectivo</option>
            <option value="card">Tarjeta</option><option value="transfer">Transferencia</option>
          </select>
        </label>
      </div>
      <button type="button" disabled={!method || readOnly || pending} className="rounded bg-blue-700 px-3 py-2 text-white disabled:opacity-40"
        onClick={() => startTransition(async () => {
          try {
            const result = await payCopaTigresAction({ enrollmentId, operatorCampusId, productId: choice.row.productId,
              amount: choice.amount, method, requestId: choice.requestId });
            if (!result.ok) { setError(result.error); return; }
            setRows((current) => current.map((row) => row.productId === choice.row.productId
              ? { ...row, paid: row.paid + choice.amount, pending: row.pending - choice.amount } : row));
            setChoice(null); onSuccess(result);
          } catch { setError("No se pudo confirmar la respuesta. Reintenta sin cerrar este panel para evitar duplicados."); }
        })}>{pending ? "Procesando..." : "Confirmar pago"}</button>
      <button type="button" disabled={pending} onClick={() => setChoice(null)} className="px-3 py-2">Cancelar</button>
    </div>}
  </section>;
}
