"use client";

import { useState } from "react";
import { printTestPage } from "@/lib/printer";

export function PrinterTestButton({ printerName }: { printerName: string }) {
  const [status, setStatus] = useState<"idle" | "printing" | "ok" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function handleTest() {
    setStatus("printing");
    setErrorMsg("");
    try {
      await printTestPage(printerName);
      setStatus("ok");
      setTimeout(() => setStatus("idle"), 3000);
    } catch (e) {
      setStatus("error");
      setErrorMsg(e instanceof Error ? e.message : "Error desconocido");
      setTimeout(() => setStatus("idle"), 5000);
    }
  }

  return (
    <button
      onClick={handleTest}
      disabled={status === "printing"}
      title={status === "error" ? errorMsg : `Imprimir prueba en: ${printerName}`}
      className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors
        ${status === "ok"
          ? "border-emerald-400 bg-emerald-50 text-emerald-700 dark:border-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-300"
          : status === "error"
            ? "border-rose-400 bg-rose-50 text-rose-700 dark:border-rose-600 dark:bg-rose-950/30 dark:text-rose-300"
            : "border-slate-300 text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
        }`}
    >
      {status === "printing" ? "Imprimiendo..." : status === "ok" ? "OK" : status === "error" ? "Error" : "Test Impresora"}
    </button>
  );
}
