"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { CompetitionRosterLiveView } from "@/components/sports/competition-roster-live-view";
import { SportsSignupsPacketExport } from "@/components/sports/sports-signups-packet-export";
import type {
  CompetitionSignupCategoryGroup,
  CompetitionSignupDashboardData,
  CompetitionSignupTrainingGroup,
} from "@/lib/queries/sports-signups";
import { formatTournamentGroupCardDisplay } from "@/lib/training-groups/shared";

type Props = {
  dashboard: CompetitionSignupDashboardData;
  initialCompetitionId: string;
  canExportExcel: boolean;
  canUsePerfDebug: boolean;
};

type CategoryActionFeedback = "copied" | "copy-error" | "png-exported" | "png-error";
type TrainingGroupVisibility = "registered" | "eligible";

const CATEGORY_TWO_COLUMN_THRESHOLD = 14;

function filterCompetitionByProgram(
  competition: CompetitionSignupDashboardData["campusBoards"][number]["competitions"][number],
  program: string | null,
) {
  if (!program) return competition;

  const categories = competition.categories
    .map((category) => {
      const players = category.players.filter((player) => player.trainingProgram === program);
      return {
        ...category,
        players,
        confirmedCount: players.length,
        activeCount: category.activeCountByProgram[program] ?? 0,
      };
    })
    .filter((category) => category.activeCount > 0 || category.confirmedCount > 0);
  const confirmedPlayers = categories.flatMap((category) => category.players);

  return {
    ...competition,
    totalConfirmed: confirmedPlayers.length,
    directConfirmedCount: confirmedPlayers.filter((player) => player.registrationSource === "direct").length,
    bundleConfirmedCount: confirmedPlayers.filter((player) => player.registrationSource === "bundle").length,
    totalActive: categories.reduce((total, category) => total + category.activeCount, 0),
    eligibilityReviewPlayers: competition.eligibilityReviewPlayers.filter(
      (player) => player.trainingProgram === program,
    ),
    categories,
    trainingGroups: competition.trainingGroups.filter((group) => group.program === program),
  };
}

