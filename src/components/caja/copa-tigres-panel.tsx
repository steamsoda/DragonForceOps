"use client";

import { useEffect, useState } from "react";
import { getCopaTigresOptionsAction, type CopaTigresOption } from "@/server/actions/copa-tigres";
import { copaTigresPaymentOptions } from "@/lib/payments/copa-tigres";
import { useReadOnly } from "@/components/auth/read-only-controls";

export function CopaTigresPanel({ enrollmentId, readOnly, selectedAmount, onSelect }: {
  enrollmentId: string; readOnly: boolean; selectedAmount?: number;
  onSelect: (row: CopaTigresOption, amount: number) => void;
}) {
  const roleReadOnly = useReadOnly();
  const [rows, setRows] = useState<CopaTigresOption[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    setRows([]);
    setError("");
    const load: Promise<CopaTigresOption[]> = roleReadOnly
      ? fetch(`/api/director-readonly/caja?mode=installments&enrollmentId=${encodeURIComponent(enrollmentId)}`, { cache: "no-store" })
        .then(response => { if (!response.ok) throw new Error("Installments unavailable"); return response.json(); })
      : getCopaTigresOptionsAction(enrollmentId);
    load
      .then((value) => { if (!cancelled) setRows(value); })
      .catch(() => { if (!cancelled) setError("No se pudo cargar Copa Tigres. Recarga la cuenta."); });
    return () => { cancelled = true; };
  }, [enrollmentId, roleReadOnly]);
  if (!rows.length && !error) return null;
  return <section className="mb-4 space-y-3 border-y border-slate-200 py-4 dark:border-slate-700">
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    {rows.map((row) => <div key={row.productId} className="flex flex-wrap items-center justify-between gap-3">
      <div><h3 className="font-semibold">{row.name}</h3>
        <p className="text-sm">{row.paid === 1250 ? "Pagado" : row.paid === 600 ? "Reservado - pendiente $650" : "Inscripcion $1,250"}</p>
      </div>
      <div className="flex flex-wrap gap-2">{copaTigresPaymentOptions(row.paid).map((amount) =>
        <button key={amount} type="button" disabled={readOnly || selectedAmount === amount}
          className="rounded border border-blue-700 px-3 py-2 text-sm text-blue-700 disabled:opacity-40"
          onClick={() => onSelect(row, amount)}>
          {amount === 600 ? "Reservar $600" : amount === 650 ? "Liquidar $650" : "Pago completo $1,250"}
        </button>)}</div>
    </div>)}
  </section>;
}
