const id = '11111111-1111-4111-8111-111111111111';
const cup = '33333333-3333-4333-8333-333333333333';
export const state = { calls: [] as string[], prints: 0 };
(window as any).fixture = state;
export function useReadOnly() { return false; }
export async function acknowledgeExplicitCajaCartAction() { await fetch('/test-recovery', { method: 'DELETE' }); return { ok: true as const }; }
export async function reviewExplicitCajaCartAction() {
  return { ok: true as const, snapshot: { enrollmentId: id, currency: 'MXN', availableCredit: 200,
    lines: [{ key: id, chargeId: id, description: 'Mensualidad septiembre', pending: 700, due: 700, kind: 'ordinary' as const, creditAllowed: true },
      { key: cup, chargeId: cup, description: 'Copa Tigres anticipo', pending: 1250, due: 600, kind: 'copa_tigres' as const, creditAllowed: false }] } };
}
export async function checkoutCajaCartAction(_: string, form: FormData) {
  const raw = String(form.get('explicitCommand'));
  const saved = await fetch('/test-checkout', { method: 'POST', body: JSON.stringify({ fields: [...form.entries()], snapshot: (await reviewExplicitCajaCartAction()).snapshot }) }).then(response => response.json());
  state.calls = saved.calls;
  if (saved.uncertain) return { ok: false as const, error: 'checkout_uncertain', uncertain: true };
  const command = JSON.parse(raw);
  return { ok: true as const, recovered: saved.calls.length > 1, receipt: { operationId: command.requestId, enrollmentId: id, actorId: id,
    occurredAt: '2026-09-21T18:00:00Z', paidAt: '2026-09-21T18:00:00Z', playerName: 'Test Player',
    campusName: 'Contry', operatorCampusName: 'Contry', currency: 'MXN', moneyReceived: 1100,
    creditApplied: 200, creditRemaining: 0, pendingChargesTotal: 650, sessionWarning: false,
    lines: [{ key: id, chargeId: id, description: 'Mensualidad septiembre', pendingBefore: 700, creditApplied: 200, moneyReceived: 500, pendingAfter: 0 }],
    payments: [{ id, folio: 'TEST-001', method: 'cash', amount: 1100 }] } };
}
export async function printExplicitCheckoutReceipt() { state.prints++; }
