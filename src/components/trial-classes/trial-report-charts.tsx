"use client";

import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export function TrialBirthYearChart({ rows }: { rows: Array<{ birthYear: number | null; count: number }> }) {
  const data = rows.map((row) => ({ category: row.birthYear == null ? "Sin YOB" : String(row.birthYear), prospectos: row.count }));

  return (
    <article className="rounded-md border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950">
      <h3 className="font-semibold">Prospectos por categoria</h3>
      <p className="text-xs text-slate-500">Prospectos unicos con al menos una visita en el periodo.</p>
      {data.length > 0 ? (
        <div className="mt-4 h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 22, right: 12, left: -16, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="category" tick={{ fontSize: 12 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
              <Tooltip formatter={(value) => [`${value} prospectos`, "Visitaron"]} contentStyle={{ fontSize: 12 }} />
              <Bar dataKey="prospectos" fill="#1455a4" radius={[3, 3, 0, 0]}>
                <LabelList dataKey="prospectos" position="top" fontSize={12} fontWeight={600} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="py-12 text-center text-sm text-slate-500">Sin visitas en este periodo.</p>
      )}
    </article>
  );
}
