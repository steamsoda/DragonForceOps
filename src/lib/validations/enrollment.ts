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

const DROPOUT_REASONS = ["cost", "distance", "injury", "attitude", "time", "level_change", "other"] as const;
export type DropoutReason = (typeof DROPOUT_REASONS)[number];

export type ParsedEnrollmentEditInput = {
  status: "active" | "ended" | "cancelled";
  endDate: string | null;
  campusId: string;
  notes: string | null;
  dropoutReason: DropoutReason | null;
  dropoutNotes: string | null;
};

export function parseEnrollmentEditData(formData: FormData): ParsedEnrollmentEditInput | null {
  const status = String(formData.get("status") ?? "").trim();
  if (!["active", "ended", "cancelled"].includes(status)) return null;

  const endDateRaw = String(formData.get("endDate") ?? "").trim();
  const endDate = endDateRaw ? parseDate(endDateRaw) : null;

  const campusId = String(formData.get("campusId") ?? "").trim();
  if (!campusId) return null;

  const notes = String(formData.get("notes") ?? "").trim() || null;

  const dropoutReasonRaw = String(formData.get("dropoutReason") ?? "").trim();
  const dropoutReason = (DROPOUT_REASONS as readonly string[]).includes(dropoutReasonRaw)
    ? (dropoutReasonRaw as DropoutReason)
    : null;
  const dropoutNotes = String(formData.get("dropoutNotes") ?? "").trim() || null;

  // Dropout reason required when ending/cancelling
  const isEnding = status === "ended" || status === "cancelled";
  if (isEnding && !dropoutReason) return null;

  return {
    status: status as "active" | "ended" | "cancelled",
    endDate,
    campusId,
    notes,
    dropoutReason,
    dropoutNotes
  };
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
