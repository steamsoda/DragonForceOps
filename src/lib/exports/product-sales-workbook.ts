import ExcelJS from "exceljs";
import { summarizeProductSales, type ProductSalesData } from "./product-sales";
import { formatDateTimeMonterrey } from "@/lib/time";

export function buildProductSalesWorkbook(data: ProductSalesData) {
  const book = new ExcelJS.Workbook();
  book.creator = "INVICTA";
  book.created = new Date();
  const columns = [
    { header: "ID alumno", key: "playerCode", width: 15 },
    { header: "Alumno", key: "playerName", width: 38 },
    { header: "Campus", key: "campusName", width: 20 },
    { header: "Ano de nacimiento", key: "birthYear", width: 20 },
    { header: "Grupo actual", key: "trainingGroupName", width: 32 },
    { header: "Talla", key: "size", width: 16 },
    { header: "Cantidad", key: "quantity", width: 13 },
    { header: "Pagado el (Monterrey)", key: "paidAt", width: 26 },
    { header: "Referencia de compra", key: "chargeId", width: 39 },
  ];
  const detail = book.addWorksheet("Detalle");
  const summary = book.addWorksheet("Resumen por talla");
  function setup(sheet: ExcelJS.Worksheet, cols: Array<{ header: string; key: string; width: number }>) {
    sheet.columns = cols.map(({ key, width }) => ({ key, width }));
    sheet.addRow([`${data.productName} - Ventas pagadas`]);
    sheet.mergeCells(1, 1, 1, cols.length);
    sheet.getRow(1).font = { bold: true, size: 16, color: { argb: "FF174A76" } };
    sheet.getRow(1).height = 30;
    sheet.addRow([`${data.campusName} | Desde: ${data.paidFrom ?? "Sin limite"} | Hasta: ${data.paidTo ?? "Sin limite"} | Horario de Monterrey`]);
    sheet.mergeCells(2, 1, 2, cols.length);
    sheet.getRow(2).alignment = { wrapText: true, vertical: "middle" };
    sheet.getRow(2).height = 38;
    sheet.addRow(cols.map(col => col.header));
    sheet.getRow(3).font = { bold: true, color: { argb: "FFFFFFFF" } };
    sheet.getRow(3).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF174A76" } };
    sheet.getRow(3).height = 28;
    sheet.views = [{ state: "frozen", ySplit: 3 }];
    sheet.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: "1:3" };
  }
  setup(detail, columns);
  for (const row of data.rows) detail.addRow({ ...row, playerCode: row.playerCode ?? "Sin dato",
    birthYear: row.birthYear ?? "Sin dato", trainingGroupName: row.trainingGroupName ?? "Sin grupo",
    size: row.size?.trim() || "Sin talla", paidAt: row.paidAt ? formatDateTimeMonterrey(row.paidAt) : "Sin fecha de pago" });
  setup(summary, [{ header: "Campus", key: "campus", width: 28 }, { header: "Talla", key: "size", width: 24 }, { header: "Cantidad", key: "quantity", width: 24 }]);
  for (const row of summarizeProductSales(data.rows)) summary.addRow(row);
  for (const sheet of [detail, summary]) {
    sheet.autoFilter = { from: { row: 3, column: 1 }, to: { row: Math.max(3, sheet.rowCount), column: sheet.columnCount } };
    sheet.eachRow((row, index) => {
      if (index <= 3) return;
      row.height = 32;
      row.alignment = { vertical: "middle", wrapText: true };
      if (index % 2 === 0) row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF0F5F9" } };
    });
  }
  summary.addRow({ campus: "TOTAL", quantity: data.rows.reduce((sum, row) => sum + row.quantity, 0) }).font = { bold: true };
  if (!data.rows.length) detail.addRow(["Sin ventas pagadas con estos filtros."]);
  return book;
}
