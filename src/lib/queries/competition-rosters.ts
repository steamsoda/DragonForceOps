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
type ExclusionRow = { enrollment_id: string; reason: string };
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
      .select("enrollment_id, reason")
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
    exclusions: (exclusionsResult.data ?? []).map((row) => ({
      enrollmentId: row.enrollment_id,
      reason: row.reason,
    })),
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
      public_player_id: string | null;
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
  publicPlayerId: string | null;
  birthYear: number | null;
  trainingGroupName: string | null;
  assignedSquadNames: string[];
  assignedSquads: Array<{ id: string; name: string; kind: CompetitionSquadKind }>;
  isExcluded: boolean;
  exclusionReason: string | null;
};

export type CompetitionRosterHelperCandidate = {
  enrollmentId: string;
  playerName: string;
  birthYear: number | null;
  trainingGroupName: string;
  programLabel: string;
  assignedSquadIds: string[];
};

export type CompetitionRosterManualHelper = {
  squadId: string;
  squadName: string;
  enrollmentId: string;
  playerName: string;
  birthYear: number | null;
  reason: string | null;
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
  squads: Array<{
    id: string;
    name: string;
    status: CompetitionSquadStatus;
    kind: CompetitionSquadKind;
    memberCount: number;
    sourceGroupIds: string[];
  }>;
  pendingCount: number;
  usesAdvancedStructure: boolean;
  hasSplitStructure: boolean;
  hasCombinedStructure: boolean;
  combinedSquadId: string | null;
  canEditSplit: boolean;
  canCombine: boolean;
};

export type CompetitionRosterCombinedSquad = {
  id: string;
  name: string;
  sourceGroupIds: string[];
  memberCount: number;
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
  combinedSquads: CompetitionRosterCombinedSquad[];
  withoutGroup: CompetitionRosterOrganizerPlayer[];
  activeSquads: Array<{ id: string; name: string }>;
  helperCandidates: CompetitionRosterHelperCandidate[];
  manualHelpers: CompetitionRosterManualHelper[];
  excludedPlayers: CompetitionRosterOrganizerPlayer[];
  liveSquads: CompetitionRosterLiveSquad[];
  latestSnapshot: { id: string; label: string; capturedAt: string } | null;
};

export type CompetitionRosterLiveMember = {
  enrollmentId: string;
  playerName: string;
  publicPlayerId: string | null;
  birthYear: number | null;
  trainingGroupName: string | null;
  source: CompetitionMembershipSource;
};

export type CompetitionRosterLiveSquad = {
  id: string;
  name: string;
  kind: CompetitionSquadKind;
  status: CompetitionSquadStatus;
  categoryLabel: string | null;
  sourceGroupNames: string[];
  members: CompetitionRosterLiveMember[];
};

export type CompetitionRosterLiveViewData = {
  tournamentId: string;
  tournamentName: string;
  campusId: string;
  campusName: string;
  program: string;
  programLabel: string;
  totalConfirmed: number;
  totalAssigned: number;
  totalPending: number;
  squads: CompetitionRosterLiveSquad[];
  pendingPlayers: Array<{
    enrollmentId: string;
    playerName: string;
    birthYear: number | null;
    trainingGroupName: string | null;
  }>;
};

