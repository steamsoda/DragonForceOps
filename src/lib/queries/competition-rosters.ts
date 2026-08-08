import { canAccessCampus } from "@/lib/auth/campuses";
import { getPermissionContext } from "@/lib/auth/permissions";
import {
  summarizeCompetitionRosterState,
  type CompetitionMembershipSource,
  type CompetitionRosterFoundation,
  type CompetitionRosterSquad,
  type CompetitionSquadKind,
  type CompetitionSquadStatus,
} from "@/lib/competition-rosters/foundation";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatTrainingGroupDisplayName } from "@/lib/training-groups/shared";

type TournamentRow = {
  id: string;
  name: string;
  campus_id: string | null;
};

type SquadRow = {
  id: string;
  tournament_id: string;
  name: string;
  squad_kind: CompetitionSquadKind;
  program: string | null;
  category_label: string | null;
  gender: string | null;
  status: CompetitionSquadStatus;
  sort_order: number;
};

type SquadGroupRow = {
  squad_id: string;
  training_group_id: string;
  training_groups: { name: string | null } | null;
};

type MemberRow = {
  squad_id: string;
  enrollment_id: string;
  source: CompetitionMembershipSource;
  reason: string | null;
};

type CandidateRow = { enrollment_id: string };
type ExclusionRow = { enrollment_id: string };
type SnapshotRow = { id: string; label: string; captured_at: string };

export async function getCompetitionRosterFoundation(
  tournamentId: string,
): Promise<CompetitionRosterFoundation | null> {
  const permission = await getPermissionContext();
  if (!permission || (!permission.hasOperationalAccess && !permission.hasSportsAccess)) return null;

  const admin = createAdminClient();
  const tournamentResult = await admin
    .from("tournaments")
    .select("id, name, campus_id")
    .eq("id", tournamentId)
    .maybeSingle<TournamentRow | null>();

  const tournament = tournamentResult.data;
  if (tournamentResult.error || !tournament?.campus_id) return null;
  if (!canAccessCampus(permission.campusAccess, tournament.campus_id)) return null;

  const [squadsResult, candidatesResult, exclusionsResult, snapshotsResult] = await Promise.all([
    admin
      .from("competition_roster_squads")
      .select("id, tournament_id, name, squad_kind, program, category_label, gender, status, sort_order")
      .eq("tournament_id", tournamentId)
      .neq("status", "archived")
      .order("sort_order")
      .order("name")
      .returns<SquadRow[]>(),
    admin
      .from("tournament_player_entries")
      .select("enrollment_id")
      .eq("tournament_id", tournamentId)
      .eq("entry_status", "confirmed")
      .returns<CandidateRow[]>(),
    admin
      .from("competition_roster_exclusions")
      .select("enrollment_id")
      .eq("tournament_id", tournamentId)
      .returns<ExclusionRow[]>(),
    admin
      .from("competition_roster_snapshots")
      .select("id, label, captured_at")
      .eq("tournament_id", tournamentId)
      .order("captured_at", { ascending: false })
      .limit(1)
      .returns<SnapshotRow[]>(),
  ]);

  if (squadsResult.error || candidatesResult.error || exclusionsResult.error || snapshotsResult.error) {
    return null;
  }

  const squadRows = squadsResult.data ?? [];
  const squadIds = squadRows.map((row) => row.id);
  const [groupsResult, membersResult] = squadIds.length > 0
    ? await Promise.all([
        admin
          .from("competition_roster_squad_groups")
          .select("squad_id, training_group_id, training_groups(name)")
          .in("squad_id", squadIds)
          .returns<SquadGroupRow[]>(),
        admin
          .from("competition_roster_squad_members")
          .select("squad_id, enrollment_id, source, reason")
          .in("squad_id", squadIds)
          .returns<MemberRow[]>(),
      ])
    : [{ data: [] as SquadGroupRow[], error: null }, { data: [] as MemberRow[], error: null }];

  if (groupsResult.error || membersResult.error) return null;

  const groupRows = groupsResult.data ?? [];
  const memberRows = membersResult.data ?? [];
  const squads: CompetitionRosterSquad[] = squadRows.map((row) => ({
    id: row.id,
    tournamentId: row.tournament_id,
    name: row.name,
    kind: row.squad_kind,
    program: row.program,
    categoryLabel: row.category_label,
    gender: row.gender,
    status: row.status,
    sortOrder: row.sort_order,
    sourceGroups: groupRows
      .filter((group) => group.squad_id === row.id)
      .map((group) => ({
        id: group.training_group_id,
        name: group.training_groups?.name ?? "Grupo",
      })),
    members: memberRows
      .filter((member) => member.squad_id === row.id)
      .map((member) => ({
        enrollmentId: member.enrollment_id,
        source: member.source,
        reason: member.reason,
      })),
  }));

  const candidateEnrollmentIds = [...new Set((candidatesResult.data ?? []).map((row) => row.enrollment_id))];
  const excludedEnrollmentIds = [...new Set((exclusionsResult.data ?? []).map((row) => row.enrollment_id))];
  const summary = summarizeCompetitionRosterState({
    candidateEnrollmentIds,
    excludedEnrollmentIds,
    memberRows: memberRows.map((row) => ({ enrollmentId: row.enrollment_id, source: row.source })),
  });
  const latestSnapshot = snapshotsResult.data?.[0] ?? null;

  return {
    tournamentId: tournament.id,
    tournamentName: tournament.name,
    campusId: tournament.campus_id,
    squads,
    candidateEnrollmentIds,
    excludedEnrollmentIds,
    ...summary,
    latestSnapshot: latestSnapshot
      ? { id: latestSnapshot.id, label: latestSnapshot.label, capturedAt: latestSnapshot.captured_at }
      : null,
  };
}

