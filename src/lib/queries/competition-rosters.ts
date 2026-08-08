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
