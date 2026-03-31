import { parseDateOnlyInput } from "@/lib/time";

export type ParsedEnrollmentInput = {
  campusId: string;
  pricingPlanCode: string;
  startDate: string;
  notes: string | null;
};

function parseDate(value: string | null): string | null {
  return parseDateOnlyInput(value);
}

const DROPOUT_REASONS = [
  "coach_capability",
  "exercise_difficulty",
  "financial",
  "training_quality",
  "school_disorganization",
  "facility_safety",
  "transport",
  "family_health",
  "player_health",
  "schedule_conflict",
  "coach_communication",
  "wants_competition",
  "lack_of_information",
  "pedagogy",
  "moved_to_competition_club",
  "player_coach_relationship",
  "unattractive_exercises",
  "moved_residence",
  "school_performance_punishment",
  "home_behavior_punishment",
  "personal",
  "distance",
  "parent_work",
  "injury",
  "dislikes_football",
  "lost_contact",
  "low_peer_attendance",
  "changed_sport",
  "did_not_return",
  "temporary_leave",
  "moved_to_another_academy",
  "school_schedule_conflict",
  "coach_change",
  "cold_weather",
  "other"
] as const;
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
  const pricingPlanCode = String(formData.get("pricingPlanCode") ?? "").trim();
  const startDate = parseDate(String(formData.get("startDate") ?? ""));
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!campusId || !pricingPlanCode || !startDate) return null;

  return { campusId, pricingPlanCode, startDate, notes };
}
