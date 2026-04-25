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
    maximumFractionDigits: 2,
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
    getCorteSemanallData({ month: selectedMonth || undefined, campusId: selectedCampusId || undefined }),
  ]);

  return (
    <PageShell title="Corte Semanal" subtitle={`Cobros agrupados por semana · ${data.monthLabel}`}>
      <div className="space-y-6">
        <form className="grid gap-3 rounded-md border border-slate-200 p-3 dark:border-slate-700 md:grid-cols-[1fr_1fr_auto]">
          <select
            name="campus"
            defaultValue={selectedCampusId}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-600"
          >
            <option value="">Todos los campus</option>
            {campuses.map((campus) => (
              <option key={campus.id} value={campus.id}>
                {campus.name}
              </option>
            ))}
          </select>
          <input
            type="month"
            name="month"
            defaultValue={data.month}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-600"
          />
          <button type="submit" className="rounded-md bg-portoBlue px-3 py-2 text-sm font-medium text-white hover:bg-portoDark">
            Aplicar
          </button>
        </form>

        <div className="rounded-md border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800">
          <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Total del mes</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900 dark:text-slate-100">{fmt(data.totalCobrado)}</p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {data.paymentCount} pago{data.paymentCount !== 1 ? "s" : ""} · {campuses.find((campus) => campus.id === selectedCampusId)?.name ?? "Todos los campus"}
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-md border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/30">
            <p className="text-xs uppercase tracking-wide text-amber-700 dark:text-amber-300">360Player</p>
            <p className="mt-1 text-xl font-semibold text-slate-900 dark:text-slate-100">{fmt(data.player360Amount)}</p>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
              {data.player360Count} pago{data.player360Count !== 1 ? "s" : ""} incluidos dentro del total semanal del mes
            </p>
          </div>
          <div className="rounded-md border border-sky-200 bg-sky-50 p-4 dark:border-sky-800 dark:bg-sky-950/30">
            <p className="text-xs uppercase tracking-wide text-sky-700 dark:text-sky-300">Regularización histórica</p>
            <p className="mt-1 text-xl font-semibold text-slate-900 dark:text-slate-100">{fmt(data.historicalCatchupAmount)}</p>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
              {data.historicalCatchupCount} pago{data.historicalCatchupCount !== 1 ? "s" : ""} contados por su fecha real de pago
            </p>
          </div>
        </div>

        <WeeklyBar data={data.weeks.map((week) => ({ label: week.label, totalCobrado: week.totalCobrado }))} />

        {data.weeks.every((week) => week.paymentCount === 0) ? (
          <p className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">Sin cobros registrados para este mes.</p>
        ) : (
          <div className="space-y-3">
            {data.weeks.map((week) => (
              <div key={week.weekNum} className="rounded-md border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
                <div className="mb-3 flex items-center justify-between">
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
                    {week.byMethod.map((method) => (
                      <div
                        key={method.method}
                        className="rounded-md border border-slate-100 bg-slate-50 px-3 py-1.5 text-xs dark:bg-slate-800"
                      >
                        <span className="text-slate-500 dark:text-slate-400">{method.methodLabel}:</span>{" "}
                        <span className="font-medium text-slate-900 dark:text-slate-100">{fmt(method.total)}</span>
                      </div>
                    ))}
                  </div>
                )}

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
