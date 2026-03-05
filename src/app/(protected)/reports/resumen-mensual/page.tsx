import Link from "next/link";
import { PageShell } from "@/components/ui/page-shell";
import { listCampuses } from "@/lib/queries/players";
import { getResumenMensualData } from "@/lib/queries/reports";
import { MONTH_NAMES_ES } from "@/lib/billing/generate-monthly-charges";

function fmt(value: number) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 2
  }).format(value);
}

function monthLabel(month: string) {
  const [yearStr, monthStr] = month.split("-");
  const monthIndex = parseInt(monthStr, 10) - 1;
  return `${MONTH_NAMES_ES[monthIndex]} ${yearStr}`;
}

type SearchParams = Promise<{ month?: string; campus?: string }>;

export default async function ResumenMensualPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const selectedMonth = params.month ?? "";
  const selectedCampusId = params.campus ?? "";

  const [campuses, data] = await Promise.all([
    listCampuses(),
    getResumenMensualData({ month: selectedMonth || undefined, campusId: selectedCampusId || undefined })
  ]);

  const balanceNet = data.totalCobrado - data.totalCargosEmitidos;

  return (
    <PageShell title="Resumen Mensual" subtitle="Resumen financiero operativo por mes">
      <div className="space-y-6">
        {/* Filters */}
        <form className="grid gap-3 rounded-md border border-slate-200 p-3 md:grid-cols-[1fr_1fr_auto_auto]">
          <select
            name="campus"
            defaultValue={selectedCampusId}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
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
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            className="rounded-md bg-portoBlue px-3 py-2 text-sm font-medium text-white hover:bg-portoDark"
          >
            Aplicar
          </button>
          <Link
            href="/reports/resumen-mensual"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50 text-center"
          >
            Este mes
          </Link>
        </form>

        {/* KPI tiles */}
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs text-slate-500 uppercase tracking-wide">Inscripciones activas</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">{data.activeEnrollments.toLocaleString("es-MX")}</p>
            <p className="text-xs text-slate-500 mt-1">Al momento de la consulta</p>
          </div>
          <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs text-slate-500 uppercase tracking-wide">Cargos emitidos</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">{fmt(data.totalCargosEmitidos)}</p>
            <p className="text-xs text-slate-500 mt-1">No anulados, creados en el mes</p>
          </div>
          <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs text-slate-500 uppercase tracking-wide">Total cobrado</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">{fmt(data.totalCobrado)}</p>
            <p className="text-xs text-slate-500 mt-1">Pagos registrados en el mes</p>
          </div>
          <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs text-slate-500 uppercase tracking-wide">Saldo pendiente</p>
            <p className={`mt-1 text-2xl font-semibold ${data.pendingBalance > 0 ? "text-rose-600" : "text-emerald-600"}`}>
              {fmt(data.pendingBalance)}
            </p>
            <p className="text-xs text-slate-500 mt-1">Inscripciones activas con saldo positivo</p>
          </div>
        </div>

        {/* Net balance note */}
        <div className="rounded-md border border-slate-200 p-3 flex items-center gap-3">
          <span className="text-sm text-slate-600">
            Diferencia cobrado – cargos ({monthLabel(data.month)}):
          </span>
          <span className={`text-sm font-semibold ${balanceNet >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
            {fmt(balanceNet)}
          </span>
          {balanceNet < 0 && (
            <span className="text-xs text-slate-400">
              (saldo sin cobrar del periodo)
            </span>
          )}
        </div>

        {/* Two tables side by side */}
        <div className="grid gap-6 md:grid-cols-2">
          {/* Charges by type */}
          <div>
            <h3 className="text-sm font-medium text-slate-700 mb-2">Cargos por tipo</h3>
            {data.chargesByType.length === 0 ? (
              <p className="text-xs text-slate-500">Sin cargos en el periodo.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs text-slate-500 uppercase tracking-wide">
                    <th className="px-3 py-2">Tipo</th>
                    <th className="px-3 py-2 text-right">Cant.</th>
                    <th className="px-3 py-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.chargesByType.map((row) => (
                    <tr key={row.typeCode} className="hover:bg-slate-50">
                      <td className="px-3 py-2">{row.typeName}</td>
                      <td className="px-3 py-2 text-right text-slate-500">{row.count}</td>
                      <td className="px-3 py-2 text-right font-medium">{fmt(row.total)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-300 font-semibold">
                    <td className="px-3 py-2">Total</td>
                    <td className="px-3 py-2 text-right">
                      {data.chargesByType.reduce((s, r) => s + r.count, 0)}
                    </td>
                    <td className="px-3 py-2 text-right">{fmt(data.totalCargosEmitidos)}</td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>

          {/* Payments by method */}
          <div>
            <h3 className="text-sm font-medium text-slate-700 mb-2">Cobros por método</h3>
            {data.paymentsByMethod.length === 0 ? (
              <p className="text-xs text-slate-500">Sin cobros en el periodo.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs text-slate-500 uppercase tracking-wide">
                    <th className="px-3 py-2">Método</th>
                    <th className="px-3 py-2 text-right">Cant.</th>
                    <th className="px-3 py-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.paymentsByMethod.map((row) => (
                    <tr key={row.method} className="hover:bg-slate-50">
                      <td className="px-3 py-2">{row.methodLabel}</td>
                      <td className="px-3 py-2 text-right text-slate-500">{row.count}</td>
                      <td className="px-3 py-2 text-right font-medium">{fmt(row.total)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-300 font-semibold">
                    <td className="px-3 py-2">Total</td>
                    <td className="px-3 py-2 text-right">
                      {data.paymentsByMethod.reduce((s, r) => s + r.count, 0)}
                    </td>
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
