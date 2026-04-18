import Link from "next/link";
import { notFound } from "next/navigation";
import { PageShell } from "@/components/ui/page-shell";
import { requireDirectorContext } from "@/lib/auth/permissions";
import {
  getProductDetail,
  getProductKpis,
  getProductMetricLabel,
  getProductRecentSalesPage,
  getProductReconciliation,
  getProductSizeStats,
} from "@/lib/queries/products";
import { deleteProductAction, updateProductAction } from "@/server/actions/products";

const inputClass =
  "w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-portoBlue focus:outline-none dark:border-slate-600";

const ERROR_MESSAGES: Record<string, string> = {
  invalid_form: "El nombre no puede estar vacio.",
  invalid_amount: "El monto debe ser mayor a cero.",
  update_failed: "No se pudo guardar el cambio. Intenta de nuevo.",
  delete_failed: "No se pudo eliminar el producto. Intenta de nuevo.",
  has_charges: "Este producto tiene cargos registrados y no puede eliminarse. Desactivalo en su lugar.",
  unauthenticated: "Sesion expirada.",
};

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

function formatReconciliationReason(reason: "not_fully_paid" | "duplicate_fully_paid_charge_same_enrollment") {
  if (reason === "duplicate_fully_paid_charge_same_enrollment") return "Cargo duplicado pagado";
  return "Cargo sin pagar";
}

