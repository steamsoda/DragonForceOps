type PaymentPostFormProps = {
  currentBalance: number;
  currency: string;
  action: (formData: FormData) => Promise<void>;
};

function formatMoney(amount: number, currency: string) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency }).format(amount);
}

export function PaymentPostForm({ currentBalance, currency, action }: PaymentPostFormProps) {
  const defaultAmount = currentBalance > 0 ? currentBalance.toFixed(2) : "";

  return (
    <form action={action} className="space-y-3 rounded-md border border-slate-200 bg-white p-4">
      <p className="text-sm font-medium text-slate-800">Registrar pago</p>
      {currentBalance > 0 ? (
        <p className="text-xs text-slate-500">
          Saldo pendiente:{" "}
          <span className="font-semibold text-rose-600">{formatMoney(currentBalance, currency)}</span>. El monto
          esta pre-llenado; ajusta si es un pago parcial.
        </p>
      ) : (
        <p className="text-xs text-slate-500">
          No hay saldo pendiente. Un pago aqui generara un credito en la cuenta.
        </p>
      )}
      <div className="grid gap-3 md:grid-cols-3">
        <label className="space-y-1 text-sm">
          <span className="font-medium text-slate-700">Monto del pago</span>
          <input
            type="number"
            name="amount"
            step="0.01"
            min="0.01"
            required
            defaultValue={defaultAmount}
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
        <label className="space-y-1 text-sm">
          <span className="font-medium text-slate-700">Notas (opcional)</span>
          <input
            type="text"
            name="notes"
            placeholder="Referencia, folio, etc."
            className="w-full rounded-md border border-slate-300 px-3 py-2"
          />
        </label>
      </div>
      <p className="text-xs text-slate-500">
        Los cargos pendientes se cubren automaticamente del mas antiguo al mas reciente.
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
