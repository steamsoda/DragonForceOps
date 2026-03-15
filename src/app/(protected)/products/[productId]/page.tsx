import Link from "next/link";
import { notFound } from "next/navigation";
import { PageShell } from "@/components/ui/page-shell";
import {
  getProductDetail,
  getProductKpis,
  getProductSizeStats,
  getProductRecentSales
} from "@/lib/queries/products";
import { updateProductAction } from "@/server/actions/products";

const inputClass = "w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-portoBlue focus:outline-none";

const ERROR_MESSAGES: Record<string, string> = {
  invalid_form:    "El nombre no puede estar vacío.",
  invalid_amount:  "El monto debe ser mayor a cero.",
  update_failed:   "No se pudo guardar el cambio. Intenta de nuevo.",
  unauthenticated: "Sesión expirada."
};

function formatMoney(amount: number, currency: string) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency }).format(amount);
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" });
}

export default async function ProductDetailPage({
  params,
  searchParams
}: {
  params: Promise<{ productId: string }>;
  searchParams: Promise<{ err?: string }>;
}) {
  const { productId } = await params;
  const query = await searchParams;

  const [product, sizeStats, recentSales] = await Promise.all([
    getProductDetail(productId),
    getProductSizeStats(productId),
    getProductRecentSales(productId)
  ]);

  if (!product) notFound();

  const kpis = await getProductKpis(productId, product.currency);
  const errorMessage = query.err ? (ERROR_MESSAGES[query.err] ?? "Ocurrió un error.") : null;
  const updateAction = updateProductAction.bind(null, productId);

  return (
    <PageShell
      title={product.name}
      subtitle={`${product.categoryName} · ${product.chargeTypeName}`}
      breadcrumbs={[
        { label: "Productos", href: "/products" },
        { label: product.name }
      ]}
    >
      <div className="space-y-6">

        {errorMessage && (
          <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
            {errorMessage}
          </div>
        )}

        {/* ── Edit form ── */}
        <details className="rounded-xl border border-slate-200 bg-white p-5">
          <summary className="cursor-pointer list-none text-sm font-semibold text-slate-700 hover:text-portoBlue">
            Editar producto
          </summary>
          <form action={updateAction} className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="block space-y-1 text-sm">
              <span className="font-medium text-slate-700">Nombre</span>
              <input type="text" name="name" required defaultValue={product.name} className={inputClass} />
            </label>

            <label className="block space-y-1 text-sm">
              <span className="font-medium text-slate-700">Precio base (dejar vacío = precio libre)</span>
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
                  className="h-4 w-4 rounded border-slate-300"
                />
                <span className="text-slate-700">Producto activo (visible en Caja)</span>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="hasSizes"
                  value="1"
                  defaultChecked={product.hasSizes}
                  className="h-4 w-4 rounded border-slate-300"
                />
                <span className="text-slate-700">Requiere talla</span>
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

        {/* ── Status + meta ── */}
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
            product.isActive ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"
          }`}>
            {product.isActive ? "Activo" : "Inactivo"}
          </span>
          {product.hasSizes && (
            <span className="rounded-full bg-sky-100 px-2.5 py-1 text-xs font-semibold text-sky-700">
              Con tallas
            </span>
          )}
          {product.defaultAmount != null ? (
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
              Precio base: {formatMoney(product.defaultAmount, product.currency)}
            </span>
          ) : (
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-500">Precio libre</span>
          )}
        </div>

        {/* ── KPI tiles ── */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <KpiTile label="Unidades vendidas" value={kpis.unitsSold.toString()} />
          <KpiTile label="Ingresos totales" value={formatMoney(kpis.totalRevenue, kpis.currency)} highlight />
          <KpiTile label="Ventas este mes" value={kpis.unitsThisMonth.toString()} />
          <KpiTile label="Ingresos este mes" value={formatMoney(kpis.revenueThisMonth, kpis.currency)} highlight />
        </div>

        {/* ── Size × goalkeeper breakdown ── */}
        {product.hasSizes && sizeStats.length > 0 && (
          <div>
            <h2 className="mb-3 text-sm font-semibold text-slate-700">Ventas por talla</h2>
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <table className="w-full text-sm">
                <thead className="border-b border-slate-100 bg-slate-50">
                  <tr>
                    <th className="px-4 py-2.5 text-left font-medium text-slate-600">Talla</th>
                    <th className="px-4 py-2.5 text-left font-medium text-slate-600">Portero</th>
                    <th className="px-4 py-2.5 text-right font-medium text-slate-600">Unidades</th>
                    <th className="px-4 py-2.5 text-right font-medium text-slate-600">Ingresos</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sizeStats.map((row, i) => (
                    <tr key={i} className="hover:bg-slate-50">
                      <td className="px-4 py-2.5 font-medium text-slate-800">
                        {row.size ?? <span className="font-normal text-slate-400">Sin talla</span>}
                      </td>
                      <td className="px-4 py-2.5">
                        {row.isGoalkeeper === true ? (
                          <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-700">Portero</span>
                        ) : row.isGoalkeeper === false ? (
                          <span className="text-xs text-slate-400">Campo</span>
                        ) : (
                          <span className="text-xs text-slate-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right font-semibold text-slate-800">{row.units}</td>
                      <td className="px-4 py-2.5 text-right text-slate-700">{formatMoney(row.revenue, product.currency)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t border-slate-200 bg-slate-50">
                  <tr>
                    <td colSpan={2} className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-600">Total</td>
                    <td className="px-4 py-2.5 text-right font-bold text-slate-800">{kpis.unitsSold}</td>
                    <td className="px-4 py-2.5 text-right font-bold text-slate-800">{formatMoney(kpis.totalRevenue, product.currency)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

        {/* ── Recent sales ── */}
        <div>
          <h2 className="mb-3 text-sm font-semibold text-slate-700">
            Últimas ventas {recentSales.length > 0 ? `(${recentSales.length})` : ""}
          </h2>
          {recentSales.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-400">
              Sin ventas registradas para este producto.
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <table className="w-full text-sm">
                <thead className="border-b border-slate-100 bg-slate-50">
                  <tr>
                    <th className="px-4 py-2.5 text-left font-medium text-slate-600">Alumno</th>
                    <th className="px-4 py-2.5 text-left font-medium text-slate-600">Descripción</th>
                    <th className="px-4 py-2.5 text-right font-medium text-slate-600">Monto</th>
                    <th className="px-4 py-2.5 text-right font-medium text-slate-600">Fecha</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {recentSales.map((sale) => (
                    <tr key={sale.chargeId} className="hover:bg-slate-50">
                      <td className="px-4 py-2.5">
                        {sale.enrollmentId ? (
                          <Link href={`/enrollments/${sale.enrollmentId}/charges`} className="font-medium text-portoBlue hover:underline">
                            {sale.playerName}
                          </Link>
                        ) : (
                          <span className="text-slate-700">{sale.playerName}</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-slate-600">{sale.description}</td>
                      <td className="px-4 py-2.5 text-right font-semibold text-slate-800">{formatMoney(sale.amount, sale.currency)}</td>
                      <td className="px-4 py-2.5 text-right text-slate-500">{formatDate(sale.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </PageShell>
  );
}

function KpiTile({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`mt-1 text-xl font-bold ${highlight ? "text-portoBlue" : "text-slate-800"}`}>
        {value}
      </p>
    </div>
  );
}
