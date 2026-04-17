export const SCHOLARSHIP_STATUSES = ["none", "half", "full"] as const;

export type ScholarshipStatus = (typeof SCHOLARSHIP_STATUSES)[number];

export function isScholarshipStatus(value: string): value is ScholarshipStatus {
  return (SCHOLARSHIP_STATUSES as readonly string[]).includes(value);
}

export function roundScholarshipMoney(value: number) {
  return Math.round(value * 100) / 100;
}

export function applyScholarshipToAmount(amount: number, scholarshipStatus: ScholarshipStatus) {
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
    default:
      return "Sin beca";
  }
}
