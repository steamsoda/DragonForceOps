import { parseExplicitCheckoutCommand, quoteExplicitCheckout, type ExplicitCheckoutSnapshot } from "./explicit-checkout";

function key(actorId: string, enrollmentId: string) {
  return `invicta:explicit-cart:v1:${actorId}:${enrollmentId}`;
}

// Tab-scoped recovery is not authorization. The server rechecks the real user,
// enrollment, prices and request payload on every retry.
export function saveCartRecovery(actorId: string, enrollmentId: string, form: FormData, snapshot: ExplicitCheckoutSnapshot) {
  const fields: [string, string][] = [];
  form.forEach((value, name) => { if (typeof value !== "string") throw Error("invalid_recovery"); fields.push([name, value]); });
  sessionStorage.setItem(key(actorId, enrollmentId), JSON.stringify({ fields, snapshot }));
}

export function loadCartRecovery(actorId: string, enrollmentId: string): FormData | null {
  const raw = sessionStorage.getItem(key(actorId, enrollmentId));
  if (!raw) return null;
  const saved = JSON.parse(raw);
  if (!Array.isArray(saved.fields) || saved.fields.length > 40) throw Error("invalid_recovery");
  const form = new FormData();
  for (const pair of saved.fields) {
    if (!Array.isArray(pair) || pair.length !== 2 || pair.some(value => typeof value !== "string")) throw Error("invalid_recovery");
    form.set(pair[0], pair[1]);
  }
  const command = parseExplicitCheckoutCommand(JSON.parse(String(form.get("explicitCommand"))));
  if (command.enrollmentId !== enrollmentId || saved.snapshot.enrollmentId !== enrollmentId || form.get("checkoutActorId") !== actorId) throw Error("invalid_recovery");
  quoteExplicitCheckout(saved.snapshot, command.creditSelection);
  form.set("recoverySnapshot", JSON.stringify(saved.snapshot));
  return form;
}

export function clearCartRecovery(actorId: string, enrollmentId: string) {
  sessionStorage.removeItem(key(actorId, enrollmentId));
}
