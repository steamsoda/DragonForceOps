export const TRAINING_GROUP_PROGRAM_OPTIONS = [
  "little_dragons",
  "futbol_para_todos",
  "selectivo",
] as const;

export const TRAINING_GROUP_STATUS_OPTIONS = ["active", "projected", "inactive"] as const;

export const TRAINING_GROUP_GENDER_OPTIONS = ["male", "female", "mixed"] as const;

export const TRAINING_GROUP_PROGRAM_LABELS: Record<string, string> = {
  little_dragons: "Little Dragons",
  futbol_para_todos: "Futbol Para Todos",
  selectivo: "Selectivo",
};

export const TRAINING_GROUP_STATUS_LABELS: Record<string, string> = {
  active: "Activa",
  projected: "Proyectada",
  inactive: "Inactiva",
};

export const TRAINING_GROUP_GENDER_LABELS: Record<string, string> = {
  male: "Varonil",
  female: "Femenil",
  mixed: "Mixto",
};

export function normalizeTrainingGroupProgram(value: string | null | undefined) {
  return TRAINING_GROUP_PROGRAM_OPTIONS.includes((value ?? "") as (typeof TRAINING_GROUP_PROGRAM_OPTIONS)[number])
    ? (value as (typeof TRAINING_GROUP_PROGRAM_OPTIONS)[number])
    : "futbol_para_todos";
}

export function normalizeTrainingGroupStatus(value: string | null | undefined) {
  return TRAINING_GROUP_STATUS_OPTIONS.includes((value ?? "") as (typeof TRAINING_GROUP_STATUS_OPTIONS)[number])
    ? (value as (typeof TRAINING_GROUP_STATUS_OPTIONS)[number])
    : "active";
}

export function normalizeTrainingGroupGender(value: string | null | undefined) {
  return TRAINING_GROUP_GENDER_OPTIONS.includes((value ?? "") as (typeof TRAINING_GROUP_GENDER_OPTIONS)[number])
    ? (value as (typeof TRAINING_GROUP_GENDER_OPTIONS)[number])
    : "mixed";
}

export function formatTrainingGroupBirthYearRange(min: number | null | undefined, max: number | null | undefined) {
  if (min == null && max == null) return "Sin categoria";
  if (min != null && max != null) {
    return min === max ? String(min) : `${min}/${max}`;
  }
  return String(min ?? max);
}

export function formatTrainingGroupLabel(group: {
  name: string;
  birthYearMin?: number | null;
  birthYearMax?: number | null;
  gender?: string | null;
}) {
  const parts = [group.name];
  const range = formatTrainingGroupBirthYearRange(group.birthYearMin ?? null, group.birthYearMax ?? null);
  if (range !== "Sin categoria") parts.push(range);
  if (group.gender) parts.push(TRAINING_GROUP_GENDER_LABELS[group.gender] ?? group.gender);
  return parts.join(" | ");
}

export function formatTrainingGroupCoachNames(names: string[]) {
  if (names.length === 0) return null;
  return names.join(", ");
}

export function deriveTrainingGroupProgramFromLevel(level: string | null | undefined) {
  if (level === "Selectivo") return "selectivo";
  if (level === "Little Dragons") return "little_dragons";
  return "futbol_para_todos";
}
