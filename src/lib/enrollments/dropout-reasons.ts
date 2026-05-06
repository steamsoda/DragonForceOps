export const DROPOUT_REASON_LABELS = {
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
} as const;

export type DropoutReason = keyof typeof DROPOUT_REASON_LABELS;

export const DROPOUT_REASON_CATEGORIES: Record<DropoutReason, string> = {
  coach_capability: "Entrenamiento",
  exercise_difficulty: "Entrenamiento",
  financial: "Economico",
  training_quality: "Entrenamiento",
  school_disorganization: "Operacion",
  facility_safety: "Operacion",
  transport: "Distancia / Logistica",
  family_health: "Salud",
  player_health: "Salud",
  schedule_conflict: "Horarios",
  coach_communication: "Relacion / Comunicacion",
  wants_competition: "Deportivo",
  lack_of_information: "Relacion / Comunicacion",
  pedagogy: "Entrenamiento",
  moved_to_competition_club: "Deportivo",
  player_coach_relationship: "Relacion / Comunicacion",
  unattractive_exercises: "Entrenamiento",
  moved_residence: "Distancia / Logistica",
  school_performance_punishment: "Escuela / Familia",
  home_behavior_punishment: "Escuela / Familia",
  personal: "Otros",
  distance: "Distancia / Logistica",
  parent_work: "Escuela / Familia",
  injury: "Salud",
  dislikes_football: "Interes",
  lost_contact: "Relacion / Comunicacion",
  low_peer_attendance: "Interes",
  changed_sport: "Deportivo",
  did_not_return: "Temporal",
  temporary_leave: "Temporal",
  moved_to_another_academy: "Deportivo",
  school_schedule_conflict: "Horarios",
  coach_change: "Entrenamiento",
  cold_weather: "Otros",
  other: "Otros",
};

export const DROPOUT_REASON_OPTIONS = Object.entries(DROPOUT_REASON_LABELS).map(([value, label]) => ({
  value: value as DropoutReason,
  label,
}));

export function getDropoutReasonLabel(value: string | null | undefined) {
  if (!value) return "-";
  return DROPOUT_REASON_LABELS[value as DropoutReason] ?? value;
}

export function getCategorizedDropoutReasonLabel(value: string | null | undefined) {
  if (!value) return "-";
  const label = getDropoutReasonLabel(value);
  const category = DROPOUT_REASON_CATEGORIES[value as DropoutReason];
  return category ? `${category} - ${label}` : label;
}
