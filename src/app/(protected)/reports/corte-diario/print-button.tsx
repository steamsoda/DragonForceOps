"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { printCorte, type CorteData } from "@/lib/printer";
import { closeAndPrepareCortePrintAction } from "@/server/actions/corte-checkpoints";

type Props = {
  campusId: string;
  printerName: string;
};

type Status = "idle" | "closing" | "printing" | "done" | "error";

const ERROR_LABELS: Record<string, string> = {
  unauthenticated: "Tu sesion ya no es valida.",
  unauthorized: "No tienes permiso para imprimir ese corte.",
  checkpoint_not_found: "No se encontro el corte activo de ese campus.",
  checkpoint_close_failed: "No se pudo cerrar el corte actual.",
  checkpoint_roll_failed: "No se pudo abrir el siguiente corte automaticamente.",
};

export function PrintButton({ campusId, printerName }: Props) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [preparedCorte, setPreparedCorte] = useState<CorteData | null>(null);

  async function printPrepared(data: CorteData) {
    setStatus("printing");
    try {
      await printCorte(printerName, data);
      setPreparedCorte(null);
      setStatus("done");
      router.refresh();
      setTimeout(() => setStatus("idle"), 3000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error al imprimir";
      setErrorMsg(
        msg.includes("connect") || msg.includes("WebSocket")
          ? "QZ Tray no esta corriendo en esta maquina."
          : msg
      );
      setPreparedCorte(data);
      setStatus("error");
    }
  }

  async function handlePrint() {
    setErrorMsg(null);

    if (preparedCorte) {
      await printPrepared(preparedCorte);
      return;
    }

    setStatus("closing");
    const result = await closeAndPrepareCortePrintAction(campusId);
    if (!result.ok) {
      setErrorMsg(ERROR_LABELS[result.error] ?? "No se pudo preparar el corte para impresion.");
      setStatus("error");
      return;
    }

    setPreparedCorte(result.printData);
    await printPrepared(result.printData);
  }

  const label =
    status === "closing"
      ? "Cerrando corte..."
      : status === "printing"
      ? "Imprimiendo..."
      : status === "done"
      ? "Corte impreso ✓"
      : preparedCorte
      ? "Reintentar impresion"
      : "Imprimir y cerrar corte";

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={handlePrint}
        disabled={status === "closing" || status === "printing"}
        className="rounded-md bg-portoBlue px-4 py-2 text-sm font-medium text-white hover:bg-portoDark disabled:opacity-50"
      >
        {label}
      </button>
      {status === "error" && errorMsg ? (
        <span className="text-xs text-rose-600">{errorMsg}</span>
      ) : null}
    </div>
  );
}
