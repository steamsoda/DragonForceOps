export type EnrollmentTrainingProgram = "little_dragons" | "futbol_para_todos" | "selectivo";

export type EnrollmentTrainingGroupOption = {
  id: string;
  campusId: string;
  campusCode: string;
  name: string;
  program: EnrollmentTrainingProgram;
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

function trainingGroupBirthYearSpan(
  group: Pick<EnrollmentTrainingGroupOption, "birthYearMin" | "birthYearMax">,
) {
  if (group.birthYearMin == null || group.birthYearMax == null) return Number.MAX_SAFE_INTEGER;
  return Math.abs(group.birthYearMax - group.birthYearMin);
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

      const spanDifference = trainingGroupBirthYearSpan(left) - trainingGroupBirthYearSpan(right);
      if (spanDifference !== 0) return spanDifference;

      const startTimeDifference = (left.startTime ?? "99:99").localeCompare(right.startTime ?? "99:99");
      if (startTimeDifference !== 0) return startTimeDifference;

      return left.name.localeCompare(right.name, "es") || left.id.localeCompare(right.id);
    });
}
