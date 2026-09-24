import { prepareExplicitCheckout, type ExplicitCheckoutSnapshot, type ExplicitCheckoutCommand } from "./explicit-checkout";
import { parseCreditAmount } from "./explicit-credit";

// Freeze the displayed proposal before the first request. The existing server
// resolver and locked transaction must still validate every amount and target.
export function prepareFastCheckoutForm(actorId: string, snapshot: ExplicitCheckoutSnapshot, base: FormData, requestId: string): FormData {
  const payments: ExplicitCheckoutCommand["payments"] = [
    { method: String(base.get("method")) as ExplicitCheckoutCommand["payments"][number]["method"], amount: parseCreditAmount(String(base.get("amount"))) ?? NaN },
    ...(base.has("amount2") ? [{ method: String(base.get("method2")) as ExplicitCheckoutCommand["payments"][number]["method"], amount: parseCreditAmount(String(base.get("amount2"))) ?? NaN }] : []),
  ];
  const plan = prepareExplicitCheckout(snapshot, { requestId, creditSelection: [], payments });
  const form = new FormData(); base.forEach((value, key) => form.set(key, value));
  form.set("checkoutMode", "fast"); form.set("checkoutActorId", actorId);
  form.set("explicitCommand", JSON.stringify(plan.command));
  form.set("displayedSnapshot", JSON.stringify(snapshot));
  form.set("diagnosticTraceId", crypto.randomUUID());
  return form;
}
