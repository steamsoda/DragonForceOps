"use client";

export function CoachAttendancePrintButton({ selectedCoach }: { selectedCoach: boolean }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-md bg-portoBlue px-4 py-2 text-sm font-semibold text-white hover:bg-portoDark print:hidden"
    >
      {selectedCoach ? "Imprimir coach seleccionado" : "Imprimir reporte completo"}
    </button>
  );
}
