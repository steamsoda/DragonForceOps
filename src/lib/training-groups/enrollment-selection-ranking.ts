export type EnrollmentTrainingProgram = "little_dragons" | "futbol_para_todos" | "selectivo";

export type EnrollmentTrainingGroupOption = {
  id: string;
  campusId: string;
  campusCode: string;
  name: string;
  program: EnrollmentTrainingProgram;
  levelLabel: string | null;
  groupCode: string | null;
  gender: string;
  birthYearMin: number | null;
  birthYearMax: number | null;
  startTime: string | null;
  endTime: string | null;
  status: string;
};

export function trainingGroupMatchesGender(groupGender: string, playerGender: string | null) {
  if (!playerGender) return groupGender === "mixed";
  return groupGender === "mixed" || groupGender === playerGender;
}

export function trainingGroupMatchesBirthYear(
  group: Pick<EnrollmentTrainingGroupOption, "birthYearMin" | "birthYearMax">,
  birthYear: number | null,
) {
  if (birthYear == null) return false;
  if (group.birthYearMin != null && birthYear < group.birthYearMin) return false;
  if (group.birthYearMax != null && birthYear > group.birthYearMax) return false;
  return true;
}

function trainingGroupBirthYearDistance(
  group: Pick<EnrollmentTrainingGroupOption, "birthYearMin" | "birthYearMax">,
  birthYear: number,
) {
  if (trainingGroupMatchesBirthYear(group, birthYear)) return 0;
  if (group.birthYearMin != null && birthYear < group.birthYearMin) return group.birthYearMin - birthYear;
  if (group.birthYearMax != null && birthYear > group.birthYearMax) return birthYear - group.birthYearMax;
  return Number.MAX_SAFE_INTEGER;
}

export function rankEnrollmentTrainingGroups(params: {
  groups: EnrollmentTrainingGroupOption[];
  campusId: string;
  program: EnrollmentTrainingProgram;
  birthYear: number | null;
  gender: string | null;
}) {
  if (!params.campusId || params.birthYear == null || !params.gender) return [];

  return params.groups
    .filter((group) =>
      group.status === "active" &&
      group.campusId === params.campusId &&
      group.program === params.program &&
      trainingGroupMatchesGender(group.gender, params.gender)
    )
    .sort((left, right) => {
      const leftDistance = trainingGroupBirthYearDistance(left, params.birthYear!);
      const rightDistance = trainingGroupBirthYearDistance(right, params.birthYear!);
      if (leftDistance !== rightDistance) return leftDistance - rightDistance;

      const leftGenderRank = left.gender === params.gender ? 0 : 1;
      const rightGenderRank = right.gender === params.gender ? 0 : 1;
      if (leftGenderRank !== rightGenderRank) return leftGenderRank - rightGenderRank;

      const leftB1Rank = params.program === "futbol_para_todos" && left.groupCode?.toUpperCase() === "B1" ? 0 : 1;
      const rightB1Rank = params.program === "futbol_para_todos" && right.groupCode?.toUpperCase() === "B1" ? 0 : 1;
      if (leftB1Rank !== rightB1Rank) return leftB1Rank - rightB1Rank;

      return left.name.localeCompare(right.name, "es");
    });
}
