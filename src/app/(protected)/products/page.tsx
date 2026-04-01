import Link from "next/link";
import { PageShell } from "@/components/ui/page-shell";
import { requireDirectorContext } from "@/lib/auth/permissions";
import { getProductCatalog } from "@/lib/queries/products";
import { getAdHocChargeTypesAction } from "@/server/actions/products";
import { createProductAction } from "@/server/actions/products";

const inputClass = "w-full rounded-md border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm focus:border-portoBlue focus:outline-none";

function formatMoney(amount: number, currency: string) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency }).format(amount);
}

const GROUP_ACCENT: Record<string, string> = {
  uniforms:    "border-l-sky-400",
  tournaments: "border-l-amber-400",
  trips:       "border-l-violet-400",
  events:      "border-l-slate-400",
};

const ERROR_MESSAGES: Record<string, string> = {
  invalid_form:          "Faltan campos obligatorios.",
  invalid_amount:        "El monto debe ser mayor a cero.",
  invalid_charge_type:   "Tipo de cargo no válido.",
  product_create_failed: "No se pudo crear el producto.",
  unauthenticated:       "Sesión expirada."
};

export default async function ProductsPage({
  searchParams
}: {
  searchParams: Promise<{ err?: string; ok?: string }>;
}) {
  await requireDirectorContext("/unauthorized");

  const [groups, chargeTypes, query] = await Promise.all([
    getProductCatalog(),
    getAdHocChargeTypesAction(),
    searchParams
  ]);

  const errorMessage = query.err ? (ERROR_MESSAGES[query.err] ?? "Ocurrió un error.") : null;
  const successMessage = query.ok === "product_deleted" ? "Producto eliminado correctamente." : null;
  const totalProducts = groups.reduce((n, g) => n + g.products.length, 0);
  const activeProducts = groups.reduce((n, g) => n + g.products.filter((p) => p.isActive).length, 0);

  return (
    <PageShell
      title="Productos"
      subtitle={`${activeProducts} activos · ${totalProducts} en total`}
      breadcrumbs={[{ label: "Productos" }]}
    >
      <div className="space-y-10">

        {successMessage && (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            {successMessage}
          </div>
        )}
        {errorMessage && (
          <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
            {errorMessage}
          </div>
        )}

        {groups.map((group) => {
          const accent = GROUP_ACCENT[group.key] ?? "border-l-slate-300";
          // Only show charge types that belong to this group
          const groupChargeTypes = chargeTypes.filter((ct) =>
            (group.codes as readonly string[]).includes(ct.code)
          );

          return (
            <div key={group.key}>
              <div className="mb-3 flex items-center gap-3">
                <h2 className="text-base font-semibold text-slate-800 dark:text-slate-200">{group.label}</h2>
                <span className="text-xs text-slate-400">{group.products.length} productos</span>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {group.products.map((product) => (
                  <Link
                    key={product.id}
                    href={`/products/${product.id}`}
                    className={`group flex flex-col justify-between rounded-xl border border-slate-200 dark:border-slate-700 border-l-4 ${accent} bg-white dark:bg-slate-900 p-4 shadow-sm transition-shadow hover:shadow-md`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-semibold text-slate-800 dark:text-slate-200 group-hover:text-portoBlue">
                        {product.name}
                      </p>
                      {!product.isActive && (
                        <span className="shrink-0 rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-xs text-slate-500 dark:text-slate-400">
                          Inactivo
                        </span>
                      )}
                    </div>
                    <div className="mt-3 flex items-end justify-between">
                      <div className="flex flex-wrap gap-1.5">
                        <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-xs text-slate-600 dark:text-slate-400">
                          {product.chargeTypeName}
                        </span>
                        {product.hasSizes && (
                          <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs text-sky-700">
                            Con tallas
                          </span>
                        )}
                      </div>
                      <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                        {product.defaultAmount != null
                          ? formatMoney(product.defaultAmount, product.currency)
                          : <span className="text-slate-400 font-normal text-xs">Precio libre</span>
                        }
                      </p>
                    </div>
                  </Link>
                ))}

                {/* ── Inline new product form ── */}
                {groupChargeTypes.length > 0 && (
                  <details className="rounded-xl border border-dashed border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 p-4">
                    <summary className="cursor-pointer text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-portoBlue list-none">
                      + Nuevo producto en {group.label}
                    </summary>
                    <form action={createProductAction} className="mt-4 space-y-3">

                      <label className="block space-y-1 text-sm">
                        <span className="font-medium text-slate-700 dark:text-slate-300">Nombre</span>
                        <input
                          type="text"
                          name="name"
                          required
                          className={inputClass}
                          placeholder="ej. Superliga Regia Clausura 2026"
                        />
                      </label>

                      {groupChargeTypes.length === 1 ? (
                        <>
                          <input type="hidden" name="chargeTypeId" value={groupChargeTypes[0].id} />
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            Tipo de cargo: <span className="font-medium">{groupChargeTypes[0].name}</span>
                          </p>
                        </>
                      ) : (
                        <label className="block space-y-1 text-sm">
                          <span className="font-medium text-slate-700 dark:text-slate-300">Tipo de cargo</span>
                          <select name="chargeTypeId" required className={inputClass}>
                            <option value="">Seleccionar…</option>
                            {groupChargeTypes.map((ct) => (
                              <option key={ct.id} value={ct.id}>{ct.name}</option>
                            ))}
                          </select>
                        </label>
                      )}

                      <label className="block space-y-1 text-sm">
                        <span className="font-medium text-slate-700 dark:text-slate-300">Precio base (opcional)</span>
                        <input
                          type="number"
                          name="defaultAmount"
                          step="0.01"
                          min="0.01"
                          className={inputClass}
                          placeholder="ej. 350"
                        />
                      </label>

                      <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" name="hasSizes" value="1" className="h-4 w-4 rounded border-slate-300 dark:border-slate-600" />
                        <span className="text-slate-700 dark:text-slate-300">Requiere talla (uniformes)</span>
                      </label>

                      <button
                        type="submit"
                        className="rounded-md bg-portoBlue px-4 py-2 text-sm font-medium text-white hover:bg-portoDark"
                      >
                        Crear producto
                      </button>
                    </form>
                  </details>
                )}
              </div>
            </div>
          );
        })}

      </div>
    </PageShell>
  );
}
