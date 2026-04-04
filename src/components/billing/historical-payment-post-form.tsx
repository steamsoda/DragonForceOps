type HistoricalPaymentPostFormProps = {
  action: (formData: FormData) => Promise<void>;
  currentBalance: number;
  currency: string;
};

function formatMoney(amount: number, currency: string) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency }).format(amount);
}

export function HistoricalPaymentPostForm({
  action,
  currentBalance,
  currency,
}: HistoricalPaymentPostFormProps) {
  const defaultAmount = currentBalance > 0 ? currentBalance.toFixed(2) : "";

  return (
    <form
      action={action}
      className="space-y-3 rounded-md border border-amber-200 bg-amber-50/70 p-4 dark:border-amber-800 dark:bg-amber-950/20"
    >
      <div className="space-y-1">
        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Registrar pago historico</p>
        <p className="text-xs text-slate-600 dark:text-slate-400">
          Esta captura es solo para regularizacion Contry. Se registrara como pago real con fecha historica, sin
          impresion automatica ni vinculacion a la sesion de caja actual.
        </p>
      </div>

      {currentBalance > 0 ? (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Saldo pendiente actual:{" "}
          <span className="font-semibold text-rose-600">{formatMoney(currentBalance, currency)}</span>.
        </p>
      ) : (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          No hay saldo pendiente. Un pago aqui generara credito en cuenta.
        </p>
      )}

      <div className="grid gap-3 md:grid-cols-3">
        <label className="space-y-1 text-sm">
          <span className="font-medium text-slate-700 dark:text-slate-300">Monto</span>
          <input
            type="number"
            name="amount"
            step="0.01"
            min="0.01"
            required
            defaultValue={defaultAmount}
            className="w-full rounded-md border border-slate-300 px-3 py-2 dark:border-slate-600"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-medium text-slate-700 dark:text-slate-300">Metodo</span>
          <select name="method" required className="w-full rounded-md border border-slate-300 px-3 py-2 dark:border-slate-600">
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
            name="notes"
            placeholder="Referencia, nota del papel, etc."
            className="w-full rounded-md border border-slate-300 px-3 py-2 dark:border-slate-600"
          />
        </label>
      </div>

      <label className="block space-y-1 text-sm">
        <span className="font-medium text-slate-700 dark:text-slate-300">Fecha y hora real del pago</span>
        <input
          type="datetime-local"
          name="paidAt"
          required
          className="w-full rounded-md border border-slate-300 px-3 py-2 dark:border-slate-600"
        />
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Obligatoria en regularizacion. Este valor define el historial real y el corte historico.
        </p>
      </label>

      <button
        type="submit"
        className="rounded-md bg-portoBlue px-4 py-2 text-sm font-medium text-white hover:bg-portoDark"
      >
        Registrar pago historico
      </button>
    </form>
  );
}
