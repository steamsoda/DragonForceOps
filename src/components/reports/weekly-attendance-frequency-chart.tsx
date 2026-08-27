"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { WeeklyAttendanceFrequencySummary } from "@/lib/queries/weekly-attendance-frequency-report";

const SERIES = [
  { key: "zero", label: "0 sesiones", color: "#e11d48" },
  { key: "one", label: "1 sesion", color: "#f59e0b" },
  { key: "two", label: "2 sesiones", color: "#2563eb" },
  { key: "three", label: "3 veces", color: "#059669" },
] as const;

function shortDate(value: string) {
  const [, month, day] = value.split("-");
  return `${day}/${month}`;
}

export function WeeklyAttendanceFrequencyChart({ weeks }: { weeks: WeeklyAttendanceFrequencySummary[] }) {
  const data = weeks.map((week) => {
    const total = week.playerWeeks;
    return {
      label: week.weekStart && week.weekEnd ? `${shortDate(week.weekStart)}-${shortDate(week.weekEnd)}` : week.label,
      ...Object.fromEntries(SERIES.map((series) => [series.key, total > 0 ? Math.round((week.buckets[series.key] / total) * 1000) / 10 : 0])),
    };
  });

  return (
    <section className="rounded-md border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <h2 className="text-base font-semibold">Frecuencia por semana</h2>
      <p className="text-xs text-slate-500">Porcentaje del plantel semanal que no asistio o asistio una, dos o tres veces.</p>
      {data.length > 0 ? (
        <div className="mt-4 h-[360px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 12, left: -12, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis domain={[0, 100]} tickFormatter={(value) => `${value}%`} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(value) => [`${value}%`, ""]} contentStyle={{ fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {SERIES.map((series) => <Bar key={series.key} dataKey={series.key} name={series.label} stackId="frequency" fill={series.color} />)}
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : <p className="py-12 text-center text-sm text-slate-500">Sin semanas completas con asistencia registrada.</p>}
    </section>
  );
}
