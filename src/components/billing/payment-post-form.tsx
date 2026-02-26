type PendingCharge = {
  id: string;
  description: string;
  typeName: string;
  pendingAmount: number;
  currency: string;
};

type PaymentPostFormProps = {
  charges: PendingCharge[];
  action: (formData: FormData) => Promise<void>;
};

function formatMoney(amount: number, currency: string) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency }).format(amount);
}

export function PaymentPostForm({ charges, action }: PaymentPostFormProps) {
  const defaultCurrency = charges[0]?.currency ?? "MXN";

  return (
    <form action={action} className="space-y-4 rounded-md border border-slate-200 bg-white p-4">
      <div className="grid gap-3 md:grid-cols-3">
        <label className="space-y-1 text-sm">
          <span className="font-medium text-slate-700">Monto total del pago</span>
          <input
            type="number"
            name="amount"
            step="0.01"
            min="0.01"
            required
            className="w-full rounded-md border border-slate-300 px-3 py-2"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-medium text-slate-700">Metodo de pago</span>
          <select name="method" required className="w-full rounded-md border border-slate-300 px-3 py-2">
            <option value="cash">Efectivo</option>
            <option value="transfer">Transferencia</option>
            <option value="card">Tarjeta</option>
            <option value="stripe_360player">Stripe 360Player</option>
            <option value="other">Otro</option>
          </select>
        </label>
        <label className="space-y-1 text-sm md:col-span-1">
          <span className="font-medium text-slate-700">Notas</span>
          <input type="text" name="notes" className="w-full rounded-md border border-slate-300 px-3 py-2" />
        </label>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium text-slate-800">Asignaciones a cargos pendientes</p>
        {charges.length === 0 ? (
          <p className="text-sm text-slate-600">No hay cargos pendientes para asignar.</p>
        ) : (
          <div className="overflow-x-auto rounded-md border border-slate-200">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-600">
                <tr>
                  <th className="px-3 py-2">Cargo</th>
                  <th className="px-3 py-2">Pendiente</th>
                  <th className="px-3 py-2">Asignar</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {charges.map((charge) => (
                  <tr key={charge.id}>
                    <td className="px-3 py-2">
                      <p className="font-medium">{charge.typeName}</p>
                      <p className="text-xs text-slate-500">{charge.description}</p>
                    </td>
                    <td className="px-3 py-2">{formatMoney(charge.pendingAmount, charge.currency)}</td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        name={`alloc_${charge.id}`}
                        step="0.01"
                        min="0"
                        max={charge.pendingAmount}
                        placeholder="0.00"
                        className="w-36 rounded-md border border-slate-300 px-3 py-1.5"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-xs text-slate-500">
        El total asignado debe ser igual al monto del pago. Moneda base: {defaultCurrency}.
      </p>
      <button
        type="submit"
        className="rounded-md bg-portoBlue px-4 py-2 text-sm font-medium text-white hover:bg-portoDark"
      >
        Registrar pago
      </button>
    </form>
  );
}

