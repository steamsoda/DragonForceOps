type EnrollmentEditFormProps = {
  enrollment: {
    status: string;
    endDate: string | null;
    campusId: string;
    notes: string | null;
    dropoutReason?: string | null;
    dropoutNotes?: string | null;
  };
  campuses: Array<{ id: string; code: string; name: string }>;
  action: (formData: FormData) => Promise<void>;
};

const STATUS_LABELS: Record<string, string> = {
  active: "Activo",
  ended: "Baja (finalizado)",
  cancelled: "Cancelado"
};

const DROPOUT_REASON_LABELS: Record<string, string> = {
  cost: "Costo / precio",
  distance: "Distancia / logística",
  injury: "Lesión o salud",
  attitude: "Actitud / disciplina",
  time: "Falta de tiempo",
  level_change: "Cambio de nivel o campus",
  other: "Otro"
};

const inputClass = "w-full rounded-md border border-slate-300 px-3 py-2 text-sm";

export function EnrollmentEditForm({ enrollment, campuses, action }: EnrollmentEditFormProps) {
  return (
    <form action={action} className="space-y-4 rounded-md border border-slate-200 bg-white p-4">
      <div className="grid gap-3 md:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span className="font-medium text-slate-700">Estatus</span>
          <select name="status" required defaultValue={enrollment.status} className={inputClass}>
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
          <input type="date" name="endDate" defaultValue={enrollment.endDate ?? ""} className={inputClass} />
          <span className="block text-xs text-slate-500">
            Dejar vacio para que se asigne automaticamente al dar de baja.
          </span>
        </label>
      </div>

      <label className="space-y-1 text-sm">
        <span className="font-medium text-slate-700">Campus</span>
        <select name="campusId" required defaultValue={enrollment.campusId} className={inputClass}>
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
          rows={2}
          defaultValue={enrollment.notes ?? ""}
          className={inputClass}
          placeholder="Acuerdos especiales, contexto general, etc."
        />
      </label>

      {/* Dropout section — always rendered so server can validate when ending */}
      <div className="space-y-3 rounded-md border border-amber-100 bg-amber-50 p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
          Motivo de baja — requerido si el estatus es Baja o Cancelado
        </p>
        <label className="space-y-1 text-sm">
          <span className="font-medium text-slate-700">Motivo</span>
          <select name="dropoutReason" defaultValue={enrollment.dropoutReason ?? ""} className={inputClass}>
            <option value="">Sin motivo (solo si permanece Activo)</option>
            {Object.entries(DROPOUT_REASON_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-medium text-slate-700">Notas de baja (opcional)</span>
          <textarea
            name="dropoutNotes"
            rows={2}
            defaultValue={enrollment.dropoutNotes ?? ""}
            className={inputClass}
            placeholder="Detalla el motivo, especialmente si seleccionaste 'Otro'."
          />
        </label>
      </div>

      <button
        type="submit"
        className="rounded-md bg-portoBlue px-4 py-2 text-sm font-medium text-white hover:bg-portoDark"
      >
        Guardar cambios
      </button>
    </form>
  );
}
