export type WeeklyCallupPngGame = {
  matchDate: string;
  arrivalTime: string;
  venue: string;
  opponent: string;
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
    month: "short",
  }).format(new Date(`${value}T12:00:00Z`));
}

function programLabel(program: WeeklyCallupPngData["program"]) {
  return program === "selectivo" ? "Selectivos" : "Futbol Para Todos";
}

function estimateLineCount(value: string, charsPerLine: number) {
  return Math.max(1, Math.ceil(value.trim().length / charsPerLine));
}

function estimateCategoryHeight(category: WeeklyCallupPngCategory, density: LayoutDensity) {
  if (category.isRest) return 150;
  const playerHeight =
    category.players.length > 0
      ? category.players.reduce(
          (height, player) =>
            height + estimateLineCount(player.playerName, density.charsPerLine) * density.playerLineHeight + density.playerGap,
          0,
        )
      : 28;
  const gamesHeight =
    category.games.length > 0
      ? category.games.reduce((height, game) => {
          const detail = `${game.arrivalTime} ${game.venue}`;
          const detailLines = estimateLineCount(detail, density.charsPerLine + 4);
          const opponentLines = estimateLineCount(game.opponent, density.charsPerLine + 2);
          return height + 54 + (detailLines + opponentLines) * 18;
        }, 0)
      : 56;
  return 122 + playerHeight + gamesHeight;
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
  const titleSize = compact ? 14 : 15;
  const detailSize = compact ? 13 : 14;
  return `
    <div style="border:1px solid #fed7aa;background:#fff7ed;padding:9px 10px;border-radius:5px;line-height:1.25;">
      <div style="font-size:${titleSize}px;font-weight:800;text-transform:uppercase;color:#9a3412;">${escapeHtml(formatDate(game.matchDate))}</div>
      <div style="margin-top:3px;font-size:${detailSize}px;color:#1e293b;overflow-wrap:anywhere;"><strong>Cita:</strong> ${escapeHtml(game.arrivalTime)} | <strong>Sede:</strong> ${escapeHtml(game.venue)}</div>
      <div style="margin-top:2px;font-size:${titleSize}px;font-weight:700;color:#0f172a;overflow-wrap:anywhere;">VS ${escapeHtml(game.opponent)}</div>
    </div>
  `;
}

function renderCategory(category: SizedCategory, density: LayoutDensity) {
  const headerBackground = category.orderIndex % 2 === 0 ? "#dbeafe" : "#e2e8f0";
  const categoryFontSize = density.compact ? 18 : 20;
  return `
    <section style="overflow:hidden;border:1px solid #94a3b8;border-radius:6px;background:#ffffff;break-inside:avoid;">
      <div style="background:${headerBackground};border-bottom:1px solid #94a3b8;padding:9px 12px;">
        <div style="font-size:${categoryFontSize}px;font-weight:900;color:#0b2f6b;overflow-wrap:anywhere;">${escapeHtml(category.categoryLabel)}</div>
        <div style="margin-top:1px;font-size:13px;font-weight:700;color:#475569;overflow-wrap:anywhere;">${escapeHtml(category.trainingGroupName)}</div>
        <div style="margin-top:3px;font-size:12px;font-weight:800;color:#9a3412;overflow-wrap:anywhere;">${escapeHtml(category.tournamentName ?? "")}</div>
        <div style="margin-top:3px;font-size:12px;font-weight:700;color:#334155;overflow-wrap:anywhere;">Coach: ${escapeHtml(category.coachNames || "Sin coach")}</div>
      </div>
      ${
        category.isRest
          ? `<div style="display:flex;min-height:92px;align-items:center;justify-content:center;padding:16px;font-size:22px;font-weight:900;letter-spacing:0.04em;color:#9a3412;">DESCANSA</div>`
          : `
            <div style="padding:10px 12px 4px;">
              <div style="margin-bottom:7px;font-size:11px;font-weight:800;text-transform:uppercase;color:#64748b;">Convocados (${category.players.length})</div>
              <div style="display:flex;flex-direction:column;gap:${density.playerGap}px;">
                ${
                  category.players.length > 0
                    ? category.players
                        .map(
                          (player, playerIndex) => `
                            <div style="display:grid;grid-template-columns:24px minmax(0,1fr);gap:5px;align-items:start;font-size:${density.playerFontSize}px;line-height:${density.playerLineHeight}px;color:#0f172a;">
                              <span style="color:#64748b;text-align:right;">${playerIndex + 1}.</span>
                              <span style="overflow-wrap:anywhere;">${escapeHtml(player.playerName)}</span>
                            </div>
                          `,
                        )
                        .join("")
                    : `<div style="font-size:14px;font-style:italic;color:#94a3b8;">Sin jugadores incluidos.</div>`
                }
              </div>
            </div>
            <div style="display:flex;flex-direction:column;gap:7px;padding:10px 12px 12px;">
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
  const width = 1700;
  const headerHeight = 142;
  const footerHeight = 0;
  const outerPadding = 32;
  const gap = 16;
  const categoryCount = Math.max(data.categories.length, 1);
  const columnCount = categoryCount >= 11 ? 5 : categoryCount >= 8 ? 4 : categoryCount >= 5 ? 3 : categoryCount >= 2 ? 2 : 1;
  const totalPlayers = data.categories.reduce((total, category) => total + category.players.length, 0);
  const largestRoster = Math.max(0, ...data.categories.map((category) => category.players.length));
  const compact = columnCount >= 5 || totalPlayers > 180 || largestRoster > 30;
  const density: LayoutDensity = {
    compact,
    playerFontSize: compact ? 13 : 15,
    playerLineHeight: compact ? 16 : 19,
    playerGap: compact ? 2 : 3,
    charsPerLine: columnCount >= 5 ? 31 : columnCount === 4 ? 39 : columnCount === 3 ? 52 : 76,
  };
  const sizedCategories = data.categories.map((category, orderIndex) => ({
    ...category,
    orderIndex,
    estimatedHeight: estimateCategoryHeight(category, density),
  }));
  const columns = distributeCategoriesInReadingOrder(sizedCategories, columnCount);
  const contentHeight = Math.max(...columns.map((column) => column.height), 180);
  const height = Math.max(720, headerHeight + contentHeight + footerHeight + outerPadding * 2 + 24);
  const titleFontSize = data.tournamentName.length > 38 ? 29 : data.tournamentName.length > 28 ? 32 : 35;

  const markup = `
    <div xmlns="http://www.w3.org/1999/xhtml" style="box-sizing:border-box;width:${width}px;height:${height}px;background:#f8fafc;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
      <header style="height:${headerHeight}px;background:#0b2f6b;border-bottom:9px solid #f97316;padding:24px 34px;color:#ffffff;box-sizing:border-box;">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:24px;">
          <div>
            <div style="font-size:19px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;color:#bfdbfe;">INVICTA | CONVOCADOS</div>
            <div style="margin-top:5px;max-width:1280px;font-size:${titleFontSize}px;font-weight:900;line-height:1.05;overflow-wrap:anywhere;">${escapeHtml(data.tournamentName)}</div>
            <div style="margin-top:9px;font-size:17px;color:#e2e8f0;">${escapeHtml(data.campusName)} | ${escapeHtml(programLabel(data.program))} | ${escapeHtml(formatDate(data.weekStart))} al ${escapeHtml(formatDate(data.weekEnd))}</div>
          </div>
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