type OrganizerEntryRow = {
  enrollment_id: string;
  enrollments: {
    id: string;
    player_id: string;
    campus_id: string;
    status: string;
    players: {
      first_name: string;
      last_name: string;
      birth_date: string | null;
    } | null;
  } | null;
};

type OrganizerAssignmentRow = {
  enrollment_id: string;
  training_group_id: string;
  training_groups: {
    id: string;
    name: string | null;
    program: string | null;
    gender: string | null;
    birth_year_min: number | null;
    birth_year_max: number | null;
  } | null;
};

export type CompetitionRosterOrganizerPlayer = {
  enrollmentId: string;
  playerId: string;
  playerName: string;
  birthYear: number | null;
  assignedSquadNames: string[];
};

export type CompetitionRosterOrganizerGroup = {
  id: string;
  name: string;
  subtitle: string;
  program: string;
  candidates: CompetitionRosterOrganizerPlayer[];
  squad: {
    id: string;
    name: string;
    status: CompetitionSquadStatus;
    kind: CompetitionSquadKind;
    memberCount: number;
  } | null;
  pendingCount: number;
  usesAdvancedStructure: boolean;
};

export type CompetitionRosterOrganizerData = {
  tournamentId: string;
  productId: string;
  tournamentName: string;
  campusId: string;
  campusName: string;
  program: string;
  programLabel: string;
  canManage: boolean;
  totalConfirmed: number;
  totalAssigned: number;
  totalPending: number;
  groups: CompetitionRosterOrganizerGroup[];
  withoutGroup: CompetitionRosterOrganizerPlayer[];
};

const ORGANIZER_PROGRAM_LABELS: Record<string, string> = {
  futbol_para_todos: "Futbol Para Todos",
  selectivo: "Selectivos",
  little_dragons: "Little Dragons",
};

function getBirthYear(value: string | null | undefined) {
  if (!value) return null;
  const year = Number.parseInt(value.slice(0, 4), 10);
  return Number.isInteger(year) ? year : null;
}

function sortOrganizerPlayers<T extends { playerName: string }>(rows: T[]) {
  return rows.sort((a, b) => a.playerName.localeCompare(b.playerName, "es-MX"));
}

