"use client";

import { useState } from "react";
import { connectQZ, sendToQZ } from "@/lib/printer";

export function PrinterTestButton({ printerName }: { printerName: string }) {
  const [status, setStatus] = useState<"idle" | "printing" | "ok" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function handleTest() {
    setStatus("printing");
    setErrorMsg("");
    try {
      await connectQZ();
      const now = new Date().toLocaleString("es-MX", {
        day: "2-digit", month: "2-digit", year: "numeric",
        hour: "2-digit", minute: "2-digit",
      });
      await sendToQZ(printerName, [
        { type: "raw", format: "plain", data: "\x1B@" },           // init
        { type: "raw", format: "plain", data: "\x1Ba\x01" },       // center
        { type: "raw", format: "plain", data: "================================\n" },
        { type: "raw", format: "plain", data: "   PRUEBA DE IMPRESORA\n" },
        { type: "raw", format: "plain", data: "   Dragon Force Ops\n" },
        { type: "raw", format: "plain", data: `   ${now}\n` },
        { type: "raw", format: "plain", data: "================================\n" },
        { type: "raw", format: "plain", data: "   Impresora: OK\n" },
        { type: "raw", format: "plain", data: `   ${printerName}\n` },
        { type: "raw", format: "plain", data: "================================\n" },
        { type: "raw", format: "plain", data: "\n\n\n\n" },
        { type: "raw", format: "plain", data: "\x1Bd\x04" },       // feed & cut
      ]);
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
