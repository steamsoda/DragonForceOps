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

export function formatTrainingGroupDisplayName(group: {
  name: string;
  program?: string | null;
}) {
  const name = sanitizeTrainingGroupDisplayName(group.name);
  if (group.program !== "futbol_para_todos") return name;

  const withoutLegacyLevel = name
    .replace(/\bB[123]\b/gi, " ")
    .replace(/\s*-?\s*f[uú]tbol\s+para\s+todos\s*$/i, " ")
    .replace(/\s+/g, " ")
    .trim();

  return withoutLegacyLevel || "Grupo";
}

export function sanitizeTrainingGroupDisplayName(value: string) {
  const withoutParenthesizedSuffix = value.replace(
    /\s*\(-?([a-z0-9]{4})\)\s*$/i,
    (match, token: string) => /[a-z]/i.test(token) ? "" : match,
  );
  const withoutBareSuffix = withoutParenthesizedSuffix.replace(
    /\s*-\s*([a-z0-9]{4})\s*$/i,
    (match, token: string) => /[a-z]/i.test(token) ? "" : match,
  );

  return withoutBareSuffix
    .replace(/\s+/g, " ")
    .trim();
}

export function sanitizeTournamentTeamDisplayName(value: string) {
  return sanitizeTrainingGroupDisplayName(value)
    .replace(/\bB[123]\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function formatCompetitionSquadDisplay(squad: {
  name: string;
  program?: string | null;
  categoryLabel?: string | null;
  kind?: string | null;
  sourceGroupCount?: number;
}) {
  const sanitizedName = sanitizeTournamentTeamDisplayName(squad.name);
  const categoryYears = `${squad.categoryLabel ?? ""} ${sanitizedName}`
    .match(/(?:19|20)\d{2}/g);
  const categoryLabel = categoryYears
    ? [...new Set(categoryYears)].join("/")
    : sanitizeTournamentTeamDisplayName(squad.categoryLabel ?? "") || "Sin categoria";
  const isSelectivo = squad.program === "selectivo";
  const programLabel = isSelectivo
    ? "Selectivo"
    : squad.program === "little_dragons"
      ? "Little Dragons"
      : "";
  const isFemale = /\bfemenil\b/i.test(sanitizedName);
  const isCombined = (squad.sourceGroupCount ?? 0) > 1;
  const combinedName = sanitizedName
    .replace(/\b(?:basico|básico|intermedio|avanzado|expert|prejuvenil)\b/gi, " ")
    .replace(/\bf[uú]tbol\s+para\s+todos\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  const kindLabel = squad.kind === "azul" || /\bazul\b/i.test(sanitizedName)
    ? "Azul"
    : squad.kind === "blanco" || /\bblanco\b/i.test(sanitizedName)
      ? "Blanco"
      : squad.kind === "single" && !isSelectivo
        ? "Azul"
      : null;
  const programTeamLabel = [programLabel, isFemale ? "Femenil" : null].filter(Boolean).join(" ");
  const teamLabel = isCombined
    ? combinedName || programTeamLabel
    : kindLabel
      ? [programTeamLabel, kindLabel].filter(Boolean).join(" ")
      : programTeamLabel;
  const title = isCombined
    ? teamLabel
    : categoryLabel === "Sin categoria"
      ? teamLabel
      : isSelectivo
        ? [programLabel, categoryLabel, isFemale ? "Femenil" : null, kindLabel].filter(Boolean).join(" ")
        : [categoryLabel, teamLabel].filter(Boolean).join(" ");

  return {
    title,
    categoryLabel,
    teamLabel,
  };
}

export function formatTournamentGroupCardDisplay(group: {
  name: string;
  program?: string | null;
  birthYearMin?: number | null;
  birthYearMax?: number | null;
}) {
  const programLabel = group.program === "selectivo"
    ? "Selectivo"
    : group.program === "little_dragons"
      ? "Little Dragons"
      : "";
  const birthYearLabel = formatTrainingGroupBirthYearRange(group.birthYearMin, group.birthYearMax);
  const sanitizedName = sanitizeTournamentTeamDisplayName(group.name)
    .replace(/\s*-?\s*f[uú]tbol\s+para\s+todos\s*$/i, "")
    .replace(/\s*-?\s*selectivos?\s*$/i, "")
    .replace(/\s*-?\s*little\s+dragons\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();

  return {
    title: birthYearLabel === "Sin categoria"
      ? programLabel || "Sin categoria"
      : group.program === "selectivo"
        ? `${programLabel} ${birthYearLabel}`
        : `${birthYearLabel}${programLabel ? ` ${programLabel}` : ""}`,
    subtitle: sanitizedName && sanitizedName !== programLabel ? sanitizedName : null,
  };
}

export function formatTrainingGroupLabel(group: {
  name: string;
  program?: string | null;
  birthYearMin?: number | null;
  birthYearMax?: number | null;
  gender?: string | null;
}) {
  const parts = [formatTrainingGroupDisplayName(group)];
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

export function derivePlayerLevelFromTrainingProgram(program: string | null | undefined) {
  if (program === "selectivo") return "Selectivo";
  if (program === "little_dragons") return "Little Dragons";
  return "B1";
}
