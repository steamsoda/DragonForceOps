import { compactPlayerName } from "@/lib/exports/player-display-name";

export type WeeklyCallupPngGame = {
  matchDate: string;
  arrivalTime: string;
  venue: string;
  opponent: string;
  players: Array<{ id: string; playerName: string }>;
};

export type WeeklyCallupPngCategory = {
  id: string;
  categoryLabel: string;
  trainingGroupName: string;
  tournamentName: string;
  coachNames: string;
  isRest: boolean;
  players: Array<{ id: string; playerName: string }>;
  games: WeeklyCallupPngGame[];
};

export type WeeklyCallupPngData = {
  tournamentName: string;
  campusName: string;
  program: "selectivo" | "futbol_para_todos";
  weekStart: string;
  weekEnd: string;
  logoDataUrl?: string;
  categories: WeeklyCallupPngCategory[];
};

type SizedCategory = WeeklyCallupPngCategory & {
  estimatedHeight: number;
  orderIndex: number;
};

type LayoutDensity = {
  compact: boolean;
  playerFontSize: number;
  playerLineHeight: number;
  playerGap: number;
  charsPerLine: number;
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-MX", {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(`${value}T12:00:00Z`));
}

function formatArrivalTime(value: string) {
  const normalized = value.trim();
  const match = normalized.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!match) return normalized.replace(/\s*([ap])\.?\s*m\.?$/i, (_, marker: string) => ` ${marker.toUpperCase()}M`);
  const hours = Number(match[1]);
  const displayHours = hours % 12 || 12;
  return `${displayHours}:${match[2]} ${hours >= 12 ? "PM" : "AM"}`;
}

function programLabel(program: WeeklyCallupPngData["program"]) {
  return program === "selectivo" ? "Selectivos" : "Futbol Para Todos";
}

function estimateLineCount(value: string, charsPerLine: number) {
  return Math.max(1, Math.ceil(value.trim().length / charsPerLine));
}

function estimateCategoryHeight(category: WeeklyCallupPngCategory, density: LayoutDensity) {
  if (category.isRest) return 132;
  const gamesHeight =
    category.games.length > 0
      ? category.games.reduce((height, game) => {
          const detail = `${formatArrivalTime(game.arrivalTime)} ${game.venue}`;
          const detailLines = estimateLineCount(detail, density.charsPerLine + 4);
          const opponentLines = estimateLineCount(game.opponent, density.charsPerLine + 2);
          const playerHeight = game.players.length
            ? game.players.reduce((total, player) => total + estimateLineCount(compactPlayerName(player.playerName), density.charsPerLine) * density.playerLineHeight + density.playerGap, 0)
            : 24;
          return height + 68 + (detailLines + opponentLines) * 17 + playerHeight;
        }, 0)
      : 56;
  return 98 + gamesHeight;
}

function distributeCategoriesInReadingOrder(categories: SizedCategory[], columnCount: number) {
  if (categories.length === 0) {
    return Array.from({ length: columnCount }, () => ({ height: 0, categories: [] as SizedCategory[] }));
  }

  const actualColumnCount = Math.min(columnCount, categories.length);
  const prefixHeights = [0];
  for (const category of categories) {
    prefixHeights.push(prefixHeights[prefixHeights.length - 1] + category.estimatedHeight + 16);
  }

  const costs = Array.from({ length: actualColumnCount + 1 }, () =>
    Array.from({ length: categories.length + 1 }, () => Number.POSITIVE_INFINITY),
  );
  const partitionStarts = Array.from({ length: actualColumnCount + 1 }, () =>
    Array.from({ length: categories.length + 1 }, () => -1),
  );
  costs[0][0] = 0;

  for (let columnsUsed = 1; columnsUsed <= actualColumnCount; columnsUsed += 1) {
    for (let end = columnsUsed; end <= categories.length; end += 1) {
      for (let start = columnsUsed - 1; start < end; start += 1) {
        const columnHeight = prefixHeights[end] - prefixHeights[start];
        const candidateCost = Math.max(costs[columnsUsed - 1][start], columnHeight);
        if (candidateCost < costs[columnsUsed][end]) {
          costs[columnsUsed][end] = candidateCost;
          partitionStarts[columnsUsed][end] = start;
        }
      }
    }
  }

  const ranges: Array<{ start: number; end: number }> = [];
  let end = categories.length;
  for (let columnsUsed = actualColumnCount; columnsUsed >= 1; columnsUsed -= 1) {
    const start = partitionStarts[columnsUsed][end];
    ranges.unshift({ start, end });
    end = start;
  }

  return ranges.map((range) => ({
    categories: categories.slice(range.start, range.end),
    height: prefixHeights[range.end] - prefixHeights[range.start],
  }));
}

