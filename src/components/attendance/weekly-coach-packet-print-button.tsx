"use client";

export function WeeklyCoachPacketPrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-md bg-portoBlue px-4 py-2 text-sm font-semibold text-white hover:bg-portoDark print:hidden"
    >
      Imprimir reporte
    </button>
  );
}
