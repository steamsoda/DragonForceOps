import { runPrintAttempt } from '../../src/lib/printer-attempts';
const id = '11111111-1111-4111-8111-111111111111';
export const state = { ackMode: 'delay', printMode: 'stall', checkoutMode: 'ok', saves: 0, prints: 0,
  saved: 0, events: [] as { name: string; at: number }[], resolveAck: () => {}, rejectAck: () => {}, resolvePrint: () => {} };
(window as any).fixture = state;
export function useReadOnly() { return false; }
export const snapshot = { enrollmentId: id, currency: 'MXN', availableCredit: 0,
  lines: [{ key: id, chargeId: id, description: 'Mensualidad septiembre', pending: 700, due: 700, kind: 'ordinary' as const, creditAllowed: true }] };
export async function reviewExplicitCajaCartAction() { return { ok: true as const, snapshot }; }
export async function acknowledgeExplicitCajaCartAction() {
  state.events.push({ name: 'ack-start', at: performance.now() });
  if (state.ackMode === 'delay') await new Promise<void>((resolve, reject) => { state.resolveAck = resolve; state.rejectAck = () => reject(Error('lost ack')); });
  if (state.ackMode === 'error') return { ok: false as const, error: 'acknowledgement_unconfirmed' };
  await fetch('/ack', { method: 'POST' });
  state.events.push({ name: 'ack-end', at: performance.now() });
  return { ok: true as const };
}
export async function checkoutCajaCartAction(_: string, form: FormData) {
  state.saves++;
  const result = await fetch('/checkout', { method: 'POST', body: JSON.stringify({ fields: [...form.entries()], snapshot }) }).then(r => r.json());
  if (state.checkoutMode === 'lost' && !result.recovered) throw Error('lost committed response');
  state.events.push({ name: 'checkout-response', at: performance.now() });
  return result;
}
export async function printExplicitCheckoutReceipt(printer: string, receipt: { operationId: string }) {
  return runPrintAttempt(receipt.operationId, printer, async () => {
    state.prints++;
    state.events.push({ name: 'print-start', at: performance.now() });
    if (state.printMode === 'stall') await new Promise<void>(resolve => { state.resolvePrint = resolve; });
    if (state.printMode === 'error') throw Error('printer error');
    state.events.push({ name: 'print-end', at: performance.now() });
  });
}
