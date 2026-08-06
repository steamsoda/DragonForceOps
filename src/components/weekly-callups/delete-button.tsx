"use client";

import { useFormStatus } from "react-dom";

export function WeeklyCallupDeleteButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      onClick={(event) => {
        if (!window.confirm("Eliminar esta convocatoria guardada? Se borraran su plantel, partidos y configuracion. Los pagos e inscripciones de torneo no cambiaran.")) {
          event.preventDefault();
        }
      }}
      className="min-h-10 w-full rounded-md border border-rose-300 bg-white px-4 py-2 text-sm font-semibold text-rose-700 disabled:opacity-60"
    >
      {pending ? "Eliminando..." : "Eliminar convocatoria"}
    </button>
  );
}
