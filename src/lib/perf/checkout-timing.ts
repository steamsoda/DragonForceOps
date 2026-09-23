type Stage = "review" | "authorization" | "resolve" | "ledger" | "prepare_item" | "prior_lookup"
  | "intent_lookup" | "stage" | "checkout" | "invalidate" | "acknowledge" | "ack_verify"
  | "save_response" | "saved_ui" | "account_refresh" | "logo" | "connect" | "sign" | "print";

// Diagnostic IDs are unrelated to users, payments, amounts, or persistent request IDs.
export function createCheckoutTrace(id?: unknown) {
  const trace = typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id) ? id : crypto.randomUUID();
  let count = 0;
  return {
    id: trace,
    async run<T>(stage: Stage, action: () => Promise<T>): Promise<T> {
      const start = performance.now();
      const logged = count++ < 64;
      if (logged) console.info("[checkout-perf]", { trace, stage, outcome: "started", at: Date.now() });
      let outcome = "error";
      try { const result = await action(); outcome = "returned"; return result; }
      finally {
        if (logged) console.info("[checkout-perf]", { trace, stage, outcome, ms: Math.round(performance.now() - start) });
      }
    },
  };
}

export type CheckoutTrace = ReturnType<typeof createCheckoutTrace>;
