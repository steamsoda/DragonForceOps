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
  coach_capability: "Falta de capacidad del entrenador",
  exercise_difficulty: "Dificultad para realizar los ejercicios propuestos",
  financial: "Financiero",
  training_quality: "Falta de calidad en el entrenamiento",
  school_disorganization: "Desorganización de la escuela",
  facility_safety: "Falta de seguridad en el acceso a las instalaciones",
  transport: "Incompatibilidad de transportes",
  family_health: "Motivos de salud de familiares",
  player_health: "Motivos de salud del alumno",
  schedule_conflict: "Incompatibilidad de horarios",
  coach_communication: "Fallos en la comunicación — comunicación del entrenador",
  wants_competition: "Quiere pasar a un contexto de competición",
  lack_of_information: "Falta de información",
  pedagogy: "Falta de pedagogía",
  moved_to_competition_club: "Cambio (club) a equipo de competición",
  player_coach_relationship: "Relación entre el alumno y el entrenador",
  unattractive_exercises: "Ejercicios poco atractivos",
  moved_residence: "Cambio de residencia",
  school_performance_punishment: "Castigo por mal rendimiento en el colegio",
  home_behavior_punishment: "Castigo por mal comportamiento en casa",
  personal: "Motivos personales",
  distance: "Motivos de distancia",
  parent_work: "Motivos de trabajo del padre o madre",
  injury: "Baja por lesión",
  dislikes_football: "No le gusta el fútbol",
  lost_contact: "Se perdió contacto con los padres / no contestan y no asisten",
  low_peer_attendance: "Por poca asistencia de compañeros",
  changed_sport: "Cambio de deporte",
  did_not_return: "Ya no regresó",
  temporary_leave: "Baja por algún tiempo — piensa regresar",
  moved_to_another_academy: "Cambio a otra academia de fútbol",
  school_schedule_conflict: "Complicaciones con horarios de la escuela",
  coach_change: "Por cambio de profes",
  cold_weather: "Por el clima frío",
  other: "Otros"
};

const inputClass = "w-full rounded-md border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm";

export function EnrollmentEditForm({ enrollment, campuses, action }: EnrollmentEditFormProps) {
  return (
    <form action={action} className="space-y-4 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
      <div className="grid gap-3 md:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span className="font-medium text-slate-700 dark:text-slate-300">Estatus</span>
          <select name="status" required defaultValue={enrollment.status} className={inputClass}>
            {Object.entries(STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <span className="block text-xs text-slate-500 dark:text-slate-400">
            Cambiar a Baja o Cancelado registra la fecha de fin automaticamente.
          </span>
        </label>

        <label className="space-y-1 text-sm">
          <span className="font-medium text-slate-700 dark:text-slate-300">Fecha de fin (opcional)</span>
          <input type="date" name="endDate" defaultValue={enrollment.endDate ?? ""} className={inputClass} />
          <span className="block text-xs text-slate-500 dark:text-slate-400">
            Dejar vacio para que se asigne automaticamente al dar de baja.
          </span>
        </label>
      </div>

      <label className="space-y-1 text-sm">
        <span className="font-medium text-slate-700 dark:text-slate-300">Campus</span>
        <select name="campusId" required defaultValue={enrollment.campusId} className={inputClass}>
          {campuses.map((campus) => (
            <option key={campus.id} value={campus.id}>
              {campus.name}
            </option>
          ))}
        </select>
      </label>

      <label className="space-y-1 text-sm">
        <span className="font-medium text-slate-700 dark:text-slate-300">Notas (opcional)</span>
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
          <span className="font-medium text-slate-700 dark:text-slate-300">Motivo</span>
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
          <span className="font-medium text-slate-700 dark:text-slate-300">Notas de baja (opcional)</span>
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
