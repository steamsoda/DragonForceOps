import ExcelJS from "exceljs";
import type { AttendanceExportRow } from "@/lib/queries/player-exports";

const ATTENDANCE_COLUMN_COUNT = 20;
const SECTION_LEVELS = ["B2", "B1", "B3", "Selectivo"] as const;
const ATTENDANCE_HEADERS = Array.from({ length: ATTENDANCE_COLUMN_COUNT }, (_, index) => `A${index + 1}`);
const TOTAL_COLUMNS = 5 + ATTENDANCE_COLUMN_COUNT; // 25

// FC Porto brand palette (ARGB)
const PORTO_NAVY  = "FF003087";
const PORTO_GOLD  = "FFFFC72C";
const PORTO_BLUE  = "FF1455A4";
const PORTO_MID   = "FFA8C4E0"; // year divider — medium blue
const PORTO_LIGHT = "FFE8EEF7";
const WHITE       = "FFFFFFFF";
const GRAY_BORDER = "FFB8C0CC";

// Logo dimensions — actual PNG is 4025×2667 (ratio ~1.51)
// Rendered at 60×40px so it fits the 42pt title row without stretching
const LOGO_WIDTH_PX  = 60;
const LOGO_HEIGHT_PX = 40;

type ExportGroup = {
  label: string;
  genders: string[];
  birthYears: number[];
};

const EXPORT_GROUPS: ExportGroup[] = [
  { label: "Little Dragons", genders: ["Varonil", "Femenil"], birthYears: [2021, 2022] },
  { label: "FEM 2016-2019",  genders: ["Femenil"],            birthYears: [2019, 2018, 2017, 2016] },
  { label: "FEM 2014-2015",  genders: ["Femenil"],            birthYears: [2015, 2014] },
  { label: "FEM 2012-2013",  genders: ["Femenil"],            birthYears: [2013, 2012] },
  { label: "FEM 2009-2011",  genders: ["Femenil"],            birthYears: [2011, 2010, 2009] },
  { label: "VAR 2019-2020",  genders: ["Varonil"],            birthYears: [2020, 2019] },
  { label: "VAR 2018",       genders: ["Varonil"],            birthYears: [2018] },
  { label: "VAR 2017",       genders: ["Varonil"],            birthYears: [2017] },
  { label: "VAR 2016",       genders: ["Varonil"],            birthYears: [2016] },
  { label: "VAR 2015",       genders: ["Varonil"],            birthYears: [2015] },
  { label: "VAR 2014",       genders: ["Varonil"],            birthYears: [2014] },
  { label: "VAR 2013",       genders: ["Varonil"],            birthYears: [2013] },
  { label: "VAR 2012",       genders: ["Varonil"],            birthYears: [2012] },
  { label: "VAR 2011",       genders: ["Varonil"],            birthYears: [2011] },
  { label: "VAR 2010",       genders: ["Varonil"],            birthYears: [2010] },
  { label: "VAR 2008-2009",  genders: ["Varonil"],            birthYears: [2009, 2008] },
];

