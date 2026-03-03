export type ParsedEnrollmentInput = {
  campusId: string;
  pricingPlanId: string;
  startDate: string;
  inscriptionAmount: number;
  firstMonthAmount: number;
  notes: string | null;
};

function parsePositiveMoney(value: string | null): number | null {
  if (!value) return null;
  const normalized = value.replace(",", ".").trim();
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return Math.round(amount * 100) / 100;
}

function parseDate(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  return trimmed;
}

export function parseEnrollmentFormData(formData: FormData): ParsedEnrollmentInput | null {
  const campusId = String(formData.get("campusId") ?? "").trim();
  const pricingPlanId = String(formData.get("pricingPlanId") ?? "").trim();
  const startDate = parseDate(String(formData.get("startDate") ?? ""));
  const inscriptionAmount = parsePositiveMoney(String(formData.get("inscriptionAmount") ?? ""));
  const firstMonthAmount = parsePositiveMoney(String(formData.get("firstMonthAmount") ?? ""));
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!campusId || !pricingPlanId || !startDate || !inscriptionAmount || !firstMonthAmount) return null;

  return { campusId, pricingPlanId, startDate, inscriptionAmount, firstMonthAmount, notes };
}