async function loadConfirmedOrganizerEntries(
  admin: ReturnType<typeof createAdminClient>,
  tournamentId: string,
) {
  const rows: OrganizerEntryRow[] = [];
  const pageSize = 500;
  for (let offset = 0; ; offset += pageSize) {
    const result = await admin
      .from("tournament_player_entries")
      .select("enrollment_id, enrollments(id, player_id, campus_id, status, players(first_name, last_name, birth_date))")
      .eq("tournament_id", tournamentId)
      .eq("entry_status", "confirmed")
      .range(offset, offset + pageSize - 1)
      .returns<OrganizerEntryRow[]>();
    if (result.error) throw result.error;
    rows.push(...(result.data ?? []));
    if ((result.data?.length ?? 0) < pageSize) break;
  }
  return rows;
}

async function loadOrganizerAssignments(
  admin: ReturnType<typeof createAdminClient>,
  enrollmentIds: string[],
) {
  const rows: OrganizerAssignmentRow[] = [];
  const chunkSize = 200;
  for (let index = 0; index < enrollmentIds.length; index += chunkSize) {
    const chunk = enrollmentIds.slice(index, index + chunkSize);
    const result = await admin
      .from("training_group_assignments")
      .select("enrollment_id, training_group_id, training_groups(id, name, program, gender, birth_year_min, birth_year_max)")
      .in("enrollment_id", chunk)
      .is("end_date", null)
      .returns<OrganizerAssignmentRow[]>();
    if (result.error) throw result.error;
    rows.push(...(result.data ?? []));
  }
  return rows;
}