function sanitizeSheetName(value: string) {
  return value.replace(/[\\/*?:[\]]/g, " ").replace(/\s+/g, " ").trim().slice(0, 31);
}

function levelRank(level: string) {
  const index = SECTION_LEVELS.indexOf(level as (typeof SECTION_LEVELS)[number]);
  return index === -1 ? SECTION_LEVELS.length : index;
}

function getOrderedLevels(rows: AttendanceExportRow[]) {
  const uniqueLevels = Array.from(new Set(rows.map((row) => row.level)));
  const withoutSinNivel = uniqueLevels.filter((level) => level !== "Sin nivel");
  const prioritized = SECTION_LEVELS.filter((level) => withoutSinNivel.includes(level));
  const extras = withoutSinNivel
    .filter((level) => !SECTION_LEVELS.includes(level as (typeof SECTION_LEVELS)[number]))
    .sort((a, b) => a.localeCompare(b, "es-MX"));
  return [
    ...prioritized,
    ...extras,
    ...(uniqueLevels.includes("Sin nivel") ? ["Sin nivel"] : []),
  ];
}

function applyGridBorder(row: ExcelJS.Row, totalColumns: number) {
  for (let col = 1; col <= totalColumns; col += 1) {
    row.getCell(col).border = {
      top:    { style: "thin", color: { argb: GRAY_BORDER } },
      left:   { style: "thin", color: { argb: GRAY_BORDER } },
      bottom: { style: "thin", color: { argb: GRAY_BORDER } },
      right:  { style: "thin", color: { argb: GRAY_BORDER } },
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

  // Level header — light Porto blue
  const sectionTitle = worksheet.addRow([`Nivel: ${level}`]);
  worksheet.mergeCells(sectionTitle.number, 1, sectionTitle.number, TOTAL_COLUMNS);
  sectionTitle.font = { bold: true, color: { argb: PORTO_NAVY } };
  sectionTitle.fill = { type: "pattern", pattern: "solid", fgColor: { argb: PORTO_LIGHT } };
  applyGridBorder(sectionTitle, TOTAL_COLUMNS);

  // Column header — Porto gold
  const headerRow = worksheet.addRow(["#", "Nombre", "Cat", "Nivel", "Equipo", ...ATTENDANCE_HEADERS]);
  headerRow.font = { bold: true, color: { argb: PORTO_NAVY } };
  headerRow.alignment = { vertical: "middle", horizontal: "center" };
  headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: PORTO_GOLD } };
  applyGridBorder(headerRow, TOTAL_COLUMNS);

  rows.forEach((row, index) => {
    const dataRow = worksheet.addRow([
      index + 1,
      row.playerName,
      row.birthYear,
      row.level,
      row.teamName,
      ...Array.from({ length: ATTENDANCE_COLUMN_COUNT }, () => ""),
    ]);
    dataRow.getCell(1).alignment = { horizontal: "center" };
    dataRow.getCell(3).alignment = { horizontal: "center" };
    dataRow.getCell(4).alignment = { horizontal: "center" };
    for (let col = 6; col <= TOTAL_COLUMNS; col += 1) {
      dataRow.getCell(col).alignment = { horizontal: "center" };
    }
    applyGridBorder(dataRow, TOTAL_COLUMNS);
  });
}

// Adds all level sections for a given set of rows (same birth year)
function addYearBlock(
  worksheet: ExcelJS.Worksheet,
  birthYear: number,
  rows: AttendanceExportRow[],
  showYearHeader: boolean
) {
  if (rows.length === 0) return;

  if (showYearHeader) {
    if (worksheet.rowCount > 1) {
      worksheet.addRow([]);
    }
    const yearHeader = worksheet.addRow([`Categoría ${birthYear}`]);
    worksheet.mergeCells(yearHeader.number, 1, yearHeader.number, TOTAL_COLUMNS);
    yearHeader.font = { bold: true, color: { argb: PORTO_NAVY } };
    yearHeader.alignment = { vertical: "middle", horizontal: "center" };
    yearHeader.fill = { type: "pattern", pattern: "solid", fgColor: { argb: PORTO_MID } };
    applyGridBorder(yearHeader, TOTAL_COLUMNS);
  }

  const sortedRows = [...rows].sort((a, b) => {
    const levelDiff = levelRank(a.level) - levelRank(b.level);
    if (levelDiff !== 0) return levelDiff;
    return a.playerName.localeCompare(b.playerName, "es-MX");
  });

  for (const level of getOrderedLevels(sortedRows)) {
    addSection(worksheet, level, sortedRows.filter((row) => row.level === level));
  }
}

function addGenderBlock(
  worksheet: ExcelJS.Worksheet,
  genderLabel: string,
  rows: AttendanceExportRow[],
  birthYears: number[]
) {
  if (rows.length === 0) return;

  if (worksheet.rowCount > 1) {
    worksheet.addRow([]);
  }

  // Gender header — Porto blue, white text
  const genderHeader = worksheet.addRow([genderLabel.toUpperCase()]);
  worksheet.mergeCells(genderHeader.number, 1, genderHeader.number, TOTAL_COLUMNS);
  genderHeader.font = { bold: true, color: { argb: WHITE } };
  genderHeader.alignment = { vertical: "middle", horizontal: "center" };
  genderHeader.fill = { type: "pattern", pattern: "solid", fgColor: { argb: PORTO_BLUE } };
  applyGridBorder(genderHeader, TOTAL_COLUMNS);

  const showYearHeaders = birthYears.length > 1;
  for (const year of birthYears) {
    addYearBlock(
      worksheet,
      year,
      rows.filter((row) => row.birthYear === year),
      showYearHeaders
    );
  }
}

function buildEmptyWorkbookSheet(workbook: ExcelJS.Workbook) {
  const worksheet = workbook.addWorksheet("Sin jugadores");
  worksheet.views = [{ state: "frozen", ySplit: 1 }];
  worksheet.columns = [{ width: 48 }];
  const titleRow = worksheet.addRow(["No hay jugadores activos disponibles para exportar."]);
  titleRow.font = { bold: true };
  titleRow.alignment = { vertical: "middle", horizontal: "center" };
}

export async function buildAttendanceWorkbook(
  rows: AttendanceExportRow[],
  logoBuffer?: Buffer
) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Dragon Force Monterrey";
  workbook.lastModifiedBy = "Dragon Force Monterrey";
  workbook.created = new Date();
  workbook.modified = new Date();

  if (rows.length === 0) {
    buildEmptyWorkbookSheet(workbook);
    return workbook;
  }

  // Register logo once for the whole workbook
  const logoId = logoBuffer
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ? workbook.addImage({ buffer: logoBuffer as any, extension: "png" })
    : undefined;

  // Collect unique campuses sorted alphabetically
  const campusMap = new Map<string, { campusName: string; campusCode: string }>();
  for (const row of rows) {
    if (!campusMap.has(row.campusId)) {
      campusMap.set(row.campusId, { campusName: row.campusName, campusCode: row.campusCode });
    }
  }
  const campuses = [...campusMap.entries()].sort((a, b) =>
    a[1].campusName.localeCompare(b[1].campusName, "es-MX")
  );

  for (const [campusId, { campusName, campusCode }] of campuses) {
    const campusRows = rows.filter((row) => row.campusId === campusId);

    for (const group of EXPORT_GROUPS) {
      const groupRows = campusRows.filter(
        (row) =>
          group.birthYears.includes(row.birthYear) &&
          group.genders.includes(row.genderLabel)
      );

      if (groupRows.length === 0) continue;

      const sheetTabName = sanitizeSheetName(`${campusCode} · ${group.label}`);
      const worksheet = workbook.addWorksheet(sheetTabName);
      worksheet.views = [{ state: "frozen", ySplit: 1 }];
      worksheet.columns = [
        { width: 5 },   // #
        { width: 34 },  // Nombre
        { width: 8 },   // Cat
        { width: 12 },  // Nivel
        { width: 24 },  // Equipo
        ...Array.from({ length: ATTENDANCE_COLUMN_COUNT }, () => ({ width: 6 })),
      ];

      // Title row — Porto navy background, white text
      const titleRow = worksheet.addRow([`Dragon Force Monterrey  ·  ${campusName}  ·  ${group.label}`]);
      worksheet.mergeCells(titleRow.number, 1, titleRow.number, TOTAL_COLUMNS);
      titleRow.height = 42;
      titleRow.font = { bold: true, size: 13, color: { argb: WHITE } };
      titleRow.alignment = { vertical: "middle", horizontal: "center" };
      titleRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: PORTO_NAVY } };
      applyGridBorder(titleRow, TOTAL_COLUMNS);

      // Overlay logo — fixed pixel size to preserve aspect ratio (no stretching)
      if (logoId !== undefined) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        worksheet.addImage(logoId, {
          tl: { col: TOTAL_COLUMNS - 3.2, row: 0.1 },
          ext: { width: LOGO_WIDTH_PX, height: LOGO_HEIGHT_PX },
          editAs: "oneCell",
        } as any);
      }

      const isMultiGender = group.genders.length > 1;
      const showYearHeaders = group.birthYears.length > 1;

      if (isMultiGender) {
        for (const gender of group.genders) {
          addGenderBlock(
            worksheet,
            gender,
            groupRows.filter((row) => row.genderLabel === gender),
            group.birthYears
          );
        }
      } else {
        // Single-gender: year blocks, then level sections within each year
        for (const year of group.birthYears) {
          addYearBlock(
            worksheet,
            year,
            groupRows.filter((row) => row.birthYear === year),
            showYearHeaders
          );
        }
      }
    }
  }

  if (workbook.worksheets.length === 0) {
    buildEmptyWorkbookSheet(workbook);
  }

  return workbook;
}
