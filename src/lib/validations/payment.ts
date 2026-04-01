const PAYMENT_METHODS = ["cash", "transfer", "card", "stripe_360player", "other"] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export type ParsedPaymentInput = {
  amount: number;
  method: PaymentMethod;
  notes: string | null;
  targetChargeIds: string[];
  operatorCampusId: string | null;
  split?: { amount: number; method: PaymentMethod };
};

function parsePositiveMoney(value: string | null): number | null {
  if (!value) return null;
  const normalized = value.replace(",", ".").trim();
  if (!normalized) return null;
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return Math.round(amount * 100) / 100;
}

export function parsePaymentFormData(formData: FormData): ParsedPaymentInput | null {
  const amount = parsePositiveMoney(String(formData.get("amount") ?? ""));
  const methodRaw = String(formData.get("method") ?? "").trim() as PaymentMethod;
  const notesRaw = String(formData.get("notes") ?? "").trim();
  const targetChargeIdsRaw = String(formData.get("targetChargeIds") ?? "").trim();
  const targetChargeIds = targetChargeIdsRaw ? targetChargeIdsRaw.split(",").filter(Boolean) : [];
  const operatorCampusIdRaw = String(formData.get("operatorCampusId") ?? "").trim();

  if (!amount) return null;
  if (!PAYMENT_METHODS.includes(methodRaw)) return null;

  // Optional second payment (split)
  const amount2Raw = formData.get("amount2");
  const method2Raw = String(formData.get("method2") ?? "").trim() as PaymentMethod;
  let split: ParsedPaymentInput["split"] = undefined;
  if (amount2Raw) {
    const amount2 = parsePositiveMoney(String(amount2Raw));
    if (amount2 && PAYMENT_METHODS.includes(method2Raw)) {
      split = { amount: amount2, method: method2Raw };
    }
  }

  return {
    amount,
    method: methodRaw,
    notes: notesRaw ? notesRaw : null,
    targetChargeIds,
    operatorCampusId: operatorCampusIdRaw || null,
    split
  };
}
