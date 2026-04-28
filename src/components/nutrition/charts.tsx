"use client";

import { useState } from "react";
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { NutritionActivityPoint } from "@/lib/queries/nutrition";
import type { GrowthClassificationTone, GrowthIndicator, GrowthProfile } from "@/lib/nutrition/growth";

type MeasurementActivityBarProps = {
  data: NutritionActivityPoint[];
};

type MeasurementTrendChartProps = {
  data: Array<{ label: string; weightKg: number; heightCm: number }>;
};

type WaistTrendChartProps = {
  data: Array<{ label: string; waistCircumferenceCm: number | null }>;
};

type OMSGrowthChartProps = {
  profile: GrowthProfile;
};

type CompactOMSGrowthChartProps = {
  profile: GrowthProfile;
  height?: number;
};

const GROWTH_TABS: Array<{ indicator: GrowthIndicator; label: string }> = [
  { indicator: "bmi_for_age", label: "IMC" },
  { indicator: "weight_for_age", label: "Peso" },
  { indicator: "height_for_age", label: "Estatura" },
];

const CLASSIFICATION_CLASSES: Record<GrowthClassificationTone, string> = {
  normal: "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  warning: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300",
  danger: "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-300",
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

export function WaistTrendChart({ data }: WaistTrendChartProps) {
  const hasData = data.some((point) => point.waistCircumferenceCm != null);

  return (
    <article className="rounded-md border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <p className="mb-3 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Tendencia de cintura</p>
      {!hasData ? (
        <p className="mt-6 text-center text-sm text-slate-400">Aun no hay circunferencias registradas.</p>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} width={40} />
            <Tooltip
              contentStyle={{ fontSize: 12 }}
              formatter={(value) => [typeof value === "number" ? `${value.toFixed(1)} cm` : "-", "Cintura"]}
            />
            <Line type="monotone" dataKey="waistCircumferenceCm" name="Cintura (cm)" stroke="#be123c" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      )}
    </article>
  );
}

