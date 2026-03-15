import Link from "next/link";
import { PageShell } from "@/components/ui/page-shell";
import { getProductCatalog } from "@/lib/queries/products";
import { getAdHocChargeTypesAction } from "@/server/actions/products";
import { createProductAction, createCategoryAction } from "@/server/actions/products";

const inputClass = "w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-portoBlue focus:outline-none";

function formatMoney(amount: number, currency: string) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency }).format(amount);
}

const CATEGORY_ACCENT: Record<string, string> = {
  uniforms:    "border-l-sky-400",
  tournaments: "border-l-amber-400",
  tuition:     "border-l-emerald-400"
};

const ERROR_MESSAGES: Record<string, string> = {
  invalid_form:          "Faltan campos obligatorios.",
  invalid_amount:        "El monto debe ser mayor a cero.",
  invalid_charge_type:   "Tipo de cargo no válido.",
  category_create_failed:"No se pudo crear la categoría.",
  product_create_failed: "No se pudo crear el producto.",
  unauthenticated:       "Sesión expirada."
};

export default async function ProductsPage({
  searchParams
}: {
  searchParams: Promise<{ err?: string }>;
}) {
  const [catalog, chargeTypes, query] = await Promise.all([
    getProductCatalog(),
    getAdHocChargeTypesAction(),
    searchParams
  ]);

  const errorMessage = query.err ? (ERROR_MESSAGES[query.err] ?? "Ocurrió un error.") : null;
  const totalProducts = catalog.reduce((n, cat) => n + cat.products.length, 0);
  const activeProducts = catalog.reduce((n, cat) => n + cat.products.filter((p) => p.isActive).length, 0);

  return (
    <PageShell
      title="Productos"
      subtitle={`${activeProducts} activos · ${totalProducts} en total`}
      breadcrumbs={[{ label: "Productos" }]}
    >
      <div className="space-y-10">

        {errorMessage && (
          <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
            {errorMessage}
          </div>
        )}

        {/* ── Existing categories + products ── */}
        {catalog.map((category) => {
          const accent = CATEGORY_ACCENT[category.slug] ?? "border-l-slate-300";
          const createAction = createProductAction.bind(null);

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

              {/* Product tiles */}
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

                {/* ── Inline new product form ── */}
                <details className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4">
                  <summary className="cursor-pointer text-sm font-medium text-slate-600 hover:text-portoBlue list-none">
                    + Nuevo producto en {category.name}
                  </summary>
                  <form action={createAction} className="mt-4 space-y-3">
                    <input type="hidden" name="categoryId" value={category.id} />

                    <label className="block space-y-1 text-sm">
                      <span className="font-medium text-slate-700">Nombre</span>
                      <input type="text" name="name" required className={inputClass} placeholder="ej. Superliga Regia Clausura 2026" />
                    </label>

                    <label className="block space-y-1 text-sm">
                      <span className="font-medium text-slate-700">Tipo de cargo</span>
                      <select name="chargeTypeId" required className={inputClass}>
                        <option value="">Seleccionar…</option>
                        {chargeTypes.map((ct) => (
                          <option key={ct.id} value={ct.id}>{ct.name}</option>
                        ))}
                      </select>
                    </label>

                    <label className="block space-y-1 text-sm">
                      <span className="font-medium text-slate-700">Precio base (opcional)</span>
                      <input type="number" name="defaultAmount" step="0.01" min="0.01" className={inputClass} placeholder="ej. 350" />
                    </label>

                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" name="hasSizes" value="1" className="h-4 w-4 rounded border-slate-300" />
                      <span className="text-slate-700">Requiere talla (uniformes)</span>
                    </label>

                    <button
                      type="submit"
                      className="rounded-md bg-portoBlue px-4 py-2 text-sm font-medium text-white hover:bg-portoDark"
                    >
                      Crear producto
                    </button>
                  </form>
                </details>
              </div>
            </div>
          );
        })}

        {/* ── New category form ── */}
        <div className="border-t border-slate-200 pt-6">
          <details className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5">
            <summary className="cursor-pointer text-sm font-medium text-slate-600 hover:text-portoBlue list-none">
              + Nueva categoría
            </summary>
            <form action={createCategoryAction} className="mt-4 space-y-3 max-w-sm">
              <label className="block space-y-1 text-sm">
                <span className="font-medium text-slate-700">Nombre de la categoría</span>
                <input type="text" name="name" required className={inputClass} placeholder="ej. Viajes, Eventos especiales" />
              </label>
              <p className="text-xs text-slate-400">
                El identificador interno (slug) se genera automáticamente del nombre.
              </p>
              <button
                type="submit"
                className="rounded-md bg-portoDark px-4 py-2 text-sm font-medium text-white hover:bg-portoBlue"
              >
                Crear categoría
              </button>
            </form>
          </details>
        </div>

      </div>
    </PageShell>
  );
}
