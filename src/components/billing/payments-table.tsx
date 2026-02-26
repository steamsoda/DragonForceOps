type PaymentItem = {
  id: string;
  paidAt: string;
  method: string;
  amount: number;
  currency: string;
  status: string;
  notes: string | null;
  allocatedAmount: number;
};

type PaymentsTableProps = {
  rows: PaymentItem[];
};

function formatMoney(amount: number, currency: string) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency }).format(amount);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(new Date(value));
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
      return "Stripe 360Player";
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

export function PaymentsTable({ rows }: PaymentsTableProps) {
  return (
    <div className="overflow-x-auto rounded-md border border-slate-200">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-600">
          <tr>
            <th className="px-3 py-2">Fecha</th>
            <th className="px-3 py-2">Metodo</th>
            <th className="px-3 py-2">Estatus</th>
            <th className="px-3 py-2">Monto</th>
            <th className="px-3 py-2">Aplicado</th>
            <th className="px-3 py-2">Notas</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.length === 0 ? (
            <tr>
              <td className="px-3 py-4 text-slate-600" colSpan={6}>
                No hay pagos registrados.
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={row.id}>
                <td className="px-3 py-2">{formatDate(row.paidAt)}</td>
                <td className="px-3 py-2">{getPaymentMethodLabel(row.method)}</td>
                <td className="px-3 py-2">{getPaymentStatusLabel(row.status)}</td>
                <td className="px-3 py-2">{formatMoney(row.amount, row.currency)}</td>
                <td className="px-3 py-2">{formatMoney(row.allocatedAmount, row.currency)}</td>
                <td className="px-3 py-2">{row.notes?.trim() ? row.notes : "-"}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

