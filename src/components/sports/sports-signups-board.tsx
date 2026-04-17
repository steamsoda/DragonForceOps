"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import type {
  CompetitionSignupCategoryGroup,
  CompetitionSignupDashboardData,
} from "@/lib/queries/sports-signups";

type Props = {
  dashboard: CompetitionSignupDashboardData;
  initialCompetitionId: string;
  canExportCsv: boolean;
  canUsePerfDebug: boolean;
};

type CategoryActionFeedback = "copied" | "copy-error" | "png-exported" | "png-error";

const CATEGORY_TWO_COLUMN_THRESHOLD = 14;

function getNameColumns(players: CompetitionSignupCategoryGroup["players"]) {
  if (players.length <= CATEGORY_TWO_COLUMN_THRESHOLD) return [players];

  const splitIndex = Math.ceil(players.length / 2);
  return [players.slice(0, splitIndex), players.slice(splitIndex)];
}

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function buildCategoryCopyText({
  competitionLabel,
  campusName,
  category,
}: {
  competitionLabel: string;
  campusName: string;
  category: CompetitionSignupCategoryGroup;
}) {
  const lines = [
    competitionLabel,
    campusName,
    `${category.label} - ${category.confirmedCount}/${category.activeCount} pagados/activos`,
    "",
    ...(category.players.length > 0 ? category.players.map((player) => player.playerName) : ["Sin jugadores pagados."]),
  ];

  return lines.join("\n");
}

function buildCategoryExportSvg({
  competitionLabel,
  campusName,
  category,
}: {
  competitionLabel: string;
  campusName: string;
  category: CompetitionSignupCategoryGroup;
}) {
  const columns = getNameColumns(category.players);
  const columnCount = columns.length;
  const cardWidth = columnCount === 2 ? 960 : 720;
  const rowCount = Math.max(...columns.map((column) => column.length), 1);
  const listHeight = rowCount * 32;
  const cardHeight = 220 + listHeight;

  const markup = `
    <div xmlns="http://www.w3.org/1999/xhtml" style="width:${cardWidth}px;height:${cardHeight}px;background:#f8fafc;padding:28px;box-sizing:border-box;font-family:Inter,Segoe UI,Arial,sans-serif;color:#0f172a;">
      <div style="height:100%;background:#ffffff;border:1px solid #cbd5e1;border-radius:24px;padding:24px;box-sizing:border-box;display:flex;flex-direction:column;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;">
          <div>
            <div style="font-size:16px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:#64748b;">${escapeXml(campusName)}</div>
            <div style="margin-top:12px;font-size:40px;font-weight:800;line-height:1.05;color:#0f172a;">${escapeXml(
              category.label,
            )}</div>
            <div style="margin-top:12px;font-size:18px;font-weight:700;color:#0f172a;">${escapeXml(competitionLabel)}</div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:40px;font-weight:800;line-height:1.05;color:#0f172a;">${category.confirmedCount}/${category.activeCount}</div>
            <div style="margin-top:10px;font-size:14px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#64748b;">Pagados / activos</div>
          </div>
        </div>
        <div style="margin-top:24px;display:grid;grid-template-columns:repeat(${columnCount}, minmax(0, 1fr));gap:18px;align-items:start;">
          ${columns
            .map(
              (column) => `
                <div style="display:flex;flex-direction:column;gap:8px;min-width:0;">
                  ${
                    column.length > 0
                      ? column
                          .map(
                            (player) => `
                              <div style="font-size:20px;line-height:1.2;color:#0f172a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                                ${escapeXml(player.playerName)}
                              </div>
                            `,
                          )
                          .join("")
                      : `<div style="font-size:20px;line-height:1.2;color:#94a3b8;font-style:italic;">Sin jugadores pagados.</div>`
                  }
                </div>
              `,
            )
            .join("")}
        </div>
      </div>
    </div>
  `;

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${cardWidth}" height="${cardHeight}" viewBox="0 0 ${cardWidth} ${cardHeight}">
      <foreignObject x="0" y="0" width="${cardWidth}" height="${cardHeight}">
        ${markup}
      </foreignObject>
    </svg>
  `;

  return {
    width: cardWidth,
    height: cardHeight,
    svg,
  };
}

async function downloadCategoryPng({
  competitionLabel,
  campusName,
  category,
}: {
  competitionLabel: string;
  campusName: string;
  category: CompetitionSignupCategoryGroup;
}) {
  const exportCard = buildCategoryExportSvg({ competitionLabel, campusName, category });
  const svgUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(exportCard.svg)}`;
  const image = new Image();
  image.decoding = "async";

  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("png_export_failed"));
    image.src = svgUrl;
  });

  const scale = 2;
  const canvas = document.createElement("canvas");
  canvas.width = exportCard.width * scale;
  canvas.height = exportCard.height * scale;

  const context = canvas.getContext("2d");
  if (!context) throw new Error("png_context_unavailable");

  context.scale(scale, scale);
  context.drawImage(image, 0, 0, exportCard.width, exportCard.height);

  const downloadUrl = canvas.toDataURL("image/png");
  const link = document.createElement("a");
  link.href = downloadUrl;
  link.download = `${competitionLabel}-${campusName}-${category.label}`.toLowerCase().replaceAll(/\s+/g, "-") + ".png";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

