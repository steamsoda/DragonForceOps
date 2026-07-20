"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
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
    .map((coach) => {
      const participation = coach.participationRate ?? 0;
      return { coach: coach.coachName, participation, nonParticipation: 100 - participation };
    });

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
            <div className="mt-4 max-h-[620px] space-y-4 overflow-y-auto pr-1">
              {ranking.map((coach) => (
                <div key={coach.coach} className="space-y-1.5">
                  <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs">
                    <strong className="text-slate-900 dark:text-slate-100">{coach.coach}</strong>
                    <div className="flex gap-3 font-semibold">
                      <span className="text-blue-700 dark:text-blue-300">Con asistencia {coach.participation}%</span>
                      <span className="text-rose-700 dark:text-rose-300">Sin asistencia {coach.nonParticipation}%</span>
                    </div>
                  </div>
                  <div className="flex h-5 w-full overflow-hidden rounded-sm bg-slate-100 dark:bg-slate-800" aria-label={`${coach.coach}: ${coach.participation}% con asistencia, ${coach.nonParticipation}% sin asistencia`}>
                    <div className="bg-blue-600" style={{ width: `${coach.participation}%` }} title={`Con asistencia ${coach.participation}%`} />
                    <div className="bg-rose-500" style={{ width: `${coach.nonParticipation}%` }} title={`Sin asistencia ${coach.nonParticipation}%`} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-8 text-center text-sm text-slate-500">Sin coaches con sesiones registradas.</p>
          )}
        </article>
      )}
    </section>
  );
}
