import ExcelJS from "exceljs";
import type { AttendanceExportRow } from "@/lib/queries/player-exports";

const ATTENDANCE_COLUMN_COUNT = 20;
const SECTION_LEVELS = ["B2", "B1", "Selectivo", "Sin nivel"] as const;
const ATTENDANCE_HEADERS = Array.from({ length: ATTENDANCE_COLUMN_COUNT }, (_, index) => `A${index + 1}`);
const TOTAL_COLUMNS = 6 + ATTENDANCE_COLUMN_COUNT;

function sanitizeSheetName(value: string) {
  return value.replace(/[\\/*?:[\]]/g, " ").replace(/\s+/g, " ").trim().slice(0, 31);
}

function getSheetKey(row: AttendanceExportRow) {
  return `${row.campusId}::${row.birthYear}::${row.genderLabel}`;
}

function buildSheetName(row: AttendanceExportRow) {
  return sanitizeSheetName(`${row.campusName} ${row.birthYear} ${row.genderLabel}`);
}

function levelRank(level: string) {
  const index = SECTION_LEVELS.indexOf(level as (typeof SECTION_LEVELS)[number]);
  return index === -1 ? SECTION_LEVELS.length : index;
}

function applyGridBorder(row: ExcelJS.Row, totalColumns: number) {
  for (let columnIndex = 1; columnIndex <= totalColumns; columnIndex += 1) {
    row.getCell(columnIndex).border = {
      top: { style: "thin", color: { argb: "FFB8C0CC" } },
      left: { style: "thin", color: { argb: "FFB8C0CC" } },
      bottom: { style: "thin", color: { argb: "FFB8C0CC" } },
      right: { style: "thin", color: { argb: "FFB8C0CC" } },
    };
  }
}

function addSection(
  worksheet: ExcelJS.Worksheet,
  level: string,
  rows: AttendanceExportRow[]
) {
  if (rows.length === 0) return;

  if (worksheet.rowCount > 1) {
    worksheet.addRow([]);
  }

  const sectionTitle = worksheet.addRow([`Nivel: ${level}`]);
  worksheet.mergeCells(sectionTitle.number, 1, sectionTitle.number, TOTAL_COLUMNS);
  sectionTitle.font = { bold: true };
  sectionTitle.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFEAF0F6" },
  };
  applyGridBorder(sectionTitle, TOTAL_COLUMNS);

  const headerRow = worksheet.addRow(["#", "Nombre", "Cat", "Nivel", "Equipo", "Tel Tutor", ...ATTENDANCE_HEADERS]);
  headerRow.font = { bold: true };
  headerRow.alignment = { vertical: "middle", horizontal: "center" };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFF8E37B" },
  };
  applyGridBorder(headerRow, TOTAL_COLUMNS);

  rows.forEach((row, index) => {
    const dataRow = worksheet.addRow([
      index + 1,
      row.playerName,
      row.birthYear,
      row.level,
      row.teamName,
      row.guardianPhone,
      ...Array.from({ length: ATTENDANCE_COLUMN_COUNT }, () => ""),
    ]);
    dataRow.getCell(1).alignment = { horizontal: "center" };
    dataRow.getCell(3).alignment = { horizontal: "center" };
    dataRow.getCell(4).alignment = { horizontal: "center" };
    dataRow.getCell(6).alignment = { horizontal: "center" };
    for (let columnIndex = 7; columnIndex <= TOTAL_COLUMNS; columnIndex += 1) {
      dataRow.getCell(columnIndex).alignment = { horizontal: "center" };
    }
    applyGridBorder(dataRow, TOTAL_COLUMNS);
  });
}

function buildEmptyWorkbookSheet(workbook: ExcelJS.Workbook) {
  const worksheet = workbook.addWorksheet("Sin jugadores");
  worksheet.views = [{ state: "frozen", ySplit: 1 }];
  worksheet.columns = [{ width: 48 }];
  const titleRow = worksheet.addRow(["No hay jugadores activos disponibles para exportar."]);
  titleRow.font = { bold: true };
  titleRow.alignment = { vertical: "middle", horizontal: "center" };
}

export async function buildAttendanceWorkbook(rows: AttendanceExportRow[]) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "INVICTA";
  workbook.lastModifiedBy = "INVICTA";
  workbook.created = new Date();
  workbook.modified = new Date();

  if (rows.length === 0) {
    buildEmptyWorkbookSheet(workbook);
    return workbook;
  }

  const grouped = new Map<string, AttendanceExportRow[]>();
  for (const row of rows) {
    const key = getSheetKey(row);
    const current = grouped.get(key) ?? [];
    current.push(row);
    grouped.set(key, current);
  }

  const sheets = [...grouped.values()].sort((a, b) => {
    const campusDiff = a[0].campusName.localeCompare(b[0].campusName, "es-MX");
    if (campusDiff !== 0) return campusDiff;
    if (a[0].birthYear !== b[0].birthYear) return a[0].birthYear - b[0].birthYear;
    return a[0].genderLabel.localeCompare(b[0].genderLabel, "es-MX");
  });

  for (const sheetRows of sheets) {
    const first = sheetRows[0];
    const worksheet = workbook.addWorksheet(buildSheetName(first));
    worksheet.views = [{ state: "frozen", ySplit: 1 }];
    worksheet.columns = [
      { width: 5 },
      { width: 34 },
      { width: 8 },
      { width: 12 },
      { width: 24 },
      { width: 16 },
      ...Array.from({ length: ATTENDANCE_COLUMN_COUNT }, () => ({ width: 6 })),
    ];

    const titleRow = worksheet.addRow([`${first.campusName} · Cat ${first.birthYear} · ${first.genderLabel}`]);
    worksheet.mergeCells(titleRow.number, 1, titleRow.number, TOTAL_COLUMNS);
    titleRow.font = { bold: true, size: 14 };
    titleRow.alignment = { vertical: "middle", horizontal: "center" };
    titleRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFDCEAF7" },
    };
    applyGridBorder(titleRow, TOTAL_COLUMNS);

    const orderedRows = [...sheetRows].sort((a, b) => {
      const levelDiff = levelRank(a.level) - levelRank(b.level);
      if (levelDiff !== 0) return levelDiff;
      return a.playerName.localeCompare(b.playerName, "es-MX");
    });

    for (const level of SECTION_LEVELS) {
      addSection(
        worksheet,
        level,
        orderedRows.filter((row) => row.level === level)
      );
    }
  }

  return workbook;
}
