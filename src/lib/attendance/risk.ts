export type AttendanceRiskTier =
  | "three_absences"
  | "four_plus_absences"
  | "inactive_30_days"
  | "inactive_60_days";

export type AttendanceRiskInput = {
  absenceStreak: number;
  daysSinceLastAttendance: number | null;
};

export function getAttendanceRiskTier(input: AttendanceRiskInput, _today: string): AttendanceRiskTier | null {
  if (input.daysSinceLastAttendance !== null && input.daysSinceLastAttendance >= 60) {
    return "inactive_60_days";
  }

  if (input.daysSinceLastAttendance !== null && input.daysSinceLastAttendance >= 30) {
    return "inactive_30_days";
  }

  if (input.absenceStreak >= 4) {
    return "four_plus_absences";
  }

  if (input.absenceStreak === 3) {
    return "three_absences";
  }

  return null;
}

export function getAttendanceRiskLabel(tier: AttendanceRiskTier) {
  switch (tier) {
    case "inactive_60_days":
      return "Sin asistir 60+ dias";
    case "inactive_30_days":
      return "Sin asistir 30+ dias";
    case "four_plus_absences":
      return "4+ faltas seguidas";
    case "three_absences":
      return "3 faltas seguidas";
  }
}
