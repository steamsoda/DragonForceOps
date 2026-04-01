import Link from "next/link";
import { PageShell } from "@/components/ui/page-shell";
import { formatDateTimeMonterrey, getMonterreyMonthString } from "@/lib/time";
import { formatPeriodMonthLabel } from "@/lib/external-payments";
import { getExternalPaymentsDashboard } from "@/lib/queries/external-payments";
import {
  createExternalPaymentEventAction,
  ignoreExternalPaymentEventAction,
  reconcileExternalPaymentEventAction,
} from "@/server/actions/external-payments";

function fmt(value: number) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 2,
  }).format(value);
}

const OK_LABELS: Record<string, string> = {
  created: "Pago externo registrado en la cola de conciliacion.",
  matched: "Pago externo conciliado y registrado en el ledger.",
  ignored: "Pago externo marcado como ignorado.",
};

const ERR_LABELS: Record<string, string> = {
  invalid_form: "Formulario invalido. Revisa fecha, monto y campos obligatorios.",
  external_ref_required: "Necesitas al menos un identificador externo (factura, invoice o charge).",
  duplicate_ref: "Ese identificador externo ya existe en la cola.",
  create_failed: "No se pudo registrar el pago externo.",
  unauthorized: "No tienes permisos para esta operacion.",
  ignore_reason_required: "Debes escribir el motivo para ignorar el pago externo.",
  ignore_failed: "No se pudo marcar el pago externo como ignorado.",
  event_not_matchable: "Ese pago externo ya no esta disponible para conciliacion.",
  target_required: "Selecciona un cargo sugerido antes de conciliar.",
  target_invalid: "El cargo seleccionado no es una mensualidad pendiente valida.",
  target_already_paid: "Ese cargo ya no tiene saldo pendiente.",
  amount_mismatch: "El monto bruto no coincide exactamente con la mensualidad pendiente seleccionada.",
  payment_insert_failed: "No se pudo crear el pago interno.",
  allocation_insert_failed: "No se pudo crear la aplicacion del pago.",
  match_update_failed: "No se pudo cerrar la conciliacion del pago externo.",
};

type SearchParams = Promise<{ month?: string; ok?: string; err?: string }>;

