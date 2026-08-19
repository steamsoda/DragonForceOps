"use client";

import { useState } from "react";
import { buildProductChargeLedgerPngSvg } from "@/lib/exports/product-charge-ledger-png";
import type { ProductChargeLedgerExportData } from "@/lib/queries/products";

function buildExportUrl(productId: string, paidFrom: string, paidTo: string, format: "xlsx" | "json") {
  const params = new URLSearchParams({ productId, format });
  if (paidFrom) params.set("paidFrom", paidFrom);
  if (paidTo) params.set("paidTo", paidTo);
  return `/api/exports/product-charge-ledger?${params.toString()}`;
}

async function svgToPngBlob(svg: string, width: number, height: number) {
  const image = new Image();
  image.decoding = "async";
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("product_ledger_png_load_failed"));
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });

  const maxPixels = 32_000_000;
  const maxDimension = 16_000;
  const scale = Math.min(2, maxDimension / height, Math.sqrt(maxPixels / (width * height)));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("product_ledger_png_context_unavailable");
  context.scale(scale, scale);
  context.drawImage(image, 0, 0, width, height);

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("product_ledger_png_encode_failed")), "image/png");
  });
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function ProductLedgerExportButtons({
  productId,
  paidFrom,
  paidTo,
  disabled,
}: {
  productId: string;
  paidFrom: string;
  paidTo: string;
  disabled: boolean;
}) {
  const [state, setState] = useState<"idle" | "working" | "done" | "error">("idle");

  async function exportPng() {
    setState("working");
    try {
      const response = await fetch(buildExportUrl(productId, paidFrom, paidTo, "json"), { cache: "no-store" });
      const payload = await response.json() as { data?: ProductChargeLedgerExportData; filename?: string; message?: string };
      if (!response.ok || !payload.data || !payload.filename) throw new Error(payload.message ?? "product_ledger_export_failed");
      if (payload.data.rows.length > 500) throw new Error("Usa un rango de fechas mas corto para el PNG. Excel incluye todos los registros.");
      const image = buildProductChargeLedgerPngSvg(payload.data);
      downloadBlob(await svgToPngBlob(image.svg, image.width, image.height), payload.filename);
      setState("done");
    } catch (error) {
      console.error("product ledger PNG export failed", error);
      setState("error");
    }
  }

  const buttonClass = "rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50";
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <button type="button" className={buttonClass} disabled={disabled || state === "working"} onClick={() => void exportPng()}>
        {state === "working" ? "Generando PNG..." : "Exportar PNG"}
      </button>
      <a
        className={`${buttonClass} ${disabled ? "pointer-events-none opacity-50" : ""}`}
        aria-disabled={disabled}
        href={buildExportUrl(productId, paidFrom, paidTo, "xlsx")}
      >
        Exportar Excel
      </a>
      {state === "done" ? <span className="text-xs font-medium text-emerald-700">PNG listo</span> : null}
      {state === "error" ? <span className="text-xs font-medium text-rose-700">No se pudo generar. Reduce el rango si hay mas de 500 filas.</span> : null}
    </div>
  );
}
