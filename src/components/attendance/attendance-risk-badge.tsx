import { getAttendanceRiskLabel } from "@/lib/attendance/risk";
import type { PlayerAttendanceRisk } from "@/lib/queries/attendance";

const RISK_CLASS: Record<NonNullable<PlayerAttendanceRisk["tier"]>, string> = {
  three_absences: "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200",
  four_plus_absences: "border-orange-300 bg-orange-50 text-orange-800 dark:border-orange-800 dark:bg-orange-950/30 dark:text-orange-200",
  inactive_30_days: "border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-200",
  inactive_60_days: "border-red-400 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950/30 dark:text-red-200",
};

function formatDate(value: string | null) {
  if (!value) return "sin asistencia positiva registrada";
  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
}

export function AttendanceRiskBadge({ risk, compact = false }: { risk: PlayerAttendanceRisk | null; compact?: boolean }) {
  if (!risk?.tier) return null;

  const label = getAttendanceRiskLabel(risk.tier);
  const title = [
    label,
    `${risk.absenceStreak} faltas confirmadas consecutivas.`,
    risk.daysSinceLastAttendance == null ? null : `${risk.daysSinceLastAttendance} dias desde la ultima asistencia positiva.`,
    `Ultima asistencia positiva: ${formatDate(risk.lastAttendanceDate)}.`,
    "No cuenta registros faltantes, lesiones ni justificadas como falta.",
  ].filter(Boolean).join(" ");

  return (
    <span
      title={title}
      aria-label={title}
      className={`inline-flex items-center justify-center rounded-full border font-semibold leading-none ${RISK_CLASS[risk.tier]} ${
        compact ? "min-h-5 px-2 py-0.5 text-[10px]" : "min-h-6 px-2.5 py-1 text-xs"
      }`}
    >
      {label}
    </span>
  );
}
