export type CompetitionSquadKind = "single" | "azul" | "blanco" | "custom";
export type CompetitionSquadStatus = "planning" | "ready" | "archived";
export type CompetitionMembershipSource = "paid" | "manual";

export type CompetitionRosterSquad = {
  id: string;
  tournamentId: string;
  name: string;
  kind: CompetitionSquadKind;
  program: string | null;
  categoryLabel: string | null;
  gender: string | null;
  status: CompetitionSquadStatus;
  sortOrder: number;
  professorAssignmentMode: "inherited" | "manual";
  sourceGroups: Array<{ id: string; name: string }>;
  members: Array<{
    enrollmentId: string;
    source: CompetitionMembershipSource;
    reason: string | null;
  }>;
};

export type CompetitionRosterFoundation = {
  tournamentId: string;
  tournamentName: string;
  campusId: string;
  squads: CompetitionRosterSquad[];
  candidateEnrollmentIds: string[];
  exclusions: Array<{ enrollmentId: string; reason: string }>;
  excludedEnrollmentIds: string[];
  assignedCandidateEnrollmentIds: string[];
  pendingCandidateEnrollmentIds: string[];
  manualMemberEnrollmentIds: string[];
  latestSnapshot: { id: string; label: string; capturedAt: string } | null;
};

export function summarizeCompetitionRosterState(input: {
  candidateEnrollmentIds: string[];
  memberRows: Array<{ enrollmentId: string; source: CompetitionMembershipSource }>;
  excludedEnrollmentIds: string[];
}) {
  const candidateIds = new Set(input.candidateEnrollmentIds);
  const excludedIds = new Set(input.excludedEnrollmentIds);
  const assignedCandidateIds = new Set<string>();
  const manualMemberIds = new Set<string>();

  for (const member of input.memberRows) {
    if (member.source === "manual") {
      manualMemberIds.add(member.enrollmentId);
    }
    if (candidateIds.has(member.enrollmentId)) {
      assignedCandidateIds.add(member.enrollmentId);
    }
  }

  return {
    assignedCandidateEnrollmentIds: [...assignedCandidateIds],
    pendingCandidateEnrollmentIds: input.candidateEnrollmentIds.filter(
      (enrollmentId) => !assignedCandidateIds.has(enrollmentId) && !excludedIds.has(enrollmentId),
    ),
    manualMemberEnrollmentIds: [...manualMemberIds],
  };
}