export default async function ExternalPaymentsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const month = params.month ?? getMonterreyMonthString();
  const data = await getExternalPaymentsDashboard({ month });

  const banner = params.ok
    ? { type: "success" as const, message: OK_LABELS[params.ok] ?? params.ok }
    : params.err
      ? { type: "error" as const, message: ERR_LABELS[params.err] ?? params.err }
      : null;

  return (
    <PageShell
      title="Conciliacion 360Player / Stripe"
      subtitle="Registra pagos externos, revisa sugerencias, y solo despues conviertelos en pagos internos reales."
    >
      <div className="space-y-6">
        <form className="grid gap-3 rounded-md border border-slate-200 p-3 md:grid-cols-[1fr_auto_auto] dark:border-slate-700">
          <input
            type="month"
            name="month"
            defaultValue={data.month}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-600"
          />
          <button
            type="submit"
            className="rounded-md bg-portoBlue px-3 py-2 text-sm font-medium text-white hover:bg-portoDark"
          >
            Aplicar
          </button>
          <Link
            href="/reports/external-payments"
            className="rounded-md border border-slate-300 px-3 py-2 text-center text-sm hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800"
          >
            Este mes
          </Link>
        </form>

        {banner && (
          <div
            className={`rounded-md border px-4 py-3 text-sm ${
              banner.type === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300"
                : "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-900/20 dark:text-rose-300"
            }`}
          >
            {banner.message}
          </div>
        )}

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-md border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800">
            <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Bruto registrado</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900 dark:text-slate-100">{fmt(data.summary.grossAmount)}</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Pagos externos del mes filtrado</p>
          </div>
          <div className="rounded-md border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800">
            <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Comisiones</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900 dark:text-slate-100">
              {fmt(data.summary.stripeFeeAmount + data.summary.platformFeeAmount)}
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Stripe: {fmt(data.summary.stripeFeeAmount)} · Plataforma: {fmt(data.summary.platformFeeAmount)}
            </p>
          </div>
          <div className="rounded-md border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800">
            <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Neto estimado</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900 dark:text-slate-100">{fmt(data.summary.netAmount)}</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Impuesto sobre fee Stripe: {fmt(data.summary.stripeFeeTaxAmount)}
            </p>
          </div>
          <div className="rounded-md border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800">
            <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Cola de conciliacion</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900 dark:text-slate-100">{data.summary.unmatchedCount}</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Conciliados: {data.summary.matchedCount} · Ignorados: {data.summary.ignoredCount}
            </p>
          </div>
        </div>

        <section className="rounded-md border border-slate-200 p-4 dark:border-slate-700">
          <div className="mb-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-300">
              Registrar pago externo
            </h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Este paso solo agrega el pago a la cola. No afecta saldos ni recibos hasta que alguien lo concilie.
            </p>
          </div>
          <form action={createExternalPaymentEventAction} className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <input type="hidden" name="return_month" value={data.month} />
            <label className="space-y-1 text-sm">
              <span className="font-medium text-slate-700 dark:text-slate-300">Fecha/hora pagada</span>
              <input
                type="datetime-local"
                name="paid_at_local"
                required
                className="w-full rounded-md border border-slate-300 px-3 py-2 dark:border-slate-600"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium text-slate-700 dark:text-slate-300">Monto bruto</span>
              <input
                type="number"
                name="gross_amount"
                min="0.01"
                step="0.01"
                required
                className="w-full rounded-md border border-slate-300 px-3 py-2 dark:border-slate-600"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium text-slate-700 dark:text-slate-300">Factura proveedor ID</span>
              <input
                type="text"
                name="provider_invoice_id"
                className="w-full rounded-md border border-slate-300 px-3 py-2 dark:border-slate-600"
                placeholder="in_..."
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium text-slate-700 dark:text-slate-300">Numero de factura</span>
              <input
                type="text"
                name="invoice_number"
                className="w-full rounded-md border border-slate-300 px-3 py-2 dark:border-slate-600"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium text-slate-700 dark:text-slate-300">Nombre pagador</span>
              <input type="text" name="payer_name" className="w-full rounded-md border border-slate-300 px-3 py-2 dark:border-slate-600" />
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium text-slate-700 dark:text-slate-300">Email pagador</span>
              <input type="email" name="payer_email" className="w-full rounded-md border border-slate-300 px-3 py-2 dark:border-slate-600" />
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium text-slate-700 dark:text-slate-300">Jugador asignado</span>
              <input
                type="text"
                name="assigned_player_name"
                className="w-full rounded-md border border-slate-300 px-3 py-2 dark:border-slate-600"
                placeholder="Nombre del jugador en 360Player"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium text-slate-700 dark:text-slate-300">Grupo / equipo</span>
              <input type="text" name="provider_group_label" className="w-full rounded-md border border-slate-300 px-3 py-2 dark:border-slate-600" />
            </label>
            <label className="space-y-1 text-sm md:col-span-2 xl:col-span-4">
              <span className="font-medium text-slate-700 dark:text-slate-300">Descripcion factura</span>
              <input
                type="text"
                name="invoice_description"
                className="w-full rounded-md border border-slate-300 px-3 py-2 dark:border-slate-600"
                placeholder="Ej: 1x MENSUALIDAD FEBRERO 2026 (600.00 mxn)"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium text-slate-700 dark:text-slate-300">Stripe charge ID</span>
              <input type="text" name="stripe_charge_id" className="w-full rounded-md border border-slate-300 px-3 py-2 dark:border-slate-600" />
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium text-slate-700 dark:text-slate-300">Stripe payment intent</span>
              <input type="text" name="stripe_payment_intent_id" className="w-full rounded-md border border-slate-300 px-3 py-2 dark:border-slate-600" />
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium text-slate-700 dark:text-slate-300">Stripe invoice ID</span>
              <input type="text" name="stripe_invoice_id" className="w-full rounded-md border border-slate-300 px-3 py-2 dark:border-slate-600" />
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium text-slate-700 dark:text-slate-300">Moneda</span>
              <input type="text" name="currency" defaultValue="MXN" className="w-full rounded-md border border-slate-300 px-3 py-2 dark:border-slate-600" />
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium text-slate-700 dark:text-slate-300">Fee Stripe</span>
              <input type="number" name="stripe_fee_amount" min="0" step="0.01" className="w-full rounded-md border border-slate-300 px-3 py-2 dark:border-slate-600" />
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium text-slate-700 dark:text-slate-300">IVA fee Stripe</span>
              <input type="number" name="stripe_fee_tax_amount" min="0" step="0.01" className="w-full rounded-md border border-slate-300 px-3 py-2 dark:border-slate-600" />
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium text-slate-700 dark:text-slate-300">Fee 360Player</span>
              <input type="number" name="platform_fee_amount" min="0" step="0.01" className="w-full rounded-md border border-slate-300 px-3 py-2 dark:border-slate-600" />
            </label>
            <label className="space-y-1 text-sm md:col-span-2 xl:col-span-4">
              <span className="font-medium text-slate-700 dark:text-slate-300">Notas</span>
              <textarea
                name="notes"
                rows={2}
                className="w-full rounded-md border border-slate-300 px-3 py-2 dark:border-slate-600"
                placeholder="Observaciones operativas opcionales"
              />
            </label>
            <div className="md:col-span-2 xl:col-span-4">
              <button
                type="submit"
                className="rounded-md bg-portoBlue px-4 py-2 text-sm font-medium text-white hover:bg-portoDark"
              >
                Registrar en cola
              </button>
            </div>
          </form>
        </section>

        <section className="rounded-md border border-slate-200 p-4 dark:border-slate-700">
          <div className="mb-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-300">
              Pendientes por conciliar
            </h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              V1 solo concilia mensualidades pendientes. El sistema sugiere jugador + mes, pero nunca publica un pago solo.
            </p>
          </div>

          {data.unmatched.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">No hay pagos externos pendientes en este mes.</p>
          ) : (
            <div className="space-y-4">
              {data.unmatched.map((event) => (
                <div key={event.id} className="grid gap-4 rounded-lg border border-slate-200 p-4 lg:grid-cols-[1.2fr_0.8fr] dark:border-slate-700">
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
                        Pendiente
                      </span>
                      {event.parsedPeriodLabel ? (
                        <span className="rounded-full bg-sky-100 px-2.5 py-1 text-xs font-medium text-sky-800 dark:bg-sky-900/20 dark:text-sky-300">
                          {event.parsedPeriodLabel}
                        </span>
                      ) : (
                        <span className="rounded-full bg-rose-100 px-2.5 py-1 text-xs font-medium text-rose-800 dark:bg-rose-900/20 dark:text-rose-300">
                          Sin mes reconocido
                        </span>
                      )}
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div>
                        <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Bruto / neto</p>
                        <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">
                          {fmt(event.grossAmount)} · Neto estimado {fmt(event.netAmount)}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Pagado: {formatDateTimeMonterrey(event.paidAt)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Referencia</p>
                        <p className="mt-1 text-sm font-medium text-slate-900 dark:text-slate-100">{event.externalRef}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Factura: {event.invoiceNumber ?? "-"} · Proveedor ID: {event.providerInvoiceId ?? "-"}
                        </p>
                      </div>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div>
                        <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Jugador / pagador</p>
                        <p className="mt-1 text-sm text-slate-900 dark:text-slate-100">
                          {event.assignedPlayerName ?? "Sin jugador asignado"}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Pagador: {event.payerName ?? "-"} {event.payerEmail ? `· ${event.payerEmail}` : ""}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Descripcion</p>
                        <p className="mt-1 text-sm text-slate-900 dark:text-slate-100">{event.invoiceDescription ?? "-"}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Grupo: {event.providerGroupLabel ?? "-"} · Stripe charge: {event.stripeChargeId ?? "-"}
                        </p>
                      </div>
                    </div>
                    {(event.stripeFeeAmount || event.platformFeeAmount || event.stripeFeeTaxAmount) && (
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Fee Stripe: {fmt(event.stripeFeeAmount ?? 0)} · IVA fee: {fmt(event.stripeFeeTaxAmount ?? 0)} · Fee 360Player: {fmt(event.platformFeeAmount ?? 0)}
                      </p>
                    )}
                    {event.notes && <p className="text-xs text-slate-500 dark:text-slate-400">Notas: {event.notes}</p>}
                  </div>

                  <div className="space-y-3 rounded-md border border-slate-200 p-3 dark:border-slate-700">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Conciliar y registrar pago</h3>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        Selecciona una mensualidad pendiente. El monto bruto debe coincidir exactamente.
                      </p>
                    </div>
                    {event.matchOptions.length > 0 ? (
                      <form action={reconcileExternalPaymentEventAction} className="space-y-3">
                        <input type="hidden" name="return_month" value={data.month} />
                        <input type="hidden" name="event_id" value={event.id} />
                        <label className="space-y-1 text-sm">
                          <span className="font-medium text-slate-700 dark:text-slate-300">Mensualidad sugerida</span>
                          <select
                            name="target_charge_id"
                            required
                            defaultValue={event.suggestedChargeId ?? ""}
                            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-600"
                          >
                            <option value="">Selecciona un cargo</option>
                            {event.matchOptions.map((option) => (
                              <option key={option.chargeId} value={option.chargeId}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <button
                          type="submit"
                          className="w-full rounded-md bg-portoBlue px-3 py-2 text-sm font-medium text-white hover:bg-portoDark"
                        >
                          Conciliar y registrar pago
                        </button>
                      </form>
                    ) : (
                      <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-800 dark:bg-rose-900/20 dark:text-rose-300">
                        No encontre una mensualidad pendiente confiable para sugerir. Deja este evento en cola o ignoralo con razon.
                      </div>
                    )}

                    <form action={ignoreExternalPaymentEventAction} className="space-y-2 border-t border-slate-200 pt-3 dark:border-slate-700">
                      <input type="hidden" name="return_month" value={data.month} />
                      <input type="hidden" name="event_id" value={event.id} />
                      <label className="space-y-1 text-sm">
                        <span className="font-medium text-slate-700 dark:text-slate-300">Ignorar con motivo</span>
                        <input
                          type="text"
                          name="ignored_reason"
                          required
                          placeholder="Ej: no es mensualidad / pago duplicado"
                          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-600"
                        />
                      </label>
                      <button
                        type="submit"
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800"
                      >
                        Ignorar
                      </button>
                    </form>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <div className="grid gap-6 xl:grid-cols-2">
          <section className="rounded-md border border-slate-200 p-4 dark:border-slate-700">
            <div className="mb-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-300">
                Conciliados
              </h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Ya generaron pago interno, folio y recibo normal. Reimpresion desde Recibos.
              </p>
            </div>
            {data.matched.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">Sin pagos conciliados en este mes.</p>
            ) : (
              <div className="space-y-3">
                {data.matched.map((row) => (
                  <div key={row.id} className="rounded-md border border-slate-200 p-3 text-sm dark:border-slate-700">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-medium text-slate-900 dark:text-slate-100">
                          {row.matchedPlayerName ?? row.assignedPlayerName ?? row.payerName ?? "Pago conciliado"}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {row.matchedCampusName ?? "-"} · {row.matchedChargeDescription ?? "-"} · {row.matchedChargePeriodLabel ?? "-"}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-slate-900 dark:text-slate-100">{fmt(row.grossAmount)}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{formatDateTimeMonterrey(row.paidAt)}</p>
                      </div>
                    </div>
                    <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                      Folio: {row.matchedPaymentFolio ?? "-"} · Factura: {row.invoiceNumber ?? "-"} · Neto estimado: {fmt(row.netAmount)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-md border border-slate-200 p-4 dark:border-slate-700">
            <div className="mb-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-300">
                Ignorados
              </h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                No afectan saldos ni reportes. Sirven como rastro operativo para pagos descartados o fuera de alcance.
              </p>
            </div>
            {data.ignored.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">Sin pagos ignorados en este mes.</p>
            ) : (
              <div className="space-y-3">
                {data.ignored.map((row) => (
                  <div key={row.id} className="rounded-md border border-slate-200 p-3 text-sm dark:border-slate-700">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-medium text-slate-900 dark:text-slate-100">
                          {row.assignedPlayerName ?? row.payerName ?? "Pago ignorado"}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {row.invoiceDescription ?? "-"} · {formatPeriodMonthLabel(null)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-slate-900 dark:text-slate-100">{fmt(row.grossAmount)}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{formatDateTimeMonterrey(row.paidAt)}</p>
                      </div>
                    </div>
                    <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                      Motivo: {row.ignoredReason ?? "-"} · Factura: {row.invoiceNumber ?? "-"}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </PageShell>
  );
}
