export const BASE_TEAM_LEVELS = ["Little Dragons", "B3", "B2", "B1", "Selectivo"] as const;
export const TEAM_GENDER_OPTIONS = ["male", "female", "mixed"] as const;
export const TEAM_GENDER_LABELS: Record<string, string> = {
  male: "Varonil",
  female: "Femenil",
  mixed: "Mixto",
};

export type BaseTeamLevel = (typeof BASE_TEAM_LEVELS)[number];
