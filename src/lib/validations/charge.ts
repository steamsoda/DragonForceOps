export type ParsedChargeInput = {
  chargeTypeId: string;
  description: string;
  amount: number;
  dueDate: string | null;
};

function parsePositiveMoney(value: string | null): number | null {
  if (!value) return null;
  const normalized = value.replace(",", ".").trim();
  if (!normalized) return null;
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return Math.round(amount * 100) / 100;
}

export function parseChargeFormData(formData: FormData): ParsedChargeInput | null {
  const chargeTypeId = String(formData.get("chargeTypeId") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const amount = parsePositiveMoney(String(formData.get("amount") ?? ""));
  const dueDateRaw = String(formData.get("dueDate") ?? "").trim();

  if (!chargeTypeId) return null;
  if (!description || description.length < 3) return null;
  if (!amount) return null;

  return {
    chargeTypeId,
    description,
    amount,
    dueDate: dueDateRaw || null
  };
}
