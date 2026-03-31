import Link from "next/link";
import { ReprintReceiptButton } from "@/components/receipts/reprint-receipt-button";
import { PageShell } from "@/components/ui/page-shell";
import { searchReceipts } from "@/lib/queries/receipts";
import { getPrinterName } from "@/lib/queries/settings";
import { listCampuses } from "@/lib/queries/players";

type SearchParams = Promise<{
  q?: string;
  campus?: string;
  page?: string;
}>;

function formatMoney(value: number) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(value);
}

function formatDate(value: string) {
  const d = new Date(value);
  const day = String(d.getUTCDate()).padStart(2, "0");
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const year = d.getUTCFullYear();
  const hours = String(d.getHours()).padStart(2, "0");
  const mins = String(d.getMinutes()).padStart(2, "0");
  return `${day}/${month}/${year} ${hours}:${mins}`;
}

const METHOD_LABELS: Record<string, string> = {
  cash: "Efectivo",
  card: "Tarjeta",
  transfer: "Transferencia",
  stripe_360player: "360Player/Stripe",
  other: "Otro",
};

export default async function ReceiptsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const q = params.q ?? "";
  const campusId = params.campus ?? "";
  const page = Math.max(1, Number(params.page ?? "1") || 1);

  const [campuses, result, printerName] = await Promise.all([
    listCampuses(),
    searchReceipts({ q: q || undefined, campusId: campusId || undefined, page }),
    getPrinterName(),
  ]);

  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));
  const prevPage = page > 1 ? page - 1 : null;
  const nextPage = page < totalPages ? page + 1 : null;
  const qsBase = `q=${encodeURIComponent(q)}&campus=${encodeURIComponent(campusId)}`;

  return (
    <PageShell title="Buscar recibos" subtitle="Busca por folio o nombre del jugador">
      <div className="space-y-4">
        <form method="GET" className="flex flex-wrap gap-3">
          <input
            type="text"
            name="q"
            defaultValue={q}
            placeholder="Folio (LV-202603-...) o nombre de jugador"
            className="min-w-[220px] flex-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
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
          {q || campusId ? (
            <Link
              href="/receipts"
              className="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Limpiar
            </Link>
          ) : null}
        </form>

        {(q || campusId) && (
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {result.total} resultado{result.total !== 1 ? "s" : ""}
          </p>
        )}

        <div className="overflow-x-auto rounded-md border border-slate-200 dark:border-slate-700">
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
                    {q || campusId
                      ? "No se encontraron recibos con esos filtros."
                      : "Ingresa un folio o nombre para buscar."}
                  </td>
                </tr>
              ) : (
                result.rows.map((row) => (
                  <tr key={row.paymentId}>
                    <td className="px-3 py-2 font-mono text-xs">
                      {row.folio ?? <span className="text-slate-400">-</span>}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">{formatDate(row.paidAt)}</td>
                    <td className="px-3 py-2">{row.playerName}</td>
                    <td className="px-3 py-2">{row.campusName}</td>
                    <td className="px-3 py-2 font-medium">{formatMoney(row.amount)}</td>
                    <td className="px-3 py-2">{METHOD_LABELS[row.method] ?? row.method}</td>
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

        {(q || campusId) && result.total > result.pageSize && (
          <div className="flex items-center justify-between text-sm">
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
