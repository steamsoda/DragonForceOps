import Link from "next/link";
import { ReprintReceiptButton } from "@/components/receipts/reprint-receipt-button";
import { PageShell } from "@/components/ui/page-shell";
import { searchReceipts } from "@/lib/queries/receipts";
import { getPrinterName } from "@/lib/queries/settings";
import { formatDateTimeMonterrey } from "@/lib/time";
import { listCampuses } from "@/lib/queries/players";

type SearchParams = Promise<{
  q?: string;
  campus?: string;
  page?: string;
  payment?: string;
}>;

function formatMoney(value: number) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(value);
}

const METHOD_LABELS: Record<string, string> = {
  cash: "Efectivo",
  card: "Tarjeta",
  transfer: "Transferencia",
  stripe_360player: "360Player",
  other: "Otro",
};

function isHistoricalCatchup(row: { externalSource: string }) {
  return row.externalSource === "historical_catchup_contry";
}

export default async function ReceiptsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const q = params.q ?? "";
  const campusId = params.campus ?? "";
  const paymentId = params.payment ?? "";
  const page = Math.max(1, Number(params.page ?? "1") || 1);

  const [campuses, result, printerName] = await Promise.all([
    listCampuses(),
    searchReceipts({ q: q || undefined, campusId: campusId || undefined, paymentId: paymentId || undefined, page }),
    getPrinterName(),
  ]);

  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));
  const prevPage = page > 1 ? page - 1 : null;
  const nextPage = page < totalPages ? page + 1 : null;
  const qsBase = `q=${encodeURIComponent(q)}&campus=${encodeURIComponent(campusId)}&payment=${encodeURIComponent(paymentId)}`;
  const hasFilters = Boolean(q || campusId || paymentId);
  const hasError = Boolean(result.error);

  return (
    <PageShell title="Buscar recibos" subtitle="Recibos recientes y busqueda por folio o jugador">
      <div className="space-y-4">
        <form method="GET" className="grid gap-3 sm:grid-cols-2 xl:flex xl:flex-wrap">
          <input
            type="text"
            name="q"
            defaultValue={q}
            placeholder="Folio (LV-202603-...) o nombre de jugador"
            className="min-w-0 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 xl:min-w-[220px] xl:flex-1"
          />
          <select
            name="campus"
            defaultValue={campusId}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
          >
            <option value="">Todos los campus</option>
            {campuses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded-md bg-portoBlue px-4 py-2 text-sm font-medium text-white hover:bg-portoDark"
          >
            Buscar
          </button>
          {hasFilters ? (
            <Link
              href="/receipts"
              className="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Limpiar
            </Link>
          ) : null}
        </form>

        {hasError ? (
          <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
            <p className="font-medium">Error operativo en Recibos</p>
            <p>{result.error}</p>
            <p className="mt-2 font-mono text-xs">
              Validacion sugerida en preview SQL editor: `select count(*) from public.payments where status = 'posted';`
              y `select * from public.search_receipts(null, null, null, 5, 0);`
            </p>
          </div>
        ) : (
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {result.total} resultado{result.total !== 1 ? "s" : ""}
            {!hasFilters ? " recientes" : ""}
          </p>
        )}

        <div className="space-y-3 md:hidden">
          {result.rows.length === 0 ? (
            <div className="rounded-md border border-slate-200 px-4 py-6 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
              {hasError
                ? "La busqueda de recibos no pudo cargarse en esta base de datos."
                : hasFilters
                ? "No se encontraron recibos con esos filtros."
                : "No hay recibos publicados todavia."}
            </div>
          ) : (
            result.rows.map((row) => (
              <div key={row.paymentId} className="space-y-3 rounded-md border border-slate-200 px-4 py-4 dark:border-slate-700">
                <div className="space-y-1">
                  <p className="font-mono text-xs text-slate-500 dark:text-slate-400">{row.folio ?? "-"}</p>
                  <p className="text-base font-semibold text-slate-900 dark:text-slate-100">{row.playerName}</p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    {row.campusName} | {formatDateTimeMonterrey(row.paidAt)}
                  </p>
                  {isHistoricalCatchup(row) ? (
                    <p className="text-xs font-medium text-amber-700 dark:text-amber-300">Regularización histórica Contry</p>
                  ) : null}
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-400">Monto</p>
                    <p className="font-medium">{formatMoney(row.amount)}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-400">Metodo</p>
                    <p>{METHOD_LABELS[row.method] ?? row.method}</p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-sm">
                  <ReprintReceiptButton paymentId={row.paymentId} printerName={printerName} />
                  <Link href={`/enrollments/${row.enrollmentId}/charges`} className="text-portoBlue hover:underline">
                    Ver cuenta
                  </Link>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="hidden overflow-x-auto rounded-md border border-slate-200 dark:border-slate-700 md:block">
          <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-700">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-600 dark:bg-slate-800 dark:text-slate-400">
              <tr>
                <th className="px-3 py-2">Folio</th>
                <th className="px-3 py-2">Fecha</th>
                <th className="px-3 py-2">Jugador</th>
                <th className="px-3 py-2">Campus</th>
                <th className="px-3 py-2">Monto</th>
                <th className="px-3 py-2">Metodo</th>
                <th className="px-3 py-2">Recibo</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {result.rows.length === 0 ? (
                <tr>
                  <td className="px-3 py-6 text-slate-500 dark:text-slate-400" colSpan={8}>
                    {hasError
                      ? "La busqueda de recibos no pudo cargarse en esta base de datos."
                      : hasFilters
                      ? "No se encontraron recibos con esos filtros."
                      : "No hay recibos publicados todavia."}
                  </td>
                </tr>
              ) : (
                result.rows.map((row) => (
                  <tr key={row.paymentId}>
                    <td className="px-3 py-2 font-mono text-xs">
                      {row.folio ?? <span className="text-slate-400">-</span>}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">{formatDateTimeMonterrey(row.paidAt)}</td>
                    <td className="px-3 py-2">{row.playerName}</td>
                    <td className="px-3 py-2">{row.campusName}</td>
                    <td className="px-3 py-2 font-medium">{formatMoney(row.amount)}</td>
                    <td className="px-3 py-2">
                      <div className="space-y-1">
                        <p>{METHOD_LABELS[row.method] ?? row.method}</p>
                        {isHistoricalCatchup(row) ? (
                          <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                            Hist. Contry
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <ReprintReceiptButton paymentId={row.paymentId} printerName={printerName} />
                    </td>
                    <td className="px-3 py-2">
                      <Link
                        href={`/enrollments/${row.enrollmentId}/charges`}
                        className="text-portoBlue hover:underline"
                      >
                        Ver cuenta
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {!hasError && result.total > result.pageSize && (
          <div className="flex flex-col gap-3 text-sm sm:flex-row sm:items-center sm:justify-between">
            <p>
              Pagina {page} de {totalPages}
            </p>
            <div className="flex gap-3">
              {prevPage ? (
                <Link
                  href={`/receipts?${qsBase}&page=${prevPage}`}
                  className="rounded border px-3 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  Anterior
                </Link>
              ) : (
                <span className="rounded border px-3 py-1.5 text-slate-400">Anterior</span>
              )}
              {nextPage ? (
                <Link
                  href={`/receipts?${qsBase}&page=${nextPage}`}
                  className="rounded border px-3 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  Siguiente
                </Link>
              ) : (
                <span className="rounded border px-3 py-1.5 text-slate-400">Siguiente</span>
              )}
            </div>
          </div>
        )}
      </div>
    </PageShell>
  );
}
