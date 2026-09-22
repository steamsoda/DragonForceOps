import { z } from "zod";

const money = z.number().finite().min(0).max(9999999999.99)
  .refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 0.00001);
export const creditCommandSchema = z.object({
  enrollmentId: z.string().uuid(),
  requestId: z.string().uuid(),
  expectedAvailable: money.refine((value) => value > 0),
  selection: z.array(z.object({
    chargeId: z.string().uuid(),
    amount: money.refine((value) => value > 0),
    expectedPending: money,
  }).strict()).min(1).max(100),
}).strict().superRefine((command, ctx) => {
  const ids = new Set(command.selection.map((line) => line.chargeId));
  if (ids.size !== command.selection.length || command.selection.some((line) => line.amount > line.expectedPending)
    || Math.round(command.selection.reduce((sum, line) => sum + line.amount, 0) * 100) > Math.round(command.expectedAvailable * 100)) {
    ctx.addIssue({ code: "custom", message: "invalid_credit_selection" });
  }
});
export type CreditCommand = z.infer<typeof creditCommandSchema>;
export type CreditReceipt = {
  operationId: string; enrollmentId: string; actorId: string; occurredAt: string;
  playerName: string; campusName: string; currency: string; moneyReceived: number;
  creditApplied: number; creditRemaining: number; pendingChargesTotal: number;
  lines: Array<{ chargeId: string; description: string; creditApplied: number; pendingBefore: number; pendingAfter: number }>;
};
export type CreditWorkspace = {
  enrollmentId: string; playerName: string; campusName: string; currency: string;
  availableCredit: number; legacyReview: number; readOnly: boolean;
  charges: Array<{ id: string; description: string; pending: number; eligible: boolean }>;
  receipts: CreditReceipt[];
  actorId?: string;
  recovery?: CreditCommand | null;
  recoveryBlocked?: boolean;
  canResolvePending?: boolean;
};
export type CreditResult = { ok: true; receipt: CreditReceipt } | { ok: false; code: string; uncertain?: boolean };
export type CreditLoadResult = { ok: true; workspace: CreditWorkspace } | { ok: false; code: string };

export function parseCreditAmount(value: string): number | null {
  if (!/^\d{1,10}([.,]\d{1,2})?$/.test(value.trim())) return null;
  const result = money.safeParse(Number(value.replace(",", ".")));
  return result.success ? result.data : null;
}

export function creditErrorMessage(code: string): string {
  const messages: Record<string, string> = {
    forbidden: "No tienes permiso para aplicar credito a esta cuenta.",
    debug_read_only: "La vista de prueba no permite guardar cambios.",
    invalid_credit_selection: "Revisa los importes seleccionados y el credito disponible.",
    credit_selection_changed: "El saldo cambio. Actualiza la cuenta y revisa los importes nuevamente.",
    invalid_target_charge: "Uno de los cargos ya no esta disponible. Actualiza la cuenta.",
    credit_source_requires_review: "El credito requiere revision de administracion antes de utilizarse.",
    copa_tigres_no_credit: "Copa Tigres no admite credito.",
    credit_request_conflict: "Esta operacion ya tiene otros datos. Consulta los comprobantes antes de continuar.",
    credit_in_progress: "Hay una operacion pendiente de confirmar en esta cuenta. Recupera el cobro original antes de iniciar otro.",
    load_failed: "No se pudo cargar el credito. Intenta nuevamente.",
    enrollment_not_found: "La cuenta ya no esta disponible.",
    enrollment_inactive: "El estado de la cuenta no permite esta operacion.",
    uncertain: "No pudimos confirmar el resultado. Reintenta esta misma operacion; no cambies los importes.",
  };
  return messages[code] ?? messages.uncertain;
}
