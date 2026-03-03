type EnrollmentEditFormProps = {
  enrollment: {
    status: string;
    endDate: string | null;
    campusId: string;
    notes: string | null;
  };
  campuses: Array<{ id: string; code: string; name: string }>;
  action: (formData: FormData) => Promise<void>;
};

const STATUS_LABELS: Record<string, string> = {
  active: "Activo",
  ended: "Baja (finalizado)",
  cancelled: "Cancelado"
};

export function EnrollmentEditForm({ enrollment, campuses, action }: EnrollmentEditFormProps) {
  return (
    <form action={action} className="space-y-4 rounded-md border border-slate-200 bg-white p-4">
      <div className="grid gap-3 md:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span className="font-medium text-slate-700">Estatus</span>
          <select
            name="status"
            required
            defaultValue={enrollment.status}
            className="w-full rounded-md border border-slate-300 px-3 py-2"
          >
            {Object.entries(STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <span className="block text-xs text-slate-500">
            Cambiar a Baja o Cancelado registra la fecha de fin automaticamente.
          </span>
        </label>

        <label className="space-y-1 text-sm">
          <span className="font-medium text-slate-700">Fecha de fin (opcional)</span>
          <input
            type="date"
            name="endDate"
            defaultValue={enrollment.endDate ?? ""}
            className="w-full rounded-md border border-slate-300 px-3 py-2"
          />
          <span className="block text-xs text-slate-500">
            Dejar vacio para que se asigne automaticamente al dar de baja.
          </span>
        </label>
      </div>

      <label className="space-y-1 text-sm">
        <span className="font-medium text-slate-700">Campus</span>
        <select
          name="campusId"
          required
          defaultValue={enrollment.campusId}
          className="w-full rounded-md border border-slate-300 px-3 py-2"
        >
          {campuses.map((campus) => (
            <option key={campus.id} value={campus.id}>
              {campus.name}
            </option>
          ))}
        </select>
      </label>

      <label className="space-y-1 text-sm">
        <span className="font-medium text-slate-700">Notas (opcional)</span>
        <textarea
          name="notes"
          rows={3}
          defaultValue={enrollment.notes ?? ""}
          className="w-full rounded-md border border-slate-300 px-3 py-2"
          placeholder="Acuerdos especiales, motivo de baja, etc."
        />
      </label>

      <button
        type="submit"
        className="rounded-md bg-portoBlue px-4 py-2 text-sm font-medium text-white hover:bg-portoDark"
      >
        Guardar cambios
      </button>
    </form>
  );
}
