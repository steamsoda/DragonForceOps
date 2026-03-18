"use client";

import { useState } from "react";
import { printCorte, type CorteData } from "@/lib/printer";

type Props = {
  data: CorteData;
  printerName: string;
};

type Status = "idle" | "printing" | "done" | "error";

export function PrintButton({ data, printerName }: Props) {
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handlePrint() {
    setStatus("printing");
    setErrorMsg(null);
    try {
      await printCorte(printerName, data);
      setStatus("done");
      setTimeout(() => setStatus("idle"), 3000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error al imprimir";
      setErrorMsg(
        msg.includes("connect") || msg.includes("WebSocket")
          ? "QZ Tray no está corriendo en esta máquina."
          : msg
      );
      setStatus("error");
    }
  }

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={handlePrint}
        disabled={status === "printing"}
        className="rounded-md border border-slate-300 dark:border-slate-600 px-3 py-1.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
      >
        {status === "printing" ? "Imprimiendo…" : status === "done" ? "Impreso ✓" : "Imprimir corte"}
      </button>
      {status === "error" && errorMsg && (
        <span className="text-xs text-rose-600">{errorMsg}</span>
      )}
    </div>
  );
}