export function SportsSignupsBoard({
  dashboard,
  initialCompetitionId,
  canExportCsv,
  canUsePerfDebug,
}: Props) {
  const [selectedCampusId, setSelectedCampusId] = useState(dashboard.selectedCampusId);
  const [selectedCompetitionId, setSelectedCompetitionId] = useState(initialCompetitionId);
  const [feedbackByCategoryKey, setFeedbackByCategoryKey] = useState<Record<string, CategoryActionFeedback>>({});
  const router = useRouter();
  const searchParams = useSearchParams();
  const perfEnabled = canUsePerfDebug && searchParams.get("perf") === "1";

  const selectedBoard = useMemo(
    () =>
      dashboard.campusBoards.find((board) => board.campusId === selectedCampusId) ??
      dashboard.campusBoards[0] ??
      null,
    [dashboard.campusBoards, selectedCampusId],
  );

  const selectedCompetition = useMemo(
    () =>
      selectedBoard?.competitions.find((competition) => competition.id === selectedCompetitionId) ??
      selectedBoard?.competitions[0] ??
      null,
    [selectedBoard, selectedCompetitionId],
  );

  function setCategoryFeedback(categoryKey: string, feedback: CategoryActionFeedback) {
    setFeedbackByCategoryKey((current) => ({ ...current, [categoryKey]: feedback }));

    window.setTimeout(() => {
      setFeedbackByCategoryKey((current) => {
        if (current[categoryKey] !== feedback) return current;
        const next = { ...current };
        delete next[categoryKey];
        return next;
      });
    }, 2200);
  }

  async function handleCopyCategoryText(category: CompetitionSignupCategoryGroup) {
    if (!selectedCompetition || !selectedBoard) return;

    const payload = buildCategoryCopyText({
      competitionLabel: selectedCompetition.label,
      campusName: selectedBoard.campusName,
      category,
    });

    try {
      await navigator.clipboard.writeText(payload);
      setCategoryFeedback(category.key, "copied");
    } catch {
      setCategoryFeedback(category.key, "copy-error");
    }
  }

  async function handleExportCategoryPng(category: CompetitionSignupCategoryGroup) {
    if (!selectedCompetition || !selectedBoard) return;

    try {
      await downloadCategoryPng({
        competitionLabel: selectedCompetition.label,
        campusName: selectedBoard.campusName,
        category,
      });
      setCategoryFeedback(category.key, "png-exported");
    } catch {
      setCategoryFeedback(category.key, "png-error");
    }
  }

  return (
    <div className="space-y-6">
      {dashboard.loadError ? (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100">
          {dashboard.loadError}
        </div>
      ) : null}

      {perfEnabled && dashboard.perf ? (
        <section className="rounded-2xl border border-amber-300 bg-amber-50/80 p-4 dark:border-amber-700 dark:bg-amber-950/30">
          <div className="mb-3">
            <p className="text-sm font-semibold text-amber-950 dark:text-amber-100">Debug perf activo</p>
            <p className="text-sm text-amber-900 dark:text-amber-200">
              Tiempo total servidor: {dashboard.perf.totalMs} ms
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {dashboard.perf.steps.map((step) => (
              <div
                key={step.label}
                className="rounded-xl border border-amber-300 bg-white px-3 py-2 dark:border-amber-700 dark:bg-slate-950/60"
              >
                <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
                  {step.label}
                </p>
                <p className="text-xl font-semibold text-slate-950 dark:text-slate-50">{step.durationMs} ms</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
            Campus
          </p>
          {canExportCsv && selectedCompetition ? (
            <a
              href={`/api/exports/sports-signups?campus=${encodeURIComponent(selectedCampusId)}&competition=${encodeURIComponent(selectedCompetition.id)}`}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Exportar CSV
            </a>
          ) : null}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {dashboard.campuses.map((campus) => {
            const isSelected = campus.id === selectedCampusId;
            return (
              <button
                key={campus.id}
                type="button"
                onClick={() => setSelectedCampusId(campus.id)}
                className={[
                  "rounded-xl border px-5 py-6 text-center text-xl font-semibold tracking-wide transition",
                  isSelected
                    ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-950"
                    : "border-slate-200 bg-slate-100 text-slate-900 hover:border-slate-300 hover:bg-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700",
                ].join(" ")}
              >
                {campus.name.toUpperCase()}
              </button>
            );
          })}
        </div>
      </section>

      <section className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
          Competencias
        </p>
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {(selectedBoard?.competitions ?? []).map((competition) => {
            const isSelected = competition.id === selectedCompetition?.id;
            return (
              <button
                key={competition.id}
                type="button"
                onClick={() => setSelectedCompetitionId(competition.id)}
                className={[
                  "rounded-xl border p-4 text-left transition",
                  isSelected
                    ? "border-portoBlue bg-portoBlue text-white shadow-sm"
                    : "border-slate-200 bg-slate-100 text-slate-900 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700",
                ].join(" ")}
              >
                <p className="text-sm font-semibold uppercase tracking-wide">{competition.label}</p>
                <p className="mt-3 text-4xl font-bold">{competition.totalConfirmed.toLocaleString("es-MX")}</p>
                <p
                  className={[
                    "mt-1 text-xs",
                    isSelected ? "text-white/80" : "text-slate-500 dark:text-slate-400",
                  ].join(" ")}
                >
                  Jugadores con inscripcion pagada
                </p>
              </button>
            );
          })}
        </div>
      </section>

      {selectedBoard && selectedCompetition ? (
        <section className="rounded-2xl border border-slate-200 bg-slate-100 p-5 dark:border-slate-700 dark:bg-slate-900/60">
          <div className="mb-5 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
                {selectedBoard.campusName}
              </p>
              <h2 className="text-2xl font-semibold text-slate-950 dark:text-slate-50">{selectedCompetition.label}</h2>
            </div>
            <div className="text-sm text-slate-600 dark:text-slate-300">
              <span className="font-semibold text-slate-950 dark:text-slate-100">
                {selectedCompetition.totalConfirmed.toLocaleString("es-MX")}
              </span>{" "}
              pagados confirmados
            </div>
          </div>

          {selectedCompetition.categories.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-8 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-950/40 dark:text-slate-400">
              No hay categorias activas o jugadores pagados para esta competencia en el campus seleccionado.
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-5">
              {selectedCompetition.categories.map((category) => {
                const detailHref = `/sports-signups/detail?campus=${encodeURIComponent(selectedCampusId)}&competition=${encodeURIComponent(selectedCompetition.id)}&birthYear=${encodeURIComponent(category.key)}${perfEnabled ? "&perf=1" : ""}`;
                const nameColumns = getNameColumns(category.players);
                const feedback = feedbackByCategoryKey[category.key];

                return (
                  <article
                    key={`${selectedCompetition.id}-${category.key}`}
                    role="link"
                    tabIndex={0}
                    onClick={() => router.push(detailHref)}
                    onKeyDown={(event) => {
                      if (event.key !== "Enter" && event.key !== " ") return;
                      event.preventDefault();
                      router.push(detailHref);
                    }}
                    className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-portoBlue hover:shadow-md focus:outline-none focus:ring-2 focus:ring-portoBlue/40 dark:border-slate-700 dark:bg-slate-950/70"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-2xl font-semibold text-slate-950 dark:text-slate-50">{category.label}</h3>
                        <p className="mt-1 text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          Pagados / activos cat.
                        </p>
                      </div>
                      <p className="text-2xl font-semibold text-slate-950 dark:text-slate-50">
                        {category.confirmedCount}/{category.activeCount}
                      </p>
                    </div>

                    <div className="mt-4 space-y-3 text-sm text-slate-700 dark:text-slate-200">
                      {category.players.length > 0 ? (
                        <div
                          className={[
                            "grid gap-x-5 gap-y-1",
                            nameColumns.length > 1 ? "sm:grid-cols-2" : "grid-cols-1",
                          ].join(" ")}
                        >
                          {nameColumns.map((column, columnIndex) => (
                            <div key={`${category.key}-column-${columnIndex}`} className="space-y-1">
                              {column.map((player) => (
                                <p key={player.enrollmentId} className="leading-5">
                                  {player.playerName}
                                </p>
                              ))}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm italic text-slate-400 dark:text-slate-500">Sin jugadores pagados.</p>
                      )}
                    </div>

                    <div className="mt-4 border-t border-slate-200 pt-3 dark:border-slate-800">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-xs font-medium uppercase tracking-wide text-portoBlue">Ver por nivel</p>
                        {feedback ? (
                          <p
                            className={[
                              "text-xs font-medium",
                              feedback === "copied" || feedback === "png-exported"
                                ? "text-emerald-700 dark:text-emerald-400"
                                : "text-rose-700 dark:text-rose-400",
                            ].join(" ")}
                          >
                            {feedback === "copied"
                              ? "Texto copiado"
                              : feedback === "png-exported"
                                ? "PNG listo"
                                : feedback === "copy-error"
                                  ? "No se pudo copiar"
                                  : "No se pudo exportar"}
                          </p>
                        ) : null}
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            void handleExportCategoryPng(category);
                          }}
                          className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                        >
                          Exportar PNG
                        </button>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            void handleCopyCategoryText(category);
                          }}
                          className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                        >
                          Copiar texto
                        </button>
                        <Link
                          href={detailHref}
                          onClick={(event) => event.stopPropagation()}
                          className="rounded-md border border-transparent px-3 py-2 text-sm font-medium text-portoBlue transition hover:bg-portoBlue/5 dark:text-portoBlue"
                        >
                          Ver detalle
                        </Link>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      ) : (
        <div className="rounded-xl border border-dashed border-slate-300 px-4 py-8 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
          No hay competencias disponibles.
        </div>
      )}

      <p className="text-sm text-slate-600 dark:text-slate-400">
        Fuente de verdad: cargos positivos, no anulados, con asignaciones de pago suficientes para cubrir el monto completo.
      </p>
    </div>
  );
}