export function OMSGrowthChart({ profile }: OMSGrowthChartProps) {
  const [selectedIndicator, setSelectedIndicator] = useState<GrowthIndicator>("bmi_for_age");
  const selected = profile.indicators.find((indicator) => indicator.indicator === selectedIndicator) ?? profile.indicators[0];
  const chartData =
    selected?.chartPoints.map((point) => ({
      ...point,
      p3Base: point.p3,
      p3ToP15: point.p15 - point.p3,
      p15ToP85: point.p85 - point.p15,
      p85ToP97: point.p97 - point.p85,
    })) ?? [];

  return (
    <article className="rounded-md border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Curvas OMS</p>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Referencia OMS por edad y sexo. Peso para la edad solo aplica de 5 a 10 anos.
          </p>
        </div>
        <span className="rounded-full border border-slate-200 px-2 py-1 text-xs text-slate-600 dark:border-slate-700 dark:text-slate-300">
          {profile.sex === "M" ? "Varonil" : profile.sex === "F" ? "Femenil" : "Sin genero"}
        </span>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {GROWTH_TABS.map((tab) => {
          const active = tab.indicator === selectedIndicator;
          return (
            <button
              key={tab.indicator}
              type="button"
              onClick={() => setSelectedIndicator(tab.indicator)}
              className={`rounded-full border px-3 py-1.5 text-sm font-medium ${
                active
                  ? "border-portoBlue bg-blue-50 text-portoBlue dark:bg-blue-950/40"
                  : "border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {!selected?.available ? (
        <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-400">
          {selected?.unavailableReason ?? "No hay datos suficientes para mostrar esta curva."}
        </div>
      ) : (
        <>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/50">
              <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Ultimo valor</p>
              <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">
                {selected.latest ? `${selected.latest.value.toFixed(1)} ${selected.unit}` : "-"}
              </p>
            </div>
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/50">
              <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Percentil / Z</p>
              <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">
                {selected.latest ? `P${selected.latest.percentile} | ${selected.latest.zScore > 0 ? "+" : ""}${selected.latest.zScore}` : "-"}
              </p>
            </div>
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/50">
              <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Clasificacion</p>
              {selected.latest?.classification ? (
                <span className={`mt-2 inline-flex rounded-full border px-2 py-1 text-xs font-medium ${CLASSIFICATION_CLASSES[selected.latest.classification.tone]}`}>
                  {selected.latest.classification.label}
                </span>
              ) : (
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Solo referencia de crecimiento.</p>
              )}
            </div>
          </div>

          <div className="mt-4">
            <ResponsiveContainer width="100%" height={360}>
              <ComposedChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis
                  dataKey="ageYears"
                  type="number"
                  domain={["dataMin", "dataMax"]}
                  tick={{ fontSize: 11, fill: "#64748b" }}
                  axisLine={false}
                  tickLine={false}
                  label={{ value: "Edad (anos)", position: "insideBottom", offset: -4, fontSize: 11, fill: "#64748b" }}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "#64748b" }}
                  axisLine={false}
                  tickLine={false}
                  width={44}
                  label={{ value: selected.unit, angle: -90, position: "insideLeft", fontSize: 11, fill: "#64748b" }}
                />
                <Tooltip
                  contentStyle={{ fontSize: 12 }}
                  formatter={(value, name) => {
                    const labelMap: Record<string, string> = {
                      p3: "P3",
                      p15: "P15",
                      p50: "P50",
                      p85: "P85",
                      p97: "P97",
                      playerValue: "Jugador",
                    };
                    return [typeof value === "number" ? value.toFixed(1) : value, labelMap[String(name)] ?? String(name)];
                  }}
                  labelFormatter={(value) => `Edad: ${value} anos`}
                />
                <Legend />
                <Area stackId="band" dataKey="p3Base" stroke="none" fill="transparent" name="Base" legendType="none" />
                <Area stackId="band" dataKey="p3ToP15" stroke="none" fill="#fecaca" fillOpacity={0.35} name="P3-P15" />
                <Area stackId="band" dataKey="p15ToP85" stroke="none" fill="#99f6e4" fillOpacity={0.3} name="P15-P85" />
                <Area stackId="band" dataKey="p85ToP97" stroke="none" fill="#fde68a" fillOpacity={0.35} name="P85-P97" />
                <Line type="monotone" dataKey="p3" name="P3" stroke="#A32D2D" strokeDasharray="3 3" dot={false} strokeWidth={1.2} />
                <Line type="monotone" dataKey="p15" name="P15" stroke="#993C1D" strokeDasharray="4 3" dot={false} strokeWidth={1.2} />
                <Line type="monotone" dataKey="p50" name="P50" stroke="#0F6E56" dot={false} strokeWidth={2} />
                <Line type="monotone" dataKey="p85" name="P85" stroke="#854F0B" strokeDasharray="4 3" dot={false} strokeWidth={1.2} />
                <Line type="monotone" dataKey="p97" name="P97" stroke="#A32D2D" strokeDasharray="3 3" dot={false} strokeWidth={1.2} />
                <Line
                  type="monotone"
                  dataKey="playerValue"
                  name="Jugador"
                  stroke="#185FA5"
                  strokeWidth={2.5}
                  dot={{ r: 5, fill: "#185FA5", stroke: "#ffffff", strokeWidth: 2 }}
                  activeDot={{ r: 6 }}
                  connectNulls
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </article>
  );
}

export function CompactOMSGrowthCharts({ profile, height = 150 }: CompactOMSGrowthChartProps) {
  return (
    <div className="grid gap-2 md:grid-cols-3 print:grid-cols-3">
      {GROWTH_TABS.map((tab) => {
        const selected = profile.indicators.find((indicator) => indicator.indicator === tab.indicator);
        const chartData =
          selected?.chartPoints.map((point) => ({
            ...point,
            p3Base: point.p3,
            p3ToP15: point.p15 - point.p3,
            p15ToP85: point.p85 - point.p15,
            p85ToP97: point.p97 - point.p85,
          })) ?? [];

        return (
          <div key={tab.indicator} className="rounded-md border border-slate-200 bg-white p-2">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">OMS {tab.label}</p>
                <p className="text-[10px] text-slate-500">{selected?.unit ?? ""}</p>
              </div>
              <p className="text-right text-[10px] font-medium text-slate-700">
                {selected?.latest ? `P${selected.latest.percentile} / Z ${selected.latest.zScore}` : "Sin dato"}
              </p>
            </div>
            {!selected?.available ? (
              <div className="mt-2 flex items-center justify-center text-center text-[10px] text-slate-500" style={{ height }}>
                {selected?.unavailableReason ?? "No hay datos suficientes."}
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={height}>
                <ComposedChart data={chartData} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="ageYears" type="number" domain={["dataMin", "dataMax"]} tick={{ fontSize: 8, fill: "#64748b" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 8, fill: "#64748b" }} axisLine={false} tickLine={false} width={28} />
                  <Area stackId="band" dataKey="p3Base" stroke="none" fill="transparent" />
                  <Area stackId="band" dataKey="p3ToP15" stroke="none" fill="#fecaca" fillOpacity={0.3} />
                  <Area stackId="band" dataKey="p15ToP85" stroke="none" fill="#99f6e4" fillOpacity={0.26} />
                  <Area stackId="band" dataKey="p85ToP97" stroke="none" fill="#fde68a" fillOpacity={0.3} />
                  <Line type="monotone" dataKey="p3" stroke="#A32D2D" strokeDasharray="3 3" dot={false} strokeWidth={0.8} />
                  <Line type="monotone" dataKey="p50" stroke="#0F6E56" dot={false} strokeWidth={1.4} />
                  <Line type="monotone" dataKey="p97" stroke="#A32D2D" strokeDasharray="3 3" dot={false} strokeWidth={0.8} />
                  <Line
                    type="monotone"
                    dataKey="playerValue"
                    stroke="#185FA5"
                    strokeWidth={2}
                    dot={{ r: 3, fill: "#185FA5", stroke: "#ffffff", strokeWidth: 1 }}
                    connectNulls
                  />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>
        );
      })}
    </div>
  );
}