function parseDateOnly(value: string | null | undefined) {
  if (!value) return null;
  const [year, month, day] = value.split("-").map((part) => Number.parseInt(part, 10));
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

function formatShortDate(value: string | null | undefined) {
  const parsed = parseDateOnly(value);
  if (!parsed) return null;
  return parsed.toLocaleDateString("es-MX", { day: "2-digit", month: "short" }).replace(".", "");
}

function formatDateRange(startDate: string | null, endDate: string | null) {
  const start = formatShortDate(startDate);
  const end = formatShortDate(endDate);
  if (start && end && start !== end) return `${start} - ${end}`;
  return start ?? end ?? null;
}

function formatPaidFilterLabel(from: string | null, to: string | null) {
  if (from && to) return `Mostrando pagos del ${from} al ${to}`;
  if (from) return `Mostrando pagos desde ${from}`;
  if (to) return `Mostrando pagos hasta ${to}`;
  return null;
}

function formatProgramLabel(program: string | null) {
  if (program === "futbol_para_todos") return "Futbol Para Todos";
  if (program === "selectivo") return "Selectivos";
  if (program === "little_dragons") return "Little Dragons";
  return "Todos los programas";
}

function formatDeadlineStatus(deadline: string | null) {
  const parsed = parseDateOnly(deadline);
  if (!parsed) return null;

  const today = new Date();
  const todayOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const diffDays = Math.ceil((parsed.getTime() - todayOnly.getTime()) / 86_400_000);
  const label = formatShortDate(deadline);

  if (diffDays < 0) return `Inscripcion cerrada (${label})`;
  if (diffDays === 0) return "Inscripcion cierra hoy";
  if (diffDays === 1) return `Inscripcion cierra manana (${label})`;
  return `Inscripcion cierra en ${diffDays} dias (${label})`;
}

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
    category.label,
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
            <div style="font-size:40px;font-weight:800;line-height:1.05;color:#0f172a;">${category.confirmedCount}</div>
            <div style="margin-top:10px;font-size:14px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#64748b;">${category.confirmedCount === 1 ? "Jugador" : "Jugadores"}</div>
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
  canExportExcel,
  canUsePerfDebug,
}: Props) {
  const [selectedCampusId, setSelectedCampusId] = useState(dashboard.selectedCampusId);
  const [selectedCompetitionId, setSelectedCompetitionId] = useState(initialCompetitionId);
  const [selectedProgram, setSelectedProgram] = useState(dashboard.selectedProgram);
  const [viewMode, setViewMode] = useState<"category" | "group" | "teams">("category");
  const [trainingGroupVisibility, setTrainingGroupVisibility] = useState<TrainingGroupVisibility>("registered");
  const [feedbackByCategoryKey, setFeedbackByCategoryKey] = useState<Record<string, CategoryActionFeedback>>({});
  const router = useRouter();
  const searchParams = useSearchParams();
  const perfEnabled = canUsePerfDebug && searchParams.get("perf") === "1";
  const paidFilterLabel = formatPaidFilterLabel(dashboard.paidDateFilter.from, dashboard.paidDateFilter.to);
  const paidFilterQuery = `${dashboard.paidDateFilter.from ? `&paidFrom=${encodeURIComponent(dashboard.paidDateFilter.from)}` : ""}${dashboard.paidDateFilter.to ? `&paidTo=${encodeURIComponent(dashboard.paidDateFilter.to)}` : ""}`;
  const programQuery = selectedProgram ? `&program=${encodeURIComponent(selectedProgram)}` : "";

  const selectedBoard = useMemo(
    () =>
      dashboard.campusBoards.find((board) => board.campusId === selectedCampusId) ??
      dashboard.campusBoards[0] ??
      null,
    [dashboard.campusBoards, selectedCampusId],
  );

  const selectedCompetition = useMemo(() => {
    const competition =
      selectedBoard?.competitions.find((item) => item.id === selectedCompetitionId) ??
      selectedBoard?.competitions[0] ??
      null;
    return competition ? filterCompetitionByProgram(competition, selectedProgram) : null;
  }, [selectedBoard, selectedCompetitionId, selectedProgram]);

  const visibleCompetitions = useMemo(
    () => (selectedBoard?.competitions ?? []).map((competition) =>
      filterCompetitionByProgram(competition, selectedProgram)),
    [selectedBoard, selectedProgram],
  );

  const registeredTrainingGroups = useMemo(
    () => selectedCompetition?.trainingGroups.filter((group) => group.confirmedCount > 0) ?? [],
    [selectedCompetition],
  );
  const visibleTrainingGroups = trainingGroupVisibility === "eligible"
    ? selectedCompetition?.trainingGroups ?? []
    : registeredTrainingGroups;

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

  function selectProgram(program: string | null) {
    setSelectedProgram(program);
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.set("campus", selectedCampusId);
    if (selectedCompetition) nextParams.set("competition", selectedCompetition.id);
    if (program) nextParams.set("program", program);
    else nextParams.delete("program");
    window.history.replaceState(null, "", `/sports-signups?${nextParams.toString()}`);
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
          {canExportExcel && selectedCompetition && selectedBoard ? (
            <div className="flex flex-wrap items-center justify-end gap-2">
              <a
                href={`/api/exports/sports-signups?campus=${encodeURIComponent(selectedCampusId)}&competition=${encodeURIComponent(selectedCompetition.id)}${programQuery}${paidFilterQuery}`}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Exportar Excel completo
              </a>
              <SportsSignupsPacketExport
                competition={selectedCompetition}
                campusName={selectedBoard.campusName}
                programLabel={formatProgramLabel(selectedProgram)}
                paidFilterLabel={paidFilterLabel ?? "Todos los pagos confirmados"}
              />
            </div>
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
        <div className="flex flex-wrap gap-2" aria-label="Filtrar por programa">
          {[
            { value: null, label: "Todos" },
            { value: "futbol_para_todos", label: "Futbol Para Todos" },
            { value: "selectivo", label: "Selectivos" },
            ...(selectedCompetition?.availablePrograms.includes("little_dragons")
              ? [{ value: "little_dragons", label: "Little Dragons" }]
              : []),
          ].map((option) => {
            const isSelected = selectedProgram === option.value;
            return (
              <button
                key={option.value ?? "all"}
                type="button"
                onClick={() => selectProgram(option.value)}
                className={isSelected
                  ? "rounded-md bg-portoBlue px-4 py-2 text-sm font-medium text-white"
                  : "rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-200"}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <form action="/sports-signups" className="grid gap-3 lg:grid-cols-[1fr_1fr_auto_auto] lg:items-end">
          <input type="hidden" name="campus" value={selectedCampusId} />
          {selectedCompetition ? <input type="hidden" name="competition" value={selectedCompetition.id} /> : null}
          {selectedProgram ? <input type="hidden" name="program" value={selectedProgram} /> : null}
          {perfEnabled ? <input type="hidden" name="perf" value="1" /> : null}
          <label className="space-y-1 text-sm">
            <span className="font-medium text-slate-700 dark:text-slate-200">Pagado desde</span>
            <input
              name="paidFrom"
              type="date"
              defaultValue={dashboard.paidDateFilter.from ?? ""}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-950"
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium text-slate-700 dark:text-slate-200">Pagado hasta</span>
            <input
              name="paidTo"
              type="date"
              defaultValue={dashboard.paidDateFilter.to ?? ""}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-950"
            />
          </label>
          <button
            type="submit"
            className="rounded-md bg-portoBlue px-4 py-2 text-sm font-medium text-white hover:bg-portoDark"
          >
            Aplicar fechas
          </button>
          <Link
            href={`/sports-signups?campus=${encodeURIComponent(selectedCampusId)}${selectedCompetition ? `&competition=${encodeURIComponent(selectedCompetition.id)}` : ""}${programQuery}${perfEnabled ? "&perf=1" : ""}`}
            className="rounded-md border border-slate-300 px-4 py-2 text-center text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Limpiar
          </Link>
        </form>
        {paidFilterLabel ? (
          <p className="mt-3 text-sm font-medium text-portoBlue">{paidFilterLabel}</p>
        ) : (
          <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
            Sin filtro de fecha: se muestran todos los pagos confirmados.
          </p>
        )}
      </section>

      <section className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
          Competencias
        </p>
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {visibleCompetitions.map((competition) => {
            const isSelected = competition.id === selectedCompetition?.id;
            const dateRange = formatDateRange(competition.startDate, competition.endDate);
            const deadlineStatus = formatDeadlineStatus(competition.signupDeadline);
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
                {dateRange || deadlineStatus ? (
                  <div
                    className={[
                      "mt-2 space-y-0.5 text-xs leading-tight",
                      isSelected ? "text-white/80" : "text-slate-500 dark:text-slate-400",
                    ].join(" ")}
                  >
                    {dateRange ? <p>Torneo: {dateRange}</p> : null}
                    {deadlineStatus ? <p>{deadlineStatus}</p> : null}
                  </div>
                ) : null}
                <p className="mt-3 text-4xl font-bold">{competition.totalConfirmed.toLocaleString("es-MX")}</p>
                <p
                  className={[
                    "mt-1 text-xs",
                    isSelected ? "text-white/80" : "text-slate-500 dark:text-slate-400",
                  ].join(" ")}
                >
                  Inscripciones confirmadas
                </p>
                <p
                  className={[
                    "mt-2 text-[11px] leading-tight",
                    isSelected ? "text-white/75" : "text-slate-500 dark:text-slate-400",
                  ].join(" ")}
                >
                  Pago directo {competition.directConfirmedCount} · Via Combo {competition.bundleConfirmedCount}
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
            <div className="flex flex-col items-start gap-2 md:items-end">
              <div className="text-sm text-slate-600 dark:text-slate-300">
                <span className="font-semibold text-slate-950 dark:text-slate-100">
                  {selectedCompetition.totalConfirmed.toLocaleString("es-MX")}
                </span>{" "}
                inscripciones confirmadas · Pago directo {selectedCompetition.directConfirmedCount} · Via Combo{" "}
                {selectedCompetition.bundleConfirmedCount}
              </div>
              {selectedCompetition.tournamentId && selectedProgram ? (
                <Link
                  href={`/sports-signups/squads?tournament=${encodeURIComponent(selectedCompetition.tournamentId)}&campus=${encodeURIComponent(selectedCampusId)}&program=${encodeURIComponent(selectedProgram)}`}
                  className="rounded-md bg-portoBlue px-4 py-2 text-sm font-semibold text-white hover:bg-portoDark"
                >
                  Administrar equipos
                </Link>
              ) : selectedCompetition.tournamentId ? (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Selecciona un programa para organizar equipos.
                </p>
              ) : null}
            </div>
          </div>

          <div className="mb-5 flex flex-wrap gap-2" aria-label="Organizar inscripciones">
            <button
              type="button"
              onClick={() => setViewMode("category")}
              className={viewMode === "category"
                ? "rounded-md bg-portoBlue px-4 py-2 text-sm font-medium text-white"
                : "rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-200"}
            >
              Por categoria
            </button>
            <button
              type="button"
              onClick={() => setViewMode("group")}
              className={viewMode === "group"
                ? "rounded-md bg-portoBlue px-4 py-2 text-sm font-medium text-white"
                : "rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-200"}
            >
              Por grupo
            </button>
            <button
              type="button"
              onClick={() => setViewMode("teams")}
              className={viewMode === "teams"
                ? "rounded-md bg-portoBlue px-4 py-2 text-sm font-medium text-white"
                : "rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-200"}
            >
              Equipos
            </button>
          </div>

          {viewMode === "group" ? (
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-900/50">
              <div>
                <p className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">Mostrar grupos</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Los grupos elegibles respetan las reglas configuradas para este torneo.
                </p>
              </div>
              <div className="inline-flex rounded-md border border-slate-300 bg-white p-1 dark:border-slate-600 dark:bg-slate-950" aria-label="Visibilidad de grupos">
                <button
                  type="button"
                  aria-pressed={trainingGroupVisibility === "registered"}
                  onClick={() => setTrainingGroupVisibility("registered")}
                  className={trainingGroupVisibility === "registered"
                    ? "rounded bg-portoBlue px-3 py-1.5 text-sm font-medium text-white"
                    : "rounded px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"}
                >
                  Con inscritos ({registeredTrainingGroups.length})
                </button>
                <button
                  type="button"
                  aria-pressed={trainingGroupVisibility === "eligible"}
                  onClick={() => setTrainingGroupVisibility("eligible")}
                  className={trainingGroupVisibility === "eligible"
                    ? "rounded bg-portoBlue px-3 py-1.5 text-sm font-medium text-white"
                    : "rounded px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"}
                >
                  Todos los elegibles ({selectedCompetition.trainingGroups.length})
                </button>
              </div>
            </div>
          ) : null}

          {selectedCompetition.eligibilityReviewPlayers.length > 0 ? (
            <div className="mb-5 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100">
              {selectedCompetition.eligibilityReviewPlayers.length} registro(s) pagado(s) requieren revision porque el grupo actual ya no coincide con los grupos invitados o las reglas del torneo.
            </div>
          ) : null}

          {viewMode === "teams" ? (
            <CompetitionRosterLiveView
              active
              tournamentId={selectedCompetition.tournamentId}
              campusId={selectedCampusId}
              program={selectedProgram}
              availablePrograms={selectedCompetition.availablePrograms}
            />
          ) : viewMode === "category" && selectedCompetition.categories.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-8 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-950/40 dark:text-slate-400">
              No hay categorias activas o jugadores pagados para esta competencia en el campus seleccionado.
            </div>
          ) : viewMode === "category" ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-5">
              {selectedCompetition.categories.map((category) => {
                const detailHref = `/sports-signups/detail?campus=${encodeURIComponent(selectedCampusId)}&competition=${encodeURIComponent(selectedCompetition.id)}&birthYear=${encodeURIComponent(category.key)}${programQuery}${paidFilterQuery}${perfEnabled ? "&perf=1" : ""}`;
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
                        <p className="text-xs font-medium uppercase tracking-wide text-portoBlue">Ver detalle</p>
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
          ) : visibleTrainingGroups.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-8 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-950/40 dark:text-slate-400">
              {trainingGroupVisibility === "registered"
                ? "No hay grupos con jugadores inscritos para esta competencia. Puedes mostrar todos los grupos elegibles."
                : "No hay grupos elegibles para esta competencia en el campus y programa seleccionados."}
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {visibleTrainingGroups.map((group) => (
                <TrainingGroupSignupCard
                  key={`${selectedCompetition.id}-${group.key}`}
                  group={group}
                  detailHref={`/sports-signups/detail?campus=${encodeURIComponent(selectedCampusId)}&competition=${encodeURIComponent(selectedCompetition.id)}&trainingGroup=${encodeURIComponent(group.key)}${programQuery}${paidFilterQuery}${perfEnabled ? "&perf=1" : ""}`}
                  onOpen={(href) => router.push(href)}
                />
              ))}
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

function TrainingGroupSignupCard({
  group,
  detailHref,
  onOpen,
}: {
  group: CompetitionSignupTrainingGroup;
  detailHref: string;
  onOpen: (href: string) => void;
}) {
  const nameColumns = getNameColumns(group.players);
  const display = formatTournamentGroupCardDisplay({
    name: group.label,
    program: group.program,
    birthYearMin: group.birthYearMin,
    birthYearMax: group.birthYearMax,
  });

  return (
    <article
      role="link"
      tabIndex={0}
      onClick={() => onOpen(detailHref)}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        onOpen(detailHref);
      }}
      className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-portoBlue hover:shadow-md focus:outline-none focus:ring-2 focus:ring-portoBlue/40 dark:border-slate-700 dark:bg-slate-950/70"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-lg font-semibold text-slate-950 dark:text-slate-50">{display.title}</h3>
          {display.subtitle ? (
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{display.subtitle}</p>
          ) : null}
        </div>
        <p className="shrink-0 text-2xl font-semibold text-slate-950 dark:text-slate-50">
          {group.confirmedCount}/{group.activeCount}
        </p>
      </div>

      <div className="mt-4 text-sm text-slate-700 dark:text-slate-200">
        {group.players.length > 0 ? (
          <div className={nameColumns.length > 1 ? "grid gap-x-5 gap-y-1 sm:grid-cols-2" : "grid grid-cols-1 gap-y-1"}>
            {nameColumns.map((column, columnIndex) => (
              <div key={`${group.key}-column-${columnIndex}`} className="space-y-1">
                {column.map((player) => <p key={player.enrollmentId}>{player.playerName}</p>)}
              </div>
            ))}
          </div>
        ) : (
          <p className="italic text-slate-400 dark:text-slate-500">Sin jugadores pagados.</p>
        )}
      </div>

      <div className="mt-4 border-t border-slate-200 pt-3 dark:border-slate-800">
        <Link
          href={detailHref}
          onClick={(event) => event.stopPropagation()}
          className="text-sm font-medium text-portoBlue hover:underline"
        >
          Ver detalle
        </Link>
      </div>
    </article>
  );
}
