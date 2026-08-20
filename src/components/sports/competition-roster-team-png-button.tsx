"use client";

import { useState } from "react";
import { setPngDpi } from "@/lib/exports/png-dpi";
import { buildSportsSignupPacketPngSvg } from "@/lib/sports-signups/png-layout";

type TeamPlayer = { id: string; playerName: string; birthYear: number | null };

function safeFileName(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

async function svgToPngBlob(svg: string, width: number, height: number) {
  const image = new Image();
  image.decoding = "async";
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("competition_team_png_load_failed"));
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });

  const scale = Math.min(2, 16_000 / height, Math.sqrt(32_000_000 / (width * height)));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("competition_team_png_context_unavailable");
  context.scale(scale, scale);
  context.drawImage(image, 0, 0, width, height);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((result) => result ? resolve(result) : reject(new Error("competition_team_png_encode_failed")), "image/png");
  });
  return setPngDpi(blob, 300);
}

export function CompetitionRosterTeamPngButton({ tournamentName, campusName, teamName, categoryLabel, professorNames, players }: {
  tournamentName: string;
  campusName: string;
  teamName: string;
  categoryLabel: string | null;
  professorNames: string[];
  players: TeamPlayer[];
}) {
  const [state, setState] = useState<"idle" | "working" | "error">("idle");

  async function download() {
    setState("working");
    try {
      const exportImage = buildSportsSignupPacketPngSvg({
        competitionLabel: tournamentName,
        campusName,
        programLabel: teamName,
        paidFilterLabel: professorNames.length ? `Profesor: ${professorNames.join(", ")}` : "Profesor: Sin asignar",
        totalConfirmed: players.length,
        groups: [{
          id: teamName,
          label: teamName,
          subtitle: categoryLabel ? `Cat. ${categoryLabel}` : "",
          programLabel: "Equipo",
          players,
        }],
      });
      const blob = await svgToPngBlob(exportImage.svg, exportImage.width, exportImage.height);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${safeFileName(tournamentName)}-${safeFileName(teamName)}-300dpi.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setState("idle");
    } catch (error) {
      console.error("competition team PNG export failed", error);
      setState("error");
    }
  }

  return (
    <button
      type="button"
      onClick={() => void download()}
      disabled={state === "working"}
      title={state === "error" ? "No se pudo generar. Intenta de nuevo." : "Descargar este equipo como PNG a 300 DPI"}
      className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-wait disabled:opacity-60 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-200"
    >
      {state === "working" ? "Generando..." : state === "error" ? "Reintentar PNG" : "Exportar PNG"}
    </button>
  );
}
