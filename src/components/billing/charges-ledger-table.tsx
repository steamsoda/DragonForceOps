type ChargeItem = {
  id: string;
  typeCode: string;
  typeName: string;
  description: string;
  amount: number;
  currency: string;
  status: string;
  dueDate: string | null;
  periodMonth: string | null;
  createdAt: string;
  allocatedAmount: number;
  pendingAmount: number;
};

type ChargesLedgerTableProps = {
  rows: ChargeItem[];
};

function formatMoney(amount: number, currency: string) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency }).format(amount);
}

function formatDate(value: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("es-MX").format(new Date(value));
}

function getChargeStatusLabel(status: string) {
  switch (status) {
    case "pending":
      return "Pendiente";
    case "posted":
      return "Registrado";
    case "void":
      return "Anulado";
    default:
      return status;
  }
}

export function ChargesLedgerTable({ rows }: ChargesLedgerTableProps) {
  return (
    <div className="overflow-x-auto rounded-md border border-slate-200">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-600">
          <tr>
            <th className="px-3 py-2">Fecha</th>
            <th className="px-3 py-2">Tipo</th>
            <th className="px-3 py-2">Descripcion</th>
            <th className="px-3 py-2">Estatus</th>
            <th className="px-3 py-2">Monto</th>
            <th className="px-3 py-2">Aplicado</th>
            <th className="px-3 py-2">Pendiente</th>
            <th className="px-3 py-2">Vence</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.length === 0 ? (
            <tr>
              <td className="px-3 py-4 text-slate-600" colSpan={8}>
                No hay cargos registrados.
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={row.id}>
                <td className="px-3 py-2">{formatDate(row.createdAt)}</td>
                <td className="px-3 py-2">
                  <p className="font-medium">{row.typeName}</p>
                  <p className="text-xs text-slate-500">{row.typeCode}</p>
                </td>
                <td className="px-3 py-2">{row.description}</td>
                <td className="px-3 py-2">{getChargeStatusLabel(row.status)}</td>
                <td className="px-3 py-2">{formatMoney(row.amount, row.currency)}</td>
                <td className="px-3 py-2">{formatMoney(row.allocatedAmount, row.currency)}</td>
                <td className="px-3 py-2 font-medium">{formatMoney(row.pendingAmount, row.currency)}</td>
                <td className="px-3 py-2">{formatDate(row.dueDate)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

