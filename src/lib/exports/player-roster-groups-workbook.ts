import ExcelJS from "exceljs";
import type {
  PlayerRosterGroupRow,
  PlayerRosterGroupSection,
  PlayerRosterGroupsData,
} from "@/lib/queries/player-roster-groups";

const BLACK = "FF000000";
const GRAY_BORDER = "FFB8C0CC";
const ATTENDANCE_EXPORT_LIMIT = 15;

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

function addEmptySheet(workbook: ExcelJS.Workbook) {
  const worksheet = workbook.addWorksheet("Sin roster");
  worksheet.columns = [{ width: 48 }];
  const row = worksheet.addRow(["No hay jugadores disponibles para exportar."]);
  row.font = { bold: true, color: { argb: BLACK } };
  row.alignment = { vertical: "middle", horizontal: "center" };
}

function getExportBirthYears(data: PlayerRosterGroupsData) {
  if (data.selectedBirthYear) return [data.selectedBirthYear];

  const years = new Set<number>();
  for (const section of data.sections) {
    for (const row of section.rows) {
      if (row.birthYear != null) years.add(row.birthYear);
    }
  }

  return [...years].sort((a, b) => b - a);
}

function configureWorksheet(worksheet: ExcelJS.Worksheet) {
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
  ];
}

function formatAttendanceDate(value: string) {
  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}/${month}` : value;
}

function attendanceSymbol(status: PlayerRosterGroupRow["recentAttendance"][number]["status"]) {
  if (status === "present") return "A";
  if (status === "absent") return "F";
  if (status === "justified") return "J";
  if (status === "injury") return "L";
  return "-";
}

function getSectionAttendanceDates(rows: PlayerRosterGroupRow[]) {
  const dates = new Set<string>();
  for (const row of rows) {
    for (const item of row.recentAttendance) {
      dates.add(item.sessionDate);
    }
  }

  return [...dates].sort((a, b) => b.localeCompare(a)).slice(0, ATTENDANCE_EXPORT_LIMIT);
}

function getAttendanceSymbolForDate(player: PlayerRosterGroupRow, sessionDate: string | undefined) {
  if (!sessionDate) return "-";
  const item = player.recentAttendance.find((entry) => entry.sessionDate === sessionDate);
  return item ? attendanceSymbol(item.status) : "-";
}

function addTitleRows({
  worksheet,
  data,
  birthYear,
  totalColumns,
  playerCount,
}: {
  worksheet: ExcelJS.Worksheet;
  data: PlayerRosterGroupsData;
  birthYear: number;
  totalColumns: number;
  playerCount: number;
}) {
  const title = worksheet.addRow([`Dragon Force Monterrey - Jugadores por grupos - ${data.selectedCampusName} - Cat. ${birthYear}`]);
  worksheet.mergeCells(title.number, 1, title.number, totalColumns);
  title.height = 28;
  title.font = { bold: true, size: 14, color: { argb: BLACK } };
  title.alignment = { vertical: "middle", horizontal: "center" };
  applyGridBorder(title, totalColumns);

  const filterParts = [
    data.selectedGender === "male" ? "Varonil" : data.selectedGender === "female" ? "Femenil" : "Todos los generos",
    `Cat. ${birthYear}`,
    `${playerCount} jugadores`,
  ];
  const subtitle = worksheet.addRow([filterParts.join(" | ")]);
  worksheet.mergeCells(subtitle.number, 1, subtitle.number, totalColumns);
  subtitle.font = { bold: true, color: { argb: BLACK } };
  subtitle.alignment = { vertical: "middle", horizontal: "center" };
  applyGridBorder(subtitle, totalColumns);
}

function addSection({
  worksheet,
  section,
  rows,
  tuitionHeaders,
  totalColumns,
}: {
  worksheet: ExcelJS.Worksheet;
  section: PlayerRosterGroupSection;
  rows: PlayerRosterGroupRow[];
  tuitionHeaders: string[];
  totalColumns: number;
}) {
  worksheet.addRow([]);

  const sectionTitle = worksheet.addRow([`${section.name} (${rows.length} jugadores)`]);
  worksheet.mergeCells(sectionTitle.number, 1, sectionTitle.number, totalColumns);
  sectionTitle.font = { bold: true, size: 12, color: { argb: BLACK } };
  sectionTitle.alignment = { vertical: "middle", horizontal: "left" };
  applyGridBorder(sectionTitle, totalColumns);

  const sectionSubtitle = worksheet.addRow([section.subtitle]);
  worksheet.mergeCells(sectionSubtitle.number, 1, sectionSubtitle.number, totalColumns);
  sectionSubtitle.font = { italic: true, color: { argb: BLACK } };
  applyGridBorder(sectionSubtitle, totalColumns);

  const attendanceDates = getSectionAttendanceDates(rows);
  const attendanceHeaders = Array.from(
    { length: ATTENDANCE_EXPORT_LIMIT },
    (_, index) => attendanceDates[index] ? formatAttendanceDate(attendanceDates[index]) : "",
  );
  const header = worksheet.addRow([...BASE_COLUMNS, ...tuitionHeaders, ...attendanceHeaders]);
  header.font = { bold: true, color: { argb: BLACK } };
  header.alignment = { vertical: "middle", horizontal: "center" };
  applyGridBorder(header, totalColumns);

  if (rows.length === 0) {
    const empty = worksheet.addRow(["Sin jugadores activos en este grupo."]);
    worksheet.mergeCells(empty.number, 1, empty.number, totalColumns);
    empty.font = { italic: true, color: { argb: BLACK } };
    applyGridBorder(empty, totalColumns);
    return;
  }

  rows.forEach((player, index) => {
    const row = worksheet.addRow([
      index + 1,
      player.publicPlayerId,
      player.fullName,
      player.birthYear ?? "-",
      player.levelGroup,
      player.inscriptionDate,
      ...player.tuition.map((cell) => cell.value),
      ...Array.from({ length: ATTENDANCE_EXPORT_LIMIT }, (_, attendanceIndex) => getAttendanceSymbolForDate(player, attendanceDates[attendanceIndex])),
    ]);

    row.getCell(1).alignment = { horizontal: "center" };
    row.getCell(2).font = { name: "Consolas", size: 10 };
    row.getCell(4).alignment = { horizontal: "center" };
    row.getCell(6).alignment = { horizontal: "center" };

    player.tuition.forEach((cell, tuitionIndex) => {
      const excelCell = row.getCell(BASE_COLUMNS.length + tuitionIndex + 1);
      excelCell.alignment = { horizontal: "center" };
      excelCell.font = { bold: cell.state !== "empty", color: { argb: BLACK } };
    });

    Array.from({ length: ATTENDANCE_EXPORT_LIMIT }).forEach((_, attendanceIndex) => {
      const excelCell = row.getCell(BASE_COLUMNS.length + player.tuition.length + attendanceIndex + 1);
      excelCell.alignment = { horizontal: "center" };
      excelCell.font = { color: { argb: BLACK }, size: 9 };
    });

    applyGridBorder(row, totalColumns);
  });
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

  const tuitionHeaders = data.months.map((month) => month.label);
  const totalColumns = BASE_COLUMNS.length + tuitionHeaders.length + ATTENDANCE_EXPORT_LIMIT;
  const birthYears = getExportBirthYears(data);

  if (birthYears.length === 0) {
    addEmptySheet(workbook);
    return workbook;
  }

  for (const birthYear of birthYears) {
    const worksheet = workbook.addWorksheet(sanitizeSheetName(String(birthYear)));
    configureWorksheet(worksheet);
    worksheet.columns = [
      { width: 5 },
      { width: 12 },
      { width: 36 },
      { width: 9 },
      { width: 20 },
      { width: 12 },
      ...data.months.map(() => ({ width: 14 })),
      ...Array.from({ length: ATTENDANCE_EXPORT_LIMIT }, () => ({ width: 5 })),
    ];

    const sections = data.sections
      .map((section) => ({
        section,
        rows: section.rows.filter((row) => row.birthYear === birthYear),
      }))
      .filter(({ rows }) => rows.length > 0);
    const playerCount = sections.reduce((sum, { rows }) => sum + rows.length, 0);

    addTitleRows({ worksheet, data, birthYear, totalColumns, playerCount });

    if (sections.length === 0) {
      const empty = worksheet.addRow(["No hay jugadores en esta categoria con los filtros actuales."]);
      worksheet.mergeCells(empty.number, 1, empty.number, totalColumns);
      empty.font = { italic: true, color: { argb: BLACK } };
      applyGridBorder(empty, totalColumns);
      continue;
    }

    for (const { section, rows } of sections) {
      addSection({ worksheet, section, rows, tuitionHeaders, totalColumns });
    }
  }

  return workbook;
}
