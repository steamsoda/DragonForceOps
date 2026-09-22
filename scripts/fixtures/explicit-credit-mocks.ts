import type { CreditCommand, CreditReceipt, CreditLoadResult, CreditResult } from "../../src/lib/finance/explicit-credit";

const state = { calls: [] as CreditCommand[], mode: "success", printed: [] as CreditReceipt[], available: 300,
  receipts: [] as CreditReceipt[] };
Object.assign(window, { creditTest: state });
export function useReadOnly() { return new URLSearchParams(location.search).has("readonly"); }
export async function loadExplicitCredit(): Promise<CreditLoadResult> {
  return { ok: true, workspace: { enrollmentId: "11111111-1111-4111-8111-111111111111",
    playerName: "Alumno de prueba", campusName: "Linda Vista", currency: "MXN", availableCredit: state.available,
    legacyReview: 50, readOnly: useReadOnly(), receipts: state.receipts, actorId: "55555555-5555-4555-8555-555555555555",
    charges: [
      { id: "22222222-2222-4222-8222-222222222222", description: "Mensualidad septiembre", pending: 700, eligible: true },
      { id: "33333333-3333-4333-8333-333333333333", description: "Uniforme de entrenamiento con descripcion extensa para verificar el ajuste del texto", pending: 800, eligible: true },
      { id: "44444444-4444-4444-8444-444444444444", description: "Copa Tigres 2026", pending: 1250, eligible: false },
    ] } };
}
export async function confirmExplicitCredit(command: CreditCommand): Promise<CreditResult> {
  state.calls.push(structuredClone(command));
  if (state.mode === "uncertain") return { ok: false, code: "uncertain", uncertain: true };
  if (state.mode === "stale") return { ok: false, code: "credit_selection_changed" };
  const workspace = await loadExplicitCredit();
  if (!workspace.ok) throw Error('fixture');
  const applied = command.selection.reduce((sum, line) => sum + line.amount, 0);
  const receipt: CreditReceipt = { operationId: command.requestId, enrollmentId: command.enrollmentId,
    actorId: "55555555-5555-4555-8555-555555555555", occurredAt: "2026-09-22T01:00:00Z",
    playerName: "Alumno de prueba", campusName: "Linda Vista", currency: "MXN", moneyReceived: 0,
    creditApplied: applied, creditRemaining: state.available - applied, pendingChargesTotal: 2750 - applied,
    lines: command.selection.map((line) => ({ chargeId: line.chargeId,
      description: workspace.workspace.charges.find((charge) => charge.id === line.chargeId)!.description,
      creditApplied: line.amount, pendingBefore: line.expectedPending, pendingAfter: line.expectedPending - line.amount })) };
  state.receipts.unshift(receipt); return { ok: true, receipt };
}
export async function printCreditReceipt(_printer: string, receipt: CreditReceipt) {
  if (state.mode === "print_error") throw Error('printer unavailable');
  state.printed.push(receipt);
}
export async function acknowledgeExplicitCredit() {}
export function PendingOperationsPanel() { return null; }
