import type { RecentPlayerAttendanceItem } from "@/lib/queries/attendance";

const ATTENDANCE_META: Record<RecentPlayerAttendanceItem["status"], { label: string; symbol: string; className: string }> = {
  present: {
    label: "A Asistio",
    symbol: "A",
    className: "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200",
  },
  absent: {
    label: "F Falta",
    symbol: "F",
    className: "border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-200",
  },
  injury: {
    label: "Lesion",
    symbol: "+",
    className: "border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-800 dark:bg-sky-950/30 dark:text-sky-200",
  },
  justified: {
    label: "Justificada",
    symbol: "J",
    className: "border-slate-300 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200",
  },
};

const ATTENDANCE_TYPE_LABELS: Record<string, string> = {
  training: "Entrenamiento",
  match: "Partido",
  special: "Especial",
};

function formatAttendanceDate(value: string) {
  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}/${month}` : value;
}

export function RecentAttendanceChips({ items, align = "center" }: { items: RecentPlayerAttendanceItem[]; align?: "start" | "center" }) {
  if (items.length === 0) {
    return <span className="text-xs text-slate-400 dark:text-slate-500">Sin registros</span>;
  }

  return (
    <div className={`flex min-w-32 flex-wrap gap-1 ${align === "start" ? "justify-start" : "justify-center"}`}>
      {items.map((item) => {
        const meta = ATTENDANCE_META[item.status] ?? ATTENDANCE_META.present;
        const title = `${formatAttendanceDate(item.sessionDate)} | ${ATTENDANCE_TYPE_LABELS[item.sessionType] ?? item.sessionType} | ${meta.label}`;
        return (
          <span
            key={`${item.sessionId}-${item.status}`}
            title={title}
            aria-label={title}
            className={`inline-flex h-6 min-w-6 items-center justify-center rounded-full border px-1.5 text-[10px] font-bold leading-none ${meta.className}`}
          >
            {meta.symbol}
          </span>
        );
      })}
    </div>
  );
}
