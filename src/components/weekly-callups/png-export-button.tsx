"use client";

import { useState } from "react";
import { buildWeeklyCallupPngSvg, type WeeklyCallupPngData } from "@/lib/weekly-callups/png-layout";

function safeFileName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function svgToPngBlob(svg: string, width: number, height: number) {
  const svgUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  const image = new Image();
  image.decoding = "async";
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("weekly_callup_png_load_failed"));
    image.src = svgUrl;
  });

  const maxCanvasPixels = 32_000_000;
  const maxCanvasDimension = 16_000;
  const scale = Math.min(2, maxCanvasDimension / height, Math.sqrt(maxCanvasPixels / (width * height)));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("weekly_callup_png_context_unavailable");
  context.scale(scale, scale);
  context.drawImage(image, 0, 0, width, height);

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("weekly_callup_png_encode_failed"))), "image/png");
  });
}

export function WeeklyCallupPngExportButton({ data }: { data: WeeklyCallupPngData }) {
  const [state, setState] = useState<"idle" | "working" | "done" | "error">("idle");

  async function handleDownload() {
    if (data.status === "draft" && !window.confirm("Esta convocatoria sigue en borrador. La imagen mostrara la marca BORRADOR. Deseas continuar?")) {
      return;
    }
    setState("working");
    try {
      const exportImage = buildWeeklyCallupPngSvg(data);
      const blob = await svgToPngBlob(exportImage.svg, exportImage.width, exportImage.height);
      const downloadUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = `${safeFileName(data.tournamentName)}-${safeFileName(data.campusName)}-${safeFileName(data.program)}-${data.weekStart}.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(downloadUrl);
      setState("done");
    } catch (error) {
      console.error("weekly callup PNG export failed", error);
      setState("error");
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        disabled={state === "working"}
        onClick={() => void handleDownload()}
        className="min-h-9 rounded-md bg-emerald-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
      >
        {state === "working" ? "Generando imagen..." : "Descargar imagen"}
      </button>
      {state === "done" ? <span className="text-xs font-medium text-emerald-700">PNG listo</span> : null}
      {state === "error" ? <span className="text-xs font-medium text-rose-700">No se pudo generar</span> : null}
    </div>
  );
}
