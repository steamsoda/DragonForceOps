"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";

type ChargeItem = {
  id: string;
  typeCode: string;
  typeName: string;
  description: string;
  amount: number;
  currency: string;
  status: string;
  allocatedAmount: number;
  pendingAmount: number;
  isCorrection: boolean;
  correctionKind: "corrective_charge" | "balance_adjustment" | null;
  isNonCash: boolean;
};

type PaymentSourceCharge = {
  chargeId: string;
  description: string;
  amount: number;
  allocatedAmount: number;
};

type PaymentItem = {
  id: string;
  paidAt: string;
  method: string;
  amount: number;
  allocatedAmount: number;
  status: string;
  refundStatus: "not_refunded" | "refunded";
  sourceCharges: PaymentSourceCharge[];
};

type CorrectionToolkitProps = {
  currency: string;
  canonicalBalance: number;
  charges: ChargeItem[];
  payments: PaymentItem[];
  prefilledPaymentIds: string[];
  prefilledChargeIds: string[];
  createCorrectiveChargeAction: (formData: FormData) => Promise<void>;
  createBalanceAdjustmentAction: (formData: FormData) => Promise<void>;
  repairPaymentAllocationsAction: (formData: FormData) => Promise<void>;
};

function formatMoney(amount: number, currency = "MXN") {
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

function getPaymentMethodLabel(method: string) {
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

function toMoneyInput(value: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || Math.abs(parsed) < 0.01) return null;
  return Math.round(parsed * 100) / 100;
}

function balancePreviewLabel(value: number) {
  if (value > 0.01) return "Saldo pendiente";
  if (value < -0.01) return "Crédito";
  return "Al corriente";
}

function SubmitButton({
  idleLabel,
  pendingLabel,
  disabled,
}: {
  idleLabel: string;
  pendingLabel: string;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className="rounded-md bg-portoBlue px-4 py-2 text-sm font-medium text-white hover:bg-portoDark disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? pendingLabel : idleLabel}
    </button>
  );
}

export function EnrollmentFinanceCorrectionToolkit({
  currency,
  canonicalBalance,
  charges,
  payments,
  prefilledPaymentIds,
  prefilledChargeIds,
  createCorrectiveChargeAction,
  createBalanceAdjustmentAction,
  repairPaymentAllocationsAction,
}: CorrectionToolkitProps) {
  const [correctiveAmount, setCorrectiveAmount] = useState("");
  const [adjustmentAmount, setAdjustmentAmount] = useState("");
  const [selectedPaymentIds, setSelectedPaymentIds] = useState<string[]>(() => {
    const eligiblePaymentIds = payments
      .filter((payment) => payment.status === "posted" && payment.refundStatus !== "refunded")
      .map((payment) => payment.id);
    const prefills = prefilledPaymentIds.filter((paymentId) => eligiblePaymentIds.includes(paymentId));
    return prefills.length > 0 ? prefills : [];
  });
  const [selectedChargeIds, setSelectedChargeIds] = useState<string[]>(() => {
    const eligibleChargeIds = charges
      .filter((charge) => charge.status !== "void" && charge.amount > 0)
      .map((charge) => charge.id);
    const prefilled = prefilledChargeIds.filter((chargeId) => eligibleChargeIds.includes(chargeId));
    const paymentDerived = payments
      .filter((payment) => selectedPaymentIds.includes(payment.id))
      .flatMap((payment) => payment.sourceCharges.map((charge) => charge.chargeId))
      .filter((chargeId, index, arr) => arr.indexOf(chargeId) === index && eligibleChargeIds.includes(chargeId));
    return Array.from(new Set([...prefilled, ...paymentDerived]));
  });
  const [repairReason, setRepairReason] = useState("");
  const [repairNotes, setRepairNotes] = useState("");
  const [matrix, setMatrix] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const payment of payments) {
      for (const sourceCharge of payment.sourceCharges) {
        initial[`${payment.id}:${sourceCharge.chargeId}`] = String(sourceCharge.allocatedAmount);
      }
    }
    return initial;
  });

  const eligiblePayments = payments.filter(
    (payment) => payment.status === "posted" && payment.refundStatus !== "refunded",
  );
  const eligibleCharges = charges.filter((charge) => charge.status !== "void" && charge.amount > 0);
  const selectedPayments = eligiblePayments.filter((payment) => selectedPaymentIds.includes(payment.id));
  const selectedCharges = eligibleCharges.filter((charge) => selectedChargeIds.includes(charge.id));

  const currentSelectedByCharge = new Map<string, number>();
  for (const payment of selectedPayments) {
    for (const charge of payment.sourceCharges) {
      currentSelectedByCharge.set(
        charge.chargeId,
        Math.round(((currentSelectedByCharge.get(charge.chargeId) ?? 0) + charge.allocatedAmount) * 100) / 100,
      );
    }
  }

  const rowTotals = new Map<string, number>();
  const columnTotals = new Map<string, number>();
  const allocationPlan = selectedPayments.flatMap((payment) =>
    selectedCharges.flatMap((charge) => {
      const key = `${payment.id}:${charge.id}`;
      const amount = toMoneyInput(matrix[key] ?? "");
      if (!amount) return [];
      rowTotals.set(payment.id, Math.round(((rowTotals.get(payment.id) ?? 0) + amount) * 100) / 100);
      columnTotals.set(charge.id, Math.round(((columnTotals.get(charge.id) ?? 0) + amount) * 100) / 100);
      return [{ paymentId: payment.id, chargeId: charge.id, amount }];
    }),
  );

  for (const payment of selectedPayments) {
    if (!rowTotals.has(payment.id)) rowTotals.set(payment.id, 0);
  }

  const correctiveDelta = toMoneyInput(correctiveAmount) ?? 0;
  const correctivePreviewBalance = canonicalBalance + correctiveDelta;
  const adjustmentDelta = toMoneyInput(adjustmentAmount) ?? 0;
  const adjustmentPreviewBalance = canonicalBalance + adjustmentDelta;

  const invalidPayments = selectedPayments.filter(
    (payment) => Math.abs((rowTotals.get(payment.id) ?? 0) - payment.amount) > 0.01,
  );
  const overappliedCharges = selectedCharges.filter((charge) => {
    const projectedAllocated =
      charge.allocatedAmount - (currentSelectedByCharge.get(charge.id) ?? 0) + (columnTotals.get(charge.id) ?? 0);
    return projectedAllocated - charge.amount > 0.01;
  });

  const repairFormValid =
    selectedPayments.length > 0 &&
    selectedCharges.length > 0 &&
    allocationPlan.length > 0 &&
    invalidPayments.length === 0 &&
    overappliedCharges.length === 0 &&
    repairReason.trim().length > 0 &&
    repairNotes.trim().length > 0;

  function toggleSelection(ids: string[], value: string) {
    return ids.includes(value) ? ids.filter((entry) => entry !== value) : [...ids, value];
  }

  function setMatrixValue(paymentId: string, chargeId: string, value: string) {
    setMatrix((current) => ({
      ...current,
      [`${paymentId}:${chargeId}`]: value,
    }));
  }

  return (
    <section className="space-y-3 rounded-md border border-slate-200 p-4 dark:border-slate-700">
      <div>
        <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
          Toolkit de corrección
        </h4>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Herramientas restringidas para corregir cuentas complejas sin inventar pagos ni tocar Caja.
        </p>
      </div>

      <details className="rounded-md border border-slate-200 dark:border-slate-700">
        <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-slate-900 dark:text-slate-100">
          Cargo correctivo
        </summary>
        <form action={createCorrectiveChargeAction} className="space-y-4 border-t border-slate-200 px-4 py-4 dark:border-slate-700">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1 text-sm">
              <span className="font-medium text-slate-700 dark:text-slate-300">Monto</span>
              <input
                type="number"
                name="amount"
                step="0.01"
                required
                value={correctiveAmount}
                onChange={(event) => setCorrectiveAmount(event.target.value)}
                className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium text-slate-700 dark:text-slate-300">Estatus</span>
              <select
                name="status"
                defaultValue="pending"
                className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
              >
                <option value="pending">Pendiente</option>
                <option value="posted">Registrado no caja</option>
              </select>
            </label>
          </div>
          <label className="space-y-1 text-sm">
            <span className="font-medium text-slate-700 dark:text-slate-300">Descripción visible</span>
            <input
              type="text"
              name="description"
              required
              maxLength={160}
              placeholder="Ej: cargo correctivo por diferencia de uniformes"
              className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
            />
          </label>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1 text-sm">
              <span className="font-medium text-slate-700 dark:text-slate-300">Motivo</span>
              <input
                type="text"
                name="reason"
                required
                maxLength={120}
                placeholder="Por qué se necesita la corrección"
                className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium text-slate-700 dark:text-slate-300">Notas</span>
              <input
                type="text"
                name="notes"
                required
                maxLength={200}
                placeholder="Contexto interno para auditoría"
                className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
              />
            </label>
          </div>
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800/60">
            <p className="font-medium text-slate-900 dark:text-slate-100">Vista previa</p>
            <p className="mt-1 text-slate-600 dark:text-slate-400">
              Saldo canónico: {formatMoney(canonicalBalance, currency)} → {formatMoney(correctivePreviewBalance, currency)} ({balancePreviewLabel(correctivePreviewBalance)})
            </p>
          </div>
          <SubmitButton idleLabel="Confirmar cargo correctivo" pendingLabel="Creando cargo correctivo..." />
        </form>
      </details>

      <details className="rounded-md border border-slate-200 dark:border-slate-700">
        <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-slate-900 dark:text-slate-100">
          Ajuste de saldo
        </summary>
        <form action={createBalanceAdjustmentAction} className="space-y-4 border-t border-slate-200 px-4 py-4 dark:border-slate-700">
          <label className="space-y-1 text-sm">
            <span className="font-medium text-slate-700 dark:text-slate-300">Monto</span>
            <input
              type="number"
              name="amount"
              step="0.01"
              required
              value={adjustmentAmount}
              onChange={(event) => setAdjustmentAmount(event.target.value)}
              className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
            />
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Negativo reduce saldo; positivo agrega deuda no caja.
            </p>
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium text-slate-700 dark:text-slate-300">Descripción visible</span>
            <input
              type="text"
              name="description"
              required
              maxLength={160}
              placeholder="Ej: ajuste de saldo por conciliación manual"
              className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
            />
          </label>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1 text-sm">
              <span className="font-medium text-slate-700 dark:text-slate-300">Motivo</span>
              <input
                type="text"
                name="reason"
                required
                maxLength={120}
                placeholder="Motivo de la corrección"
                className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium text-slate-700 dark:text-slate-300">Notas</span>
              <input
                type="text"
                name="notes"
                required
                maxLength={200}
                placeholder="Contexto interno para auditoría"
                className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
              />
            </label>
          </div>
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800/60">
            <p className="font-medium text-slate-900 dark:text-slate-100">Vista previa</p>
            <p className="mt-1 text-slate-600 dark:text-slate-400">
              Saldo canónico: {formatMoney(canonicalBalance, currency)} → {formatMoney(adjustmentPreviewBalance, currency)} ({balancePreviewLabel(adjustmentPreviewBalance)})
            </p>
          </div>
          <SubmitButton idleLabel="Confirmar ajuste de saldo" pendingLabel="Registrando ajuste..." />
        </form>
      </details>

      <details className="rounded-md border border-slate-200 dark:border-slate-700">
        <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-slate-900 dark:text-slate-100">
          Reparar asignaciones
        </summary>
        <form action={repairPaymentAllocationsAction} className="space-y-4 border-t border-slate-200 px-4 py-4 dark:border-slate-700">
          <input type="hidden" name="selectedPaymentIds" value={JSON.stringify(selectedPaymentIds)} />
          <input type="hidden" name="selectedChargeIds" value={JSON.stringify(selectedChargeIds)} />
          <input type="hidden" name="allocationPlan" value={JSON.stringify(allocationPlan)} />

          <div className="grid gap-4 xl:grid-cols-2">
            <div className="space-y-2 rounded-md border border-slate-200 p-3 dark:border-slate-700">
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Pagos elegibles</p>
              <div className="space-y-2">
                {eligiblePayments.length === 0 ? (
                  <p className="text-sm text-slate-500 dark:text-slate-400">No hay pagos vigentes elegibles para reparar.</p>
                ) : (
                  eligiblePayments.map((payment) => (
                    <label key={payment.id} className="flex items-start gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={selectedPaymentIds.includes(payment.id)}
                        onChange={() => setSelectedPaymentIds((current) => toggleSelection(current, payment.id))}
                        className="mt-1"
                      />
                      <span>
                        <span className="font-medium text-slate-900 dark:text-slate-100">
                          {formatMoney(payment.amount, currency)}
                        </span>
                        <span className="text-slate-500 dark:text-slate-400"> · {getPaymentMethodLabel(payment.method)} · {formatDateTime(payment.paidAt)}</span>
                      </span>
                    </label>
                  ))
                )}
              </div>
            </div>

            <div className="space-y-2 rounded-md border border-slate-200 p-3 dark:border-slate-700">
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Cargos destino</p>
              <div className="space-y-2">
                {eligibleCharges.length === 0 ? (
                  <p className="text-sm text-slate-500 dark:text-slate-400">No hay cargos elegibles para recibir asignaciones.</p>
                ) : (
                  eligibleCharges.map((charge) => (
                    <label key={charge.id} className="flex items-start gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={selectedChargeIds.includes(charge.id)}
                        onChange={() => setSelectedChargeIds((current) => toggleSelection(current, charge.id))}
                        className="mt-1"
                      />
                      <span>
                        <span className="font-medium text-slate-900 dark:text-slate-100">{charge.description}</span>
                        <span className="text-slate-500 dark:text-slate-400">
                          {" "}· {formatMoney(charge.amount, currency)} · aplicado {formatMoney(charge.allocatedAmount, currency)}
                        </span>
                      </span>
                    </label>
                  ))
                )}
              </div>
            </div>
          </div>

          {selectedPayments.length > 0 && selectedCharges.length > 0 ? (
            <div className="space-y-3 rounded-md border border-slate-200 p-3 dark:border-slate-700">
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Matriz explícita</p>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-700">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      <th className="px-2 py-2">Pago</th>
                      {selectedCharges.map((charge) => (
                        <th key={charge.id} className="px-2 py-2">
                          <div className="min-w-[11rem]">
                            <p className="font-semibold text-slate-700 dark:text-slate-200">{charge.description}</p>
                            <p className="normal-case text-[11px] font-normal text-slate-500 dark:text-slate-400">
                              {formatMoney(charge.amount, currency)}
                            </p>
                          </div>
                        </th>
                      ))}
                      <th className="px-2 py-2">Total fila</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {selectedPayments.map((payment) => (
                      <tr key={payment.id}>
                        <td className="px-2 py-2 align-top">
                          <p className="font-medium text-slate-900 dark:text-slate-100">{formatMoney(payment.amount, currency)}</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">{getPaymentMethodLabel(payment.method)}</p>
                        </td>
                        {selectedCharges.map((charge) => {
                          const key = `${payment.id}:${charge.id}`;
                          return (
                            <td key={key} className="px-2 py-2">
                              <input
                                type="number"
                                step="0.01"
                                value={matrix[key] ?? ""}
                                onChange={(event) => setMatrixValue(payment.id, charge.id, event.target.value)}
                                className="w-28 rounded-md border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-900"
                              />
                            </td>
                          );
                        })}
                        <td className="px-2 py-2 align-top">
                          <p
                            className={`font-medium ${
                              Math.abs((rowTotals.get(payment.id) ?? 0) - payment.amount) > 0.01
                                ? "text-rose-600 dark:text-rose-300"
                                : "text-emerald-600 dark:text-emerald-300"
                            }`}
                          >
                            {formatMoney(rowTotals.get(payment.id) ?? 0, currency)}
                          </p>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="grid gap-3 xl:grid-cols-2">
                <div className="rounded-md border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/60">
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Vista previa por pago</p>
                  <div className="mt-2 space-y-1 text-sm">
                    {selectedPayments.map((payment) => (
                      <p key={payment.id} className={Math.abs((rowTotals.get(payment.id) ?? 0) - payment.amount) > 0.01 ? "text-rose-600 dark:text-rose-300" : "text-slate-600 dark:text-slate-400"}>
                        {payment.id}: {formatMoney(rowTotals.get(payment.id) ?? 0, currency)} / {formatMoney(payment.amount, currency)}
                      </p>
                    ))}
                  </div>
                </div>

                <div className="rounded-md border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/60">
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Vista previa por cargo</p>
                  <div className="mt-2 space-y-1 text-sm">
                    {selectedCharges.map((charge) => {
                      const projectedAllocated =
                        charge.allocatedAmount - (currentSelectedByCharge.get(charge.id) ?? 0) + (columnTotals.get(charge.id) ?? 0);
                      const projectedPending = Math.max(charge.amount - projectedAllocated, 0);
                      const isOver = projectedAllocated - charge.amount > 0.01;
                      return (
                        <p key={charge.id} className={isOver ? "text-rose-600 dark:text-rose-300" : "text-slate-600 dark:text-slate-400"}>
                          {charge.description}: aplicado {formatMoney(projectedAllocated, currency)} · pendiente {formatMoney(projectedPending, currency)}
                        </p>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-md border border-dashed border-slate-300 px-3 py-3 text-sm text-slate-500 dark:border-slate-600 dark:text-slate-400">
              Selecciona al menos un pago y un cargo para construir la matriz explícita.
            </div>
          )}

          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1 text-sm">
              <span className="font-medium text-slate-700 dark:text-slate-300">Motivo</span>
              <input
                type="text"
                name="reason"
                required
                value={repairReason}
                onChange={(event) => setRepairReason(event.target.value)}
                maxLength={120}
                className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium text-slate-700 dark:text-slate-300">Notas</span>
              <input
                type="text"
                name="notes"
                required
                value={repairNotes}
                onChange={(event) => setRepairNotes(event.target.value)}
                maxLength={200}
                className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
              />
            </label>
          </div>

          {!repairFormValid ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
              Revisa la matriz antes de confirmar: cada pago seleccionado debe cerrar exactamente con su monto y ningún cargo puede quedar sobreaplicado.
            </div>
          ) : null}

          <SubmitButton
            idleLabel="Confirmar reparación de asignaciones"
            pendingLabel="Reparando asignaciones..."
            disabled={!repairFormValid}
          />
        </form>
      </details>
    </section>
  );
}
