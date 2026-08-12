import { compactPlayerName } from "@/lib/exports/player-display-name";

export type SportsSignupPacketPlayer = {
  id: string;
  playerName: string;
  birthYear: number | null;
};

export type SportsSignupPacketGroup = {
  id: string;
  label: string;
  subtitle: string;
  programLabel: string;
  players: SportsSignupPacketPlayer[];
};

export type SportsSignupPacketPngData = {
  competitionLabel: string;
  campusName: string;
  programLabel: string;
  paidFilterLabel: string;
  totalConfirmed: number;
  groups: SportsSignupPacketGroup[];
};

type SizedGroup = SportsSignupPacketGroup & {
  estimatedHeight: number;
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function getPlayerColumnCount(playerCount: number) {
  return playerCount > 18 ? 2 : 1;
}

function estimateGroupHeight(group: SportsSignupPacketGroup, cardWidth: number) {
  const playerColumns = getPlayerColumnCount(group.players.length);
  const splitAt = Math.ceil(group.players.length / playerColumns);
  const innerWidth = cardWidth - 24;
  const playerColumnWidth = (innerWidth - (playerColumns - 1) * 14) / playerColumns;
  const nameWidth = Math.max(52, playerColumnWidth - 62);
  const charsPerLine = Math.max(7, Math.floor(nameWidth / 6.6));
  const titleWidth = Math.max(100, cardWidth - 108);
  const titleLines = Math.max(1, Math.ceil(group.label.length / Math.max(12, Math.floor(titleWidth / 9.5))));
  const columnHeights = Array.from({ length: playerColumns }, (_, columnIndex) =>
    group.players
      .slice(columnIndex * splitAt, (columnIndex + 1) * splitAt)
      .reduce((height, player) => height + Math.max(18, Math.ceil(compactPlayerName(player.playerName).length / charsPerLine) * 18) + 3, 0),
  );
  return 72 + (titleLines - 1) * 22 + Math.max(24, ...columnHeights);
}

function distributeGroups(groups: SizedGroup[], columnCount: number) {
  const columns = Array.from({ length: columnCount }, () => ({ height: 0, groups: [] as SizedGroup[] }));

  for (const group of groups) {
    const target = columns.reduce((shortest, column) => (column.height < shortest.height ? column : shortest));
    target.groups.push(group);
    target.height += group.estimatedHeight + 16;
  }

  return columns;
}

function renderPlayers(group: SportsSignupPacketGroup) {
  if (group.players.length === 0) {
    return `<div style="font-size:15px;font-style:italic;color:#94a3b8;">Sin jugadores confirmados.</div>`;
  }

  const columnCount = getPlayerColumnCount(group.players.length);
  const splitAt = Math.ceil(group.players.length / columnCount);
  const columns = Array.from({ length: columnCount }, (_, columnIndex) =>
    group.players.slice(columnIndex * splitAt, (columnIndex + 1) * splitAt),
  );

  return `
    <div style="display:grid;grid-template-columns:repeat(${columnCount},minmax(0,1fr));gap:8px 18px;align-items:start;">
      ${columns
        .map(
          (players, columnIndex) => `
            <div style="display:flex;flex-direction:column;gap:3px;min-width:0;">
              ${players
                .map(
                  (player, playerIndex) => `
                    <div style="display:grid;grid-template-columns:23px minmax(0,1fr) auto;gap:5px;align-items:baseline;font-size:13px;line-height:18px;color:#0f172a;">
                      <span style="text-align:right;color:#64748b;">${columnIndex * splitAt + playerIndex + 1}.</span>
                      <span style="font-weight:600;overflow-wrap:anywhere;">${escapeHtml(compactPlayerName(player.playerName))}</span>
                      <span style="font-size:11px;color:#64748b;">${player.birthYear ?? "-"}</span>
                    </div>
                  `,
                )
                .join("")}
            </div>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderGroup(group: SizedGroup) {
  return `
    <section style="overflow:hidden;border:1px solid #94a3b8;border-radius:7px;background:#ffffff;">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:14px;border-bottom:1px solid #cbd5e1;background:#eaf2fb;padding:10px 12px;">
        <div style="min-width:0;">
          <div style="font-size:18px;font-weight:900;line-height:1.08;color:#0b2f6b;overflow-wrap:anywhere;">${escapeHtml(group.label)}</div>
          <div style="margin-top:2px;font-size:12px;font-weight:700;color:#475569;overflow-wrap:anywhere;">${escapeHtml([group.programLabel, group.subtitle].filter(Boolean).join(" | "))}</div>
        </div>
        <div style="flex:none;text-align:right;">
          <div style="font-size:24px;font-weight:900;color:#0b2f6b;">${group.players.length}</div>
          <div style="font-size:10px;font-weight:800;text-transform:uppercase;color:#64748b;">Pagados</div>
        </div>
      </div>
      <div style="padding:10px 12px 12px;">${renderPlayers(group)}</div>
    </section>
  `;
}

export function buildSportsSignupPacketPngSvg(data: SportsSignupPacketPngData) {
  const outerPadding = 24;
  const headerHeight = 132;
  const visibleGroups = data.groups.filter((group) => group.players.length > 0);
  const candidates = Array.from({ length: Math.max(1, Math.min(5, visibleGroups.length)) }, (_, index) => index + 1).map((columnCount) => {
    const width = Math.min(1700, Math.max(1040, outerPadding * 2 + columnCount * 390 + (columnCount - 1) * 12));
    const cardWidth = (width - outerPadding * 2 - (columnCount - 1) * 16) / columnCount;
    const groups = visibleGroups.map((group) => ({ ...group, estimatedHeight: estimateGroupHeight(group, cardWidth) }));
    const columns = distributeGroups(groups, columnCount);
    const contentHeight = Math.max(220, ...columns.map((column) => column.height));
    // Browser font metrics can add a final wrapped line inside narrow roster columns.
    // Keep a small bottom reserve so the last card is never clipped from the PNG.
    const height = headerHeight + contentHeight + outerPadding * 2 + 80;
    return { width, height, columnCount, columns, score: Math.abs(Math.log(width / height)) };
  });
  const layout = candidates.reduce((best, candidate) => candidate.score < best.score ? candidate : best);
  const { width, height, columnCount, columns } = layout;
  const groups = visibleGroups;
  const titleSize = data.competitionLabel.length > 42 ? 30 : data.competitionLabel.length > 30 ? 34 : 38;

  const emptyState = `
    <div style="display:flex;min-height:220px;align-items:center;justify-content:center;border:1px dashed #94a3b8;border-radius:7px;background:#ffffff;font-size:20px;color:#64748b;">
      No hay jugadores confirmados con estos filtros.
    </div>
  `;

  const markup = `
    <div xmlns="http://www.w3.org/1999/xhtml" style="width:${width}px;height:${height}px;box-sizing:border-box;background:#f8fafc;padding:${outerPadding}px;font-family:Inter,Segoe UI,Arial,sans-serif;color:#0f172a;">
      <header style="height:${headerHeight - 18}px;border-bottom:3px solid #0b2f6b;padding:0 2px 16px;box-sizing:border-box;">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:24px;">
          <div style="min-width:0;">
            <div style="font-size:14px;font-weight:800;letter-spacing:0.16em;text-transform:uppercase;color:#64748b;">Inscripciones Torneos | ${escapeHtml(data.campusName)}</div>
            <div style="margin-top:8px;font-size:${titleSize}px;font-weight:900;line-height:1.05;color:#0b2f6b;overflow-wrap:anywhere;">${escapeHtml(data.competitionLabel)}</div>
            <div style="margin-top:8px;font-size:15px;font-weight:700;color:#475569;">${escapeHtml([data.programLabel, data.paidFilterLabel].filter(Boolean).join(" | "))}</div>
          </div>
          <div style="flex:none;text-align:right;">
            <div style="font-size:44px;font-weight:900;line-height:1;color:#0b2f6b;">${data.totalConfirmed}</div>
            <div style="margin-top:6px;font-size:12px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;color:#64748b;">Jugadores confirmados</div>
          </div>
        </div>
      </header>
      ${
        groups.length === 0
          ? emptyState
          : `<main style="display:grid;grid-template-columns:repeat(${columnCount},minmax(0,1fr));gap:16px;align-items:start;">
              ${columns
                .map(
                  (column) => `<div style="display:flex;flex-direction:column;gap:16px;min-width:0;">${column.groups.map(renderGroup).join("")}</div>`,
                )
                .join("")}
            </main>`
      }
    </div>
  `;

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <foreignObject x="0" y="0" width="${width}" height="${height}">${markup}</foreignObject>
    </svg>
  `;

  return { width, height, svg };
}
