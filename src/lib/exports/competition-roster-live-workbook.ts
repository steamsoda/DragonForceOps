import ExcelJS from "exceljs";
import type { CompetitionRosterLiveViewData } from "@/lib/queries/competition-rosters";
import {
  formatCampusCompetitionTeamName,
  formatCompetitionSquadDisplay,
} from "@/lib/training-groups/shared";

const BORDER = "FFB8C0CC";
const LIGHT_GRAY = "FFF3F5F8";
const COLUMNS = [
  { header: "#", width: 6 },
  { header: "ID", width: 14 },
  { header: "Jugador", width: 38 },
  { header: "Categoria", width: 12 },
  { header: "Grupo de entrenamiento", width: 30 },
  { header: "Origen", width: 16 },
];

function borderRow(row: ExcelJS.Row) {
  for (let column = 1; column <= COLUMNS.length; column += 1) {
    row.getCell(column).border = {
      top: { style: "thin", color: { argb: BORDER } },
      left: { style: "thin", color: { argb: BORDER } },
      bottom: { style: "thin", color: { argb: BORDER } },
      right: { style: "thin", color: { argb: BORDER } },
    };
  }
}

export async function buildCompetitionRosterLiveWorkbook(data: CompetitionRosterLiveViewData) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Dragon Force Monterrey";
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet("Equipos actuales");
  worksheet.columns = COLUMNS.map((column) => ({ width: column.width }));
  worksheet.pageSetup = {
    orientation: "landscape",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: { left: 0.25, right: 0.25, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 },
  };

  const title = worksheet.addRow([`${data.tournamentName} - Equipos actuales`]);
  worksheet.mergeCells(title.number, 1, title.number, COLUMNS.length);
  title.font = { bold: true, size: 14 };
  title.alignment = { horizontal: "center" };
  title.height = 26;
  borderRow(title);

  const subtitle = worksheet.addRow([
    `${data.campusName} | ${data.programLabel} | ${data.totalAssigned} jugadores en equipos`,
  ]);
  worksheet.mergeCells(subtitle.number, 1, subtitle.number, COLUMNS.length);
  subtitle.font = { bold: true };
  subtitle.alignment = { horizontal: "center" };
  borderRow(subtitle);

  for (const squad of data.squads) {
    worksheet.addRow([]);
    const display = formatCompetitionSquadDisplay({
      name: squad.name,
      program: data.program,
      categoryLabel: squad.categoryLabel,
      kind: squad.kind,
      sourceGroupCount: squad.sourceGroupNames.length,
    });
    const squadName = formatCampusCompetitionTeamName(data.campusName, display.title);
    const squadTitle = worksheet.addRow([`${squadName} (${squad.members.length} jugadores)`]);
    worksheet.mergeCells(squadTitle.number, 1, squadTitle.number, COLUMNS.length);
    squadTitle.font = { bold: true, size: 12 };
    squadTitle.fill = { type: "pattern", pattern: "solid", fgColor: { argb: LIGHT_GRAY } };
    borderRow(squadTitle);

    const detail = worksheet.addRow([
      [
        squad.categoryLabel ? `Cat. ${squad.categoryLabel}` : null,
        `Profesor: ${squad.professorNames.join(", ") || "Sin asignar"}`,
        squad.sourceGroupNames.join(", ")
      ]
        .filter(Boolean)
        .join(" | "),
    ]);
    worksheet.mergeCells(detail.number, 1, detail.number, COLUMNS.length);
    detail.font = { italic: true };
    borderRow(detail);

    const header = worksheet.addRow(COLUMNS.map((column) => column.header));
    header.font = { bold: true };
    header.alignment = { horizontal: "center" };
    borderRow(header);

    squad.members.forEach((member, index) => {
      const row = worksheet.addRow([
        index + 1,
        member.publicPlayerId ?? "-",
        member.playerName,
        member.birthYear ?? "-",
        member.trainingGroupName ?? "Sin grupo",
        member.source === "manual" ? "Refuerzo" : "Inscripcion confirmada",
      ]);
      row.getCell(1).alignment = { horizontal: "center" };
      row.getCell(4).alignment = { horizontal: "center" };
      borderRow(row);
    });
  }

  if (data.pendingPlayers.length > 0) {
    worksheet.addRow([]);
    const pendingTitle = worksheet.addRow([`Pendientes por asignar (${data.pendingPlayers.length})`]);
    worksheet.mergeCells(pendingTitle.number, 1, pendingTitle.number, COLUMNS.length);
    pendingTitle.font = { bold: true };
    borderRow(pendingTitle);
    for (const [index, player] of data.pendingPlayers.entries()) {
      const row = worksheet.addRow([
        index + 1,
        "-",
        player.playerName,
        player.birthYear ?? "-",
        player.trainingGroupName ?? "Sin grupo",
        "Pendiente",
      ]);
      borderRow(row);
    }
  }

  return workbook;
}
