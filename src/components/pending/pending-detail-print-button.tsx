"use client";

export function PendingDetailPrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex rounded-md border border-slate-300 px-3 py-1.5 text-sm text-portoBlue hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800"
    >
      Imprimir lista
    </button>
  );
}
