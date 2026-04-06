"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { CajaPendingCharge, CajaProduct, CajaProductCategory } from "@/server/actions/caja";
import { createAdvanceTuitionAction, postCajaChargeAction } from "@/server/actions/caja";
import { reassignPaymentAction } from "@/server/actions/billing";

const SIZES = ["XCH JR", "CH JR", "M JR", "G JR", "XL JR", "CH", "M", "G", "XL"];

type ReassignmentPayment = {
  id: string;
  amount: number;
  currency: string;
  paidAt: string;
  method: string;
  notes: string | null;
  sourceCharges: Array<{
    chargeId: string;
    description: string;
    typeCode: string;
    typeName: string;
    amount: number;
    allocatedAmount: number;
  }>;
};

type AdvanceOption = {
  periodMonth: string;
  label: string;
  amount: number;
};

function formatMoney(amount: number, currency: string) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency }).format(amount);
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("es-MX", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Monterrey",
  });
}

function getMethodLabel(method: string) {
  switch (method) {
    case "cash":
      return "Efectivo";
    case "transfer":
      return "Transferencia";
    case "card":
      return "Tarjeta";
    case "stripe_360player":
      return "360Player";
    case "other":
      return "Otro";
    default:
      return method;
  }
}

function getActionErrorMessage(code: string) {
  const messages: Record<string, string> = {
    invalid_form: "Revisa los datos del cargo que quieres crear.",
    unauthenticated: "Tu sesi\u00f3n expir\u00f3. Inicia sesi\u00f3n de nuevo.",
    enrollment_not_found: "La cuenta ya no est\u00e1 disponible.",
    enrollment_inactive: "La inscripci\u00f3n ya no est\u00e1 activa.",
    product_not_found: "Producto no encontrado o inactivo.",
    charge_insert_failed: "No se pudo crear el cargo destino.",
    tuition_rate_not_found: "No se pudo calcular la mensualidad adelantada.",
    prior_month_arrears: "Hay mensualidades anteriores pendientes.",
    duplicate_period: "Ya existe una mensualidad para ese periodo.",
    charge_type_not_found: "Falta configuraci\u00f3n del tipo de cargo.",
    target_charge_required: "Selecciona al menos un cargo destino.",
    target_capacity_too_small: "Los cargos destino no absorben el pago completo.",
    target_charge_invalid: "Alguno de los cargos destino ya no es v\u00e1lido.",
    target_charge_conflict: "No puedes reusar el mismo cargo origen como destino.",
    payment_not_fully_allocated: "Solo se pueden mover pagos aplicados al 100%.",
    source_charge_shared: "El cargo origen tambi\u00e9n tiene otro pago aplicado.",
    source_charge_not_exclusive: "El cargo origen no est\u00e1 cubierto exclusivamente por este pago.",
    payment_already_refunded: "Este pago ya fue reembolsado.",
    payment_not_posted: "Solo se pueden mover pagos vigentes.",
    payment_has_no_allocations: "Este pago ya no tiene cargos aplicados.",
    unauthorized: "No tienes permiso para modificar este pago.",
    debug_read_only: "El modo de solo lectura bloquea cambios.",
  };
  return messages[code] ?? "No se pudo completar el cambio de concepto.";
}

type AddChargeMode = "product" | "tuition";

