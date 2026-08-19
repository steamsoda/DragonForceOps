import type { ProductChargeLedgerExportData } from "@/lib/queries/products";
import { formatDateTimeMonterrey } from "@/lib/time";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function money(value: number, currency: string) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency }).format(value);
}

function dateOnly(value: string | null) {
  if (!value) return null;
  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
}

function filterLabel(data: ProductChargeLedgerExportData) {
  const from = dateOnly(data.paidFrom);
  const to = dateOnly(data.paidTo);
  if (from && to) return `Pagados del ${from} al ${to}`;
  if (from) return `Pagados desde ${from}`;
  if (to) return `Pagados hasta ${to}`;
  return "Todos los cargos del producto";
}

export function buildProductChargeLedgerPngSvg(data: ProductChargeLedgerExportData) {
  const width = 1800;
  const rowHeight = 44;
  const headerHeight = 178;
  const footerHeight = 36;
  const height = headerHeight + 48 + Math.max(1, data.rows.length) * rowHeight + footerHeight;
  const columns = "42px 240px 120px 82px 210px 330px 100px 120px 190px 190px";
  const headerCells = ["#", "Alumno", "Campus", "Categoria", "Grupo actual", "Equipo asignado", "Estatus", "Monto", "Cargo emitido", "Pagado"];

  const rows = data.rows.length > 0
    ? data.rows.map((sale, index) => `
        <div style="display:grid;grid-template-columns:${columns};min-height:${rowHeight}px;border-bottom:1px solid #d7dde5;align-items:center;background:${index % 2 === 0 ? "#ffffff" : "#f8fafc"};font-size:13px;line-height:16px;">
          <div style="padding:6px;text-align:center;color:#64748b;">${index + 1}</div>
          <div style="padding:6px 8px;font-weight:700;overflow-wrap:anywhere;">${escapeHtml(sale.playerName)}</div>
          <div style="padding:6px 8px;">${escapeHtml(sale.campusName)}</div>
          <div style="padding:6px;text-align:center;">${sale.birthYear ?? "-"}</div>
          <div style="padding:6px 8px;overflow-wrap:anywhere;">${escapeHtml(sale.trainingGroupName ?? "Sin grupo")}</div>
          <div style="padding:6px 8px;overflow-wrap:anywhere;">${escapeHtml(sale.assignedTeamNames.join(" | ") || "Sin equipo")}</div>
          <div style="padding:6px;text-align:center;font-weight:700;color:${sale.paymentStatus === "paid" ? "#047857" : "#b45309"};">${sale.paymentStatus === "paid" ? "Pagado" : "Pendiente"}</div>
          <div style="padding:6px 8px;text-align:right;font-weight:800;">${escapeHtml(money(sale.amount, sale.currency))}</div>
          <div style="padding:6px 8px;text-align:right;white-space:nowrap;">${escapeHtml(formatDateTimeMonterrey(sale.createdAt))}</div>
          <div style="padding:6px 8px;text-align:right;white-space:nowrap;">${escapeHtml(sale.paidAt ? formatDateTimeMonterrey(sale.paidAt) : "-")}</div>
        </div>`).join("")
    : `<div style="height:${rowHeight}px;display:flex;align-items:center;justify-content:center;color:#64748b;font-style:italic;">No hay cargos con los filtros seleccionados.</div>`;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <foreignObject width="${width}" height="${height}">
      <div xmlns="http://www.w3.org/1999/xhtml" style="width:${width}px;height:${height}px;box-sizing:border-box;background:#eef2f7;padding:24px;font-family:Inter,Segoe UI,Arial,sans-serif;color:#0f172a;">
        <header style="height:${headerHeight - 24}px;background:#0b2f6b;border-bottom:6px solid #f97316;padding:24px 28px;box-sizing:border-box;color:white;">
          <div style="font-size:13px;font-weight:800;letter-spacing:.16em;text-transform:uppercase;color:#dbeafe;">Invicta | Productos</div>
          <div style="margin-top:8px;font-size:34px;font-weight:900;line-height:1.05;">${escapeHtml(data.productName)}</div>
          <div style="margin-top:10px;font-size:15px;font-weight:700;color:#dbeafe;">${escapeHtml(filterLabel(data))} | ${data.rows.length} registros | Horario de Monterrey</div>
        </header>
        <main style="margin-top:16px;overflow:hidden;border:1px solid #94a3b8;border-radius:6px;background:#ffffff;">
          <div style="display:grid;grid-template-columns:${columns};height:48px;align-items:center;background:#e2e8f0;border-bottom:2px solid #64748b;font-size:12px;font-weight:900;text-transform:uppercase;color:#334155;">
            ${headerCells.map((cell, index) => `<div style="padding:6px 8px;${index >= 7 ? "text-align:right;" : index === 0 || index === 3 || index === 6 ? "text-align:center;" : ""}">${cell}</div>`).join("")}
          </div>
          ${rows}
        </main>
      </div>
    </foreignObject>
  </svg>`;

  return { svg, width, height };
}
