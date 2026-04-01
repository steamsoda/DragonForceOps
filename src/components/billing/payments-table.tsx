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
};

type PaymentsTableProps = {
  rows: PaymentItem[];
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

export function PaymentsTable({ rows, voidPaymentAction }: PaymentsTableProps) {
  return (
    <div className="overflow-x-auto rounded-md border border-slate-200 dark:border-slate-700">
      <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700 text-sm">
        <thead className="bg-slate-50 dark:bg-slate-800 text-left text-xs uppercase tracking-wide text-slate-600 dark:text-slate-400">
          <tr>
            <th className="px-3 py-2">Fecha</th>
            <th className="px-3 py-2">Metodo</th>
            <th className="px-3 py-2">Campus que recibe</th>
            <th className="px-3 py-2">Estatus</th>
            <th className="px-3 py-2">Monto</th>
            <th className="px-3 py-2">Aplicado</th>
            <th className="px-3 py-2">Notas</th>
            {voidPaymentAction && <th className="px-3 py-2" />}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
          {rows.length === 0 ? (
            <tr>
              <td className="px-3 py-4 text-slate-600 dark:text-slate-400" colSpan={voidPaymentAction ? 8 : 7}>
                No hay pagos registrados.
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={row.id} className={row.status === "void" ? "opacity-50" : ""}>
                <td className="px-3 py-2">{formatDate(row.paidAt)}</td>
                <td className="px-3 py-2">{getPaymentMethodLabel(row.method)}</td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span>{row.operatorCampusName}</span>
                    {row.isCrossCampus ? (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                        Cruzado
                      </span>
                    ) : null}
                  </div>
                </td>
                <td className="px-3 py-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    row.status === "posted"
                      ? "bg-emerald-100 text-emerald-800"
                      : "bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400"
                  }`}>
                    {getPaymentStatusLabel(row.status)}
                  </span>
                </td>
                <td className="px-3 py-2">{formatMoney(row.amount, row.currency)}</td>
                <td className="px-3 py-2">{formatMoney(row.allocatedAmount, row.currency)}</td>
                <td className="px-3 py-2">{row.notes?.trim() ? row.notes : "-"}</td>
                {voidPaymentAction && (
                  <td className="relative px-3 py-2">
                    {row.status === "posted" && (
                      <details className="group">
                        <summary className="cursor-pointer list-none rounded-md border border-rose-300 px-2 py-1 text-xs font-medium text-rose-600 hover:bg-rose-50 dark:border-rose-700 dark:text-rose-400 dark:hover:bg-rose-900/20">
                          Anular
                        </summary>
                        <form
                          action={voidPaymentAction.bind(null, row.id)}
                          className="absolute right-0 z-10 mt-1 w-60 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3 shadow-lg"
                        >
                          <p className="mb-2 text-xs font-semibold text-slate-700 dark:text-slate-300">
                            Motivo de anulacion
                          </p>
                          <input
                            name="reason"
                            required
                            placeholder="Ej: pago duplicado, error de monto…"
                            className="mb-2 w-full rounded border border-slate-300 dark:border-slate-600 px-2 py-1.5 text-xs"
                          />
                          <button
                            type="submit"
                            className="w-full rounded bg-rose-600 px-2 py-1.5 text-xs font-semibold text-white hover:bg-rose-700"
                          >
                            Confirmar anulacion
                          </button>
                        </form>
                      </details>
                    )}
                  </td>
                )}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
