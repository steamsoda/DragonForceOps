import ExcelJS from "exceljs";
import type { PlayerRosterGroupsData, RosterTuitionCell } from "@/lib/queries/player-roster-groups";

const PORTO_NAVY = "FF003087";
const PORTO_BLUE = "FF1455A4";
const PORTO_GOLD = "FFFFC72C";
const PORTO_LIGHT = "FFE8EEF7";
const WHITE = "FFFFFFFF";
const GRAY_BORDER = "FFB8C0CC";
const GREEN = "FFDFF7EA";
const BLUE = "FFDCEEFF";
const AMBER = "FFFFF1C2";
const SLATE = "FFF3F5F7";

const BASE_COLUMNS = ["#", "ID", "Nombre", "Cat", "Nivel/Grupo", "Insc"];

function sanitizeSheetName(value: string) {
  return value.replace(/[\\/*?:[\]]/g, " ").replace(/\s+/g, " ").trim().slice(0, 31) || "Roster";
}

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

function tuitionFill(cell: RosterTuitionCell) {
  if (cell.state === "paid") return GREEN;
  if (cell.state === "platform") return BLUE;
  if (cell.state === "pending") return AMBER;
  return SLATE;
}

function addEmptySheet(workbook: ExcelJS.Workbook) {
  const worksheet = workbook.addWorksheet("Sin roster");
  worksheet.columns = [{ width: 48 }];
  const row = worksheet.addRow(["No hay jugadores disponibles para exportar."]);
  row.font = { bold: true };
  row.alignment = { vertical: "middle", horizontal: "center" };
}

export async function buildPlayerRosterGroupsWorkbook(data: PlayerRosterGroupsData | null) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Dragon Force Monterrey";
  workbook.lastModifiedBy = "Dragon Force Monterrey";
  workbook.created = new Date();
  workbook.modified = new Date();

  if (!data) {
    addEmptySheet(workbook);
    return workbook;
  }

  const totalColumns = BASE_COLUMNS.length + data.months.length;
  const worksheet = workbook.addWorksheet(sanitizeSheetName(data.selectedCampusName));
  worksheet.views = [{ state: "frozen", ySplit: 3 }];
  worksheet.pageSetup = {
    orientation: "landscape",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: {
      left: 0.25,
      right: 0.25,
      top: 0.4,
      bottom: 0.4,
      header: 0.2,
      footer: 0.2,
    },
  };
  worksheet.properties.defaultRowHeight = 18;
  worksheet.columns = [
    { width: 5 },
    { width: 12 },
    { width: 36 },
    { width: 9 },
    { width: 20 },
    { width: 12 },
    ...data.months.map(() => ({ width: 14 })),
  ];

  const title = worksheet.addRow([`Dragon Force Monterrey - Jugadores por grupos - ${data.selectedCampusName}`]);
  worksheet.mergeCells(title.number, 1, title.number, totalColumns);
  title.height = 28;
  title.font = { bold: true, size: 14, color: { argb: WHITE } };
  title.alignment = { vertical: "middle", horizontal: "center" };
  title.fill = { type: "pattern", pattern: "solid", fgColor: { argb: PORTO_NAVY } };
  applyGridBorder(title, totalColumns);

  const filterParts = [
    data.selectedGender === "male" ? "Varonil" : data.selectedGender === "female" ? "Femenil" : "Todos los generos",
    data.selectedBirthYear ? `Cat. ${data.selectedBirthYear}` : "Todas las categorias",
    `${data.totalPlayers} jugadores`,
  ];
  const subtitle = worksheet.addRow([filterParts.join(" | ")]);
  worksheet.mergeCells(subtitle.number, 1, subtitle.number, totalColumns);
  subtitle.font = { bold: true, color: { argb: PORTO_NAVY } };
  subtitle.alignment = { vertical: "middle", horizontal: "center" };
  subtitle.fill = { type: "pattern", pattern: "solid", fgColor: { argb: PORTO_LIGHT } };
  applyGridBorder(subtitle, totalColumns);

  for (const section of data.sections) {
    worksheet.addRow([]);

    const sectionTitle = worksheet.addRow([`${section.name} (${section.rows.length} jugadores)`]);
    worksheet.mergeCells(sectionTitle.number, 1, sectionTitle.number, totalColumns);
    sectionTitle.font = { bold: true, size: 12, color: { argb: WHITE } };
    sectionTitle.alignment = { vertical: "middle", horizontal: "left" };
    sectionTitle.fill = { type: "pattern", pattern: "solid", fgColor: { argb: PORTO_BLUE } };
    applyGridBorder(sectionTitle, totalColumns);

    const sectionSubtitle = worksheet.addRow([section.subtitle]);
    worksheet.mergeCells(sectionSubtitle.number, 1, sectionSubtitle.number, totalColumns);
    sectionSubtitle.font = { italic: true, color: { argb: PORTO_NAVY } };
    sectionSubtitle.fill = { type: "pattern", pattern: "solid", fgColor: { argb: PORTO_LIGHT } };
    applyGridBorder(sectionSubtitle, totalColumns);

    const header = worksheet.addRow([...BASE_COLUMNS, ...data.months.map((month) => month.label)]);
    header.font = { bold: true, color: { argb: PORTO_NAVY } };
    header.alignment = { vertical: "middle", horizontal: "center" };
    header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: PORTO_GOLD } };
    applyGridBorder(header, totalColumns);

    if (section.rows.length === 0) {
      const empty = worksheet.addRow(["Sin jugadores activos en este grupo."]);
      worksheet.mergeCells(empty.number, 1, empty.number, totalColumns);
      empty.font = { italic: true, color: { argb: PORTO_NAVY } };
      applyGridBorder(empty, totalColumns);
      continue;
    }

    section.rows.forEach((player, index) => {
      const row = worksheet.addRow([
        index + 1,
        player.publicPlayerId,
        player.fullName,
        player.birthYear ?? "-",
        player.levelGroup,
        player.inscriptionDate,
        ...player.tuition.map((cell) => cell.value),
      ]);

      row.getCell(1).alignment = { horizontal: "center" };
      row.getCell(2).font = { name: "Consolas", size: 10 };
      row.getCell(4).alignment = { horizontal: "center" };
      row.getCell(6).alignment = { horizontal: "center" };

      player.tuition.forEach((cell, tuitionIndex) => {
        const excelCell = row.getCell(BASE_COLUMNS.length + tuitionIndex + 1);
        excelCell.alignment = { horizontal: "center" };
        excelCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: tuitionFill(cell) } };
        excelCell.font = { bold: cell.state !== "empty", color: { argb: PORTO_NAVY } };
      });

      applyGridBorder(row, totalColumns);
    });
  }

  return workbook;
}