export async function getCompetitionRosterOrganizerData(filters: {
  tournamentId: string;
  campusId: string;
  program: string;
}): Promise<CompetitionRosterOrganizerData | null> {
  const permission = await getPermissionContext();
  if (!permission || (!permission.hasOperationalAccess && !permission.hasSportsAccess)) return null;
  if (!ORGANIZER_PROGRAM_LABELS[filters.program]) return null;

  const admin = createAdminClient();
  const tournamentResult = await admin
    .from("tournaments")
    .select("id, name, product_id, campus_id, is_active, campuses(name)")
    .eq("id", filters.tournamentId)
    .maybeSingle<{
      id: string;
      name: string;
      product_id: string;
      campus_id: string | null;
      is_active: boolean;
      campuses: { name: string | null } | null;
    } | null>();

  const tournament = tournamentResult.data;
  if (tournamentResult.error || !tournament?.is_active || tournament.campus_id !== filters.campusId) return null;
  if (!canAccessCampus(permission.campusAccess, tournament.campus_id)) return null;

  const [entryRows, foundation] = await Promise.all([
    loadConfirmedOrganizerEntries(admin, tournament.id),
    getCompetitionRosterFoundation(tournament.id),
  ]);
  if (!foundation) return null;

  const activeEntries = entryRows.filter((row) =>
    row.enrollments?.status === "active" && row.enrollments.campus_id === tournament.campus_id,
  );
  const enrollmentIds = [...new Set(activeEntries.map((row) => row.enrollment_id))];
  const assignmentRows = await loadOrganizerAssignments(admin, enrollmentIds);
  const assignmentByEnrollment = new Map(assignmentRows.map((row) => [row.enrollment_id, row]));
  const squadNamesByEnrollment = new Map<string, string[]>();
  for (const squad of foundation.squads) {
    for (const member of squad.members) {
      const names = squadNamesByEnrollment.get(member.enrollmentId) ?? [];
      names.push(squad.name);
      squadNamesByEnrollment.set(member.enrollmentId, names);
    }
  }

  const groupRows = new Map<string, {
    assignment: OrganizerAssignmentRow;
    candidates: CompetitionRosterOrganizerPlayer[];
  }>();
  const withoutGroup: CompetitionRosterOrganizerPlayer[] = [];

  for (const entry of activeEntries) {
    const enrollment = entry.enrollments;
    if (!enrollment?.players) continue;
    const assignment = assignmentByEnrollment.get(entry.enrollment_id) ?? null;
    if (assignment && assignment.training_groups?.program !== filters.program) continue;

    const player: CompetitionRosterOrganizerPlayer = {
      enrollmentId: enrollment.id,
      playerId: enrollment.player_id,
      playerName: `${enrollment.players.first_name} ${enrollment.players.last_name}`.trim(),
      birthYear: getBirthYear(enrollment.players.birth_date),
      assignedSquadNames: squadNamesByEnrollment.get(enrollment.id) ?? [],
    };

    if (!assignment?.training_groups) {
      withoutGroup.push(player);
      continue;
    }

    const current = groupRows.get(assignment.training_group_id) ?? { assignment, candidates: [] };
    current.candidates.push(player);
    groupRows.set(assignment.training_group_id, current);
  }

  const assignedIds = new Set(foundation.assignedCandidateEnrollmentIds);
  const excludedIds = new Set(foundation.excludedEnrollmentIds);
  const groups = [...groupRows.values()].map<CompetitionRosterOrganizerGroup>(({ assignment, candidates }) => {
    const group = assignment.training_groups!;
    const linkedSquads = foundation.squads.filter((squad) =>
      squad.sourceGroups.some((sourceGroup) => sourceGroup.id === assignment.training_group_id),
    );
    const singleSquad = linkedSquads.find((squad) => squad.kind === "single") ?? null;
    const sortedCandidates = sortOrganizerPlayers(candidates);
    return {
      id: assignment.training_group_id,
      name: formatTrainingGroupDisplayName({ name: group.name ?? "Grupo", program: group.program }),
      subtitle: [
        group.birth_year_min && group.birth_year_max
          ? `Cat. ${group.birth_year_min === group.birth_year_max ? group.birth_year_min : `${group.birth_year_min}/${group.birth_year_max}`}`
          : null,
        ORGANIZER_PROGRAM_LABELS[group.program ?? ""] ?? null,
      ].filter(Boolean).join(" | "),
      program: group.program ?? filters.program,
      candidates: sortedCandidates,
      squad: singleSquad
        ? {
            id: singleSquad.id,
            name: singleSquad.name,
            status: singleSquad.status,
            kind: singleSquad.kind,
            memberCount: singleSquad.members.length,
          }
        : null,
      pendingCount: sortedCandidates.filter(
        (player) => !assignedIds.has(player.enrollmentId) && !excludedIds.has(player.enrollmentId),
      ).length,
      usesAdvancedStructure: linkedSquads.length > 1 || linkedSquads.some((squad) => squad.kind !== "single"),
    };
  }).sort((a, b) => {
    const yearA = Math.max(...a.candidates.map((player) => player.birthYear ?? 0), 0);
    const yearB = Math.max(...b.candidates.map((player) => player.birthYear ?? 0), 0);
    if (yearA !== yearB) return yearB - yearA;
    return a.name.localeCompare(b.name, "es-MX");
  });

  const visibleCandidateIds = new Set([
    ...groups.flatMap((group) => group.candidates.map((player) => player.enrollmentId)),
    ...withoutGroup.map((player) => player.enrollmentId),
  ]);
  const totalAssigned = [...visibleCandidateIds].filter((id) => assignedIds.has(id)).length;
  const totalExcluded = [...visibleCandidateIds].filter((id) => excludedIds.has(id)).length;

  return {
    tournamentId: tournament.id,
    productId: tournament.product_id,
    tournamentName: tournament.name,
    campusId: tournament.campus_id,
    campusName: tournament.campuses?.name ?? "Campus",
    program: filters.program,
    programLabel: ORGANIZER_PROGRAM_LABELS[filters.program],
    canManage: permission.isSportsDirector,
    totalConfirmed: visibleCandidateIds.size,
    totalAssigned,
    totalPending: visibleCandidateIds.size - totalAssigned - totalExcluded,
    groups,
    withoutGroup: sortOrganizerPlayers(withoutGroup),
  };
}