function renderGame(game: WeeklyCallupPngGame, compact: boolean) {
  const titleSize = compact ? 13 : 14;
  const detailSize = compact ? 12 : 13;
  return `
    <div style="border:1px solid #fed7aa;background:#fff7ed;padding:7px 9px;border-radius:5px;line-height:1.2;">
      <div style="font-size:${titleSize}px;font-weight:800;text-transform:uppercase;color:#9a3412;">${escapeHtml(formatDate(game.matchDate))}</div>
      <div style="margin-top:2px;font-size:${detailSize}px;color:#1e293b;overflow-wrap:anywhere;"><strong>Cita:</strong> ${escapeHtml(formatArrivalTime(game.arrivalTime))} | <strong>Sede:</strong> ${escapeHtml(game.venue)}</div>
      <div style="margin-top:2px;font-size:${titleSize}px;font-weight:700;color:#0f172a;overflow-wrap:anywhere;">VS ${escapeHtml(game.opponent)}</div>
      <div style="margin-top:5px;border-top:1px solid #fed7aa;padding-top:5px;font-size:10px;font-weight:800;text-transform:uppercase;color:#64748b;">Convocados (${game.players.length})</div>
      <div style="margin-top:3px;display:flex;flex-direction:column;gap:1px;">
        ${game.players.length ? game.players.map((player, index) => `<div style="display:grid;grid-template-columns:20px minmax(0,1fr);gap:4px;font-size:${compact ? 11 : 12}px;line-height:${compact ? 14 : 16}px;color:#0f172a;"><span style="color:#64748b;text-align:right;">${index + 1}.</span><span style="overflow-wrap:anywhere;">${escapeHtml(compactPlayerName(player.playerName))}</span></div>`).join("") : `<div style="font-size:11px;font-style:italic;color:#94a3b8;">Sin jugadores convocados.</div>`}
      </div>
    </div>
  `;
}

function renderCategory(category: SizedCategory, density: LayoutDensity) {
  const headerBackground = category.orderIndex % 2 === 0 ? "#dbeafe" : "#e2e8f0";
  const teamFontSize = density.compact ? 17 : 19;
  return `
    <section style="overflow:hidden;border:1px solid #94a3b8;border-radius:6px;background:#ffffff;break-inside:avoid;">
      <div style="background:${headerBackground};border-bottom:1px solid #94a3b8;padding:7px 10px;">
        <div style="font-size:${teamFontSize}px;font-weight:900;color:#0b2f6b;overflow-wrap:anywhere;">${escapeHtml(category.trainingGroupName)}</div>
        <div style="margin-top:1px;font-size:12px;font-weight:800;color:#475569;overflow-wrap:anywhere;">Categoría ${escapeHtml(category.categoryLabel)}</div>
        <div style="margin-top:2px;font-size:11px;font-weight:800;color:#9a3412;overflow-wrap:anywhere;">${escapeHtml(category.tournamentName ?? "")}</div>
        <div style="margin-top:2px;font-size:11px;font-weight:700;color:#334155;overflow-wrap:anywhere;">Profesor: ${escapeHtml(category.coachNames || "Sin profesor")}</div>
      </div>
      ${
        category.isRest
          ? `<div style="display:flex;min-height:92px;align-items:center;justify-content:center;padding:16px;font-size:22px;font-weight:900;letter-spacing:0.04em;color:#9a3412;">DESCANSA</div>`
          : `
            <div style="display:flex;flex-direction:column;gap:5px;padding:7px 9px 9px;">
              ${
                category.games.length > 0
                  ? category.games.map((game) => renderGame(game, density.compact)).join("")
                  : `<div style="border:1px dashed #f59e0b;background:#fffbeb;padding:10px;font-size:13px;font-weight:700;color:#92400e;">PARTIDO PENDIENTE DE CAPTURAR</div>`
              }
            </div>
          `
      }
    </section>
  `;
}

