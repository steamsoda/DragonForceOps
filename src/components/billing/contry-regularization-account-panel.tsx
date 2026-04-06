"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { ChargesLedgerTable } from "@/components/billing/charges-ledger-table";
import { LedgerSummaryCards } from "@/components/billing/ledger-summary-cards";
import { PaymentsTable } from "@/components/billing/payments-table";
import type { EnrollmentLedger } from "@/lib/queries/billing";
import {
  getContryRegularizationChargeContextAction,
  getContryRegularizationLedgerAction,
  postContryHistoricalPaymentAction,
  type ContryRegularizationChargeContext,
} from "@/server/actions/payments";
import {
  createAdvanceTuitionAction,
  getProductsForCajaAction,
  postCajaChargeAction,
  type CajaProduct,
  type CajaProductCategory,
} from "@/server/actions/caja";

const SIZES = ["XCH JR", "CH JR", "M JR", "G JR", "XL JR", "CH", "M", "G", "XL"];

function formatMoney(amount: number, currency: string) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency }).format(amount);
}

function getActionErrorMessage(code: string) {
  const messages: Record<string, string> = {
    invalid_form: "Verifica el monto, método y datos del cargo.",
    unauthenticated: "Tu sesión expiró. Inicia sesión de nuevo.",
    enrollment_not_found: "La cuenta seleccionada ya no está disponible para Contry.",
    enrollment_inactive: "La inscripción ya no está activa.",
    no_pending_charges: "No hay cargos pendientes en esta cuenta.",
    payment_insert_failed: "No se pudo registrar el pago histórico.",
    allocation_insert_failed: "No se pudieron guardar las asignaciones del pago.",
    paid_at_required: "Debes capturar la fecha y hora real del pago.",
    product_not_found: "Producto no encontrado o inactivo.",
    charge_insert_failed: "No se pudo crear el cargo.",
    tuition_rate_not_found: "No se pudo calcular la mensualidad adelantada.",
    prior_month_arrears: "Hay mensualidades anteriores pendientes.",
    duplicate_period: "Ya existe una mensualidad para ese periodo.",
    charge_type_not_found: "Falta configuración del tipo de cargo.",
    debug_read_only: "El modo de solo lectura bloquea cambios.",
  };
  return messages[code] ?? "Ocurrió un error. Intenta de nuevo.";
}

type AddChargeMode = "product" | "tuition";

