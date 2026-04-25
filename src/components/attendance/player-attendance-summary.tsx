import type { AttendancePlayerSummary } from "@/lib/queries/attendance";

const STATUS_META: Record<string, { symbol: string; className: string; label: string }> = {
  present: { symbol: "P", className: "bg-emerald-100 text-emerald-800 border-emerald-300", label: "Presente" },
  absent: { symbol: "A", className: "bg-rose-100 text-rose-800 border-rose-300", label: "Ausente" },
  injury: { symbol: "L", className: "bg-sky-100 text-sky-800 border-sky-300", label: "Lesion" },
  justified: { symbol: "J", className: "bg-slate-100 text-slate-700 border-slate-300", label: "Justificada" },
};

const TYPE_LABELS: Record<string, string> = {
  training: "E",
  match: "P",
  special: "X",
};

export function PlayerAttendanceSummary({ summary }: { summary: AttendancePlayerSummary | null }) {
  if (!summary) return null;

  return (
    <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Asistencia</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {summary.currentMonth.label}: {summary.currentMonth.covered} de {summary.currentMonth.total} sesiones
            {summary.currentMonth.rate != null ? ` (${summary.currentMonth.rate}%)` : " (sin datos)"}
          </p>
        </div>
        <div className="flex gap-2">
          {summary.lastFive.length === 0 ? (
            <span className="text-sm text-slate-500">Sin sesiones registradas</span>
          ) : (
            summary.lastFive.map((item) => {
              const meta = STATUS_META[item.status] ?? STATUS_META.present;
              return (
                <div key={`${item.sessionId}-${item.sessionDate}`} className="text-center">
                  <p className="text-[10px] font-bold text-slate-500">{TYPE_LABELS[item.sessionType] ?? "E"}</p>
                  <span title={meta.label} className={`inline-flex h-8 w-8 items-center justify-center rounded-full border text-xs font-bold ${meta.className}`}>
                    {meta.symbol}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>
      <div className="flex flex-wrap gap-2 text-xs">
        {summary.recentMonths.map((month) => (
          <span key={month.label} className="rounded-full border border-slate-200 px-2 py-1 text-slate-600 dark:border-slate-700 dark:text-slate-300">
            {month.label}: {month.rate == null ? "sin datos" : `${month.rate}%`}
          </span>
        ))}
      </div>
    </section>
  );
}
