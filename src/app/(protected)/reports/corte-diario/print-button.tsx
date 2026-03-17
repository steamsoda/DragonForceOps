"use client";

export function PrintButton() {
  return (
    <div className="print:hidden flex justify-end">
      <button
        type="button"
        onClick={() => window.print()}
        className="rounded-md border border-slate-300 dark:border-slate-600 px-3 py-1.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
      >
        Imprimir corte
      </button>
    </div>
  );
}
