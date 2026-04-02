import Link from "next/link";
import { redirect } from "next/navigation";
import { PageShell } from "@/components/ui/page-shell";
import { getOperationalCampusAccess } from "@/lib/auth/campuses";
import { getCorteCheckpointById, getOrCreateCurrentCorteCheckpoint } from "@/lib/queries/corte-checkpoints";
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

type SearchParams = Promise<{ campus?: string; checkpoint?: string }>;

export default async function CorteDiarioDetallePage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const campusAccess = await getOperationalCampusAccess();
  const accessibleCampuses = campusAccess?.campuses ?? [];

  const historicalCheckpoint = params.checkpoint ? await getCorteCheckpointById(params.checkpoint) : null;
  const selectedCampusId =
    historicalCheckpoint?.campusId ??
    params.campus ??
    campusAccess?.defaultCampusId ??
    accessibleCampuses[0]?.id ??
    "";

  if (!selectedCampusId) {
    redirect("/reports/corte-diario");
  }

  const checkpoint = historicalCheckpoint ?? (await getOrCreateCurrentCorteCheckpoint(selectedCampusId));
  if (!checkpoint) {
    redirect("/reports/corte-diario");
  }

  const data = await getCorteDiarioData({
    campusId: checkpoint.campusId,
    openedAt: checkpoint.openedAt,
    closedAt: checkpoint.status === "closed" ? checkpoint.closedAt : undefined,
  });
  const isHistorical = checkpoint.status === "closed";
  const periodEndLabel = checkpoint.closedAt ? formatDateTimeMonterrey(checkpoint.closedAt) : "ahora";

  return (
    <PageShell
      title="Reporte detallado de corte"
      subtitle={`${data.campusName} · ${formatDateTimeMonterrey(data.openedAt)} - ${periodEndLabel}`}
      breadcrumbs={[
        { label: "Reportes", href: "/reports/corte-diario" },
        {
          label: "Corte Diario",
          href: isHistorical
            ? `/reports/corte-diario?campus=${encodeURIComponent(data.campusId)}&checkpoint=${encodeURIComponent(checkpoint.id)}`
            : `/reports/corte-diario?campus=${encodeURIComponent(data.campusId)}`,
        },
        { label: "Reporte detallado" },
      ]}
    >
      <div className="space-y-6 print:space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Reporte A4 informativo.{" "}
            {isHistorical
              ? "Corresponde a un corte historico ya cerrado."
              : "No cierra el corte actual ni modifica el checkpoint."}
          </p>
          <div className="flex items-center gap-2">
            <Link
              href={
                isHistorical
                  ? `/reports/corte-diario?campus=${encodeURIComponent(data.campusId)}&checkpoint=${encodeURIComponent(checkpoint.id)}`
                  : `/reports/corte-diario?campus=${encodeURIComponent(data.campusId)}`
              }
              className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Volver al corte
            </Link>
            <DetailPrintButton />
          </div>
        </div>

        <div className="hidden rounded-md border border-slate-300 print:block">
          <table className="w-full text-[11px]">
            <tbody>
              <tr className="border-b border-slate-200">
                <td className="px-2 py-1 font-semibold">Campus</td>
                <td className="px-2 py-1">{data.campusName}</td>
                <td className="px-2 py-1 font-semibold">Periodo</td>
                <td className="px-2 py-1">
                  {formatDateTimeMonterrey(data.openedAt)} - {periodEndLabel}
                </td>
                <td className="px-2 py-1 font-semibold">Total contado</td>
                <td className="px-2 py-1">{fmt(data.totalCobrado)}</td>
                <td className="px-2 py-1 font-semibold">Pagos</td>
                <td className="px-2 py-1">{data.countedPaymentsCount}</td>
              </tr>
              <tr className="border-b border-slate-200">
                {["cash", "card", "transfer", "other"].map((method) => {
                  const row = data.byMethod.find((item) => item.method === method);
                  const label =
                    row?.methodLabel ??
                    ({ cash: "Efectivo", card: "Tarjeta", transfer: "Transferencia", other: "Otro" }[method] ?? method);
                  return (
                    <td key={`${method}-label`} className="px-2 py-1 font-semibold">
                      {label}
                    </td>
                  );
                })}
              </tr>
              <tr className="border-b border-slate-200">
                {["cash", "card", "transfer", "other"].map((method) => {
                  const row = data.byMethod.find((item) => item.method === method);
                  return (
                    <td key={`${method}-value`} className="px-2 py-1" colSpan={2}>
                      {fmt(row?.total ?? 0)} · {row?.count ?? 0} pago{(row?.count ?? 0) !== 1 ? "s" : ""}
                    </td>
                  );
                })}
              </tr>
              <tr>
                <td className="px-2 py-1 font-semibold">360Player excluido</td>
                <td className="px-2 py-1" colSpan={7}>
                  {fmt(data.excludedPaymentsTotal)} · {data.excludedPaymentsCount} pago
                  {data.excludedPaymentsCount !== 1 ? "s" : ""} visible
                  {data.excludedPaymentsCount !== 1 ? "s" : ""}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="grid gap-3 md:grid-cols-4 print:hidden">
          <div className="rounded-md border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800">
            <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Campus</p>
            <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">{data.campusName}</p>
          </div>
          <div className="rounded-md border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800">
            <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Periodo</p>
            <p className="mt-1 text-sm font-medium text-slate-900 dark:text-slate-100">
              {formatDateTimeMonterrey(data.openedAt)}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">Hasta {periodEndLabel}</p>
          </div>
          <div className="rounded-md border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800">
            <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Total contado</p>
            <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">{fmt(data.totalCobrado)}</p>
          </div>
          <div className="rounded-md border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800">
            <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Pagos</p>
            <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">{data.countedPaymentsCount}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">Contados dentro del corte</p>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5 print:hidden">
          {["cash", "card", "transfer", "other"].map((method) => {
            const row = data.byMethod.find((item) => item.method === method);
            const label =
              row?.methodLabel ??
              ({ cash: "Efectivo", card: "Tarjeta", transfer: "Transferencia", other: "Otro" }[method] ?? method);

            return (
              <div key={method} className="rounded-md border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
                <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</p>
                <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">{fmt(row?.total ?? 0)}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {row?.count ?? 0} pago{(row?.count ?? 0) !== 1 ? "s" : ""}
                </p>
              </div>
            );
          })}
          <div className="rounded-md border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/20">
            <p className="text-xs uppercase tracking-wide text-amber-700 dark:text-amber-300">360Player excluido</p>
            <p className="mt-1 text-lg font-semibold text-amber-900 dark:text-amber-100">{fmt(data.excludedPaymentsTotal)}</p>
            <p className="text-xs text-amber-700 dark:text-amber-300">
              {data.excludedPaymentsCount} pago{data.excludedPaymentsCount !== 1 ? "s" : ""} visible
              {data.excludedPaymentsCount !== 1 ? "s" : ""}
            </p>
          </div>
        </div>

        {data.byChargeType.length > 0 ? (
          <div className="rounded-md border border-slate-200 p-4 print:p-2 dark:border-slate-700">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-300 print:mb-2 print:text-xs">
              Por tipo de cargo
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 print:grid-cols-4 print:gap-2">
              {data.byChargeType.map((chargeType) => (
                <div
                  key={chargeType.typeCode}
                  className="rounded-md border border-slate-200 bg-white p-4 print:p-2 dark:border-slate-700 dark:bg-slate-900"
                >
                  <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400 print:text-[10px]">
                    {chargeType.typeName}
                  </p>
                  <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100 print:mt-0.5 print:text-sm">
                    {fmt(chargeType.total)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="overflow-x-auto print:overflow-visible">
          <table className="min-w-full text-sm print:text-[11px]">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:text-slate-400 print:text-[10px]">
                <th className="px-3 py-2 print:px-2 print:py-1.5">Hora</th>
                <th className="px-3 py-2 print:px-2 print:py-1.5">Jugador</th>
                <th className="px-3 py-2 print:px-2 print:py-1.5">Campus jugador</th>
                <th className="px-3 py-2 print:px-2 print:py-1.5">Campus recibe</th>
                <th className="px-3 py-2 print:px-2 print:py-1.5">Cat.</th>
                <th className="px-3 py-2 print:px-2 print:py-1.5">Metodo</th>
                <th className="px-3 py-2 print:px-2 print:py-1.5">Folio</th>
                <th className="px-3 py-2 print:px-2 print:py-1.5">Conceptos pagados</th>
                <th className="px-3 py-2 text-right print:px-2 print:py-1.5">Monto</th>
                <th className="px-3 py-2 print:px-2 print:py-1.5">Notas</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {data.payments.map((payment) => (
                <tr key={payment.id} className="print:break-inside-avoid">
                  <td className="px-3 py-2 align-top text-xs text-slate-500 print:px-2 print:py-1.5 dark:text-slate-400">
                    {formatDateTimeMonterrey(payment.paidAt)}
                  </td>
                  <td className="px-3 py-2 align-top font-medium text-slate-900 print:px-2 print:py-1.5 dark:text-slate-100">
                    {payment.playerName}
                  </td>
                  <td className="px-3 py-2 align-top text-slate-600 print:px-2 print:py-1.5 dark:text-slate-400">{payment.playerCampusName}</td>
                  <td className="px-3 py-2 align-top text-slate-600 print:px-2 print:py-1.5 dark:text-slate-400">
                    <div className="flex flex-wrap items-center gap-2">
                      <span>{payment.operatorCampusName}</span>
                      {payment.isCrossCampus ? (
                        <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-medium text-sky-800 dark:bg-sky-900/30 dark:text-sky-300">
                          Cruzado
                        </span>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-3 py-2 align-top text-slate-600 print:px-2 print:py-1.5 dark:text-slate-400">{payment.birthYear ?? "-"}</td>
                  <td className="px-3 py-2 align-top text-slate-600 print:px-2 print:py-1.5 dark:text-slate-400">
                    <div className="flex flex-wrap items-center gap-2">
                      <span>{payment.methodLabel}</span>
                      {payment.excludedFromCorte ? (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                          Externo
                        </span>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-3 py-2 align-top text-slate-600 print:px-2 print:py-1.5 dark:text-slate-400">{payment.folio ?? "-"}</td>
                  <td className="px-3 py-2 align-top text-xs text-slate-600 print:px-2 print:py-1.5 dark:text-slate-400">
                    {payment.concepts.length > 0 ? payment.concepts.join(" · ") : "-"}
                  </td>
                  <td className="px-3 py-2 align-top text-right font-medium text-slate-900 print:px-2 print:py-1.5 dark:text-slate-100">
                    {fmt(payment.amount)}
                  </td>
                  <td className="px-3 py-2 align-top text-xs text-slate-600 print:px-2 print:py-1.5 dark:text-slate-400">{payment.notes ?? "-"}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-300 font-semibold dark:border-slate-600">
                <td className="px-3 py-2 print:px-2 print:py-1.5" colSpan={8}>
                  Total contado
                </td>
                <td className="px-3 py-2 text-right print:px-2 print:py-1.5">{fmt(data.totalCobrado)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </PageShell>
  );
}
