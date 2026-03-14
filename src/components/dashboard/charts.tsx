"use client";

import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid
} from "recharts";
import type { PaymentByMethod } from "@/lib/queries/dashboard";

// ── Payment Status Pie ─────────────────────────────────────────────────────────

type PaymentStatusPieProps = {
  upToDate: number;
  withBalance: number;
};

const PIE_COLORS = ["#10b981", "#f59e0b"]; // emerald-500, amber-400

export function PaymentStatusPie({ upToDate, withBalance }: PaymentStatusPieProps) {
  const data = [
    { name: "Al corriente", value: upToDate },
    { name: "Con saldo", value: withBalance }
  ].filter((d) => d.value > 0);

  const total = upToDate + withBalance;

  return (
    <article className="rounded-md border border-slate-200 bg-white p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Estado de pago</p>
      <p className="mt-1 text-xs text-slate-400">Inscripciones activas · {total} total</p>
      <div className="mt-3 flex items-center gap-6">
        <ResponsiveContainer width={160} height={160}>
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={45}
              outerRadius={72}
              dataKey="value"
              strokeWidth={1}
            >
              {data.map((_, i) => (
                <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              formatter={(v) => [`${v} alumnos`, ""]}
              contentStyle={{ fontSize: 12 }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full bg-emerald-500" />
            <span className="text-slate-700">Al corriente</span>
            <span className="ml-auto font-semibold text-slate-900">{upToDate}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full bg-amber-400" />
            <span className="text-slate-700">Con saldo</span>
            <span className="ml-auto font-semibold text-slate-900">{withBalance}</span>
          </div>
          {total > 0 && (
            <p className="text-xs text-slate-400 pt-1">
              {Math.round((upToDate / total) * 100)}% al corriente
            </p>
          )}
        </div>
      </div>
    </article>
  );
}

// ── Payments by Method Bar ─────────────────────────────────────────────────────

type PaymentsByMethodBarProps = {
  data: PaymentByMethod[];
};

function fmtK(value: number) {
  if (value >= 1000) return `$${(value / 1000).toFixed(0)}k`;
  return `$${value}`;
}

export function PaymentsByMethodBar({ data }: PaymentsByMethodBarProps) {
  if (data.length === 0) {
    return (
      <article className="rounded-md border border-slate-200 bg-white p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Cobros por método</p>
        <p className="mt-6 text-center text-sm text-slate-400">Sin cobros este mes.</p>
      </article>
    );
  }

  return (
    <article className="rounded-md border border-slate-200 bg-white p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500 mb-3">Cobros por método</p>
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis
            dataKey="methodLabel"
            tick={{ fontSize: 11, fill: "#64748b" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "#64748b" }}
            tickFormatter={fmtK}
            axisLine={false}
            tickLine={false}
            width={40}
          />
          <Tooltip
            formatter={(v) =>
              new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(Number(v))
            }
            contentStyle={{ fontSize: 12 }}
            cursor={{ fill: "#f1f5f9" }}
          />
          <Bar dataKey="total" fill="#1d4ed8" radius={[4, 4, 0, 0]} maxBarSize={60} />
        </BarChart>
      </ResponsiveContainer>
    </article>
  );
}
