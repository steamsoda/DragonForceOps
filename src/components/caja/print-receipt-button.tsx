"use client";

import { useEffect, useRef, useState } from "react";
import { printReceipt, type ReceiptData } from "@/lib/printer";

type Props = {
  data: ReceiptData;
  printerName: string;
  autoPrint?: boolean;
};

type Status = "idle" | "printing" | "done" | "error";

export function PrintReceiptButton({ data, printerName, autoPrint }: Props) {
  const [status, setStatus] = useState<Status>(autoPrint ? "printing" : "idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const didAutoprint = useRef(false);

  async function doPrint() {
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

  // Auto-print on mount (only once)
  useEffect(() => {
    if (!autoPrint || didAutoprint.current) return;
    didAutoprint.current = true;
    doPrint();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (status === "error") {
    return (
      <div className="space-y-2">
        <p className="text-xs text-rose-600 rounded border border-rose-200 bg-rose-50 px-3 py-2">
          {errorMsg?.includes("qz-tray.js")
            ? "Falta el archivo QZ Tray en /public/qz-tray.js"
            : errorMsg?.includes("connect") || errorMsg?.includes("WebSocket")
            ? "QZ Tray no está corriendo. Ábrelo desde la bandeja del sistema."
            : errorMsg}
        </p>
        <button
          onClick={doPrint}
          className="text-xs text-slate-500 underline"
        >
          Reintentar impresión
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={doPrint}
      disabled={status === "printing" || status === "done"}
      className="rounded-xl border border-slate-300 dark:border-slate-600 px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
    >
      {status === "printing" ? "Imprimiendo…" : status === "done" ? "Impreso ✓" : "Imprimir recibo"}
    </button>
  );
}
