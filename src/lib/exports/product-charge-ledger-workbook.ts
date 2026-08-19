import ExcelJS from "exceljs";
import type { ProductChargeLedgerExportData } from "@/lib/queries/products";
import { formatDateTimeMonterrey } from "@/lib/time";

const BORDER = "FFC7CDD6";
const HEADER_FILL = "FFF1F5F9";

const COLUMNS = [
  { header: "#", key: "index", width: 7 },
  { header: "Alumno", key: "player", width: 36 },
  { header: "Campus", key: "campus", width: 18 },
  { header: "Categoria", key: "birthYear", width: 13 },
  { header: "Grupo actual", key: "group", width: 30 },
  { header: "Equipo asignado", key: "team", width: 48 },
  { header: "Estatus", key: "status", width: 14 },
  { header: "Monto", key: "amount", width: 15 },
  { header: "Cargo emitido", key: "issuedAt", width: 23 },
  { header: "Pagado", key: "paidAt", width: 23 },
];

function applyBorders(row: ExcelJS.Row) {
  row.eachCell((cell) => {
    cell.border = {
      top: { style: "thin", color: { argb: BORDER } },
      left: { style: "thin", color: { argb: BORDER } },
      bottom: { style: "thin", color: { argb: BORDER } },
      right: { style: "thin", color: { argb: BORDER } },
    };
    cell.alignment = { vertical: "middle", wrapText: true };
  });
}

function formatDateOnly(value: string | null) {
  if (!value) return null;
  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
}

function buildFilterLabel(data: ProductChargeLedgerExportData) {
  const from = formatDateOnly(data.paidFrom);
  const to = formatDateOnly(data.paidTo);
  if (from && to) return `Pagados del ${from} al ${to}`;
  if (from) return `Pagados desde ${from}`;
  if (to) return `Pagados hasta ${to}`;
  return "Todos los cargos del producto";
}

export async function buildProductChargeLedgerWorkbook(data: ProductChargeLedgerExportData) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Dragon Force Monterrey";
  workbook.created = new Date();
  workbook.modified = new Date();

  const worksheet = workbook.addWorksheet("Cargos");
  worksheet.columns = COLUMNS.map(({ key, width }) => ({ key, width }));
  worksheet.views = [{ state: "frozen", ySplit: 3 }];
  worksheet.pageSetup = {
    orientation: "landscape",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: { left: 0.2, right: 0.2, top: 0.35, bottom: 0.35, header: 0.15, footer: 0.15 },
  };

  const title = worksheet.addRow([`Productos - ${data.productName}`]);
  worksheet.mergeCells(title.number, 1, title.number, COLUMNS.length);
  title.font = { bold: true, size: 15 };
  title.alignment = { horizontal: "center", vertical: "middle" };
  title.height = 27;
  applyBorders(title);

  const scope = worksheet.addRow([`${buildFilterLabel(data)} | ${data.rows.length} registros | Horario de Monterrey`]);
  worksheet.mergeCells(scope.number, 1, scope.number, COLUMNS.length);
  scope.font = { bold: true, size: 10 };
  scope.alignment = { horizontal: "center", vertical: "middle" };
  applyBorders(scope);

  const header = worksheet.addRow(COLUMNS.map((column) => column.header));
  header.font = { bold: true };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
  header.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  header.height = 24;
  applyBorders(header);

  data.rows.forEach((sale, index) => {
    const row = worksheet.addRow({
      index: index + 1,
      player: sale.playerName,
      campus: sale.campusName,
      birthYear: sale.birthYear ?? "Sin dato",
      group: sale.trainingGroupName ?? "Sin grupo",
      team: sale.assignedTeamNames.join("\n") || "Sin equipo",
      status: sale.paymentStatus === "paid" ? "Pagado" : "Pendiente",
      amount: sale.amount,
      issuedAt: formatDateTimeMonterrey(sale.createdAt),
      paidAt: sale.paidAt ? formatDateTimeMonterrey(sale.paidAt) : "-",
    });
    row.getCell("amount").numFmt = '[$$-es-MX]#,##0.00';
    row.getCell("index").alignment = { horizontal: "center", vertical: "middle" };
    row.getCell("birthYear").alignment = { horizontal: "center", vertical: "middle" };
    row.getCell("status").alignment = { horizontal: "center", vertical: "middle" };
    applyBorders(row);
  });

  if (data.rows.length === 0) {
    const empty = worksheet.addRow(["No hay cargos con los filtros seleccionados."]);
    worksheet.mergeCells(empty.number, 1, empty.number, COLUMNS.length);
    empty.font = { italic: true };
    empty.alignment = { horizontal: "center" };
    applyBorders(empty);
  }

  worksheet.autoFilter = { from: { row: 3, column: 1 }, to: { row: Math.max(3, worksheet.rowCount), column: COLUMNS.length } };
  return workbook;
}
