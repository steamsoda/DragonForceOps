type ChargeTypeOption = {
  id: string;
  code: string;
  name: string;
};

type ChargeCreateFormProps = {
  chargeTypes: ChargeTypeOption[];
  action: (formData: FormData) => Promise<void>;
};

export function ChargeCreateForm({ chargeTypes, action }: ChargeCreateFormProps) {
  return (
    <form action={action} className="space-y-4 rounded-md border border-slate-200 bg-white p-4">
      <div className="grid gap-3 md:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span className="font-medium text-slate-700">Tipo de cargo</span>
          <select
            name="chargeTypeId"
            required
            className="w-full rounded-md border border-slate-300 px-3 py-2"
            defaultValue=""
          >
            <option value="" disabled>
              Selecciona un tipo
            </option>
            {chargeTypes.map((type) => (
              <option key={type.id} value={type.id}>
                {type.name}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1 text-sm">
          <span className="font-medium text-slate-700">Monto</span>
          <input
            type="number"
            name="amount"
            min="0.01"
            step="0.01"
            required
            className="w-full rounded-md border border-slate-300 px-3 py-2"
          />
        </label>
      </div>

      <label className="space-y-1 text-sm">
        <span className="font-medium text-slate-700">Descripcion</span>
        <input type="text" name="description" required className="w-full rounded-md border border-slate-300 px-3 py-2" />
      </label>

      <label className="space-y-1 text-sm">
        <span className="font-medium text-slate-700">Fecha de vencimiento (opcional)</span>
        <input type="date" name="dueDate" className="w-full rounded-md border border-slate-300 px-3 py-2" />
      </label>

      <button
        type="submit"
        className="rounded-md bg-portoBlue px-4 py-2 text-sm font-medium text-white hover:bg-portoDark"
      >
        Guardar cargo
      </button>
    </form>
  );
}

