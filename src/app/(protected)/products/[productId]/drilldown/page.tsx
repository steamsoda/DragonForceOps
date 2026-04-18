import Link from "next/link";
import { notFound } from "next/navigation";
import { PageShell } from "@/components/ui/page-shell";
import { requireDirectorContext } from "@/lib/auth/permissions";
import {
  getProductDetail,
  getProductMetricLabel,
  getProductMetricPageData,
  isProductMetricKey,
  type ProductMetricIssueRow,
  type ProductMetricPageData,
} from "@/lib/queries/products";

function formatMoney(amount: number, currency: string) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency }).format(amount);
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatReason(reason: ProductMetricIssueRow["reason"]) {
  if (reason === "duplicate_fully_paid_charge_same_enrollment") return "Cargo duplicado pagado";
  return "Cargo sin pagar";
}

type SearchParams = Promise<{
  metric?: string;
  page?: string;
}>;

export default async function ProductMetricDrilldownPage({
  params,
  searchParams,
}: {
  params: Promise<{ productId: string }>;
  searchParams: SearchParams;
}) {
  const { productId } = await params;
  const query = await searchParams;

  await requireDirectorContext("/unauthorized");

  if (!isProductMetricKey(query.metric)) notFound();

  const page = Math.max(1, Number.parseInt(query.page ?? "1", 10) || 1);
  const [product, metricPage] = await Promise.all([
    getProductDetail(productId),
    getProductMetricPageData(productId, query.metric, page),
  ]);

  if (!product || !metricPage) notFound();

  const metricLabel = getProductMetricLabel(metricPage.metric);

  return (
    <PageShell
      title={metricLabel}
      subtitle={product.name}
      breadcrumbs={[
        { label: "Productos", href: "/products" },
        { label: product.name, href: `/products/${productId}` },
        { label: metricLabel },
      ]}
    >
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-4 dark:border-slate-700 dark:bg-slate-900">
          <div>
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{metricLabel}</p>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Pagina {metricPage.page} · {metricPage.totalCount} registros
            </p>
          </div>
          <Link
            href={`/products/${productId}`}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Volver al producto
          </Link>
        </div>

        {renderMetricTable(metricPage, product.currency)}

        <div className="flex items-center justify-end gap-3 text-sm text-slate-500 dark:text-slate-400">
          {metricPage.hasPreviousPage ? (
            <Link
              href={`/products/${productId}/drilldown?metric=${metricPage.metric}&page=${metricPage.page - 1}`}
              className="rounded border px-3 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              Anterior
            </Link>
          ) : (
            <span className="rounded border px-3 py-1.5 text-slate-400">Anterior</span>
          )}
          {metricPage.hasNextPage ? (
            <Link
              href={`/products/${productId}/drilldown?metric=${metricPage.metric}&page=${metricPage.page + 1}`}
              className="rounded border px-3 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              Siguiente
            </Link>
          ) : (
            <span className="rounded border px-3 py-1.5 text-slate-400">Siguiente</span>
          )}
        </div>
      </div>
    </PageShell>
  );
}

