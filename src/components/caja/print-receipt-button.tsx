"use client";

import { useState } from "react";
import { printReceipt, type ReceiptData } from "@/lib/printer";

type Props = {
  data: ReceiptData;
  printerName: string;
};

type Status = "idle" | "printing" | "done" | "error";

export function PrintReceiptButton({ data, printerName }: Props) {
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handlePrint() {
    setStatus("printing");
    setErrorMsg(null);
    try {
      await printReceipt(printerName, data);
      setStatus("done");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error al imprimir";
      setErrorMsg(msg);
      setStatus("error");
    }
  }

  if (status === "error") {
    return (
      <div className="space-y-2">
        <p className="text-xs text-rose-600 rounded border border-rose-200 bg-rose-50 px-3 py-2">
          {errorMsg?.includes("qz-tray.js")
            ? "Falta el archivo QZ Tray en /public/qz-tray.js"
            : errorMsg?.includes("connect") || errorMsg?.includes("WebSocket")
            ? "QZ Tray no está corriendo en esta máquina. Ábrelo desde la bandeja del sistema."
            : errorMsg}
        </p>
        <button
          onClick={() => setStatus("idle")}
          className="text-xs text-slate-500 underline"
        >
          Reintentar
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={handlePrint}
      disabled={status === "printing" || status === "done"}
      className="rounded-xl border border-slate-300 dark:border-slate-600 px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
    >
      {status === "printing" ? "Imprimiendo…" : status === "done" ? "Impreso ✓" : "Imprimir recibo"}
    </button>
  );
}
