"use client";

import { useState } from "react";
import { Download } from "lucide-react";

export function ProductSalesExport({ productId, campuses, paidFrom, paidTo }: {
  productId: string; campuses: Array<{ id: string; name: string }>; paidFrom: string; paidTo: string;
}) {
  const [campusId, setCampusId] = useState("");
  const [from, setFrom] = useState(paidFrom);
  const [to, setTo] = useState(paidTo);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const invalidRange = Boolean(from && to && from > to);
  async function download() {
    setBusy(true);
    setError("");
    try {
      const params = new URLSearchParams({ productId, mode: "sales", campusId, paidFrom: from, paidTo: to });
      const response = await fetch(`/api/exports/product-charge-ledger?${params}`, { cache: "no-store" });
      if (!response.ok || !response.headers.get("content-type")?.includes("spreadsheetml")) throw new Error("export_failed");
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = response.headers.get("content-disposition")?.match(/filename="([^"]+)"/)?.[1] ?? "ventas.xlsx";
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setError("No se pudo generar el Excel. Intenta de nuevo.");
    } finally { setBusy(false); }
  }
  const input = "mt-1 block w-full min-w-0 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:bg-slate-900";
  return <section className="border-y border-slate-200 py-4" aria-labelledby="product-sales-heading">
    <h2 id="product-sales-heading" className="mb-3 text-sm font-semibold">Ventas pagadas por talla</h2>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:items-end">
      <label className="min-w-0 text-xs font-medium">Campus
        <select className={input} value={campusId} onChange={e => setCampusId(e.target.value)}>
          <option value="">Todos los campus</option>
          {campuses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </label>
      <label className="min-w-0 text-xs font-medium">Pagado desde
        <input className={input} type="date" value={from} onChange={e => setFrom(e.target.value)} />
      </label>
      <label className="min-w-0 text-xs font-medium">Pagado hasta
        <input className={input} type="date" value={to} onChange={e => setTo(e.target.value)} />
      </label>
      <button type="button" disabled={busy || invalidRange} onClick={() => void download()}
        className="flex min-h-10 items-center justify-center gap-2 rounded-md bg-portoBlue px-3 py-2 text-sm font-medium text-white hover:bg-portoDark disabled:opacity-50">
        <Download size={16} aria-hidden="true" />{busy ? "Generando..." : "Exportar ventas Excel"}
      </button>
    </div>
    {invalidRange ? <p role="alert" className="mt-2 text-sm text-rose-700">La fecha final no puede ser anterior a la inicial.</p> : null}
    {error ? <p role="alert" className="mt-2 text-sm text-rose-700">{error}</p> : null}
  </section>;
}
