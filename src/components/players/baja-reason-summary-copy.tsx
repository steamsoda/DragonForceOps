"use client";

import { useState } from "react";

export function BajaReasonSummaryCopy({ text }: { text: string }) {
  const [status, setStatus] = useState<"idle" | "copied" | "error">("idle");

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setStatus("copied");
      window.setTimeout(() => setStatus("idle"), 1800);
    } catch {
      setStatus("error");
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Resumen copiable</p>
        <button
          type="button"
          onClick={handleCopy}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          {status === "copied" ? "Copiado" : status === "error" ? "No se pudo copiar" : "Copiar resumen"}
        </button>
      </div>
      <textarea
        readOnly
        value={text}
        rows={8}
        className="w-full resize-y rounded-md border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
      />
    </div>
  );
}