function renderMetricTable(metricPage: ProductMetricPageData, currency: string) {
  if (metricPage.totalCount === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-400 dark:border-slate-700 dark:bg-slate-900">
        No hay registros para este filtro.
      </div>
    );
  }

  if (metricPage.metric === "charges_registered" || metricPage.metric === "charges_this_month") {
    return (
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-100 bg-slate-50 dark:bg-slate-800">
            <tr>
              <th className="px-4 py-2.5 text-left font-medium text-slate-600 dark:text-slate-400">Alumno</th>
              <th className="px-4 py-2.5 text-left font-medium text-slate-600 dark:text-slate-400">Campus</th>
              <th className="px-4 py-2.5 text-left font-medium text-slate-600 dark:text-slate-400">Descripcion</th>
              <th className="px-4 py-2.5 text-right font-medium text-slate-600 dark:text-slate-400">Monto</th>
              <th className="px-4 py-2.5 text-right font-medium text-slate-600 dark:text-slate-400">Fecha</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {metricPage.rows.map((row) => (
              <tr key={row.chargeId} className="hover:bg-slate-50 dark:hover:bg-slate-800">
                <td className="px-4 py-2.5">
                  <Link href={`/enrollments/${row.enrollmentId}/charges`} className="font-medium text-portoBlue hover:underline">
                    {row.playerName}
                  </Link>
                </td>
                <td className="px-4 py-2.5 text-slate-600 dark:text-slate-400">{row.campusName}</td>
                <td className="px-4 py-2.5 text-slate-600 dark:text-slate-400">{row.description}</td>
                <td className="px-4 py-2.5 text-right font-semibold text-slate-800 dark:text-slate-200">
                  {formatMoney(row.amount, row.currency)}
                </td>
                <td className="px-4 py-2.5 text-right text-slate-500 dark:text-slate-400">{formatDate(row.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (metricPage.metric === "players_with_charge" || metricPage.metric === "players_fully_paid") {
    return (
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-100 bg-slate-50 dark:bg-slate-800">
            <tr>
              <th className="px-4 py-2.5 text-left font-medium text-slate-600 dark:text-slate-400">Alumno</th>
              <th className="px-4 py-2.5 text-left font-medium text-slate-600 dark:text-slate-400">Campus</th>
              <th className="px-4 py-2.5 text-right font-medium text-slate-600 dark:text-slate-400">Cargos</th>
              <th className="px-4 py-2.5 text-right font-medium text-slate-600 dark:text-slate-400">Ultimo cargo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {metricPage.rows.map((row) => (
              <tr key={row.enrollmentId} className="hover:bg-slate-50 dark:hover:bg-slate-800">
                <td className="px-4 py-2.5">
                  <Link href={`/enrollments/${row.enrollmentId}/charges`} className="font-medium text-portoBlue hover:underline">
                    {row.playerName}
                  </Link>
                </td>
                <td className="px-4 py-2.5 text-slate-600 dark:text-slate-400">{row.campusName}</td>
                <td className="px-4 py-2.5 text-right font-semibold text-slate-800 dark:text-slate-200">{row.chargeCount}</td>
                <td className="px-4 py-2.5 text-right text-slate-500 dark:text-slate-400">{formatDate(row.latestChargeAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  const issueRows = metricPage.rows as ProductMetricIssueRow[];

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
      <table className="w-full text-sm">
        <thead className="border-b border-slate-100 bg-slate-50 dark:bg-slate-800">
          <tr>
            <th className="px-4 py-2.5 text-left font-medium text-slate-600 dark:text-slate-400">Motivo</th>
            <th className="px-4 py-2.5 text-left font-medium text-slate-600 dark:text-slate-400">Alumno</th>
            <th className="px-4 py-2.5 text-left font-medium text-slate-600 dark:text-slate-400">Campus</th>
            <th className="px-4 py-2.5 text-right font-medium text-slate-600 dark:text-slate-400">Cargo</th>
            <th className="px-4 py-2.5 text-right font-medium text-slate-600 dark:text-slate-400">Asignado</th>
            <th className="px-4 py-2.5 text-right font-medium text-slate-600 dark:text-slate-400">Faltante</th>
            <th className="px-4 py-2.5 text-right font-medium text-slate-600 dark:text-slate-400">Fecha</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {issueRows.map((row) => (
            <tr key={row.chargeId} className="hover:bg-slate-50 dark:hover:bg-slate-800">
              <td className="px-4 py-2.5 text-slate-700 dark:text-slate-300">{formatReason(row.reason)}</td>
              <td className="px-4 py-2.5">
                <Link href={`/enrollments/${row.enrollmentId}/charges`} className="font-medium text-portoBlue hover:underline">
                  {row.playerName}
                </Link>
              </td>
              <td className="px-4 py-2.5 text-slate-600 dark:text-slate-400">{row.campusName}</td>
              <td className="px-4 py-2.5 text-right text-slate-700 dark:text-slate-300">{formatMoney(row.amount, currency)}</td>
              <td className="px-4 py-2.5 text-right text-slate-700 dark:text-slate-300">{formatMoney(row.allocatedAmount, currency)}</td>
              <td className="px-4 py-2.5 text-right font-semibold text-rose-700">{formatMoney(row.missingAmount, currency)}</td>
              <td className="px-4 py-2.5 text-right text-slate-500 dark:text-slate-400">{formatDate(row.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
