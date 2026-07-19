"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { CoachAttendanceSummary } from "@/lib/queries/coach-attendance-report";

const COLORS = ["#10b981", "#f43f5e"];

function ParticipationDonut({ title, attended, notAttended }: { title: string; attended: number; notAttended: number }) {
  const total = attended + notAttended;
  const data = [
    { name: "Con asistencia", value: attended },
    { name: "Sin asistencia", value: notAttended },
  ].filter((row) => row.value > 0);

  return (
    <article className="rounded-md border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
      <p className="text-xs text-slate-500">Jugadores evaluados: {total}</p>
      {total > 0 ? (
        <div className="mt-3 flex flex-col items-center gap-3 sm:flex-row">
          <ResponsiveContainer width={170} height={170}>
            <PieChart>
              <Pie data={data} dataKey="value" innerRadius={48} outerRadius={76} strokeWidth={1}>
                {data.map((row, index) => <Cell key={row.name} fill={COLORS[index]} />)}
              </Pie>
              <Tooltip formatter={(value) => [`${value} jugadores`, ""]} contentStyle={{ fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
          <div className="min-w-0 flex-1 space-y-2 text-sm">
            {data.map((row, index) => (
              <div key={row.name} className="grid grid-cols-[auto_1fr_auto] items-center gap-2">
                <span className="h-3 w-3 rounded-full" style={{ backgroundColor: COLORS[index] }} />
                <span>{row.name}</span>
                <strong>{row.value} / {Math.round((row.value / total) * 100)}%</strong>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="mt-8 text-center text-sm text-slate-500">Sin sesiones registradas para evaluar.</p>
      )}
    </article>
  );
}

export function CoachAttendanceCharts({
  attended,
  notAttended,
  selectedCoach,
  coachSummaries,
}: {
  attended: number;
  notAttended: number;
  selectedCoach: CoachAttendanceSummary | null;
  coachSummaries: CoachAttendanceSummary[];
}) {
  const ranking = coachSummaries
    .filter((coach) => coach.participationRate != null)
    .map((coach) => ({ coach: coach.coachName, participation: coach.participationRate ?? 0 }));
  const chartHeight = Math.max(230, ranking.length * 38);

  return (
    <section className="grid gap-4 print:hidden xl:grid-cols-2">
      <ParticipationDonut title="Participacion del alcance seleccionado" attended={attended} notAttended={notAttended} />
      {selectedCoach ? (
        <ParticipationDonut title={`Coach: ${selectedCoach.coachName}`} attended={selectedCoach.attendedCount} notAttended={selectedCoach.notAttendedCount} />
      ) : (
        <article className="rounded-md border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Comparativo por coach</h2>
          <p className="text-xs text-slate-500">Porcentaje de jugadores que asistieron al menos una vez.</p>
          {ranking.length > 0 ? (
            <div className="mt-3 overflow-y-auto" style={{ maxHeight: 620 }}>
              <ResponsiveContainer width="100%" height={chartHeight}>
                <BarChart data={ranking} layout="vertical" margin={{ top: 4, right: 24, left: 36, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                  <XAxis type="number" domain={[0, 100]} tickFormatter={(value) => `${value}%`} tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="coach" width={120} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(value) => [`${value}%`, "Participacion"]} contentStyle={{ fontSize: 12 }} />
                  <Bar dataKey="participation" fill="#1455a4" radius={[0, 4, 4, 0]} maxBarSize={22} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="mt-8 text-center text-sm text-slate-500">Sin coaches con sesiones registradas.</p>
          )}
        </article>
      )}
    </section>
  );
}
