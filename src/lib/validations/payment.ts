const PAYMENT_METHODS = ["cash", "transfer", "card", "stripe_360player", "other"] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export type ParsedPaymentInput = {
  amount: number;
  method: PaymentMethod;
  notes: string | null;
  allocations: Array<{ chargeId: string; amount: number }>;
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

  const allocations: Array<{ chargeId: string; amount: number }> = [];

  for (const [key, raw] of formData.entries()) {
    if (!key.startsWith("alloc_")) continue;
    const chargeId = key.slice("alloc_".length);
    if (!chargeId) continue;
    const parsed = parsePositiveMoney(String(raw));
    if (!parsed) continue;
    allocations.push({ chargeId, amount: parsed });
  }

  return {
    amount,
    method: methodRaw,
    notes: notesRaw ? notesRaw : null,
    allocations
  };
}
