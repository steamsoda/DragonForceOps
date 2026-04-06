type EnrollmentDropoutFormProps = {
  enrollment: {
    startDate: string;
    endDate: string | null;
    campusName: string;
    pendingBalance: number;
    dropoutReason: string | null;
    dropoutNotes: string | null;
  };
  action: (formData: FormData) => Promise<void>;
};

const DROPOUT_REASON_LABELS: Record<string, string> = {
  coach_capability: "Falta de capacidad del entrenador",
  exercise_difficulty: "Dificultad para realizar los ejercicios propuestos",
  financial: "Financiero",
  training_quality: "Falta de calidad en el entrenamiento",
  school_disorganization: "Desorganizacion de la escuela",
  facility_safety: "Falta de seguridad en el acceso a las instalaciones",
  transport: "Incompatibilidad de transportes",
  family_health: "Motivos de salud de familiares",
  player_health: "Motivos de salud del alumno",
  schedule_conflict: "Incompatibilidad de horarios",
  coach_communication: "Fallos en la comunicacion del entrenador",
  wants_competition: "Quiere pasar a un contexto de competicion",
  lack_of_information: "Falta de informacion",
  pedagogy: "Falta de pedagogia",
  moved_to_competition_club: "Cambio a club de competicion",
  player_coach_relationship: "Relacion entre el alumno y el entrenador",
  unattractive_exercises: "Ejercicios poco atractivos",
  moved_residence: "Cambio de residencia",
  school_performance_punishment: "Castigo por mal rendimiento en el colegio",
  home_behavior_punishment: "Castigo por mal comportamiento en casa",
  personal: "Motivos personales",
  distance: "Motivos de distancia",
  parent_work: "Motivos de trabajo del padre o madre",
  injury: "Baja por lesion",
  dislikes_football: "No le gusta el futbol",
  lost_contact: "Se perdio contacto con los padres / no contestan y no asisten",
  low_peer_attendance: "Por poca asistencia de companeros",
  changed_sport: "Cambio de deporte",
  did_not_return: "Ya no regreso",
  temporary_leave: "Baja por algun tiempo - piensa regresar",
  moved_to_another_academy: "Cambio a otra academia de futbol",
  school_schedule_conflict: "Complicaciones con horarios de la escuela",
  coach_change: "Por cambio de profes",
  cold_weather: "Por el clima frio",
  other: "Otros",
};

const inputClass = "w-full rounded-md border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm";

function formatMoney(amount: number) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(amount);
}

export function EnrollmentDropoutForm({ enrollment, action }: EnrollmentDropoutFormProps) {
  const defaultEndDate = enrollment.endDate ?? new Date().toISOString().split("T")[0];

  return (
    <form action={action} className="space-y-4 rounded-md border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <div className="grid gap-3 rounded-md border border-slate-200 bg-slate-50 p-4 text-sm dark:border-slate-700 dark:bg-slate-800/60 md:grid-cols-3">
        <div>
          <p className="text-xs uppercase text-slate-500 dark:text-slate-400">Campus</p>
          <p className="font-medium">{enrollment.campusName}</p>
        </div>
        <div>
          <p className="text-xs uppercase text-slate-500 dark:text-slate-400">Inicio de inscripcion</p>
          <p className="font-medium">{enrollment.startDate}</p>
        </div>
        <div>
          <p className="text-xs uppercase text-slate-500 dark:text-slate-400">Saldo pendiente</p>
          <p className={`font-medium ${enrollment.pendingBalance > 0 ? "text-amber-700 dark:text-amber-300" : ""}`}>
            {formatMoney(enrollment.pendingBalance)}
          </p>
        </div>
      </div>

      <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/20 dark:text-amber-200">
        Dar de baja termina la inscripcion activa. No anula cargos pendientes automaticamente; esos se manejan despues desde Bajas y saldos pendientes.
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span className="font-medium text-slate-700 dark:text-slate-300">Fecha efectiva de baja</span>
          <input type="date" name="endDate" required defaultValue={defaultEndDate} className={inputClass} />
        </label>

        <label className="space-y-1 text-sm">
          <span className="font-medium text-slate-700 dark:text-slate-300">Motivo</span>
          <select name="dropoutReason" required defaultValue={enrollment.dropoutReason ?? ""} className={inputClass}>
            <option value="">Selecciona un motivo</option>
            {Object.entries(DROPOUT_REASON_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="space-y-1 text-sm">
        <span className="font-medium text-slate-700 dark:text-slate-300">Notas de baja (opcional)</span>
        <textarea
          name="dropoutNotes"
          rows={3}
          defaultValue={enrollment.dropoutNotes ?? ""}
          className={inputClass}
          placeholder="Contexto adicional, acuerdos con la familia, o detalles operativos."
        />
      </label>

      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          className="rounded-md bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700"
        >
          Confirmar baja
        </button>
      </div>
    </form>
  );
}