export default async function ProductDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ productId: string }>;
  searchParams: Promise<{ err?: string; salesPage?: string }>;
}) {
  const { productId } = await params;
  const query = await searchParams;
  const salesPage = Math.max(1, Number.parseInt(query.salesPage ?? "1", 10) || 1);

  await requireDirectorContext("/unauthorized");

  const [product, sizeStats, recentSales] = await Promise.all([
    getProductDetail(productId),
    getProductSizeStats(productId),
    getProductRecentSalesPage(productId, salesPage),
  ]);

  if (!product) notFound();

  const [kpis, reconciliation] = await Promise.all([
    getProductKpis(productId, product.currency),
    getProductReconciliation(productId),
  ]);

  const errorMessage = query.err ? (ERROR_MESSAGES[query.err] ?? "Ocurrio un error.") : null;
  const updateAction = updateProductAction.bind(null, productId);
  const deleteAction = deleteProductAction.bind(null, productId);

  return (
    <PageShell
      title={product.name}
      subtitle={product.chargeTypeName}
      breadcrumbs={[
        { label: "Productos", href: "/products" },
        { label: product.name },
      ]}
    >
      <div className="space-y-6">
        {errorMessage ? (
          <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
            {errorMessage}
          </div>
        ) : null}

        <details className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
          <summary className="cursor-pointer list-none text-sm font-semibold text-slate-700 hover:text-portoBlue dark:text-slate-300">
            Editar producto
          </summary>
          <form action={updateAction} className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="block space-y-1 text-sm">
              <span className="font-medium text-slate-700 dark:text-slate-300">Nombre</span>
              <input type="text" name="name" required defaultValue={product.name} className={inputClass} />
            </label>

            <label className="block space-y-1 text-sm">
              <span className="font-medium text-slate-700 dark:text-slate-300">
                Precio base (dejar vacio = precio libre)
              </span>
              <input
                type="number"
                name="defaultAmount"
                step="0.01"
                min="0.01"
                defaultValue={product.defaultAmount ?? ""}
                className={inputClass}
                placeholder="ej. 600"
              />
            </label>

            <div className="flex flex-col gap-3 sm:col-span-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="isActive"
                  value="1"
                  defaultChecked={product.isActive}
                  className="h-4 w-4 rounded border-slate-300 dark:border-slate-600"
                />
                <span className="text-slate-700 dark:text-slate-300">Producto activo (visible en Caja)</span>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="hasSizes"
                  value="1"
                  defaultChecked={product.hasSizes}
                  className="h-4 w-4 rounded border-slate-300 dark:border-slate-600"
                />
                <span className="text-slate-700 dark:text-slate-300">Requiere talla</span>
              </label>
            </div>

            <div className="sm:col-span-2">
              <button
                type="submit"
                className="rounded-md bg-portoBlue px-4 py-2 text-sm font-medium text-white hover:bg-portoDark"
              >
                Guardar cambios
              </button>
            </div>
          </form>
        </details>

        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
              product.isActive
                ? "bg-emerald-100 text-emerald-700"
                : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
            }`}
          >
            {product.isActive ? "Activo" : "Inactivo"}
          </span>
          {product.hasSizes ? (
            <span className="rounded-full bg-sky-100 px-2.5 py-1 text-xs font-semibold text-sky-700">
              Con tallas
            </span>
          ) : null}
          {product.defaultAmount != null ? (
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
              Precio base: {formatMoney(product.defaultAmount, product.currency)}
            </span>
          ) : (
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              Precio libre
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <KpiTile
            label="Cargos registrados"
            value={kpis.unitsSold.toString()}
            href={`/products/${productId}/drilldown?metric=charges_registered`}
          />
          <KpiTile label="Monto cargado total" value={formatMoney(kpis.totalRevenue, kpis.currency)} highlight />
          <KpiTile
            label="Cargos este mes"
            value={kpis.unitsThisMonth.toString()}
            href={`/products/${productId}/drilldown?metric=charges_this_month`}
          />
          <KpiTile label="Monto cargado este mes" value={formatMoney(kpis.revenueThisMonth, kpis.currency)} highlight />
          <KpiTile
            label="Jugadores con cargo"
            value={reconciliation.uniqueEnrollmentsWithCharge.toString()}
            href={`/products/${productId}/drilldown?metric=players_with_charge`}
          />
          <KpiTile
            label="Jugadores totalmente pagados"
            value={reconciliation.uniqueEnrollmentsFullyPaid.toString()}
            highlight
            href={`/products/${productId}/drilldown?metric=players_fully_paid`}
          />
          <KpiTile
            label="Cargos sin pagar"
            value={reconciliation.notFullyPaidChargeRows.toString()}
            href={`/products/${productId}/drilldown?metric=charges_unpaid`}
          />
          <KpiTile
            label="Brecha vs pagados"
            value={reconciliation.rawVsDashboardGap.toString()}
            href={`/products/${productId}/drilldown?metric=reconciliation_gap`}
          />
        </div>

        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
          <h2 className="mb-2 text-sm font-semibold text-amber-900">Conciliacion del producto</h2>
          <p className="text-sm text-amber-900">
            Esta vista separa <span className="font-semibold">cargos registrados</span> de{" "}
            <span className="font-semibold">jugadores totalmente pagados</span>. El KPI del producto cuenta cargos no
            anulados. El dashboard de inscripciones cuenta un jugador solo si al menos un cargo del producto quedo cubierto al 100%.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <MiniStat label="Filas de cargo pagadas al 100%" value={reconciliation.fullyPaidChargeRows.toString()} />
            <MiniStat label="Duplicados pagados" value={reconciliation.duplicateFullyPaidChargeRows.toString()} />
            <MiniStat label="Jugadores pagados unicos" value={reconciliation.uniqueEnrollmentsFullyPaid.toString()} />
          </div>
        </div>

        <div>
          <h2 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-300">
            Diferencias que explican la brecha {reconciliation.issues.length > 0 ? `(${reconciliation.issues.length})` : ""}
          </h2>
          {reconciliation.issues.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-400 dark:border-slate-700 dark:bg-slate-900">
              No hay diferencias entre cargos registrados y jugadores pagados para este producto.
            </div>
          ) : (
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
                  {reconciliation.issues.map((issue) => (
                    <tr key={issue.chargeId} className="hover:bg-slate-50 dark:hover:bg-slate-800">
                      <td className="px-4 py-2.5 text-slate-700 dark:text-slate-300">
                        {formatReconciliationReason(issue.reason)}
                      </td>
                      <td className="px-4 py-2.5">
                        <Link href={`/enrollments/${issue.enrollmentId}/charges`} className="font-medium text-portoBlue hover:underline">
                          {issue.playerName}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5 text-slate-600 dark:text-slate-400">{issue.campusName}</td>
                      <td className="px-4 py-2.5 text-right text-slate-700 dark:text-slate-300">
                        {formatMoney(issue.amount, product.currency)}
                      </td>
                      <td className="px-4 py-2.5 text-right text-slate-700 dark:text-slate-300">
                        {formatMoney(issue.allocatedAmount, product.currency)}
                      </td>
                      <td className="px-4 py-2.5 text-right font-semibold text-rose-700">
                        {formatMoney(issue.missingAmount, product.currency)}
                      </td>
                      <td className="px-4 py-2.5 text-right text-slate-500 dark:text-slate-400">
                        {formatDate(issue.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {product.hasSizes && sizeStats.length > 0 ? (
          <div>
            <h2 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-300">Cargos por talla</h2>
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
              <table className="w-full text-sm">
                <thead className="border-b border-slate-100 bg-slate-50 dark:bg-slate-800">
                  <tr>
                    <th className="px-4 py-2.5 text-left font-medium text-slate-600 dark:text-slate-400">Talla</th>
                    <th className="px-4 py-2.5 text-left font-medium text-slate-600 dark:text-slate-400">Portero</th>
                    <th className="px-4 py-2.5 text-right font-medium text-slate-600 dark:text-slate-400">Unidades</th>
                    <th className="px-4 py-2.5 text-right font-medium text-slate-600 dark:text-slate-400">Ingresos</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sizeStats.map((row, index) => (
                    <tr key={index} className="hover:bg-slate-50 dark:hover:bg-slate-800">
                      <td className="px-4 py-2.5 font-medium text-slate-800 dark:text-slate-200">
                        {row.size ?? <span className="font-normal text-slate-400">Sin talla</span>}
                      </td>
                      <td className="px-4 py-2.5">
                        {row.isGoalkeeper === true ? (
                          <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-700">
                            Portero
                          </span>
                        ) : row.isGoalkeeper === false ? (
                          <span className="text-xs text-slate-400">Campo</span>
                        ) : (
                          <span className="text-xs text-slate-300">-</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right font-semibold text-slate-800 dark:text-slate-200">
                        {row.units}
                      </td>
                      <td className="px-4 py-2.5 text-right text-slate-700 dark:text-slate-300">
                        {formatMoney(row.revenue, product.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800">
                  <tr>
                    <td colSpan={2} className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
                      Total
                    </td>
                    <td className="px-4 py-2.5 text-right font-bold text-slate-800 dark:text-slate-200">{kpis.unitsSold}</td>
                    <td className="px-4 py-2.5 text-right font-bold text-slate-800 dark:text-slate-200">
                      {formatMoney(kpis.totalRevenue, product.currency)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        ) : null}

        <div>
          <h2 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-300">
            Ultimas ventas {recentSales.totalCount > 0 ? `(${recentSales.totalCount})` : ""}
          </h2>
          {recentSales.rows.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-400 dark:border-slate-700 dark:bg-slate-900">
              Sin cargos registrados para este producto.
            </div>
          ) : (
            <div className="space-y-3">
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
                <table className="w-full text-sm">
                  <thead className="border-b border-slate-100 bg-slate-50 dark:bg-slate-800">
                    <tr>
                      <th className="px-4 py-2.5 text-left font-medium text-slate-600 dark:text-slate-400">Alumno</th>
                      <th className="px-4 py-2.5 text-left font-medium text-slate-600 dark:text-slate-400">Descripcion</th>
                      <th className="px-4 py-2.5 text-right font-medium text-slate-600 dark:text-slate-400">Monto</th>
                      <th className="px-4 py-2.5 text-right font-medium text-slate-600 dark:text-slate-400">Fecha</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {recentSales.rows.map((sale) => (
                      <tr key={sale.chargeId} className="hover:bg-slate-50 dark:hover:bg-slate-800">
                        <td className="px-4 py-2.5">
                          {sale.enrollmentId ? (
                            <Link href={`/enrollments/${sale.enrollmentId}/charges`} className="font-medium text-portoBlue hover:underline">
                              {sale.playerName}
                            </Link>
                          ) : (
                            <span className="text-slate-700 dark:text-slate-300">{sale.playerName}</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-slate-600 dark:text-slate-400">{sale.description}</td>
                        <td className="px-4 py-2.5 text-right font-semibold text-slate-800 dark:text-slate-200">
                          {formatMoney(sale.amount, sale.currency)}
                        </td>
                        <td className="px-4 py-2.5 text-right text-slate-500 dark:text-slate-400">{formatDate(sale.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-between gap-3 text-sm text-slate-500 dark:text-slate-400">
                <p>
                  Pagina {recentSales.page} - {recentSales.totalCount} ventas
                </p>
                <div className="flex gap-3">
                  {recentSales.hasPreviousPage ? (
                    <Link href={`/products/${productId}?salesPage=${recentSales.page - 1}`} className="rounded border px-3 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800">
                      Anterior
                    </Link>
                  ) : (
                    <span className="rounded border px-3 py-1.5 text-slate-400">Anterior</span>
                  )}
                  {recentSales.hasNextPage ? (
                    <Link href={`/products/${productId}?salesPage=${recentSales.page + 1}`} className="rounded border px-3 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800">
                      Siguiente
                    </Link>
                  ) : (
                    <span className="rounded border px-3 py-1.5 text-slate-400">Siguiente</span>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-rose-200 bg-rose-50 p-5">
          <h2 className="mb-3 text-sm font-semibold text-rose-700">Zona de riesgo</h2>
          {kpis.unitsSold === 0 ? (
            <details className="group">
              <summary className="cursor-pointer list-none text-sm text-rose-700 hover:text-rose-900">
                Eliminar producto permanentemente
              </summary>
              <div className="mt-3 space-y-3">
                <p className="text-sm text-rose-700">
                  Este producto no tiene cargos registrados. La eliminacion es permanente y no se puede deshacer.
                </p>
                <form action={deleteAction}>
                  <button type="submit" className="rounded-md bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700">
                    Si, eliminar "{product.name}"
                  </button>
                </form>
              </div>
            </details>
          ) : (
            <div className="space-y-1 text-sm text-rose-700">
              <p className="font-medium">Este producto no puede eliminarse.</p>
              <p>
                Tiene <span className="font-semibold">{kpis.unitsSold}</span> cargo{kpis.unitsSold !== 1 ? "s" : ""} registrado
                {kpis.unitsSold !== 1 ? "s" : ""}. Para retirarlo de Caja sin perder el historial, desactivalo usando el formulario
                de edicion de arriba.
              </p>
            </div>
          )}
        </div>
      </div>
    </PageShell>
  );
}

function KpiTile({
  label,
  value,
  highlight,
  href,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  href?: string;
}) {
  const content = (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-4 dark:border-slate-700 dark:bg-slate-900">
      <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
      <p className={`mt-1 text-xl font-bold ${highlight ? "text-portoBlue" : "text-slate-800 dark:text-slate-200"}`}>
        {value}
      </p>
    </div>
  );

  if (!href) return content;

  return (
    <Link
      href={href}
      aria-label={`${resolveMetricLabel(label)}: ${value}`}
      className="block transition hover:-translate-y-0.5 hover:shadow-sm"
    >
      {content}
    </Link>
  );
}

function resolveMetricLabel(label: string) {
  switch (label) {
    case "Cargos registrados":
      return getProductMetricLabel("charges_registered");
    case "Cargos este mes":
      return getProductMetricLabel("charges_this_month");
    case "Jugadores con cargo":
      return getProductMetricLabel("players_with_charge");
    case "Jugadores totalmente pagados":
      return getProductMetricLabel("players_fully_paid");
    case "Cargos sin pagar":
      return getProductMetricLabel("charges_unpaid");
    case "Brecha vs pagados":
      return getProductMetricLabel("reconciliation_gap");
    default:
      return label;
  }
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-amber-200 bg-white/80 px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">{label}</p>
      <p className="mt-1 text-lg font-bold text-amber-950">{value}</p>
    </div>
  );
}
