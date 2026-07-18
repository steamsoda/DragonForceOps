import ExcelJS from "exceljs";
import type { CompetitionSignupExportData } from "@/lib/queries/sports-signups";

const BLACK = "FF000000";
const BORDER = "FFB8C0CC";
const LIGHT_GRAY = "FFF3F5F8";

const COLUMNS = [
  { header: "#", width: 7 },
  { header: "Jugador", width: 38 },
  { header: "Categoria", width: 13 },
  { header: "Campus", width: 18 },
  { header: "Nivel", width: 20 },
  { header: "Equipo base", width: 28 },
];

function applyGridBorder(row: ExcelJS.Row) {
  for (let column = 1; column <= COLUMNS.length; column += 1) {
    row.getCell(column).border = {
      top: { style: "thin", color: { argb: BORDER } },
      left: { style: "thin", color: { argb: BORDER } },
      bottom: { style: "thin", color: { argb: BORDER } },
      right: { style: "thin", color: { argb: BORDER } },
    };
  }
}

function formatDateOnly(value: string | null) {
  if (!value) return null;
  const [year, month, day] = value.split("-");
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
}

function paidDateLabel(data: CompetitionSignupExportData) {
  const from = formatDateOnly(data.paidDateFilter.from);
  const to = formatDateOnly(data.paidDateFilter.to);
  if (from && to) return `Pagos confirmados del ${from} al ${to}`;
  if (from) return `Pagos confirmados desde ${from}`;
  if (to) return `Pagos confirmados hasta ${to}`;
  return "Todos los pagos confirmados";
}

export async function buildSportsSignupsWorkbook(data: CompetitionSignupExportData) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Dragon Force Monterrey";
  workbook.lastModifiedBy = "Dragon Force Monterrey";
  workbook.created = new Date();
  workbook.modified = new Date();

  const worksheet = workbook.addWorksheet("Inscritos");
  worksheet.views = [{ state: "frozen", ySplit: 4 }];
  worksheet.pageSetup = {
    orientation: "landscape",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: { left: 0.25, right: 0.25, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 },
  };
  worksheet.columns = COLUMNS.map((column) => ({ width: column.width }));

  const title = worksheet.addRow([`Inscripciones Torneos - ${data.competitionLabel}`]);
  worksheet.mergeCells(title.number, 1, title.number, COLUMNS.length);
  title.font = { bold: true, size: 14, color: { argb: BLACK } };
  title.alignment = { horizontal: "center", vertical: "middle" };
  title.height = 26;
  applyGridBorder(title);

  const scope = worksheet.addRow([`${data.campusName} | ${paidDateLabel(data)} | ${data.rows.length} jugadores`]);
  worksheet.mergeCells(scope.number, 1, scope.number, COLUMNS.length);
  scope.font = { bold: true, color: { argb: BLACK } };
  scope.alignment = { horizontal: "center", vertical: "middle" };
  applyGridBorder(scope);

  worksheet.addRow([]);
  const header = worksheet.addRow(COLUMNS.map((column) => column.header));
  header.font = { bold: true, color: { argb: BLACK } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: LIGHT_GRAY } };
  header.alignment = { horizontal: "center", vertical: "middle" };
  applyGridBorder(header);
  worksheet.autoFilter = {
    from: { row: header.number, column: 1 },
    to: { row: header.number, column: COLUMNS.length },
  };

  if (data.rows.length === 0) {
    const empty = worksheet.addRow(["No hay jugadores confirmados con estos filtros."]);
    worksheet.mergeCells(empty.number, 1, empty.number, COLUMNS.length);
    empty.font = { italic: true, color: { argb: BLACK } };
    empty.alignment = { horizontal: "center" };
    applyGridBorder(empty);
    return workbook;
  }

  data.rows.forEach((player, index) => {
    const row = worksheet.addRow([
      index + 1,
      player.playerName,
      player.birthYear ?? "-",
      player.campusName,
      player.level || "-",
      player.teamName || "-",
    ]);
    row.getCell(1).alignment = { horizontal: "center" };
    row.getCell(3).alignment = { horizontal: "center" };
    applyGridBorder(row);
  });

  return workbook;
}
