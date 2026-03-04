const PAYMENT_METHODS = ["cash", "transfer", "card", "stripe_360player", "other"] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export type ParsedPaymentInput = {
  amount: number;
  method: PaymentMethod;
  notes: string | null;
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

  if (!amount) return null;
  if (!PAYMENT_METHODS.includes(methodRaw)) return null;

  return {
    amount,
    method: methodRaw,
    notes: notesRaw ? notesRaw : null
  };
}
