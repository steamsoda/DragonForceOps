import Link from "next/link";
import { PageShell } from "@/components/ui/page-shell";
import { listCampuses } from "@/lib/queries/players";
import { getCorteDiarioData } from "@/lib/queries/reports";

function fmt(value: number) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 2
  }).format(value);
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("es-MX", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC"
  });
}

type SearchParams = Promise<{ date?: string; campus?: string }>;

export default async function CorteDiarioPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const selectedDate = params.date ?? "";
  const selectedCampusId = params.campus ?? "";

  const [campuses, data] = await Promise.all([
    listCampuses(),
    getCorteDiarioData({ date: selectedDate || undefined, campusId: selectedCampusId || undefined })
  ]);

  return (
    <PageShell title="Corte Diario" subtitle="Cobros registrados por fecha y campus">
      <div className="space-y-6">
        {/* Filters */}
        <form className="grid gap-3 rounded-md border border-slate-200 dark:border-slate-700 p-3 md:grid-cols-[1fr_1fr_auto_auto]">
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
            type="date"
            name="date"
            defaultValue={data.date}
            className="rounded-md border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            className="rounded-md bg-portoBlue px-3 py-2 text-sm font-medium text-white hover:bg-portoDark"
          >
            Aplicar
          </button>
          <Link
            href="/reports/corte-diario"
            className="rounded-md border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-800 text-center"
          >
            Hoy
          </Link>
        </form>

        {/* Summary tiles */}
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-4">
            <p className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wide">Total cobrado</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900 dark:text-slate-100">{fmt(data.totalCobrado)}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{data.payments.length} pago{data.payments.length !== 1 ? "s" : ""}</p>
          </div>
          {data.byMethod.map((m) => (
            <div key={m.method} className="rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-4">
              <p className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wide">{m.methodLabel}</p>
              <p className="mt-1 text-2xl font-semibold text-slate-900 dark:text-slate-100">{fmt(m.total)}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{m.count} pago{m.count !== 1 ? "s" : ""}</p>
            </div>
          ))}
        </div>

        {/* Charge-type breakdown */}
        {data.byChargeType.length > 0 && (
          <div className="rounded-md border border-slate-200 dark:border-slate-700 p-4">
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3 uppercase tracking-wide">Por tipo de cargo</h2>
            <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
              {data.byChargeType.map((ct) => (
                <div key={ct.typeCode} className="flex items-center justify-between rounded-md bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm">
                  <span className="text-slate-600 dark:text-slate-400">{ct.typeName}</span>
                  <span className="font-medium text-slate-900 dark:text-slate-100">{fmt(ct.total)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Payments table */}
        {data.payments.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-6">Sin cobros registrados para esta fecha.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700 text-left text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                  <th className="px-3 py-2">Hora (UTC)</th>
                  <th className="px-3 py-2">Jugador</th>
                  <th className="px-3 py-2">Método</th>
                  <th className="px-3 py-2 text-right">Monto</th>
                  <th className="px-3 py-2">Notas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.payments.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-800">
                    <td className="px-3 py-2 text-slate-500 dark:text-slate-400">{fmtTime(p.paidAt)}</td>
                    <td className="px-3 py-2">
                      <Link href={`/enrollments/${p.enrollmentId}/charges`} className="text-portoBlue hover:underline">
                        {p.playerName}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-slate-600 dark:text-slate-400">{p.methodLabel}</td>
                    <td className="px-3 py-2 text-right font-medium">{fmt(p.amount)}</td>
                    <td className="px-3 py-2 text-slate-500 dark:text-slate-400 text-xs">{p.notes ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-300 dark:border-slate-600 font-semibold">
                  <td className="px-3 py-2" colSpan={3}>Total</td>
                  <td className="px-3 py-2 text-right">{fmt(data.totalCobrado)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        <p className="text-xs text-slate-400">Horarios en UTC. Campus: {campuses.find((c) => c.id === selectedCampusId)?.name ?? "Todos"}.</p>
      </div>
    </PageShell>
  );
}
