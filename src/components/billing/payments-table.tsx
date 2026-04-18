import Link from "next/link";
import { formatDateTimeMonterrey } from "@/lib/time";

type PaymentItem = {
  id: string;
  paidAt: string;
  method: string;
  amount: number;
  currency: string;
  status: string;
  notes: string | null;
  allocatedAmount: number;
  operatorCampusName: string;
  isCrossCampus: boolean;
  refundStatus: "not_refunded" | "refunded";
  refundedAt: string | null;
  refundMethod: string | null;
  refundReason: string | null;
  refundNotes: string | null;
  canReassign: boolean;
  reassignBlockedReason: string | null;
};

type PaymentsTableProps = {
  enrollmentId: string;
  rows: PaymentItem[];
  returnTo?: string;
  voidPaymentAction?: (paymentId: string, fd: FormData) => Promise<void>;
};

function formatMoney(amount: number, currency: string) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency }).format(amount);
}

function formatDate(value: string) {
  return formatDateTimeMonterrey(value);
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

function getPaymentStatusLabel(status: string) {
  switch (status) {
    case "posted":
      return "Registrado";
    case "void":
      return "Anulado";
    case "refunded":
      return "Reembolsado";
    default:
      return status;
  }
}

function getRefundMethodLabel(method: string | null) {
  return method ? getPaymentMethodLabel(method) : "-";
}

function getReassignBlockedReason(code: string | null) {
  const messages: Record<string, string> = {
    payment_not_posted: "Solo se puede cambiar concepto en pagos vigentes.",
    payment_already_refunded: "Este pago ya fue reembolsado.",
    payment_has_no_allocations: "Este pago ya no tiene cargos aplicados.",
    payment_not_fully_allocated: "Solo se pueden mover pagos aplicados al 100%.",
    source_charge_shared: "El cargo origen tambien tiene otro pago aplicado.",
    source_charge_not_exclusive: "El cargo origen no esta cubierto de forma exclusiva por este pago.",
  };
  return code ? messages[code] ?? "Este pago no se puede mover con seguridad." : null;
}

export function PaymentsTable({ enrollmentId, rows, returnTo, voidPaymentAction }: PaymentsTableProps) {
  const colSpan = voidPaymentAction ? 8 : 7;

  return (
    <div className="overflow-x-auto rounded-md border border-slate-200 dark:border-slate-700">
      <table className="w-full divide-y divide-slate-200 text-sm dark:divide-slate-700">
        <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-600 dark:bg-slate-800 dark:text-slate-400">
          <tr>
            <th className="px-3 py-2">Pago</th>
            <th className="px-3 py-2">Campus que recibe</th>
            <th className="px-3 py-2">Estatus</th>
            <th className="px-3 py-2 text-right">Monto</th>
            <th className="px-3 py-2 text-right">Aplicado</th>
            <th className="px-3 py-2">Notas</th>
            <th className="px-3 py-2">Acciones</th>
            {voidPaymentAction ? <th className="px-3 py-2">Director</th> : null}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
          {rows.length === 0 ? (
            <tr>
              <td className="px-3 py-4 text-slate-600 dark:text-slate-400" colSpan={colSpan}>
                No hay pagos registrados.
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={row.id} className={row.status === "void" ? "opacity-50" : ""}>
                <td className="px-3 py-2 align-top">
                  <div className="space-y-1">
                    <p className="text-slate-900 dark:text-slate-100">{formatDate(row.paidAt)}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{getPaymentMethodLabel(row.method)}</p>
                  </div>
                </td>
                <td className="px-3 py-2 align-top">
                  <div className="flex flex-wrap items-center gap-2">
                    <span>{row.operatorCampusName}</span>
                    {row.isCrossCampus ? (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                        Cruzado
                      </span>
                    ) : null}
                  </div>
                </td>
                <td className="px-3 py-2 align-top">
                  <div className="space-y-1">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        row.refundStatus === "refunded"
                          ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
                          : row.status === "posted"
                            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
                            : "bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400"
                      }`}
                    >
                      {row.refundStatus === "refunded" ? "Reembolsado" : getPaymentStatusLabel(row.status)}
                    </span>
                    {row.refundStatus === "refunded" ? (
                      <p className="text-[11px] text-amber-700 dark:text-amber-300">
                        {row.refundedAt
                          ? `${formatDate(row.refundedAt)} | ${getRefundMethodLabel(row.refundMethod)}`
                          : getRefundMethodLabel(row.refundMethod)}
                      </p>
                    ) : null}
                  </div>
                </td>
                <td className="px-3 py-2 text-right align-top">{formatMoney(row.amount, row.currency)}</td>
                <td className="px-3 py-2 text-right align-top">{formatMoney(row.allocatedAmount, row.currency)}</td>
                <td className="px-3 py-2 align-top">
                  <div className="space-y-1">
                    <p className="max-w-xs whitespace-normal break-words">{row.notes?.trim() ? row.notes : "-"}</p>
                    {row.refundReason ? (
                      <p className="text-[11px] text-amber-700 dark:text-amber-300">Reembolso: {row.refundReason}</p>
                    ) : null}
                  </div>
                </td>
                <td className="px-3 py-2 align-top">
                  <div className="flex flex-col gap-2">
                    {row.status === "posted" ? (
                      <>
                        {row.canReassign ? (
                          <Link
                            href={`/enrollments/${enrollmentId}/payments/${row.id}/reassign${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ""}`}
                            className="inline-flex rounded-md border border-blue-300 px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50 dark:border-blue-700 dark:text-blue-300 dark:hover:bg-blue-950/20"
                          >
                            Cambiar concepto
                          </Link>
                        ) : (
                          <span
                            className="inline-flex rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-400"
                            title={getReassignBlockedReason(row.reassignBlockedReason) ?? undefined}
                          >
                            Cambiar concepto
                          </span>
                        )}
                        {row.refundStatus === "refunded" ? (
                          <span className="inline-flex rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-400">
                            Reembolsar
                          </span>
                        ) : (
                          <Link
                            href={`/enrollments/${enrollmentId}/payments/${row.id}/refund${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ""}`}
                            className="inline-flex rounded-md border border-amber-300 px-2 py-1 text-xs font-medium text-amber-700 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-300 dark:hover:bg-amber-950/20"
                          >
                            Reembolsar
                          </Link>
                        )}
                        {!row.canReassign && row.reassignBlockedReason ? (
                          <p className="max-w-[14rem] text-[11px] text-slate-500 dark:text-slate-400">
                            {getReassignBlockedReason(row.reassignBlockedReason)}
                          </p>
                        ) : null}
                      </>
                    ) : (
                      <span className="text-xs text-slate-400">Sin acciones</span>
                    )}
                  </div>
                </td>
                {voidPaymentAction ? (
                  <td className="relative px-3 py-2 align-top">
                    {row.status === "posted" ? (
                      <details className="group">
                        <summary className="cursor-pointer list-none rounded-md border border-rose-300 px-2 py-1 text-xs font-medium text-rose-600 hover:bg-rose-50 dark:border-rose-700 dark:text-rose-400 dark:hover:bg-rose-900/20">
                          Anular
                        </summary>
                        <form
                          action={voidPaymentAction.bind(null, row.id)}
                          className="absolute right-0 z-10 mt-1 w-60 rounded-md border border-slate-200 bg-white p-3 shadow-lg dark:border-slate-700 dark:bg-slate-800"
                        >
                          <p className="mb-2 text-xs font-semibold text-slate-700 dark:text-slate-300">Motivo de anulacion</p>
                          <input
                            name="reason"
                            required
                            placeholder="Ej: pago duplicado, error de monto..."
                            className="mb-2 w-full rounded border border-slate-300 px-2 py-1.5 text-xs dark:border-slate-600"
                          />
                          <button
                            type="submit"
                            className="w-full rounded bg-rose-600 px-2 py-1.5 text-xs font-semibold text-white hover:bg-rose-700"
                          >
                            Confirmar anulacion
                          </button>
                        </form>
                      </details>
                    ) : (
                      <span className="text-xs text-slate-400">-</span>
                    )}
                  </td>
                ) : null}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
