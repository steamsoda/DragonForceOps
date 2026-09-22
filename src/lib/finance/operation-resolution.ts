import type { CreditReceipt } from "./explicit-credit";
import type { ExplicitCheckoutReceipt } from "./explicit-checkout";

export type OperationKind = "cart" | "credit";
export type OperationResolution = {
  kind: OperationKind; requestId: string;
  outcome: "cancelled_uncommitted" | "receipt_recovered";
  receipt: CreditReceipt | ExplicitCheckoutReceipt | null;
};
export type PendingOperations = {
  pending: Array<{ kind: OperationKind; requestId: string; actorEmail: string; createdAt: string; committed: boolean; canResolve: boolean }>;
  history: Array<{ kind: OperationKind; requestId: string; reason: string; resolvedAt: string; result: OperationResolution }>;
};
export function operationResolutionError(code: string) {
  const messages: Record<string, string> = {
    forbidden: "No tienes permiso para resolver esta operacion.",
    invalid_resolution: "Confirma la revision y escribe un motivo de 8 a 500 caracteres.",
    operation_not_found: "La operacion ya no esta disponible. Actualiza la lista.",
    operation_already_resolved: "La operacion ya fue resuelta. Actualiza la lista.",
    operation_too_recent: "El intento es reciente. Espera dos minutos desde su inicio y actualiza la lista.",
    operation_receipt_mismatch: "El comprobante requiere revision tecnica. No se realizaron cambios.",
    unavailable: "No se pudo confirmar el resultado. Actualiza la lista antes de continuar.",
  };
  return messages[code] ?? messages.unavailable;
}