export function PaymentReassignmentPanel({
  enrollmentId,
  returnTo,
  payment,
  initialPendingCharges,
  products,
  advanceTuitionOptions,
}: {
  enrollmentId: string;
  returnTo: string;
  payment: ReassignmentPayment;
  initialPendingCharges: CajaPendingCharge[];
  products: CajaProductCategory[];
  advanceTuitionOptions: AdvanceOption[];
}) {
  const router = useRouter();
  const [pendingCharges, setPendingCharges] = useState(initialPendingCharges);
  const [selectedChargeIds, setSelectedChargeIds] = useState<string[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<CajaProduct | null>(null);
  const [chargeAmount, setChargeAmount] = useState("");
  const [chargeSize, setChargeSize] = useState("");
  const [goalkeeper, setGoalkeeper] = useState(false);
  const [tuitionPeriod, setTuitionPeriod] = useState(advanceTuitionOptions[0]?.periodMonth.slice(0, 7) ?? "");
  const [addChargeMode, setAddChargeMode] = useState<AddChargeMode>("product");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const selectedTotal = useMemo(
    () =>
      pendingCharges
        .filter((charge) => selectedChargeIds.includes(charge.id))
        .reduce((sum, charge) => sum + charge.pendingAmount, 0),
    [pendingCharges, selectedChargeIds],
  );

  function toggleCharge(chargeId: string) {
    setSelectedChargeIds((current) =>
      current.includes(chargeId) ? current.filter((id) => id !== chargeId) : [...current, chargeId],
    );
  }

  function syncPendingCharges(nextCharges: CajaPendingCharge[], newChargeId?: string) {
    setPendingCharges(nextCharges);
    if (newChargeId) {
      setSelectedChargeIds((current) => Array.from(new Set([...current, newChargeId])));
    }
  }

  function selectProduct(product: CajaProduct) {
    setSelectedProduct(product);
    setChargeAmount(product.defaultAmount != null ? product.defaultAmount.toFixed(2) : "");
    setChargeSize("");
    setGoalkeeper(false);
    setErrorMessage(null);
  }

  function submitProductCharge() {
    if (!selectedProduct) return;
    setErrorMessage(null);

    startTransition(async () => {
      const formData = new FormData();
      formData.set("productId", selectedProduct.id);
      if (chargeAmount) formData.set("amount", chargeAmount);
      if (chargeSize) formData.set("size", chargeSize);
      if (goalkeeper) formData.set("goalkeeper", "1");

      const result = await postCajaChargeAction(enrollmentId, formData);
      if (!result.ok) {
        setErrorMessage(getActionErrorMessage(result.error));
        return;
      }
      if (!result.updatedData) {
        setErrorMessage("No se pudo refrescar la cuenta despues de crear el cargo.");
        return;
      }

      syncPendingCharges(result.updatedData.pendingCharges, result.newChargeId);
      setSelectedProduct(null);
      setChargeAmount("");
      setChargeSize("");
      setGoalkeeper(false);
    });
  }

  function submitAdvanceTuition() {
    if (!tuitionPeriod) return;
    setErrorMessage(null);

    startTransition(async () => {
      const result = await createAdvanceTuitionAction(enrollmentId, tuitionPeriod);
      if (!result.ok) {
        setErrorMessage(getActionErrorMessage(result.error));
        return;
      }

      syncPendingCharges(result.updatedData.pendingCharges, result.newChargeId);
    });
  }

  function submitReassignment() {
    setErrorMessage(null);

    startTransition(async () => {
      const formData = new FormData();
      formData.set("targetChargeIds", selectedChargeIds.join(","));
      const result = await reassignPaymentAction(enrollmentId, payment.id, formData);
      if (!result.ok) {
        setErrorMessage(getActionErrorMessage(result.error));
        return;
      }

      const joiner = returnTo.includes("?") ? "&" : "?";
      router.push(`${returnTo}${joiner}ok=payment_reassigned`);
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
        <div className="space-y-2">
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Pago original</p>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {formatDateTime(payment.paidAt)} \u00b7 {getMethodLabel(payment.method)}
          </p>
          <p className="text-xl font-semibold text-slate-900 dark:text-slate-100">
            {formatMoney(payment.amount, payment.currency)}
          </p>
          {payment.notes ? <p className="text-sm text-slate-500 dark:text-slate-400">{payment.notes}</p> : null}
        </div>

        <div className="mt-4 space-y-2">
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Cargos origen</p>
          <div className="space-y-2">
            {payment.sourceCharges.map((charge) => (
              <div key={charge.chargeId} className="rounded-md border border-slate-200 px-3 py-2 dark:border-slate-700">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-medium text-slate-900 dark:text-slate-100">{charge.description}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{charge.typeName}</p>
                  </div>
                  <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                    {formatMoney(charge.allocatedAmount, payment.currency)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {errorMessage ? (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-200">
          {errorMessage}
        </div>
      ) : null}

      <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Destino del dinero</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Selecciona cargos pendientes o crea uno nuevo antes de aplicar el cambio de concepto.
            </p>
          </div>
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800/60">
            Total seleccionado:{" "}
            <span className="font-semibold text-slate-900 dark:text-slate-100">
              {formatMoney(selectedTotal, payment.currency)}
            </span>
          </div>
        </div>

        <div className="space-y-2">
          {pendingCharges.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">Todav\u00eda no hay cargos destino disponibles.</p>
          ) : (
            pendingCharges.map((charge) => {
              const checked = selectedChargeIds.includes(charge.id);
              return (
                <label
                  key={charge.id}
                  className={`flex cursor-pointer items-start gap-3 rounded-md border px-3 py-3 ${
                    checked
                      ? "border-portoBlue bg-portoBlue/5"
                      : "border-slate-200 hover:border-slate-300 dark:border-slate-700 dark:hover:border-slate-600"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleCharge(charge.id)}
                    className="mt-1 h-4 w-4 rounded border-slate-300 text-portoBlue focus:ring-portoBlue"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-slate-900 dark:text-slate-100">{charge.description}</p>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                        {charge.typeName}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {charge.periodMonth ? `Periodo ${charge.periodMonth}` : "Sin periodo"}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-semibold text-rose-600">
                    {formatMoney(charge.pendingAmount, payment.currency)}
                  </span>
                </label>
              );
            })
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setSelectedChargeIds(pendingCharges.map((charge) => charge.id))}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Seleccionar todos
          </button>
          <button
            type="button"
            onClick={() => setSelectedChargeIds([])}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Limpiar
          </button>
        </div>
      </section>

      <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Crear cargo destino</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">Caja-lite para resolver el cambio sin dejar cr\u00e9dito flotando.</p>
          </div>
          <div className="flex rounded-md border border-slate-300 p-1 dark:border-slate-600">
            <button
              type="button"
              onClick={() => setAddChargeMode("product")}
              className={`rounded px-3 py-1.5 text-sm ${addChargeMode === "product" ? "bg-portoBlue text-white" : "text-slate-700 dark:text-slate-300"}`}
            >
              Cat\u00e1logo
            </button>
            <button
              type="button"
              onClick={() => setAddChargeMode("tuition")}
              className={`rounded px-3 py-1.5 text-sm ${addChargeMode === "tuition" ? "bg-portoBlue text-white" : "text-slate-700 dark:text-slate-300"}`}
            >
              Mensualidad
            </button>
          </div>
        </div>

        {addChargeMode === "product" ? (
          <div className="space-y-5">
            {products.map((category) => (
              <div key={category.slug}>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{category.name}</p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {category.products.map((product) => {
                    const selected = selectedProduct?.id === product.id;
                    return (
                      <button
                        key={product.id}
                        type="button"
                        onClick={() => selectProduct(product)}
                        className={`rounded-xl border p-4 text-left transition-all ${
                          selected
                            ? "border-portoBlue bg-portoBlue/5 ring-2 ring-portoBlue"
                            : "border-slate-200 bg-slate-50 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700"
                        }`}
                      >
                        <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{product.name}</p>
                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                          {product.defaultAmount != null ? formatMoney(product.defaultAmount, payment.currency) : "Precio libre"}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}

            {selectedProduct ? (
              <div className="space-y-3 rounded-xl border border-portoBlue bg-portoBlue/5 p-4">
                <p className="font-semibold text-slate-800 dark:text-slate-200">{selectedProduct.name}</p>
                {selectedProduct.hasSizes ? (
                  <div className="space-y-3">
                    <div>
                      <p className="mb-1.5 text-xs font-medium text-slate-600 dark:text-slate-400">Talla</p>
                      <div className="flex flex-wrap gap-1.5">
                        {SIZES.map((size) => (
                          <button
                            key={size}
                            type="button"
                            onClick={() => setChargeSize(chargeSize === size ? "" : size)}
                            className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                              chargeSize === size
                                ? "border-portoBlue bg-portoBlue text-white"
                                : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                            }`}
                          >
                            {size}
                          </button>
                        ))}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setGoalkeeper((current) => !current)}
                      className={`rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors ${
                        goalkeeper
                          ? "border-violet-500 bg-violet-500 text-white"
                          : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800"
                      }`}
                    >
                      Portero {goalkeeper ? "\u2713" : ""}
                    </button>
                  </div>
                ) : null}

                <label className="block space-y-1 text-sm">
                  <span className="font-medium text-slate-700 dark:text-slate-300">Monto</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={chargeAmount}
                    onChange={(event) => setChargeAmount(event.target.value)}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-slate-900"
                  />
                </label>

                <div className="flex gap-3">
                  <button
                    type="button"
                    disabled={isPending || !chargeAmount}
                    onClick={submitProductCharge}
                    className="rounded-md bg-portoBlue px-4 py-2 text-sm font-medium text-white hover:bg-portoDark disabled:opacity-50"
                  >
                    {isPending ? "Guardando..." : "Crear cargo"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedProduct(null)}
                    className="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/60">
            <label className="block space-y-1 text-sm">
              <span className="font-medium text-slate-700 dark:text-slate-300">Mensualidad adelantada</span>
              <select
                value={tuitionPeriod}
                onChange={(event) => setTuitionPeriod(event.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-slate-900"
              >
                <option value="">Selecciona periodo</option>
                {advanceTuitionOptions.map((option) => (
                  <option key={option.periodMonth} value={option.periodMonth.slice(0, 7)}>
                    {option.label} \u00b7 {formatMoney(option.amount, payment.currency)}
                  </option>
                ))}
              </select>
            </label>

            <button
              type="button"
              disabled={isPending || !tuitionPeriod}
              onClick={submitAdvanceTuition}
              className="rounded-md bg-portoBlue px-4 py-2 text-sm font-medium text-white hover:bg-portoDark disabled:opacity-50"
            >
              {isPending ? "Guardando..." : "Agregar mensualidad"}
            </button>
          </div>
        )}
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          El pago original conservar\u00e1 su folio, fecha y m\u00e9todo. Solo se mover\u00e1n sus asignaciones.
        </p>
        <button
          type="button"
          disabled={isPending || selectedChargeIds.length === 0}
          onClick={submitReassignment}
          className="rounded-md bg-portoBlue px-4 py-2 text-sm font-medium text-white hover:bg-portoDark disabled:opacity-50"
        >
          {isPending ? "Aplicando..." : "Aplicar cambio de concepto"}
        </button>
      </div>
    </div>
  );
}
