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
  isCorrection?: boolean;
  correctionKind?: "corrective_charge" | "balance_adjustment" | null;
  isNonCash?: boolean;
};

type ChargesLedgerTableProps = {
  rows: ChargeItem[];
  voidChargeAction?: (chargeId: string, fd: FormData) => Promise<void>;
};

function formatMoney(amount: number, currency: string) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency }).format(amount);
}

function formatDate(value: string | null) {
  if (!value) return "-";
  const [y, m, d] = value.split("-");
  return d ? `${d}/${m}/${y}` : value;
}

function getEffectiveStatus(status: string, pendingAmount: number) {
  if (status === "void") return "void";
  if (status === "pending" && pendingAmount <= 0) return "paid";
  if (status === "pending") return "pending";
  return "posted";
}

function getChargeStatusLabel(effectiveStatus: string) {
  switch (effectiveStatus) {
    case "paid":
      return "Pagado";
    case "pending":
      return "Pendiente";
    case "void":
      return "Anulado";
    default:
      return "Registrado";
  }
}

export function ChargesLedgerTable({ rows, voidChargeAction }: ChargesLedgerTableProps) {
  return (
    <div className="overflow-x-auto rounded-md border border-slate-200 dark:border-slate-700">
      <table className="w-full divide-y divide-slate-200 text-sm dark:divide-slate-700">
        <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-600 dark:bg-slate-800 dark:text-slate-400">
          <tr>
            <th className="px-3 py-2">Cargo</th>
            <th className="px-3 py-2">Estatus</th>
            <th className="px-3 py-2 text-right">Monto</th>
            <th className="px-3 py-2 text-right">Aplicado</th>
            <th className="px-3 py-2 text-right">Pendiente</th>
            {voidChargeAction ? <th className="px-3 py-2 text-right">Acciones</th> : null}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
          {rows.length === 0 ? (
            <tr>
              <td className="px-3 py-4 text-slate-600 dark:text-slate-400" colSpan={voidChargeAction ? 6 : 5}>
                No hay cargos registrados.
              </td>
            </tr>
          ) : (
            rows.map((row) => {
              const effectiveStatus = getEffectiveStatus(row.status, row.pendingAmount);

              return (
                <tr key={row.id} className={row.status === "void" ? "opacity-50" : ""}>
                  <td className="px-3 py-2 align-top">
                    <div className="space-y-1">
                      <p className="text-xs text-slate-500 dark:text-slate-400">{formatDate(row.createdAt)}</p>
                      <div className="flex flex-wrap items-center gap-1">
                        <span className="font-medium text-slate-800 dark:text-slate-200">{row.typeName}</span>
                        <span className="text-xs text-slate-500 dark:text-slate-400">{row.typeCode}</span>
                        {row.isCorrection ? (
                          <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-medium text-violet-800 dark:bg-violet-900/40 dark:text-violet-300">
                            Correctivo
                          </span>
                        ) : null}
                        {row.isNonCash ? (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700 dark:bg-slate-700 dark:text-slate-300">
                            No caja
                          </span>
                        ) : null}
                      </div>
                      <p className="break-words text-slate-700 dark:text-slate-300">{row.description}</p>
                      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                        {row.periodMonth ? <span>Periodo {row.periodMonth.slice(0, 7)}</span> : null}
                        <span>Vence {formatDate(row.dueDate)}</span>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2 align-top">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        effectiveStatus === "pending"
                          ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
                          : effectiveStatus === "void"
                            ? "bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400"
                            : "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
                      }`}
                    >
                      {getChargeStatusLabel(effectiveStatus)}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right align-top text-slate-700 dark:text-slate-300">
                    {formatMoney(row.amount, row.currency)}
                  </td>
                  <td className="px-3 py-2 text-right align-top text-slate-700 dark:text-slate-300">
                    {formatMoney(row.allocatedAmount, row.currency)}
                  </td>
                  <td className="px-3 py-2 text-right align-top font-medium text-slate-900 dark:text-slate-100">
                    {formatMoney(row.pendingAmount, row.currency)}
                  </td>
                  {voidChargeAction ? (
                    <td className="relative px-3 py-2 text-right align-top">
                      {row.status === "pending" ? (
                        <details className="group">
                          <summary className="cursor-pointer list-none rounded-md border border-rose-300 px-2 py-1 text-xs font-medium text-rose-600 hover:bg-rose-50 dark:border-rose-700 dark:text-rose-400 dark:hover:bg-rose-900/20">
                            Anular
                          </summary>
                          <form
                            action={voidChargeAction.bind(null, row.id)}
                            className="absolute right-0 z-10 mt-1 w-60 rounded-md border border-slate-200 bg-white p-3 shadow-lg dark:border-slate-700 dark:bg-slate-800"
                          >
                            <p className="mb-2 text-xs font-semibold text-slate-700 dark:text-slate-300">Motivo de anulacion</p>
                            <input
                              name="reason"
                              required
                              placeholder="Ej: baja, error de captura..."
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
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
