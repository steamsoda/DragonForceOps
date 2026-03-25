"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  postCajaChargeAction,
  type CajaProductCategory,
  type CajaProduct,
} from "@/server/actions/caja";

const SIZES = ["XCH JR", "CH JR", "M JR", "G JR", "XL JR", "CH", "M", "G", "XL"];

const CATEGORY_STYLES: Record<string, { tile: string; selected: string; header: string }> = {
  uniforms:    { tile: "border-sky-200 bg-sky-50 hover:bg-sky-100",            selected: "border-sky-500 bg-sky-100 ring-2 ring-sky-500",         header: "text-sky-700" },
  tournaments: { tile: "border-amber-200 bg-amber-50 hover:bg-amber-100",      selected: "border-amber-500 bg-amber-100 ring-2 ring-amber-500",   header: "text-amber-700" },
  tuition:     { tile: "border-emerald-200 bg-emerald-50 hover:bg-emerald-100", selected: "border-emerald-500 bg-emerald-100 ring-2 ring-emerald-500", header: "text-emerald-700" },
};
const DEFAULT_STYLE = {
  tile: "border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700",
  selected: "border-portoBlue bg-blue-50 ring-2 ring-portoBlue",
  header: "text-slate-600 dark:text-slate-400",
};

const MONTH_NAMES_ES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

function getDefaultNextMonth(): string {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`;
}

function getMonthOptions(): { value: string; label: string }[] {
  const now = new Date();
  return [-1, 0, 1, 2].map((offset) => {
    const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    return {
      value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      label: `${MONTH_NAMES_ES[d.getMonth()]} ${d.getFullYear()}`,
    };
  });
}

type Props = {
  enrollmentId: string;
  playerName: string;
  campusName: string;
  currency: string;
  products: CajaProductCategory[];
};

export function ChargeProductGrid({ enrollmentId, playerName, campusName, currency, products }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selected, setSelected] = useState<CajaProduct | null>(null);
  const [amount, setAmount] = useState("");
  const [size, setSize] = useState("");
  const [goalkeeper, setGoalkeeper] = useState(false);
  const [periodMonth, setPeriodMonth] = useState(() => getDefaultNextMonth());
  const [error, setError] = useState<string | null>(null);

  function fmt(n: number) {
    return new Intl.NumberFormat("es-MX", { style: "currency", currency }).format(n);
  }

  function handleSelectProduct(product: CajaProduct) {
    setSelected(product);
    setAmount(product.defaultAmount != null ? product.defaultAmount.toFixed(2) : "");
    setSize("");
    setGoalkeeper(false);
    setPeriodMonth(getDefaultNextMonth());
    setError(null);
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selected) return;
    const fd = new FormData();
    fd.set("productId", selected.id);
    fd.set("amount", amount);
    if (size) fd.set("size", size);
    if (goalkeeper) fd.set("goalkeeper", "1");
    if (selected.categorySlug === "tuition" && periodMonth) fd.set("period_month", periodMonth);
    setError(null);
    startTransition(async () => {
      const result = await postCajaChargeAction(enrollmentId, fd);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push(`/enrollments/${enrollmentId}/charges`);
    });
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-500 dark:text-slate-400">
        {playerName} · {campusName}
      </p>

      <div className="space-y-5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5">
        {error && (
          <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
        )}

        {products.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">No hay productos disponibles.</p>
        ) : (
          products.map((category) => {
            const style = CATEGORY_STYLES[category.slug] ?? DEFAULT_STYLE;
            return (
              <div key={category.slug}>
                <p className={`mb-2 text-xs font-semibold uppercase tracking-wide ${style.header}`}>
                  {category.name}
                </p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {category.products.map((product) => {
                    const isSelected = selected?.id === product.id;
                    return (
                      <button
                        key={product.id}
                        type="button"
                        onClick={() => handleSelectProduct(product)}
                        className={`rounded-xl border p-4 text-left transition-all ${isSelected ? style.selected : style.tile}`}
                      >
                        <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{product.name}</p>
                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                          {product.defaultAmount != null ? fmt(product.defaultAmount) : "Precio libre"}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}

        {selected && (
          <form
            onSubmit={handleSubmit}
            className="mt-2 space-y-3 rounded-xl border border-portoBlue bg-blue-50 p-4"
          >
            <p className="font-semibold text-slate-800 dark:text-slate-200">{selected.name}</p>

            {selected.hasSizes && (
              <div className="space-y-3">
                <div>
                  <p className="mb-1.5 text-xs font-medium text-slate-600 dark:text-slate-400">Talla</p>
                  <div className="flex flex-wrap gap-1.5">
                    {SIZES.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setSize(size === s ? "" : s)}
                        className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                          size === s
                            ? "border-portoBlue bg-portoBlue text-white"
                            : "border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setGoalkeeper((g) => !g)}
                  className={`rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors ${
                    goalkeeper
                      ? "border-violet-500 bg-violet-500 text-white"
                      : "border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"
                  }`}
                >
                  Portero {goalkeeper ? "✓" : ""}
                </button>
              </div>
            )}

            {selected.categorySlug === "tuition" && (
              <label className="block space-y-1 text-sm">
                <span className="font-medium text-slate-700 dark:text-slate-300">Período</span>
                <select
                  value={periodMonth}
                  onChange={(e) => setPeriodMonth(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-2 focus:border-portoBlue focus:outline-none"
                >
                  {getMonthOptions().map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </label>
            )}

            <label className="block space-y-1 text-sm">
              <span className="font-medium text-slate-700 dark:text-slate-300">Monto</span>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-2 focus:border-portoBlue focus:outline-none"
              />
            </label>

            <div className="flex gap-3">
              <button
                type="submit"
                disabled={isPending}
                className="flex-1 rounded-lg bg-portoBlue py-2.5 text-sm font-semibold text-white hover:bg-portoDark disabled:opacity-50"
              >
                {isPending ? "Guardando…" : "Crear cargo"}
              </button>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="rounded-lg border border-slate-300 dark:border-slate-600 px-4 py-2.5 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                Cancelar
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
