import Link from "next/link";
import { redirect } from "next/navigation";
import { PageShell } from "@/components/ui/page-shell";
import { getOperationalCampusAccess } from "@/lib/auth/campuses";
import { getOrCreateCurrentCorteCheckpoint } from "@/lib/queries/corte-checkpoints";
import { getCorteDiarioData } from "@/lib/queries/reports";
import { formatDateTimeMonterrey } from "@/lib/time";
import { DetailPrintButton } from "./detail-print-button";

function fmt(value: number) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 2,
  }).format(value);
}

type SearchParams = Promise<{ campus?: string }>;

export default async function CorteDiarioDetallePage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const campusAccess = await getOperationalCampusAccess();
  const accessibleCampuses = campusAccess?.campuses ?? [];
  const selectedCampusId = params.campus ?? campusAccess?.defaultCampusId ?? accessibleCampuses[0]?.id ?? "";

  if (!selectedCampusId) {
    redirect("/reports/corte-diario");
  }

  const checkpoint = await getOrCreateCurrentCorteCheckpoint(selectedCampusId);
  if (!checkpoint) {
    redirect("/reports/corte-diario");
  }

  const data = await getCorteDiarioData({
    campusId: checkpoint.campusId,
    openedAt: checkpoint.openedAt,
  });

  return (
    <PageShell
      title="Reporte detallado de corte"
      subtitle={`${data.campusName} · ${formatDateTimeMonterrey(data.openedAt)} - ahora`}
      breadcrumbs={[
        { label: "Reportes", href: "/reports/corte-diario" },
        { label: "Corte Diario", href: `/reports/corte-diario?campus=${encodeURIComponent(data.campusId)}` },
        { label: "Reporte detallado" },
      ]}
    >
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Reporte A4 informativo. No cierra el corte actual ni modifica el checkpoint.
          </p>
          <div className="flex items-center gap-2">
            <Link
              href={`/reports/corte-diario?campus=${encodeURIComponent(data.campusId)}`}
              className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Volver al corte
            </Link>
            <DetailPrintButton />
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-4 print:grid-cols-4">
          <div className="rounded-md border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800">
            <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Campus</p>
            <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">{data.campusName}</p>
          </div>
          <div className="rounded-md border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800">
            <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Periodo</p>
            <p className="mt-1 text-sm font-medium text-slate-900 dark:text-slate-100">{formatDateTimeMonterrey(data.openedAt)}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">Hasta ahora</p>
          </div>
          <div className="rounded-md border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800">
            <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Total contado</p>
            <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">{fmt(data.totalCobrado)}</p>
          </div>
          <div className="rounded-md border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800">
            <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Pagos visibles</p>
            <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">{data.payments.length}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">{data.excludedPaymentsCount} externos fuera del total</p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:text-slate-400">
                <th className="px-3 py-2">Hora</th>
                <th className="px-3 py-2">Jugador</th>
                <th className="px-3 py-2">Campus jugador</th>
                <th className="px-3 py-2">Campus recibe</th>
                <th className="px-3 py-2">Cat.</th>
                <th className="px-3 py-2">Metodo</th>
                <th className="px-3 py-2">Folio</th>
                <th className="px-3 py-2">Conceptos pagados</th>
                <th className="px-3 py-2 text-right">Monto</th>
                <th className="px-3 py-2">Notas</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {data.payments.map((payment) => (
                <tr key={payment.id}>
                  <td className="px-3 py-2 align-top text-xs text-slate-500 dark:text-slate-400">{formatDateTimeMonterrey(payment.paidAt)}</td>
                  <td className="px-3 py-2 align-top font-medium text-slate-900 dark:text-slate-100">{payment.playerName}</td>
                  <td className="px-3 py-2 align-top text-slate-600 dark:text-slate-400">{payment.playerCampusName}</td>
                  <td className="px-3 py-2 align-top text-slate-600 dark:text-slate-400">
                    <div className="flex flex-wrap items-center gap-2">
                      <span>{payment.operatorCampusName}</span>
                      {payment.isCrossCampus ? (
                        <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-medium text-sky-800 dark:bg-sky-900/30 dark:text-sky-300">
                          Cruzado
                        </span>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-3 py-2 align-top text-slate-600 dark:text-slate-400">{payment.birthYear ?? "-"}</td>
                  <td className="px-3 py-2 align-top text-slate-600 dark:text-slate-400">
                    <div className="flex flex-wrap items-center gap-2">
                      <span>{payment.methodLabel}</span>
                      {payment.excludedFromCorte ? (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                          Externo
                        </span>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-3 py-2 align-top text-slate-600 dark:text-slate-400">{payment.folio ?? "-"}</td>
                  <td className="px-3 py-2 align-top text-xs text-slate-600 dark:text-slate-400">
                    {payment.concepts.length > 0 ? payment.concepts.join(" · ") : "-"}
                  </td>
                  <td className="px-3 py-2 align-top text-right font-medium text-slate-900 dark:text-slate-100">{fmt(payment.amount)}</td>
                  <td className="px-3 py-2 align-top text-xs text-slate-600 dark:text-slate-400">{payment.notes ?? "-"}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-300 font-semibold dark:border-slate-600">
                <td className="px-3 py-2" colSpan={8}>Total contado</td>
                <td className="px-3 py-2 text-right">{fmt(data.totalCobrado)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </PageShell>
  );
}
