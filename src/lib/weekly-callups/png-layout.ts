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
  status: "draft" | "ready" | "shared";
  categories: WeeklyCallupPngCategory[];
};

type SizedCategory = WeeklyCallupPngCategory & { estimatedHeight: number };

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

function estimateCategoryHeight(category: WeeklyCallupPngCategory) {
  if (category.isRest) return 150;
  const playerHeight = Math.max(category.players.length, 1) * 29;
  const gamesHeight = Math.max(category.games.length, 1) * 76;
  return 96 + playerHeight + gamesHeight;
}

function distributeCategories(categories: SizedCategory[], columnCount: number) {
  const columns = Array.from({ length: columnCount }, () => ({ height: 0, categories: [] as SizedCategory[] }));
  for (const category of categories) {
    const target = columns.reduce((shortest, column) => (column.height < shortest.height ? column : shortest));
    target.categories.push(category);
    target.height += category.estimatedHeight + 16;
  }
  return columns;
}

function renderGame(game: WeeklyCallupPngGame) {
  return `
    <div style="border:1px solid #fed7aa;background:#fff7ed;padding:9px 10px;border-radius:5px;line-height:1.25;">
      <div style="font-size:15px;font-weight:800;text-transform:uppercase;color:#9a3412;">${escapeHtml(formatDate(game.matchDate))}</div>
      <div style="margin-top:3px;font-size:14px;color:#1e293b;"><strong>Cita:</strong> ${escapeHtml(game.arrivalTime)} | <strong>Sede:</strong> ${escapeHtml(game.venue)}</div>
      <div style="margin-top:2px;font-size:15px;font-weight:700;color:#0f172a;">VS ${escapeHtml(game.opponent)}</div>
    </div>
  `;
}

function renderCategory(category: SizedCategory, index: number) {
  const headerBackground = index % 2 === 0 ? "#dbeafe" : "#e2e8f0";
  return `
    <section style="overflow:hidden;border:1px solid #94a3b8;border-radius:6px;background:#ffffff;break-inside:avoid;">
      <div style="background:${headerBackground};border-bottom:1px solid #94a3b8;padding:9px 12px;">
        <div style="font-size:20px;font-weight:900;color:#0b2f6b;">${escapeHtml(category.categoryLabel)}</div>
        <div style="margin-top:1px;font-size:13px;font-weight:700;color:#475569;">${escapeHtml(category.trainingGroupName)}</div>
      </div>
      ${
        category.isRest
          ? `<div style="display:flex;min-height:92px;align-items:center;justify-content:center;padding:16px;font-size:22px;font-weight:900;letter-spacing:0.04em;color:#9a3412;">DESCANSA</div>`
          : `
            <div style="padding:10px 12px 4px;">
              <div style="margin-bottom:7px;font-size:11px;font-weight:800;text-transform:uppercase;color:#64748b;">Convocados (${category.players.length})</div>
              <div style="display:flex;flex-direction:column;gap:3px;">
                ${
                  category.players.length > 0
                    ? category.players
                        .map(
                          (player, playerIndex) => `
                            <div style="display:grid;grid-template-columns:24px minmax(0,1fr);gap:5px;align-items:start;font-size:15px;line-height:1.25;color:#0f172a;">
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
                  ? category.games.map(renderGame).join("")
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
  const footerHeight = 44;
  const outerPadding = 32;
  const gap = 16;
  const categoryCount = Math.max(data.categories.length, 1);
  const columnCount = categoryCount >= 9 ? 4 : categoryCount >= 5 ? 3 : categoryCount >= 2 ? 2 : 1;
  const sizedCategories = data.categories.map((category) => ({
    ...category,
    estimatedHeight: estimateCategoryHeight(category),
  }));
  const columns = distributeCategories(sizedCategories, columnCount);
  const contentHeight = Math.max(...columns.map((column) => column.height), 180);
  const height = Math.max(720, headerHeight + contentHeight + footerHeight + outerPadding * 2);
  let categoryIndex = 0;

  const markup = `
    <div xmlns="http://www.w3.org/1999/xhtml" style="box-sizing:border-box;width:${width}px;height:${height}px;background:#f8fafc;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
      <header style="height:${headerHeight}px;background:#0b2f6b;border-bottom:9px solid #f97316;padding:24px 34px;color:#ffffff;box-sizing:border-box;">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:24px;">
          <div>
            <div style="font-size:19px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;color:#bfdbfe;">INVICTA | CONVOCADOS</div>
            <div style="margin-top:5px;font-size:35px;font-weight:900;line-height:1.05;">${escapeHtml(data.tournamentName)}</div>
            <div style="margin-top:9px;font-size:17px;color:#e2e8f0;">${escapeHtml(data.campusName)} | ${escapeHtml(programLabel(data.program))} | ${escapeHtml(formatDate(data.weekStart))} al ${escapeHtml(formatDate(data.weekEnd))}</div>
          </div>
          ${data.status === "draft" ? `<div style="border:2px solid #fdba74;background:#7c2d12;padding:8px 14px;font-size:18px;font-weight:900;letter-spacing:0.08em;">BORRADOR</div>` : ""}
        </div>
      </header>
      <main style="display:grid;grid-template-columns:repeat(${columnCount},minmax(0,1fr));gap:${gap}px;align-items:start;padding:${outerPadding}px;box-sizing:border-box;">
        ${columns
          .map(
            (column) => `
              <div style="display:flex;min-width:0;flex-direction:column;gap:${gap}px;">
                ${column.categories.map((category) => renderCategory(category, categoryIndex++)).join("")}
              </div>
            `,
          )
          .join("")}
      </main>
      <footer style="height:${footerHeight}px;padding:0 ${outerPadding}px;box-sizing:border-box;font-size:13px;color:#64748b;">Lista generada desde INVICTA. Confirma sede, rival y horario antes de compartir.</footer>
    </div>
  `;

  return {
    width,
    height,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><foreignObject x="0" y="0" width="${width}" height="${height}">${markup}</foreignObject></svg>`,
  };
}
