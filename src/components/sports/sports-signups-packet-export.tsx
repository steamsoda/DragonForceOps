"use client";

import { useState } from "react";
import type { CompetitionSignupCompetitionGroup } from "@/lib/queries/sports-signups";
import {
  buildSportsSignupPacketPngSvg,
  type SportsSignupPacketPngData,
} from "@/lib/sports-signups/png-layout";
import { formatTournamentGroupCardDisplay } from "@/lib/training-groups/shared";

const PROGRAM_LABELS: Record<string, string> = {
  futbol_para_todos: "",
  selectivo: "Selectivos",
  little_dragons: "Little Dragons",
};

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
    image.onerror = () => reject(new Error("sports_signup_packet_png_load_failed"));
    image.src = svgUrl;
  });

  const maxCanvasPixels = 32_000_000;
  const maxCanvasDimension = 16_000;
  const scale = Math.min(2, maxCanvasDimension / height, Math.sqrt(maxCanvasPixels / (width * height)));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("sports_signup_packet_png_context_unavailable");

  context.scale(scale, scale);
  context.drawImage(image, 0, 0, width, height);

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("sports_signup_packet_png_encode_failed"))),
      "image/png",
    );
  });
}

export function SportsSignupsPacketExport({
  competition,
  campusName,
  programLabel,
  paidFilterLabel,
}: {
  competition: CompetitionSignupCompetitionGroup;
  campusName: string;
  programLabel: string;
  paidFilterLabel: string;
}) {
  const [state, setState] = useState<"idle" | "working" | "done" | "error">("idle");

  async function handleDownload() {
    setState("working");

    try {
      const groups: SportsSignupPacketPngData["groups"] = competition.trainingGroups
        .filter((group) => group.players.length > 0)
        .map((group) => {
          const display = formatTournamentGroupCardDisplay({
            name: group.label,
            program: group.program,
            birthYearMin: group.birthYearMin,
            birthYearMax: group.birthYearMax,
          });
          return {
            id: group.key,
            label: display.title,
            subtitle: display.subtitle ?? "",
            programLabel: PROGRAM_LABELS[group.program ?? ""] ?? "Sin programa",
            players: group.players.map((player) => ({
              id: player.enrollmentId,
              playerName: player.playerName,
              birthYear: player.birthYear,
            })),
          };
        });
      const exportImage = buildSportsSignupPacketPngSvg({
        competitionLabel: competition.label,
        campusName,
        programLabel,
        paidFilterLabel,
        totalConfirmed: groups.reduce((total, group) => total + group.players.length, 0),
        groups,
      });
      const blob = await svgToPngBlob(exportImage.svg, exportImage.width, exportImage.height);
      const downloadUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = `inscripciones-${safeFileName(competition.label)}-${safeFileName(campusName)}-${safeFileName(programLabel)}.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(downloadUrl);
      setState("done");
    } catch (error) {
      console.error("sports signup packet PNG export failed", error);
      setState("error");
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        disabled={state === "working"}
        onClick={() => void handleDownload()}
        className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
      >
        {state === "working" ? "Generando PNG..." : "Exportar PNG completo"}
      </button>
      {state === "done" ? <span className="text-xs font-medium text-emerald-700">PNG listo</span> : null}
      {state === "error" ? <span className="text-xs font-medium text-rose-700">No se pudo generar</span> : null}
    </div>
  );
}