export type CompetitionRosterSnapshotExportData = {
  snapshotId: string;
  label: string;
  capturedAt: string;
  tournamentName: string;
  campusName: string;
  squads: Array<{
    name: string;
    kind: CompetitionSquadKind;
    program: string | null;
    categoryLabel: string | null;
    sourceGroupNames: string[];
    members: Array<{
      playerName: string;
      publicPlayerId: string | null;
      birthYear: number | null;
      trainingGroupName: string | null;
      source: CompetitionMembershipSource;
    }>;
  }>;
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
      .select("enrollment_id, enrollments(id, player_id, campus_id, status, players(first_name, last_name, birth_date, public_player_id))")
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

type OrganizerCampusEnrollmentRow = {
  id: string;
  player_id: string;
  players: {
    first_name: string;
    last_name: string;
    birth_date: string | null;
    public_player_id: string | null;
  } | null;
};

async function loadActiveCampusEnrollments(
  admin: ReturnType<typeof createAdminClient>,
  campusId: string,
) {
  const rows: OrganizerCampusEnrollmentRow[] = [];
  const pageSize = 500;
  for (let offset = 0; ; offset += pageSize) {
    const result = await admin
      .from("enrollments")
      .select("id, player_id, players(first_name, last_name, birth_date, public_player_id)")
      .eq("campus_id", campusId)
      .eq("status", "active")
      .range(offset, offset + pageSize - 1)
      .returns<OrganizerCampusEnrollmentRow[]>();
    if (result.error) throw result.error;
    rows.push(...(result.data ?? []));
    if ((result.data?.length ?? 0) < pageSize) break;
  }
  return rows;
}

async function loadCampusEnrollmentsByIds(
  admin: ReturnType<typeof createAdminClient>,
  campusId: string,
  enrollmentIds: string[],
) {
  const rows: OrganizerCampusEnrollmentRow[] = [];
  const chunkSize = 200;
  for (let index = 0; index < enrollmentIds.length; index += chunkSize) {
    const result = await admin
      .from("enrollments")
      .select("id, player_id, players(first_name, last_name, birth_date, public_player_id)")
      .eq("campus_id", campusId)
      .in("id", enrollmentIds.slice(index, index + chunkSize))
      .returns<OrganizerCampusEnrollmentRow[]>();
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

  const [entryRows, foundation, programSnapshotsResult] = await Promise.all([
    loadConfirmedOrganizerEntries(admin, tournament.id),
    getCompetitionRosterFoundation(tournament.id),
    admin
      .from("competition_roster_snapshots")
      .select("id, label, captured_at, competition_roster_snapshot_squads!inner(program_snapshot)")
      .eq("tournament_id", tournament.id)
      .eq("competition_roster_snapshot_squads.program_snapshot", filters.program)
      .order("captured_at", { ascending: false })
      .limit(1)
      .returns<Array<{
        id: string;
        label: string;
        captured_at: string;
        competition_roster_snapshot_squads: Array<{ program_snapshot: string | null }>;
      }>>(),
  ]);
  if (!foundation || programSnapshotsResult.error) return null;

  const activeEntries = entryRows.filter((row) =>
    row.enrollments?.status === "active" && row.enrollments.campus_id === tournament.campus_id,
  );
  const enrollmentIds = [...new Set(activeEntries.map((row) => row.enrollment_id))];
  const assignmentRows = await loadOrganizerAssignments(admin, enrollmentIds);
  const assignmentByEnrollment = new Map(assignmentRows.map((row) => [row.enrollment_id, row]));
  const squadNamesByEnrollment = new Map<string, string[]>();
  const squadsByEnrollment = new Map<string, Array<{ id: string; name: string; kind: CompetitionSquadKind }>>();
  const exclusionReasonByEnrollment = new Map(
    foundation.exclusions.map((exclusion) => [exclusion.enrollmentId, exclusion.reason]),
  );
  for (const squad of foundation.squads) {
    for (const member of squad.members) {
      const names = squadNamesByEnrollment.get(member.enrollmentId) ?? [];
      names.push(squad.name);
      squadNamesByEnrollment.set(member.enrollmentId, names);
      const assignedSquads = squadsByEnrollment.get(member.enrollmentId) ?? [];
      assignedSquads.push({ id: squad.id, name: squad.name, kind: squad.kind });
      squadsByEnrollment.set(member.enrollmentId, assignedSquads);
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
      publicPlayerId: enrollment.players.public_player_id,
      birthYear: getBirthYear(enrollment.players.birth_date),
      trainingGroupName: assignment?.training_groups
        ? formatTrainingGroupDisplayName({
            name: assignment.training_groups.name ?? "Grupo",
            program: assignment.training_groups.program,
          })
        : null,
      assignedSquadNames: squadNamesByEnrollment.get(enrollment.id) ?? [],
      assignedSquads: squadsByEnrollment.get(enrollment.id) ?? [],
      isExcluded: exclusionReasonByEnrollment.has(enrollment.id),
      exclusionReason: exclusionReasonByEnrollment.get(enrollment.id) ?? null,
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
    const displaySquad = singleSquad ?? linkedSquads[0] ?? null;
    const hasSplitStructure = linkedSquads.length === 2
      && linkedSquads.some((squad) => squad.kind === "azul")
      && linkedSquads.some((squad) => squad.kind === "blanco")
      && linkedSquads.every((squad) => squad.sourceGroups.length === 1);
    const hasCombinedStructure = linkedSquads.length === 1
      && singleSquad !== null
      && singleSquad.sourceGroups.length > 1;
    const canEditSplit = linkedSquads.length === 0
      || (linkedSquads.length === 1 && singleSquad !== null && singleSquad.sourceGroups.length === 1)
      || hasSplitStructure;
    const canCombine = linkedSquads.length === 0
      || (linkedSquads.length === 1
        && singleSquad !== null
        && !singleSquad.members.some((member) => member.source === "manual"));
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
      squad: displaySquad
        ? {
            id: displaySquad.id,
            name: displaySquad.name,
            status: displaySquad.status,
            kind: displaySquad.kind,
            memberCount: displaySquad.members.length,
          }
        : null,
      squads: linkedSquads.map((squad) => ({
        id: squad.id,
        name: squad.name,
        status: squad.status,
        kind: squad.kind,
        memberCount: squad.members.length,
        sourceGroupIds: squad.sourceGroups.map((sourceGroup) => sourceGroup.id),
      })),
      pendingCount: sortedCandidates.filter(
        (player) => !assignedIds.has(player.enrollmentId) && !excludedIds.has(player.enrollmentId),
      ).length,
      usesAdvancedStructure: linkedSquads.length > 1
        || linkedSquads.some((squad) => squad.kind !== "single" || squad.sourceGroups.length > 1),
      hasSplitStructure,
      hasCombinedStructure,
      combinedSquadId: hasCombinedStructure ? singleSquad.id : null,
      canEditSplit,
      canCombine,
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
  const visibleGroupIds = new Set(groups.map((group) => group.id));
  const combinedSquads = foundation.squads
    .filter((squad) =>
      squad.kind === "single"
      && squad.program === filters.program
      && squad.sourceGroups.length > 1
      && squad.sourceGroups.some((sourceGroup) => visibleGroupIds.has(sourceGroup.id)),
    )
    .map((squad) => ({
      id: squad.id,
      name: squad.name,
      sourceGroupIds: squad.sourceGroups.map((sourceGroup) => sourceGroup.id),
      memberCount: squad.members.length,
    }));

  const activeSquads = foundation.squads
    .filter((squad) => squad.program === filters.program)
    .map((squad) => ({ id: squad.id, name: squad.name }))
    .sort((a, b) => a.name.localeCompare(b.name, "es-MX"));
  const manualMemberIds = new Set(foundation.manualMemberEnrollmentIds);
  const campusEnrollments = permission.isSportsDirector
    ? await loadActiveCampusEnrollments(admin, tournament.campus_id)
    : [];
  const manualEnrollmentIds = [...manualMemberIds];
  const manualOnlyEnrollments = permission.isSportsDirector
    ? []
    : await loadCampusEnrollmentsByIds(admin, tournament.campus_id, manualEnrollmentIds);
  const helperEnrollmentRows = permission.isSportsDirector ? campusEnrollments : manualOnlyEnrollments;
  const helperEnrollmentIds = helperEnrollmentRows.map((row) => row.id);
  const helperAssignments = helperEnrollmentIds.length > 0
    ? await loadOrganizerAssignments(admin, helperEnrollmentIds)
    : [];
  const helperAssignmentByEnrollment = new Map(helperAssignments.map((row) => [row.enrollment_id, row]));
  const helperRowByEnrollment = new Map(helperEnrollmentRows.map((row) => [row.id, row]));
  const helperCandidates = permission.isSportsDirector
    ? sortOrganizerPlayers(campusEnrollments.flatMap<CompetitionRosterHelperCandidate>((enrollment) => {
        if (!enrollment.players) return [];
        const assignment = helperAssignmentByEnrollment.get(enrollment.id);
        const group = assignment?.training_groups;
        return [{
          enrollmentId: enrollment.id,
          playerName: `${enrollment.players.first_name} ${enrollment.players.last_name}`.trim(),
          birthYear: getBirthYear(enrollment.players.birth_date),
          trainingGroupName: group
            ? formatTrainingGroupDisplayName({ name: group.name ?? "Grupo", program: group.program })
            : "Sin grupo",
          programLabel: ORGANIZER_PROGRAM_LABELS[group?.program ?? ""] ?? "Sin programa",
          assignedSquadIds: squadsByEnrollment.get(enrollment.id)?.map((squad) => squad.id) ?? [],
        }];
      }))
    : [];
  const manualHelpers = foundation.squads.flatMap<CompetitionRosterManualHelper>((squad) =>
    squad.members.flatMap((member) => {
      if (member.source !== "manual") return [];
      const enrollment = helperRowByEnrollment.get(member.enrollmentId);
      if (!enrollment?.players) return [];
      return [{
        squadId: squad.id,
        squadName: squad.name,
        enrollmentId: member.enrollmentId,
        playerName: `${enrollment.players.first_name} ${enrollment.players.last_name}`.trim(),
        birthYear: getBirthYear(enrollment.players.birth_date),
        reason: member.reason,
      }];
    }),
  ).sort((a, b) => a.playerName.localeCompare(b.playerName, "es-MX"));
  const allVisiblePlayers = [...groups.flatMap((group) => group.candidates), ...withoutGroup];
  const excludedPlayers = sortOrganizerPlayers(allVisiblePlayers.filter((player) => player.isExcluded));
  const playerByEnrollment = new Map(allVisiblePlayers.map((player) => [player.enrollmentId, player]));
  const helperByEnrollment = new Map(manualHelpers.map((helper) => [helper.enrollmentId, helper]));
  const liveSquads = foundation.squads
    .filter((squad) => squad.program === filters.program)
    .map<CompetitionRosterLiveSquad>((squad) => ({
      id: squad.id,
      name: squad.name,
      kind: squad.kind,
      status: squad.status,
      categoryLabel: squad.categoryLabel,
      sourceGroupNames: squad.sourceGroups.map((group) => group.name),
      members: squad.members.flatMap<CompetitionRosterLiveMember>((member) => {
        const player = playerByEnrollment.get(member.enrollmentId);
        if (player) {
          return [{
            enrollmentId: player.enrollmentId,
            playerName: player.playerName,
            publicPlayerId: player.publicPlayerId,
            birthYear: player.birthYear,
            trainingGroupName: player.trainingGroupName,
            source: member.source,
          }];
        }
        const helper = helperByEnrollment.get(member.enrollmentId);
        if (!helper) return [];
        const helperCandidate = helperAssignmentByEnrollment.get(member.enrollmentId)?.training_groups;
        return [{
          enrollmentId: member.enrollmentId,
          playerName: helper.playerName,
          publicPlayerId: helperRowByEnrollment.get(member.enrollmentId)?.players?.public_player_id ?? null,
          birthYear: helper.birthYear,
          trainingGroupName: helperCandidate
            ? formatTrainingGroupDisplayName({
                name: helperCandidate.name ?? "Grupo",
                program: helperCandidate.program,
              })
            : null,
          source: member.source,
        }];
      }).sort((a, b) => a.playerName.localeCompare(b.playerName, "es-MX")),
    }))
    .filter((squad) => squad.members.length > 0)
    .sort((a, b) => a.name.localeCompare(b.name, "es-MX"));

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
    combinedSquads,
    withoutGroup: sortOrganizerPlayers(withoutGroup),
    activeSquads,
    helperCandidates,
    manualHelpers,
    excludedPlayers,
    liveSquads,
    latestSnapshot: programSnapshotsResult.data?.[0]
      ? {
          id: programSnapshotsResult.data[0].id,
          label: programSnapshotsResult.data[0].label,
          capturedAt: programSnapshotsResult.data[0].captured_at,
        }
      : null,
  };
}

export async function getCompetitionRosterLiveViewData(filters: {
  tournamentId: string;
  campusId: string;
  program: string;
}): Promise<CompetitionRosterLiveViewData | null> {
  const organizer = await getCompetitionRosterOrganizerData(filters);
  if (!organizer) return null;

  const assignedIds = new Set(organizer.liveSquads.flatMap((squad) => squad.members.map((member) => member.enrollmentId)));
  const pendingPlayers = sortOrganizerPlayers(
    [...organizer.groups.flatMap((group) => group.candidates), ...organizer.withoutGroup]
      .filter((player) => !player.isExcluded && !assignedIds.has(player.enrollmentId))
      .map((player) => ({
        enrollmentId: player.enrollmentId,
        playerName: player.playerName,
        birthYear: player.birthYear,
        trainingGroupName: player.trainingGroupName,
      })),
  );

  return {
    tournamentId: organizer.tournamentId,
    tournamentName: organizer.tournamentName,
    campusId: organizer.campusId,
    campusName: organizer.campusName,
    program: organizer.program,
    programLabel: organizer.programLabel,
    totalConfirmed: organizer.totalConfirmed,
    totalAssigned: organizer.totalAssigned,
    totalPending: organizer.totalPending,
    squads: organizer.liveSquads,
    pendingPlayers,
  };
}

export async function getCompetitionRosterSnapshotExportData(
  snapshotId: string,
): Promise<CompetitionRosterSnapshotExportData | null> {
  const permission = await getPermissionContext();
  if (!permission || (!permission.hasOperationalAccess && !permission.hasSportsAccess)) return null;

  const admin = createAdminClient();
  const snapshotResult = await admin
    .from("competition_roster_snapshots")
    .select("id, label, captured_at, tournament_id, tournaments(name, campus_id, campuses(name))")
    .eq("id", snapshotId)
    .maybeSingle<{
      id: string;
      label: string;
      captured_at: string;
      tournament_id: string;
      tournaments: {
        name: string;
        campus_id: string;
        campuses: { name: string | null } | null;
      } | null;
    } | null>();
  const snapshot = snapshotResult.data;
  if (snapshotResult.error || !snapshot?.tournaments) return null;
  if (!canAccessCampus(permission.campusAccess, snapshot.tournaments.campus_id)) return null;

  const squadsResult = await admin
    .from("competition_roster_snapshot_squads")
    .select("id, name_snapshot, squad_kind_snapshot, program_snapshot, category_label_snapshot, source_group_names_snapshot, sort_order")
    .eq("snapshot_id", snapshot.id)
    .order("sort_order")
    .order("name_snapshot")
    .returns<Array<{
      id: string;
      name_snapshot: string;
      squad_kind_snapshot: CompetitionSquadKind;
      program_snapshot: string | null;
      category_label_snapshot: string | null;
      source_group_names_snapshot: string[] | null;
      sort_order: number;
    }>>();
  if (squadsResult.error) throw squadsResult.error;

  const squadRows = squadsResult.data ?? [];
  const squadIds = squadRows.map((squad) => squad.id);
  const memberRows: Array<{
    snapshot_squad_id: string;
    player_name_snapshot: string;
    player_public_id_snapshot: string | null;
    birth_year_snapshot: number | null;
    training_group_name_snapshot: string | null;
    membership_source_snapshot: CompetitionMembershipSource;
    sort_order: number;
  }> = [];
  for (let index = 0; index < squadIds.length; index += 100) {
    const result = await admin
      .from("competition_roster_snapshot_members")
      .select("snapshot_squad_id, player_name_snapshot, player_public_id_snapshot, birth_year_snapshot, training_group_name_snapshot, membership_source_snapshot, sort_order")
      .in("snapshot_squad_id", squadIds.slice(index, index + 100))
      .order("sort_order")
      .order("player_name_snapshot")
      .returns<typeof memberRows>();
    if (result.error) throw result.error;
    memberRows.push(...(result.data ?? []));
  }

  return {
    snapshotId: snapshot.id,
    label: snapshot.label,
    capturedAt: snapshot.captured_at,
    tournamentName: snapshot.tournaments.name,
    campusName: snapshot.tournaments.campuses?.name ?? "Campus",
    squads: squadRows.map((squad) => ({
      name: squad.name_snapshot,
      kind: squad.squad_kind_snapshot,
      program: squad.program_snapshot,
      categoryLabel: squad.category_label_snapshot,
      sourceGroupNames: squad.source_group_names_snapshot ?? [],
      members: memberRows
        .filter((member) => member.snapshot_squad_id === squad.id)
        .map((member) => ({
          playerName: member.player_name_snapshot,
          publicPlayerId: member.player_public_id_snapshot,
          birthYear: member.birth_year_snapshot,
          trainingGroupName: member.training_group_name_snapshot,
          source: member.membership_source_snapshot,
        })),
    })),
  };
}
