"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { CoachTuitionSummary } from "@/lib/queries/coach-tuition-report";

const COLORS = ["#10b981", "#f43f5e"];

function CollectionDonut({ title, paid, notPaid }: { title: string; paid: number; notPaid: number }) {
  const total = paid + notPaid;
  const data = [
    { name: "Pagada", value: paid },
    { name: "Pendiente / sin cargo", value: notPaid },
  ].filter((row) => row.value > 0);

  return (
    <article className="rounded-md border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
      <p className="text-xs text-slate-500">Jugadores que deben pagar: {total}</p>
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
      ) : <p className="mt-8 text-center text-sm text-slate-500">Sin mensualidades esperadas para este alcance.</p>}
    </article>
  );
}

export function CoachTuitionCharts({ paid, notPaid, selectedCoach, coachSummaries }: { paid: number; notPaid: number; selectedCoach: CoachTuitionSummary | null; coachSummaries: CoachTuitionSummary[] }) {
  const ranking = coachSummaries.filter((coach) => coach.collectionRate != null).map((coach) => {
    const collection = coach.collectionRate ?? 0;
    return { coach: coach.coachName, collection, pending: 100 - collection };
  });

  return (
    <section className="grid gap-4 print:hidden xl:grid-cols-2">
      <CollectionDonut title="Cobranza del alcance seleccionado" paid={paid} notPaid={notPaid} />
      {selectedCoach ? (
        <CollectionDonut title={`Coach: ${selectedCoach.coachName}`} paid={selectedCoach.paidCount} notPaid={selectedCoach.pendingCount + selectedCoach.missingCount} />
      ) : (
        <article className="rounded-md border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Comparativo por coach</h2>
          <p className="text-xs text-slate-500">Porcentaje de jugadores con mensualidad completamente pagada.</p>
          {ranking.length > 0 ? (
            <div className="mt-4 max-h-[620px] space-y-4 overflow-y-auto pr-1">
              {ranking.map((coach) => (
                <div key={coach.coach} className="space-y-1.5">
                  <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs">
                    <strong>{coach.coach}</strong>
                    <div className="flex gap-3 font-semibold"><span className="text-emerald-700">Pagada {coach.collection}%</span><span className="text-rose-700">Pendiente {coach.pending}%</span></div>
                  </div>
                  <div className="flex h-5 overflow-hidden rounded-sm bg-slate-100 dark:bg-slate-800" aria-label={`${coach.coach}: ${coach.collection}% pagada, ${coach.pending}% pendiente`}>
                    <div className="bg-emerald-500" style={{ width: `${coach.collection}%` }} />
                    <div className="bg-rose-500" style={{ width: `${coach.pending}%` }} />
                  </div>
                </div>
              ))}
            </div>
          ) : <p className="mt-8 text-center text-sm text-slate-500">Sin mensualidades esperadas para comparar.</p>}
        </article>
      )}
    </section>
  );
}
