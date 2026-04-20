"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { NutritionActivityPoint } from "@/lib/queries/nutrition";

type MeasurementActivityBarProps = {
  data: NutritionActivityPoint[];
};

type MeasurementTrendChartProps = {
  data: Array<{ label: string; weightKg: number; heightCm: number }>;
};

export function MeasurementActivityBar({ data }: MeasurementActivityBarProps) {
  if (data.length === 0) {
    return (
      <article className="rounded-md border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Actividad de mediciones</p>
        <p className="mt-6 text-center text-sm text-slate-400">Sin sesiones registradas.</p>
      </article>
    );
  }

  return (
    <article className="rounded-md border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <p className="mb-3 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Actividad de mediciones</p>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
          <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} width={36} />
          <Tooltip formatter={(value) => [`${value} sesiones`, "Mediciones"]} contentStyle={{ fontSize: 12 }} cursor={{ fill: "#f1f5f9" }} />
          <Bar dataKey="total" fill="#0f766e" radius={[4, 4, 0, 0]} maxBarSize={56} />
        </BarChart>
      </ResponsiveContainer>
    </article>
  );
}

export function MeasurementTrendChart({ data }: MeasurementTrendChartProps) {
  if (data.length === 0) {
    return (
      <article className="rounded-md border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Tendencia corporal</p>
        <p className="mt-6 text-center text-sm text-slate-400">Aun no hay mediciones para graficar.</p>
      </article>
    );
  }

  return (
    <article className="rounded-md border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <p className="mb-3 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Tendencia corporal</p>
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
          <YAxis yAxisId="weight" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} width={40} />
          <YAxis yAxisId="height" orientation="right" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} width={40} />
          <Tooltip contentStyle={{ fontSize: 12 }} />
          <Legend />
          <Line yAxisId="weight" type="monotone" dataKey="weightKg" name="Peso (kg)" stroke="#0f766e" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
          <Line yAxisId="height" type="monotone" dataKey="heightCm" name="Estatura (cm)" stroke="#1d4ed8" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
        </LineChart>
      </ResponsiveContainer>
    </article>
  );
}
