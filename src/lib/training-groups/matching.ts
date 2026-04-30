import { deriveTrainingGroupProgramFromLevel } from "@/lib/training-groups/shared";

export type TrainingGroupReviewState = "assigned" | "suggested" | "ambiguous" | "unmatched";

export type TrainingGroupSuggestionConfidence = "assigned" | "auto_safe" | "manual_review" | "no_match";

export type TrainingGroupCandidate = {
  id: string;
  name: string;
  campusId: string;
  program: string;
  gender: string;
  birthYearMin: number | null;
  birthYearMax: number | null;
  groupCode: string | null;
  status: string;
};

export type TrainingGroupSuggestionResult = {
  reviewState: Exclude<TrainingGroupReviewState, "assigned">;
  confidence: Exclude<TrainingGroupSuggestionConfidence, "assigned">;
  suggestionGroupId: string | null;
  suggestionGroupName: string | null;
  suggestionReason: string;
  suggestionCount: number;
};

export function getTrainingGroupLevelCode(level: string | null | undefined) {
  const match = /\b(B1|B2|B3)\b/i.exec(level ?? "");
  return match ? match[1].toUpperCase() : null;
}

function normalizeCode(value: string | null | undefined) {
  return value?.trim().toUpperCase() || null;
}

function birthYearMatches(group: TrainingGroupCandidate, birthYear: number) {
  if (group.birthYearMin != null && birthYear < group.birthYearMin) return false;
  if (group.birthYearMax != null && birthYear > group.birthYearMax) return false;
  return true;
}

function genderPreferenceRank(groupGender: string, playerGender: string | null | undefined) {
  if (groupGender === "mixed") return playerGender ? 2 : 1;
  if (!playerGender) return null;
  return groupGender === playerGender ? 0 : null;
}

export function resolveTrainingGroupSuggestion(params: {
  groups: TrainingGroupCandidate[];
  campusId: string;
  birthYear: number | null;
  gender: string | null;
  resolvedLevel: string | null;
}): TrainingGroupSuggestionResult {
  if (params.birthYear == null) {
    return {
      reviewState: "unmatched",
      confidence: "no_match",
      suggestionGroupId: null,
      suggestionGroupName: null,
      suggestionReason: "Falta fecha de nacimiento para resolver categoria",
      suggestionCount: 0,
    };
  }

  const program = deriveTrainingGroupProgramFromLevel(params.resolvedLevel);
  const levelCode = getTrainingGroupLevelCode(params.resolvedLevel);
  const campusProgramMatches = params.groups.filter((group) =>
    group.campusId === params.campusId &&
    group.program === program &&
    birthYearMatches(group, params.birthYear!)
  );

  if (campusProgramMatches.length === 0) {
    return {
      reviewState: "unmatched",
      confidence: "no_match",
      suggestionGroupId: null,
      suggestionGroupName: null,
      suggestionReason: "No hay grupo compatible por campus, programa y categoria",
      suggestionCount: 0,
    };
  }

  const genderMatches = campusProgramMatches
    .map((group) => ({ group, rank: genderPreferenceRank(group.gender, params.gender) }))
    .filter((row): row is { group: TrainingGroupCandidate; rank: number } => row.rank != null);

  if (genderMatches.length === 0) {
    return {
      reviewState: "unmatched",
      confidence: "no_match",
      suggestionGroupId: null,
      suggestionGroupName: null,
      suggestionReason: "No hay grupo compatible por genero",
      suggestionCount: 0,
    };
  }

  const bestGenderRank = Math.min(...genderMatches.map((row) => row.rank));
  let candidates = genderMatches.filter((row) => row.rank === bestGenderRank).map((row) => row.group);

  if (program === "futbol_para_todos") {
    if (levelCode) {
      candidates = candidates.filter((group) => normalizeCode(group.groupCode) === levelCode);
      if (candidates.length === 0) {
        return {
          reviewState: "unmatched",
          confidence: "no_match",
          suggestionGroupId: null,
          suggestionGroupName: null,
          suggestionReason: `No hay grupo ${levelCode} compatible; requiere revision manual`,
          suggestionCount: 0,
        };
      }
    } else {
      const b1Candidates = candidates.filter((group) => normalizeCode(group.groupCode) === "B1");
      if (b1Candidates.length > 0) candidates = b1Candidates;
    }
  }

  const activeCandidates = candidates.filter((group) => group.status === "active");
  if (activeCandidates.length === 1) {
    const match = activeCandidates[0];
    return {
      reviewState: "suggested",
      confidence: "auto_safe",
      suggestionGroupId: match.id,
      suggestionGroupName: match.name,
      suggestionReason: levelCode
        ? `Coincidencia unica activa por campus, categoria, genero y ${levelCode}`
        : "Coincidencia unica activa por campus, categoria, genero y programa",
      suggestionCount: activeCandidates.length,
    };
  }

  if (activeCandidates.length > 1) {
    return {
      reviewState: "ambiguous",
      confidence: "manual_review",
      suggestionGroupId: null,
      suggestionGroupName: null,
      suggestionReason: `${activeCandidates.length} grupos activos posibles`,
      suggestionCount: activeCandidates.length,
    };
  }

  return {
    reviewState: "ambiguous",
    confidence: "manual_review",
    suggestionGroupId: null,
    suggestionGroupName: null,
    suggestionReason: candidates.length > 0
      ? "Solo hay grupos proyectados/inactivos; requiere revision manual"
      : "Sin grupo activo compatible",
    suggestionCount: candidates.length,
  };
}
