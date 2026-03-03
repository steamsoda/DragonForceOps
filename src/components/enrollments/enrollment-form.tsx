type EnrollmentCreateFormProps = {
  campuses: Array<{ id: string; code: string; name: string }>;
  plan: { id: string; name: string } | null;
  defaultInscriptionAmount: number;
  defaultFirstMonthAmount: number;
  action: (formData: FormData) => Promise<void>;
};

export function EnrollmentCreateForm({
  campuses,
  plan,
  defaultInscriptionAmount,
  defaultFirstMonthAmount,
  action
}: EnrollmentCreateFormProps) {
  const today = new Date().toISOString().split("T")[0];

  return (
    <form action={action} className="space-y-4 rounded-md border border-slate-200 bg-white p-4">
      {plan && <input type="hidden" name="pricingPlanId" value={plan.id} />}

      <div className="grid gap-3 md:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span className="font-medium text-slate-700">Campus</span>
          <select
            name="campusId"
            required
            defaultValue=""
            className="w-full rounded-md border border-slate-300 px-3 py-2"
          >
            <option value="" disabled>
              Selecciona un campus
            </option>
            {campuses.map((campus) => (
              <option key={campus.id} value={campus.id}>
                {campus.name}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1 text-sm">
          <span className="font-medium text-slate-700">Fecha de inicio</span>
          <input
            type="date"
            name="startDate"
            required
            defaultValue={today}
            className="w-full rounded-md border border-slate-300 px-3 py-2"
          />
        </label>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span className="font-medium text-slate-700">Inscripción</span>
          <span className="block text-xs text-slate-500">Incluye cuota + 2 kits de entrenamiento</span>
          <input
            type="number"
            name="inscriptionAmount"
            required
            min="0.01"
            step="0.01"
            defaultValue={defaultInscriptionAmount}
            className="w-full rounded-md border border-slate-300 px-3 py-2"
          />
        </label>

        <label className="space-y-1 text-sm">
          <span className="font-medium text-slate-700">Primera mensualidad</span>
          <span className="block text-xs text-slate-500">Ajustar si el alumno se inscribe tarde en el mes</span>
          <input
            type="number"
            name="firstMonthAmount"
            required
            min="0.01"
            step="0.01"
            defaultValue={defaultFirstMonthAmount}
            className="w-full rounded-md border border-slate-300 px-3 py-2"
          />
        </label>
      </div>

      <label className="space-y-1 text-sm">
        <span className="font-medium text-slate-700">Notas (opcional)</span>
        <textarea
          name="notes"
          rows={2}
          className="w-full rounded-md border border-slate-300 px-3 py-2"
          placeholder="Descuentos, acuerdos especiales, etc."
        />
      </label>

      {plan && <p className="text-xs text-slate-400">Plan: {plan.name}</p>}

      <button
        type="submit"
        className="rounded-md bg-portoBlue px-4 py-2 text-sm font-medium text-white hover:bg-portoDark"
      >
        Crear inscripción
      </button>
    </form>
  );
}
