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

function estimateGroupHeight(group: SportsSignupPacketGroup) {
  const playerColumns = getPlayerColumnCount(group.players.length);
  const playerRows = Math.max(1, Math.ceil(group.players.length / playerColumns));
  return 112 + playerRows * 25;
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
            <div style="display:flex;flex-direction:column;gap:4px;min-width:0;">
              ${players
                .map(
                  (player, playerIndex) => `
                    <div style="display:grid;grid-template-columns:27px minmax(0,1fr) auto;gap:6px;align-items:baseline;font-size:15px;line-height:21px;color:#0f172a;">
                      <span style="text-align:right;color:#64748b;">${columnIndex * splitAt + playerIndex + 1}.</span>
                      <span style="font-weight:600;overflow-wrap:anywhere;">${escapeHtml(player.playerName)}</span>
                      <span style="font-size:12px;color:#64748b;">${player.birthYear ?? "-"}</span>
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
          <div style="font-size:20px;font-weight:900;color:#0b2f6b;overflow-wrap:anywhere;">${escapeHtml(group.label)}</div>
          <div style="margin-top:2px;font-size:12px;font-weight:700;color:#475569;overflow-wrap:anywhere;">${escapeHtml(group.programLabel)} | ${escapeHtml(group.subtitle)}</div>
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
  const width = 1700;
  const outerPadding = 30;
  const headerHeight = 145;
  const groups = data.groups
    .filter((group) => group.players.length > 0)
    .map((group) => ({ ...group, estimatedHeight: estimateGroupHeight(group) }));
  const totalPlayers = groups.reduce((total, group) => total + group.players.length, 0);
  const columnCount = groups.length >= 10 || totalPlayers > 150 ? 4 : groups.length >= 6 ? 3 : groups.length >= 2 ? 2 : 1;
  const columns = distributeGroups(groups, columnCount);
  const contentHeight = Math.max(260, ...columns.map((column) => column.height));
  const height = headerHeight + contentHeight + outerPadding * 2;
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
            <div style="margin-top:8px;font-size:15px;font-weight:700;color:#475569;">${escapeHtml(data.programLabel)} | ${escapeHtml(data.paidFilterLabel)}</div>
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
