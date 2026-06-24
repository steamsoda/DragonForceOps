export const SCHOLARSHIP_STATUSES = ["none", "half", "full", "custom"] as const;

export type ScholarshipStatus = (typeof SCHOLARSHIP_STATUSES)[number];

export function isScholarshipStatus(value: string): value is ScholarshipStatus {
  return (SCHOLARSHIP_STATUSES as readonly string[]).includes(value);
}

export function roundScholarshipMoney(value: number) {
  return Math.round(value * 100) / 100;
}

export function applyScholarshipToAmount(
  amount: number,
  scholarshipStatus: ScholarshipStatus,
  customScholarshipAmount?: number | null,
) {
  if (scholarshipStatus === "custom") {
    return roundScholarshipMoney(
      typeof customScholarshipAmount === "number" && Number.isFinite(customScholarshipAmount)
        ? customScholarshipAmount
        : amount,
    );
  }

  if (scholarshipStatus === "half") {
    return roundScholarshipMoney(amount * 0.5);
  }

  return roundScholarshipMoney(amount);
}

export function getScholarshipStatusLabel(status: ScholarshipStatus) {
  switch (status) {
    case "half":
      return "Media beca";
    case "full":
      return "Beca completa";
    case "custom":
      return "Beca personalizada";
    default:
      return "Sin beca";
  }
}
