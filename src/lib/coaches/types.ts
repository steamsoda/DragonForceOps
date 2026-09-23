export type CoachLink = { coachId: string; primary: boolean; linkId?: string };
export type CoachTournament = {
  id: string; name: string; tournament: string; campusId: string; mode: "inherited" | "manual";
  sourceGroups: { groupId: string; coaches: CoachLink[] }[];
};
export type CoachGroup = { id: string; name: string; program: string; status: string; campusId: string; startTime: string | null; endTime: string | null; coaches: CoachLink[]; tournaments: CoachTournament[] };
export type Coach = {
  id: string; firstName: string; lastName: string; campusId: string | null;
  active: boolean; linked: boolean; email: string | null; roles: string[];
  protected: boolean; version: string; departureVersion: string | null;
  providerPending: boolean;
  tournaments: { squad: string; tournament: string; campusId: string; inherited: boolean }[];
};
export type CoachDirectory = {
  canManage: boolean; canLifecycle: boolean;
  campuses: { id: string; name: string }[]; coaches: Coach[]; groups: CoachGroup[];
};
export type CoachGroupCommand = { groupId: string; expected: CoachLink[]; coaches: CoachLink[]; expectedTournaments: CoachTournament[] };

export function summarizeCoachTournamentChanges(commands: CoachGroupCommand[]) {
  const changes = new Map(commands.map(command => [command.groupId, command.coaches]));
  const squads = new Map(commands.flatMap(command => command.expectedTournaments).map(squad => [squad.id, squad]));
  const merge = (links: CoachLink[]) => {
    const coaches = new Map<string, CoachLink>();
    for (const link of links) coaches.set(link.coachId, { coachId: link.coachId, primary: (coaches.get(link.coachId)?.primary ?? false) || link.primary });
    return [...coaches.values()].sort((a, b) => a.coachId.localeCompare(b.coachId));
  };
  return [...squads.values()].filter(squad => squad.mode === "inherited").map(squad => ({
    ...squad,
    before: merge(squad.sourceGroups.flatMap(group => group.coaches)),
    after: merge(squad.sourceGroups.flatMap(group => changes.get(group.groupId) ?? group.coaches)),
  }));
}

// Retain co-coaches and explicitly expose the resulting primary in the review.
export function replaceCoachInGroup(group: CoachGroup, coachId: string, replacementId: string | null): CoachGroupCommand {
  const old = group.coaches.find(c => c.coachId === coachId);
  const next = group.coaches.filter(c => c.coachId !== coachId).map(c => ({ coachId: c.coachId, primary: c.primary }));
  if (replacementId) {
    const existing = next.find(c => c.coachId === replacementId);
    if (existing) existing.primary ||= old?.primary ?? false;
    else next.push({ coachId: replacementId, primary: old?.primary ?? next.length === 0 });
  }
  if (next.length && !next.some(c => c.primary)) next[0].primary = true;
  return { groupId: group.id, expected: group.coaches, coaches: next, expectedTournaments: group.tournaments };
}
