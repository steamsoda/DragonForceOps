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
  { header: "Programa", width: 22 },
  { header: "Grupo de entrenamiento", width: 34 },
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

function groupRowsByCampusProgramAndTrainingGroup(data: CompetitionSignupExportData) {
  const campusGroups = new Map<string, Map<string, Map<string, typeof data.rows>>>();

  for (const player of data.rows) {
    const campusPrograms = campusGroups.get(player.campusName) ?? new Map<string, Map<string, typeof data.rows>>();
    const programGroups = campusPrograms.get(player.programLabel) ?? new Map<string, typeof data.rows>();
    programGroups.set(player.trainingGroupName, [...(programGroups.get(player.trainingGroupName) ?? []), player]);
    campusPrograms.set(player.programLabel, programGroups);
    campusGroups.set(player.campusName, campusPrograms);
  }

  return [...campusGroups.entries()]
    .sort(([campusA], [campusB]) => campusA.localeCompare(campusB, "es-MX"))
    .map(([campusName, programGroups]) => ({
      campusName,
      programGroups: [...programGroups.entries()]
        .sort(([programA], [programB]) => programA.localeCompare(programB, "es-MX"))
        .map(([programLabel, trainingGroups]) => ({
          programLabel,
          trainingGroups: [...trainingGroups.entries()]
            .sort(([groupA], [groupB]) => groupA.localeCompare(groupB, "es-MX"))
            .map(([trainingGroupName, players]) => ({
              trainingGroupName,
              players: [...players].sort((playerA, playerB) =>
                playerA.playerName.localeCompare(playerB.playerName, "es-MX"),
              ),
            })),
        })),
    }));
}

export async function buildSportsSignupsWorkbook(data: CompetitionSignupExportData) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Dragon Force Monterrey";
  workbook.lastModifiedBy = "Dragon Force Monterrey";
  workbook.created = new Date();
  workbook.modified = new Date();

  const worksheet = workbook.addWorksheet("Inscritos");
  worksheet.views = [{ state: "frozen", ySplit: 2 }];
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

  const scope = worksheet.addRow([
    `${data.campusName} | ${data.selectedProgramLabel} | ${paidDateLabel(data)} | ${data.rows.length} jugadores`,
  ]);
  worksheet.mergeCells(scope.number, 1, scope.number, COLUMNS.length);
  scope.font = { bold: true, color: { argb: BLACK } };
  scope.alignment = { horizontal: "center", vertical: "middle" };
  applyGridBorder(scope);

  if (data.rows.length === 0) {
    worksheet.addRow([]);
    const empty = worksheet.addRow(["No hay jugadores confirmados con estos filtros."]);
    worksheet.mergeCells(empty.number, 1, empty.number, COLUMNS.length);
    empty.font = { italic: true, color: { argb: BLACK } };
    empty.alignment = { horizontal: "center" };
    applyGridBorder(empty);
    return workbook;
  }

  for (const campusGroup of groupRowsByCampusProgramAndTrainingGroup(data)) {
    worksheet.addRow([]);
    const campusTitle = worksheet.addRow([
      `${campusGroup.campusName} (${campusGroup.programGroups.reduce((campusTotal, program) => campusTotal + program.trainingGroups.reduce((programTotal, group) => programTotal + group.players.length, 0), 0)} jugadores)`,
    ]);
    worksheet.mergeCells(campusTitle.number, 1, campusTitle.number, COLUMNS.length);
    campusTitle.font = { bold: true, size: 12, color: { argb: BLACK } };
    campusTitle.alignment = { vertical: "middle" };
    applyGridBorder(campusTitle);

    for (const programGroup of campusGroup.programGroups) {
      const programTitle = worksheet.addRow([programGroup.programLabel]);
      worksheet.mergeCells(programTitle.number, 1, programTitle.number, COLUMNS.length);
      programTitle.font = { bold: true, size: 11, color: { argb: BLACK } };
      programTitle.fill = { type: "pattern", pattern: "solid", fgColor: { argb: LIGHT_GRAY } };
      applyGridBorder(programTitle);

      for (const trainingGroup of programGroup.trainingGroups) {
        const groupTitle = worksheet.addRow([
          `${trainingGroup.trainingGroupName} (${trainingGroup.players.length} jugadores)`,
        ]);
        worksheet.mergeCells(groupTitle.number, 1, groupTitle.number, COLUMNS.length);
        groupTitle.font = { bold: true, color: { argb: BLACK } };
        applyGridBorder(groupTitle);

        const header = worksheet.addRow(COLUMNS.map((column) => column.header));
        header.font = { bold: true, color: { argb: BLACK } };
        header.alignment = { horizontal: "center", vertical: "middle" };
        applyGridBorder(header);

        trainingGroup.players.forEach((player, index) => {
          const row = worksheet.addRow([
            index + 1,
            player.playerName,
            player.birthYear ?? "-",
            player.campusName,
            player.programLabel || "-",
            player.trainingGroupName || "Sin grupo",
          ]);
          row.getCell(1).alignment = { horizontal: "center" };
          row.getCell(3).alignment = { horizontal: "center" };
          applyGridBorder(row);
        });
      }
    }
  }

  return workbook;
}
