import Link from "next/link";
import { PageShell } from "@/components/ui/page-shell";
import { requireDirectorContext } from "@/lib/auth/permissions";
import { listCampuses } from "@/lib/queries/players";
import { getResumenMensualData } from "@/lib/queries/reports";
import { MONTH_NAMES_ES } from "@/lib/billing/generate-monthly-charges";

function fmt(value: number) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 2,
  }).format(value);
}

function monthLabel(month: string) {
  const [yearStr, monthStr] = month.split("-");
  const monthIndex = parseInt(monthStr, 10) - 1;
  return `${MONTH_NAMES_ES[monthIndex]} ${yearStr}`;
}

type SearchParams = Promise<{ month?: string; campus?: string }>;

export default async function ResumenMensualPage({ searchParams }: { searchParams: SearchParams }) {
  await requireDirectorContext("/unauthorized");
  const params = await searchParams;
  const selectedMonth = params.month ?? "";
  const selectedCampusId = params.campus ?? "";

  const [campuses, data] = await Promise.all([
    listCampuses(),
    getResumenMensualData({ month: selectedMonth || undefined, campusId: selectedCampusId || undefined }),
  ]);

  const balanceNet = data.totalCobrado - data.totalCargosEmitidos;

  return (
    <PageShell title="Resumen Mensual" subtitle="Resumen financiero operativo por mes">
      <div className="space-y-6">
        <form className="grid gap-3 rounded-md border border-slate-200 p-3 dark:border-slate-700 md:grid-cols-[1fr_1fr_auto_auto]">
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
          <Link
            href="/reports/resumen-mensual"
            className="rounded-md border border-slate-300 px-3 py-2 text-center text-sm hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800"
          >
            Este mes
          </Link>
        </form>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-md border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800">
            <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Inscripciones activas</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900 dark:text-slate-100">{data.activeEnrollments.toLocaleString("es-MX")}</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Al momento de la consulta</p>
          </div>
          <div className="rounded-md border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800">
            <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Cargos emitidos</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900 dark:text-slate-100">{fmt(data.totalCargosEmitidos)}</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Mensualidades por periodo y cargos operativos del mes</p>
          </div>
          <div className="rounded-md border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800">
            <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Total cobrado</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900 dark:text-slate-100">{fmt(data.totalCobrado)}</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {data.paymentCount} pago{data.paymentCount !== 1 ? "s" : ""} registrados en el mes
            </p>
          </div>
          <div className="rounded-md border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800">
            <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Saldo pendiente</p>
            <p className={`mt-1 text-2xl font-semibold ${data.pendingBalance > 0 ? "text-rose-600" : "text-emerald-600"}`}>
              {fmt(data.pendingBalance)}
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Inscripciones activas con saldo positivo</p>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-md border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/30">
            <p className="text-xs uppercase tracking-wide text-amber-700 dark:text-amber-300">360Player</p>
            <p className="mt-1 text-xl font-semibold text-slate-900 dark:text-slate-100">{fmt(data.player360Amount)}</p>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
              {data.player360Count} pago{data.player360Count !== 1 ? "s" : ""} incluidos dentro del total cobrado del mes
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

        <div className="flex items-center gap-3 rounded-md border border-slate-200 p-3 dark:border-slate-700">
          <span className="text-sm text-slate-600 dark:text-slate-400">Diferencia cobrado - cargos ({monthLabel(data.month)}):</span>
          <span className={`text-sm font-semibold ${balanceNet >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{fmt(balanceNet)}</span>
          {balanceNet < 0 && <span className="text-xs text-slate-400">(saldo sin cobrar del periodo)</span>}
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <div>
            <h3 className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-300">Cargos por tipo</h3>
            {data.chargesByType.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">Sin cargos en el periodo.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:text-slate-400">
                    <th className="px-3 py-2">Tipo</th>
                    <th className="px-3 py-2 text-right">Cant.</th>
                    <th className="px-3 py-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.chargesByType.map((row) => (
                    <tr key={row.typeCode} className="hover:bg-slate-50 dark:hover:bg-slate-800">
                      <td className="px-3 py-2">{row.typeName}</td>
                      <td className="px-3 py-2 text-right text-slate-500 dark:text-slate-400">{row.count}</td>
                      <td className="px-3 py-2 text-right font-medium">{fmt(row.total)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-300 font-semibold dark:border-slate-600">
                    <td className="px-3 py-2">Total</td>
                    <td className="px-3 py-2 text-right">{data.chargesByType.reduce((sum, row) => sum + row.count, 0)}</td>
                    <td className="px-3 py-2 text-right">{fmt(data.totalCargosEmitidos)}</td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>

          <div>
            <h3 className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-300">Cobros por método</h3>
            {data.paymentsByMethod.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">Sin cobros en el periodo.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:text-slate-400">
                    <th className="px-3 py-2">Método</th>
                    <th className="px-3 py-2 text-right">Cant.</th>
                    <th className="px-3 py-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.paymentsByMethod.map((row) => (
                    <tr key={row.method} className="hover:bg-slate-50 dark:hover:bg-slate-800">
                      <td className="px-3 py-2">{row.methodLabel}</td>
                      <td className="px-3 py-2 text-right text-slate-500 dark:text-slate-400">{row.count}</td>
                      <td className="px-3 py-2 text-right font-medium">{fmt(row.total)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-300 font-semibold dark:border-slate-600">
                    <td className="px-3 py-2">Total</td>
                    <td className="px-3 py-2 text-right">{data.paymentsByMethod.reduce((sum, row) => sum + row.count, 0)}</td>
                    <td className="px-3 py-2 text-right">{fmt(data.totalCobrado)}</td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
        </div>
      </div>
    </PageShell>
  );
}
