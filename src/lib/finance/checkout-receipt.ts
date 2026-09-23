import type { ExplicitCheckoutReceipt } from "./explicit-checkout";

const WIDTH = 42;
const methods = { cash: "Efectivo", card: "Tarjeta", transfer: "Transferencia", stripe_360player: "Stripe / 360Player", other: "Otro" };

// Preserve long concepts and folios without allowing text to inject printer commands.
function wrap(text: string): string[] {
  let rest = text.replace(/[\x00-\x1f\x7f]/g, " ").replace(/\s+/g, " ").trim();
  const lines: string[] = [];
  while (rest.length > WIDTH) {
    const space = rest.lastIndexOf(" ", WIDTH);
    const end = space > 0 ? space : WIDTH;
    lines.push(rest.slice(0, end));
    rest = rest.slice(end).trimStart();
  }
  if (rest) lines.push(rest);
  return lines;
}

export function checkoutReceiptLines(receipt: ExplicitCheckoutReceipt): string[] {
  const money = (value: number) => new Intl.NumberFormat("es-MX", { style: "currency", currency: receipt.currency }).format(value);
  const date = (value: string) => new Date(value).toLocaleString("es-MX", {
    timeZone: "America/Monterrey", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  });
  const lines: string[] = [];
  const text = (value: string) => lines.push(...wrap(value));
  const row = (label: string, value: number) => {
    const parts = wrap(label), right = money(value);
    const last = parts.pop() ?? "";
    lines.push(...parts);
    if (last.length + right.length + 1 > WIDTH) {
      lines.push(last, right.padStart(WIDTH));
    } else lines.push(last + right.padStart(WIDTH - last.length));
  };
  text(`Alumno: ${receipt.playerName}`);
  text(`Categoria: ${receipt.birthYear ?? "no registrada"}`);
  if (receipt.campusName !== receipt.operatorCampusName) text(`Campus alumno: ${receipt.campusName}`);
  const paid = receipt.payments.length > 0;
  text(`${paid ? "Fecha de pago" : "Fecha"}: ${date(paid ? receipt.paidAt : receipt.occurredAt)}`);
  if (paid && date(receipt.paidAt) !== date(receipt.occurredAt)) text(`Registrado: ${date(receipt.occurredAt)}`);
  lines.push("-".repeat(WIDTH));
  for (const line of receipt.lines) {
    // Only saved transaction values, never a fresh account balance.
    row(line.description, (Math.round(line.moneyReceived * 100) + Math.round(line.creditApplied * 100)) / 100);
    if (line.creditApplied > 0) row("  Credito aplicado", line.creditApplied);
    if (line.pendingAfter > 0) row("  Pendiente del cargo", line.pendingAfter);
  }
  lines.push("-".repeat(WIDTH));
  for (const payment of receipt.payments) {
    row(methods[payment.method], payment.amount);
    text(`Folio: ${payment.folio ?? payment.id}`);
  }
  row("DINERO RECIBIDO", receipt.moneyReceived);
  if (receipt.creditApplied > 0) row("CREDITO UTILIZADO", receipt.creditApplied);
  if (receipt.creditRemaining > 0) row("Credito disponible", receipt.creditRemaining);
  if (receipt.pendingChargesTotal > 0) row("Pendiente en cuenta", receipt.pendingChargesTotal);
  return lines;
}
