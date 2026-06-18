import ExcelJS from "exceljs";
import type { PendingTuitionCategoryDetailData, PendingTuitionPlayer } from "@/lib/queries/tuition-pending";

const BLACK = "FF000000";
const GRAY_BORDER = "FFB8C0CC";
const LIGHT_GRAY = "FFF3F5F8";

const COLUMNS = [
  { header: "#", width: 6 },
  { header: "Categoria", width: 12 },
  { header: "Jugador", width: 36 },
  { header: "Campus", width: 18 },
  { header: "Nivel", width: 18 },
  { header: "Equipo", width: 24 },
  { header: "Mensualidades pendientes", width: 34 },
  { header: "Estado", width: 16 },
];

function applyGridBorder(row: ExcelJS.Row, totalColumns: number) {
  for (let col = 1; col <= totalColumns; col += 1) {
    row.getCell(col).border = {
      top: { style: "thin", color: { argb: GRAY_BORDER } },
      left: { style: "thin", color: { argb: GRAY_BORDER } },
      bottom: { style: "thin", color: { argb: GRAY_BORDER } },
      right: { style: "thin", color: { argb: GRAY_BORDER } },
    };
  }
}

function categoryKey(player: PendingTuitionPlayer) {
  return player.birthYear == null ? "sin-categoria" : String(player.birthYear);
}

function categoryLabel(player: PendingTuitionPlayer) {
  return player.birthYear == null ? "Sin categoria" : `Cat. ${player.birthYear}`;
}

function pendingMonthsLabel(player: PendingTuitionPlayer) {
  return player.pendingMonths.map((month) => month.label).join(", ") || "-";
}

function statusLabel(player: PendingTuitionPlayer) {
  const pendingLabel = player.pendingMonthCount >= 3 ? "3+ meses" : `${player.pendingMonthCount} mes${player.pendingMonthCount === 1 ? "" : "es"}`;
  return player.overdueMonthCount > 0 ? `${pendingLabel} / vencido` : pendingLabel;
}

function groupPlayers(players: PendingTuitionPlayer[]) {
  const groups = new Map<string, PendingTuitionPlayer[]>();
  for (const player of players) {
    const key = categoryKey(player);
    groups.set(key, [...(groups.get(key) ?? []), player]);
  }
  return [...groups.entries()].map(([key, rows]) => ({
    key,
    label: rows[0] ? categoryLabel(rows[0]) : "Sin categoria",
    rows,
  }));
}

export async function buildPendingDetailWorkbook(data: PendingTuitionCategoryDetailData) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Dragon Force Monterrey";
  workbook.lastModifiedBy = "Dragon Force Monterrey";
  workbook.created = new Date();
  workbook.modified = new Date();

  const worksheet = workbook.addWorksheet("Pendientes");
  worksheet.views = [{ state: "frozen", ySplit: 4 }];
  worksheet.pageSetup = {
    orientation: "landscape",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: { left: 0.25, right: 0.25, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 },
  };
  worksheet.columns = COLUMNS.map((column) => ({ width: column.width }));

  const totalColumns = COLUMNS.length;
  const title = worksheet.addRow([`Dragon Force Monterrey - Pendientes - ${data.categoryLabel}`]);
  worksheet.mergeCells(title.number, 1, title.number, totalColumns);
  title.font = { bold: true, size: 14, color: { argb: BLACK } };
  title.alignment = { vertical: "middle", horizontal: "center" };
  title.height = 26;
  applyGridBorder(title, totalColumns);

  const subtitle = worksheet.addRow([`${data.campusName} | ${data.selectedMonth || "Mes actual"} | ${data.players.length} jugadores`]);
  worksheet.mergeCells(subtitle.number, 1, subtitle.number, totalColumns);
  subtitle.font = { bold: true, color: { argb: BLACK } };
  subtitle.alignment = { vertical: "middle", horizontal: "center" };
  applyGridBorder(subtitle, totalColumns);

  if (data.players.length === 0) {
    worksheet.addRow([]);
    const empty = worksheet.addRow(["No hay jugadores con este filtro."]);
    worksheet.mergeCells(empty.number, 1, empty.number, totalColumns);
    empty.font = { italic: true, color: { argb: BLACK } };
    applyGridBorder(empty, totalColumns);
    return workbook;
  }

  for (const group of groupPlayers(data.players)) {
    worksheet.addRow([]);

    const groupTitle = worksheet.addRow([`${group.label} (${group.rows.length} jugadores)`]);
    worksheet.mergeCells(groupTitle.number, 1, groupTitle.number, totalColumns);
    groupTitle.font = { bold: true, color: { argb: BLACK } };
    groupTitle.fill = { type: "pattern", pattern: "solid", fgColor: { argb: LIGHT_GRAY } };
    applyGridBorder(groupTitle, totalColumns);

    const header = worksheet.addRow(COLUMNS.map((column) => column.header));
    header.font = { bold: true, color: { argb: BLACK } };
    header.alignment = { vertical: "middle", horizontal: "center" };
    applyGridBorder(header, totalColumns);

    group.rows.forEach((player, index) => {
      const row = worksheet.addRow([
        index + 1,
        player.birthYear ?? "-",
        player.playerName,
        player.campusName,
        player.level ?? "-",
        player.teamName ?? "-",
        pendingMonthsLabel(player),
        statusLabel(player),
      ]);
      row.getCell(1).alignment = { horizontal: "center" };
      row.getCell(2).alignment = { horizontal: "center" };
      row.getCell(7).alignment = { wrapText: true };
      applyGridBorder(row, totalColumns);
    });
  }

  return workbook;
}
