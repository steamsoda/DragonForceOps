"use client";

import { useState } from "react";
import { printReceipt } from "@/lib/printer";
import { getReceiptForPrintAction } from "@/server/actions/receipts";

type Props = {
  paymentId: string;
  printerName: string;
};

type Status = "idle" | "loading" | "printing" | "done" | "error";

export function ReprintReceiptButton({ paymentId, printerName }: Props) {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setStatus("loading");
    setError(null);

    const result = await getReceiptForPrintAction(paymentId);
    if (!result.ok) {
      setError(
        result.error === "receipt_not_found"
          ? "No se encontró el recibo."
          : result.error === "unauthenticated"
          ? "Sesión expirada."
          : "No se pudo preparar el recibo."
      );
      setStatus("error");
      return;
    }

    setStatus("printing");
    try {
      await printReceipt(printerName, result.receipt);
      setStatus("done");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error al imprimir";
      setError(
        msg.includes("qz-tray.js")
          ? "Falta el archivo QZ Tray en /public/qz-tray.js"
          : msg.includes("connect") || msg.includes("WebSocket")
          ? "QZ Tray no está corriendo. Ábrelo desde la bandeja del sistema."
          : msg
      );
      setStatus("error");
    }
  }

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={status === "loading" || status === "printing"}
        className="rounded-md border border-slate-300 dark:border-slate-600 px-3 py-1.5 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
      >
        {status === "loading"
          ? "Preparando…"
          : status === "printing"
          ? "Imprimiendo…"
          : status === "done"
          ? "Reimpreso ✓"
          : "Reimprimir"}
      </button>
      {status === "error" && error ? (
        <p className="max-w-[220px] text-xs text-rose-600">{error}</p>
      ) : null}
    </div>
  );
}
