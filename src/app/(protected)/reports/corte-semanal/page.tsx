import Link from "next/link";
import { PageShell } from "@/components/ui/page-shell";
import { requireDirectorContext } from "@/lib/auth/permissions";
import { listCampuses } from "@/lib/queries/players";
import { getCorteSemanallData } from "@/lib/queries/reports";
import { WeeklyBar } from "@/components/dashboard/charts";

function fmt(value: number) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 2
  }).format(value);
}

type SearchParams = Promise<{ month?: string; campus?: string }>;

export default async function CorteSemanalPage({ searchParams }: { searchParams: SearchParams }) {
  await requireDirectorContext("/unauthorized");
  const params = await searchParams;
  const selectedCampusId = params.campus ?? "";
  const selectedMonth = params.month ?? "";

  const [campuses, data] = await Promise.all([
    listCampuses(),
    getCorteSemanallData({ month: selectedMonth || undefined, campusId: selectedCampusId || undefined })
  ]);

  return (
    <PageShell
      title="Corte Semanal"
      subtitle={`Cobros agrupados por semana · ${data.monthLabel}`}
    >
      <div className="space-y-6">
        {/* Filters */}
        <form className="grid gap-3 rounded-md border border-slate-200 dark:border-slate-700 p-3 md:grid-cols-[1fr_1fr_auto]">
          <select
            name="campus"
            defaultValue={selectedCampusId}
            className="rounded-md border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm"
          >
            <option value="">Todos los campus</option>
            {campuses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <input
            type="month"
            name="month"
            defaultValue={data.month}
            className="rounded-md border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            className="rounded-md bg-portoBlue px-3 py-2 text-sm font-medium text-white hover:bg-portoDark"
          >
            Aplicar
          </button>
        </form>

        {/* Total tile */}
        <div className="rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-4">
          <p className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wide">Total del mes</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900 dark:text-slate-100">{fmt(data.totalCobrado)}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {data.weeks.reduce((s, w) => s + w.paymentCount, 0)} pagos ·{" "}
            {campuses.find((c) => c.id === selectedCampusId)?.name ?? "Todos los campus"}
          </p>
        </div>

        {/* Weekly bar chart */}
        <WeeklyBar
          data={data.weeks.map((w) => ({ label: w.label, totalCobrado: w.totalCobrado }))}
        />

        {/* Week-by-week breakdown */}
        {data.weeks.every((w) => w.paymentCount === 0) ? (
          <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-6">
            Sin cobros registrados para este mes.
          </p>
        ) : (
          <div className="space-y-3">
            {data.weeks.map((week) => (
              <div key={week.weekNum} className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="font-medium text-slate-900 dark:text-slate-100">Semana {week.weekNum}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{week.label}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">{fmt(week.totalCobrado)}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {week.paymentCount} pago{week.paymentCount !== 1 ? "s" : ""}
                    </p>
                  </div>
                </div>

                {week.paymentCount === 0 ? (
                  <p className="text-xs text-slate-400">Sin cobros esta semana.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {week.byMethod.map((m) => (
                      <div
                        key={m.method}
                        className="rounded-md bg-slate-50 dark:bg-slate-800 border border-slate-100 px-3 py-1.5 text-xs"
                      >
                        <span className="text-slate-500 dark:text-slate-400">{m.methodLabel}:</span>{" "}
                        <span className="font-medium text-slate-900 dark:text-slate-100">{fmt(m.total)}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Link to corte diario for the first day of this week */}
                <Link
                  href={`/reports/corte-diario?date=${data.month}-${String(week.startDay).padStart(2, "0")}${selectedCampusId ? `&campus=${selectedCampusId}` : ""}`}
                  className="mt-3 inline-block text-xs text-portoBlue hover:underline"
                >
                  Ver día {week.startDay} →
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>
    </PageShell>
  );
}