export function ContryRegularizationAccountPanel({
  initialLedger,
  contryCampusId,
}: {
  initialLedger: EnrollmentLedger;
  contryCampusId: string;
}) {
  const [ledger, setLedger] = useState(initialLedger);
  const [chargeContext, setChargeContext] = useState<ContryRegularizationChargeContext | null>(null);
  const [products, setProducts] = useState<CajaProductCategory[]>([]);
  const [selectedChargeIds, setSelectedChargeIds] = useState<string[]>([]);
  const [paymentAmount, setPaymentAmount] = useState(initialLedger.totals.balance > 0 ? initialLedger.totals.balance.toFixed(2) : "");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [paymentNotes, setPaymentNotes] = useState("");
  const [paymentPaidAt, setPaymentPaidAt] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<CajaProduct | null>(null);
  const [chargeAmount, setChargeAmount] = useState("");
  const [chargeSize, setChargeSize] = useState("");
  const [goalkeeper, setGoalkeeper] = useState(false);
  const [tuitionPeriod, setTuitionPeriod] = useState("");
  const [addChargeMode, setAddChargeMode] = useState<AddChargeMode>("product");
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [successPaymentId, setSuccessPaymentId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setLedger(initialLedger);
    setSelectedChargeIds([]);
    setPaymentAmount(initialLedger.totals.balance > 0 ? initialLedger.totals.balance.toFixed(2) : "");
    setSuccessMessage(null);
    setSuccessPaymentId(null);
    setErrorMessage(null);
  }, [initialLedger]);

  useEffect(() => {
    getProductsForCajaAction().then(setProducts);
  }, []);

  useEffect(() => {
    getContryRegularizationChargeContextAction(initialLedger.enrollment.id).then((context) => {
      setChargeContext(context);
      if (context?.advanceTuitionOptions[0]?.periodMonth) {
        setTuitionPeriod(context.advanceTuitionOptions[0].periodMonth.slice(0, 7));
      }
    });
  }, [initialLedger.enrollment.id]);

  const pendingCharges = useMemo(
    () => ledger.charges.filter((charge) => charge.pendingAmount > 0 && charge.status !== "void"),
    [ledger.charges],
  );

  const selectedTotal = useMemo(
    () =>
      pendingCharges
        .filter((charge) => selectedChargeIds.includes(charge.id))
        .reduce((sum, charge) => sum + charge.pendingAmount, 0),
    [pendingCharges, selectedChargeIds],
  );

  function setQuickAmount(value: number) {
    setPaymentAmount(value > 0 ? value.toFixed(2) : "");
  }

  function toggleCharge(chargeId: string) {
    setSelectedChargeIds((current) =>
      current.includes(chargeId) ? current.filter((id) => id !== chargeId) : [...current, chargeId],
    );
  }

  async function refreshWorkspace() {
    const [nextLedger, nextContext] = await Promise.all([
      getContryRegularizationLedgerAction(ledger.enrollment.id),
      getContryRegularizationChargeContextAction(ledger.enrollment.id),
    ]);
    if (nextLedger) setLedger(nextLedger);
    if (nextContext) {
      setChargeContext(nextContext);
      if (!tuitionPeriod && nextContext.advanceTuitionOptions[0]?.periodMonth) {
        setTuitionPeriod(nextContext.advanceTuitionOptions[0].periodMonth.slice(0, 7));
      }
    }
  }

  function submitHistoricalPayment() {
    setErrorMessage(null);
    setSuccessMessage(null);
    setSuccessPaymentId(null);

    startTransition(async () => {
      const formData = new FormData();
      formData.set("amount", paymentAmount);
      formData.set("method", paymentMethod);
      if (paymentNotes.trim()) formData.set("notes", paymentNotes.trim());
      if (paymentPaidAt.trim()) formData.set("paidAt", paymentPaidAt.trim());
      if (selectedChargeIds.length > 0) formData.set("targetChargeIds", selectedChargeIds.join(","));

      const result = await postContryHistoricalPaymentAction(ledger.enrollment.id, contryCampusId, formData);
      if (!result.ok) {
        setErrorMessage(getActionErrorMessage(result.error));
        return;
      }

      await refreshWorkspace();
      setSelectedChargeIds([]);
      setPaymentAmount("");
      setPaymentNotes("");
      setPaymentPaidAt("");
      setSuccessPaymentId(result.paymentId);
      setSuccessMessage("Pago histórico registrado correctamente para Contry.");
    });
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
    setSuccessMessage(null);
    setSuccessPaymentId(null);

    startTransition(async () => {
      const formData = new FormData();
      formData.set("productId", selectedProduct.id);
      if (chargeAmount) formData.set("amount", chargeAmount);
      if (chargeSize) formData.set("size", chargeSize);
      if (goalkeeper) formData.set("goalkeeper", "1");

      const result = await postCajaChargeAction(ledger.enrollment.id, formData, contryCampusId);
      if (!result.ok) {
        setErrorMessage(getActionErrorMessage(result.error));
        return;
      }

      await refreshWorkspace();
      setSelectedProduct(null);
      setChargeAmount("");
      setChargeSize("");
      setGoalkeeper(false);
      setSuccessMessage("Cargo agregado correctamente.");
    });
  }

  function submitAdvanceTuition() {
    if (!tuitionPeriod) return;
    setErrorMessage(null);
    setSuccessMessage(null);
    setSuccessPaymentId(null);

    startTransition(async () => {
      const result = await createAdvanceTuitionAction(ledger.enrollment.id, tuitionPeriod, contryCampusId);
      if (!result.ok) {
        setErrorMessage(getActionErrorMessage(result.error));
        return;
      }

      await refreshWorkspace();
      setSuccessMessage("Mensualidad agregada correctamente.");
    });
  }

  return (
    <section className="space-y-4">
      <div className="rounded-md border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/60">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">{ledger.enrollment.playerName}</p>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              {ledger.enrollment.campusName} ({ledger.enrollment.campusCode}) | Inscripción {ledger.enrollment.id}
            </p>
          </div>
          <Link
            href={`/enrollments/${ledger.enrollment.id}/charges`}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-white dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Ver cuenta completa
          </Link>
        </div>
      </div>

      {successMessage ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200">
          <p>{successMessage}</p>
          {successPaymentId ? (
            <div className="mt-2 flex flex-wrap gap-3">
              <Link href={`/receipts?payment=${encodeURIComponent(successPaymentId)}`} className="font-medium text-portoBlue hover:underline">
                Ver recibo guardado
              </Link>
            </div>
          ) : null}
        </div>
      ) : null}

      {errorMessage ? (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-200">
          {errorMessage}
        </div>
      ) : null}

      <LedgerSummaryCards
        currency={ledger.enrollment.currency}
        totalCharges={ledger.totals.totalCharges}
        totalPayments={ledger.totals.totalPayments}
        balance={ledger.totals.balance}
      />

      <section className="space-y-3 rounded-md border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900/60">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Aplicar a cargos específicos</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Los cargos seleccionados se pagan primero. Si sobra monto, el resto continúa por antigüedad.
            </p>
          </div>
          {pendingCharges.length > 0 ? (
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
          ) : null}
        </div>

        {pendingCharges.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">No hay cargos pendientes seleccionables en esta cuenta.</p>
        ) : (
          <div className="space-y-2">
            {pendingCharges.map((charge) => {
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
                      {charge.periodMonth ? `Periodo ${charge.periodMonth}` : "Sin periodo"} · {charge.dueDate ? `Vence ${charge.dueDate}` : "Sin vencimiento"}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-semibold text-rose-600">
                    {formatMoney(charge.pendingAmount, charge.currency)}
                  </span>
                </label>
              );
            })}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800/60">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            {selectedChargeIds.length > 0
              ? `${selectedChargeIds.length} cargo(s) seleccionados`
              : "Sin cargos seleccionados"}
          </p>
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Total seleccionado: {formatMoney(selectedTotal, ledger.enrollment.currency)}
          </p>
        </div>
      </section>

      <section className="space-y-3 rounded-md border border-amber-200 bg-amber-50/70 p-4 dark:border-amber-800 dark:bg-amber-950/20">
        <div className="space-y-1">
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Registrar pago histórico</p>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            Esta captura sigue siendo solo para Regularización Contry. No imprime automáticamente y no se vincula a la sesión de caja.
          </p>
        </div>

        {ledger.totals.balance > 0 ? (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Saldo pendiente actual: <span className="font-semibold text-rose-600">{formatMoney(ledger.totals.balance, ledger.enrollment.currency)}</span>.
          </p>
        ) : (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            No hay saldo pendiente. Un pago aquí generará crédito en cuenta.
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          {selectedTotal > 0 ? (
            <button
              type="button"
              onClick={() => setQuickAmount(selectedTotal)}
              className="rounded-md border border-portoBlue px-3 py-1.5 text-xs font-medium text-portoBlue hover:bg-portoBlue/5"
            >
              Usar total seleccionado
            </button>
          ) : null}
          {ledger.totals.balance > 0 ? (
            <button
              type="button"
              onClick={() => setQuickAmount(ledger.totals.balance)}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Usar saldo completo
            </button>
          ) : null}
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <label className="space-y-1 text-sm">
            <span className="font-medium text-slate-700 dark:text-slate-300">Monto</span>
            <input
              type="number"
              step="0.01"
              min="0.01"
              required
              value={paymentAmount}
              onChange={(event) => setPaymentAmount(event.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-slate-900"
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium text-slate-700 dark:text-slate-300">Método</span>
            <select
              value={paymentMethod}
              onChange={(event) => setPaymentMethod(event.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-slate-900"
            >
              <option value="cash">Efectivo</option>
              <option value="transfer">Transferencia</option>
              <option value="card">Tarjeta</option>
              <option value="stripe_360player">360Player</option>
              <option value="other">Otro</option>
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium text-slate-700 dark:text-slate-300">Notas</span>
            <input
              type="text"
              value={paymentNotes}
              onChange={(event) => setPaymentNotes(event.target.value)}
              placeholder="Referencia, nota del papel, etc."
              className="w-full rounded-md border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-slate-900"
            />
          </label>
        </div>

        <label className="block space-y-1 text-sm">
          <span className="font-medium text-slate-700 dark:text-slate-300">Fecha y hora real del pago</span>
          <input
            type="datetime-local"
            required
            value={paymentPaidAt}
            onChange={(event) => setPaymentPaidAt(event.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-slate-900"
          />
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Obligatoria en regularización. Este valor define el historial real y el corte histórico.
          </p>
        </label>

        <button
          type="button"
          disabled={isPending || !paymentAmount || !paymentPaidAt}
          onClick={submitHistoricalPayment}
          className="rounded-md bg-portoBlue px-4 py-2 text-sm font-medium text-white hover:bg-portoDark disabled:opacity-50"
        >
          {isPending ? "Registrando…" : "Registrar pago histórico"}
        </button>
      </section>

      <section className="space-y-4 rounded-md border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900/60">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Agregar nuevo cargo</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">Caja-lite para Regularización Contry: crea cargos y mensualidades sin salir de esta cuenta.</p>
          </div>
          <div className="flex rounded-md border border-slate-300 p-1 dark:border-slate-600">
            <button
              type="button"
              onClick={() => setAddChargeMode("product")}
              className={`rounded px-3 py-1.5 text-sm ${addChargeMode === "product" ? "bg-portoBlue text-white" : "text-slate-700 dark:text-slate-300"}`}
            >
              Catálogo
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
          <div className="space-y-4">
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
                            {product.defaultAmount != null ? formatMoney(product.defaultAmount, ledger.enrollment.currency) : "Precio libre"}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

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
                      Portero {goalkeeper ? "✓" : ""}
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
                    {isPending ? "Guardando…" : "Crear cargo"}
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
                {(chargeContext?.advanceTuitionOptions ?? []).map((option) => (
                  <option key={option.periodMonth} value={option.periodMonth.slice(0, 7)}>
                    {option.label} · {formatMoney(option.amount, ledger.enrollment.currency)}
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
              {isPending ? "Guardando…" : "Agregar mensualidad"}
            </button>
          </div>
        )}
      </section>

      <section className="space-y-2">
        <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Cargos pendientes e históricos</h3>
        <ChargesLedgerTable rows={ledger.charges} />
      </section>

      <section className="space-y-2">
        <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Pagos registrados</h3>
        <PaymentsTable rows={ledger.payments} />
      </section>
    </section>
  );
}