export function buildWeeklyCallupPngSvg(data: WeeklyCallupPngData) {
  const headerHeight = 132;
  const footerHeight = 0;
  const outerPadding = 24;
  const gap = 12;
  const categoryCount = data.categories.length;
  const totalPlayers = data.categories.reduce((total, category) => total + category.players.length, 0);
  const largestRoster = Math.max(0, ...data.categories.map((category) => category.players.length));
  const candidates = Array.from({ length: Math.max(1, Math.min(5, categoryCount)) }, (_, index) => index + 1).map((columnCount) => {
    const width = Math.min(1700, Math.max(980, outerPadding * 2 + columnCount * 390 + (columnCount - 1) * gap));
    const columnWidth = (width - outerPadding * 2 - (columnCount - 1) * gap) / columnCount;
    const compact = columnCount >= 4 || totalPlayers > 150 || largestRoster > 24;
    const density: LayoutDensity = {
      compact,
      playerFontSize: compact ? 11 : 12,
      playerLineHeight: compact ? 14 : 16,
      playerGap: 1,
      charsPerLine: Math.max(24, Math.floor((columnWidth - 48) / (compact ? 6.2 : 6.8))),
    };
    const sizedCategories = data.categories.map((category, orderIndex) => ({ ...category, orderIndex, estimatedHeight: estimateCategoryHeight(category, density) }));
    const columns = distributeCategoriesInReadingOrder(sizedCategories, columnCount);
    const contentHeight = Math.max(...columns.map((column) => column.height), 120);
    const height = headerHeight + contentHeight + footerHeight + outerPadding * 2 + 12;
    return { width, height, columnCount, density, columns, score: Math.abs(Math.log(width / height)) };
  });
  const layout = candidates.reduce((best, candidate) => candidate.score < best.score ? candidate : best);
  const { width, height, columnCount, density, columns } = layout;
  const titleFontSize = data.tournamentName.length > 38 ? 29 : data.tournamentName.length > 28 ? 32 : 35;

  const markup = `
    <div xmlns="http://www.w3.org/1999/xhtml" style="box-sizing:border-box;width:${width}px;height:${height}px;background:#f8fafc;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
      <header style="height:${headerHeight}px;background:#0b2f6b;border-bottom:9px solid #f97316;padding:24px 34px;color:#ffffff;box-sizing:border-box;">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:24px;">
          <div style="min-width:0;">
            <div style="font-size:19px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;color:#bfdbfe;">INVICTA | CONVOCADOS</div>
            <div style="margin-top:5px;max-width:1280px;font-size:${titleFontSize}px;font-weight:900;line-height:1.05;overflow-wrap:anywhere;">${escapeHtml(data.tournamentName)}</div>
            <div style="margin-top:9px;font-size:17px;color:#e2e8f0;">${escapeHtml(data.campusName)} | ${escapeHtml(programLabel(data.program))} | ${escapeHtml(formatDate(data.weekStart))} al ${escapeHtml(formatDate(data.weekEnd))}</div>
          </div>
          ${data.logoDataUrl ? `<div style="display:flex;width:108px;height:84px;flex:none;align-items:center;justify-content:center;border-radius:8px;background:#ffffff;padding:7px;"><img src="${escapeHtml(data.logoDataUrl)}" alt="INVICTA" style="display:block;max-width:100%;max-height:100%;object-fit:contain;" /></div>` : ""}
        </div>
      </header>
      <main style="display:grid;grid-template-columns:repeat(${columnCount},minmax(0,1fr));gap:${gap}px;align-items:start;padding:${outerPadding}px;box-sizing:border-box;">
        ${columns
          .map(
            (column) => `
              <div style="display:flex;min-width:0;flex-direction:column;gap:${gap}px;">
                ${column.categories.map((category) => renderCategory(category, density)).join("")}
              </div>
            `,
          )
          .join("")}
      </main>
    </div>
  `;

  return {
    width,
    height,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><foreignObject x="0" y="0" width="${width}" height="${height}">${markup}</foreignObject></svg>`,
  };
}
