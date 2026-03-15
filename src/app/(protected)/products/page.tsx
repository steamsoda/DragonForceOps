import Link from "next/link";
import { PageShell } from "@/components/ui/page-shell";
import { getProductCatalog } from "@/lib/queries/products";

function formatMoney(amount: number, currency: string) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency }).format(amount);
}

const CATEGORY_ACCENT: Record<string, string> = {
  uniforms:    "border-l-sky-400",
  tournaments: "border-l-amber-400",
  tuition:     "border-l-emerald-400"
};

export default async function ProductsPage() {
  const catalog = await getProductCatalog();

  const totalProducts = catalog.reduce((n, cat) => n + cat.products.length, 0);
  const activeProducts = catalog.reduce((n, cat) => n + cat.products.filter((p) => p.isActive).length, 0);

  return (
    <PageShell
      title="Productos"
      subtitle={`${activeProducts} activos · ${totalProducts} en total`}
      breadcrumbs={[{ label: "Productos" }]}
    >
      <div className="space-y-8">
        {catalog.length === 0 && (
          <p className="text-sm text-slate-500">No hay categorías de productos configuradas.</p>
        )}

        {catalog.map((category) => {
          const accent = CATEGORY_ACCENT[category.slug] ?? "border-l-slate-300";
          return (
            <div key={category.id}>
              {/* Category header */}
              <div className="mb-3 flex items-center gap-3">
                <h2 className="text-base font-semibold text-slate-800">{category.name}</h2>
                {!category.isActive && (
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">Inactiva</span>
                )}
                <span className="text-xs text-slate-400">{category.products.length} productos</span>
              </div>

              {category.products.length === 0 ? (
                <p className="text-sm text-slate-400 italic">Sin productos en esta categoría.</p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {category.products.map((product) => (
                    <Link
                      key={product.id}
                      href={`/products/${product.id}`}
                      className={`group flex flex-col justify-between rounded-xl border border-slate-200 border-l-4 ${accent} bg-white p-4 shadow-sm transition-shadow hover:shadow-md`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-semibold text-slate-800 group-hover:text-portoBlue">
                          {product.name}
                        </p>
                        {!product.isActive && (
                          <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                            Inactivo
                          </span>
                        )}
                      </div>

                      <div className="mt-3 flex items-end justify-between">
                        <div className="flex flex-wrap gap-1.5">
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                            {product.chargeTypeName}
                          </span>
                          {product.hasSizes && (
                            <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs text-sky-700">
                              Con tallas
                            </span>
                          )}
                        </div>
                        <p className="text-sm font-semibold text-slate-700">
                          {product.defaultAmount != null
                            ? formatMoney(product.defaultAmount, product.currency)
                            : <span className="text-slate-400 font-normal text-xs">Precio libre</span>
                          }
                        </p>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </PageShell>
  );
}
