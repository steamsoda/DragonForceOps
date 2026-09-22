import { z } from "zod";

export const chargeOperationReceiptSchema = z.object({
  operationId: z.string().uuid(), chargeId: z.string().uuid(), enrollmentId: z.string().uuid(),
  kind: z.enum(["credit", "cash"]), playerName: z.string(), campusName: z.string(),
  operatorCampusName: z.string().optional(), operator: z.string(), description: z.string(),
  currency: z.string(), chargeAmount: z.number().nonnegative(),
  cashReturned: z.number().nonnegative(), creditGenerated: z.number().nonnegative(), creditRestored: z.number().nonnegative(),
  occurredAt: z.string(), recordedAt: z.string(), reason: z.string(), paymentReferences: z.array(z.string()),
});
export type ChargeOperationReceipt = z.infer<typeof chargeOperationReceiptSchema>;

export function cancellationLabel(credit: number) {
  return credit > 0 ? "Cancelar cargo y generar crédito" : "Cancelar cargo";
}

export function operationReceiptLines(receipt: ChargeOperationReceipt): string[] {
  const money = (value: number) => new Intl.NumberFormat("es-MX", { style: "currency", currency: receipt.currency }).format(value);
  const date = (value: string) => new Date(value).toLocaleString("es-MX", { timeZone: "America/Monterrey", hour12: false });
  return [receipt.kind === "cash" ? "COMPROBANTE DE REEMBOLSO" : "COMPROBANTE DE CANCELACION",
    `Alumno: ${receipt.playerName}`, `Campus: ${receipt.campusName}`,
    `Operacion: ${receipt.operationId}`, `Fecha: ${date(receipt.occurredAt)}`, `Registrado: ${date(receipt.recordedAt)}`,
    `Operador: ${receipt.operator}`, `Cargo: ${receipt.description}`, `Referencia cargo: ${receipt.chargeId}`,
    ...receipt.paymentReferences.map(value => `Pago original: ${value}`), `Motivo: ${receipt.reason}`,
    `Cargo cancelado: ${money(receipt.chargeAmount)}`, `Efectivo devuelto: ${money(receipt.cashReturned)}`,
    `Credito generado: ${money(receipt.creditGenerated)}`, `Credito previo restaurado: ${money(receipt.creditRestored)}`,
    ...(receipt.cashReturned === 0 ? ["No se entrego efectivo."] : []),
    ...(receipt.creditGenerated + receipt.creditRestored > 0
      ? ["Credito disponible al registrar esta operacion.", "No aplicado automaticamente a otros cargos."]
      : receipt.cashReturned === 0 ? ["Sin movimiento de dinero ni generacion de credito."] : []),
    "No es un recibo de pago."];
}
