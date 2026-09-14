import "server-only";
import type { PermissionContext } from "@/lib/auth/permissions";
import type { getPlayerDetail, listPlayers } from "@/lib/queries/players";
import { formatTrainingGroupDisplayName } from "@/lib/training-groups/shared";

type Detail = NonNullable<Awaited<ReturnType<typeof getPlayerDetail>>>;
type ListRow = Awaited<ReturnType<typeof listPlayers>>["rows"][number];
export type DirectorCampus = { id: string; name: string; code: string; is_active: boolean };
export type DirectorEnrollment = { id: string; player_id: string; campus_id: string; status: string; start_date: string; end_date: string | null; inscription_date: string };
export type DirectorPlayer = { id: string; public_player_id: string | null; first_name: string; last_name: string; birth_date: string; status: string; gender: string | null; uniform_size: string | null; is_goalkeeper: boolean; level: string | null; jersey_number: number | null };
export type DirectorGroup = { id: string; campus_id: string; name: string; program: string; level_label: string | null; group_code: string | null; gender: string; birth_year_min: number | null; birth_year_max: number | null; start_time: string | null; end_time: string | null; status: string };
export type DirectorGroupAssignment = { id: string; enrollment_id: string; training_group_id: string; start_date: string; end_date: string | null };
type Guardian = Omit<Detail["guardians"][number], "isPrimary">;
type GuardianLink = { id: string; player_id: string; guardian_id: string; is_primary: boolean };
type TeamAssignment = { id: string; enrollment_id: string; team_id: string; end_date: string | null; is_primary: boolean };
type Team = { id: string; name: string; birth_year: number; gender: string; level: string | null; type: string; coach_id: string | null };
type Coach = { id: string; first_name: string; last_name: string };

export const DIRECTOR_COLUMNS = {
  players: "id,public_player_id,first_name,last_name,birth_date,status,gender,uniform_size,is_goalkeeper,level,jersey_number",
  enrollments: "id,player_id,campus_id,status,start_date,end_date,inscription_date",
  campuses: "id,name,code,is_active",
  player_guardians: "id,player_id,guardian_id,is_primary",
  guardians: "id,first_name,last_name,phone_primary,phone_secondary,email,relationship_label",
  training_groups: "id,campus_id,name,program,level_label,group_code,gender,birth_year_min,birth_year_max,start_time,end_time,status",
  training_group_assignments: "id,enrollment_id,training_group_id,start_date,end_date",
  team_assignments: "id,enrollment_id,team_id,end_date,is_primary",
  teams: "id,name,birth_year,gender,level,type,coach_id",
  coaches: "id,first_name,last_name",
  attendance_records: "id,player_id,enrollment_id,session_id,status",
  attendance_sessions: "id,campus_id,session_date,session_type,start_time,status",
} as const;

export function isDirectorReadOnly(context: PermissionContext) {
  return context.isDirectorReadOnly === true;
}

// Barriers enforce verified isolated membership; never fall back to raw/admin reads.
export async function readDirectorRows<T>(context: PermissionContext, resource: keyof typeof DIRECTOR_COLUMNS,
  filter: { key?: string; ids?: string[]; equals?: string; nullKey?: string } = {}): Promise<T[]> {
  if (!isDirectorReadOnly(context) || context.canViewFinancials !== false) throw new Error("director_readonly_context_required");
  const ids = filter.ids ? [...new Set(filter.ids)] : undefined;
  if (ids?.length === 0) return [];
  const chunks: Array<string[] | undefined> = ids
    ? Array.from({ length: Math.ceil(ids.length / 100) }, (_, i) => ids.slice(i * 100, i * 100 + 100)) : [undefined];
  const rows: T[] = [];
  for (const chunk of chunks) {
    for (let from = 0; ; from += 500) {
      let query = context.supabase.from(`v_director_readonly_${resource}`).select(DIRECTOR_COLUMNS[resource]).order("id").range(from, from + 499);
      if (chunk) query = query.in(filter.key ?? "id", chunk);
      if (filter.equals !== undefined) query = query.eq(filter.key ?? "id", filter.equals);
      if (filter.nullKey) query = query.is(filter.nullKey, null);
      const { data, error } = await query.returns<T[]>();
      if (error) throw error;
      rows.push(...(data ?? []));
      if (!data || data.length < 500) break;
    }
  }
  return rows;
}

export async function readDirectorCore(context: PermissionContext) {
  const players = await readDirectorRows<DirectorPlayer>(context, "players");
  const enrollments = await readDirectorRows<DirectorEnrollment>(context, "enrollments");
  const campuses = await readDirectorRows<DirectorCampus>(context, "campuses");
  return { players, enrollments, campuses };
}

async function readGuardians(context: PermissionContext, playerIds: string[]) {
  const links = await readDirectorRows<GuardianLink>(context, "player_guardians", { key: "player_id", ids: playerIds });
  const guardians = await readDirectorRows<Guardian>(context, "guardians", { ids: links.map((link) => link.guardian_id) });
  const byId = new Map(guardians.map((guardian) => [guardian.id, guardian]));
  return links.flatMap((link) => {
    const guardian = byId.get(link.guardian_id);
    return guardian ? [{ playerId: link.player_id, ...guardian, isPrimary: link.is_primary }] : [];
  }).sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary));
}

export async function readDirectorPlayers(context: PermissionContext) {
  const { players, enrollments, campuses } = await readDirectorCore(context);
  const guardians = await readGuardians(context, players.map((player) => player.id));
  const assignments = await readDirectorRows<TeamAssignment>(context, "team_assignments", { key: "enrollment_id", ids: enrollments.map((row) => row.id), nullKey: "end_date" });
  const teams = await readDirectorRows<Team>(context, "teams", { ids: assignments.map((row) => row.team_id) });
  const teamsById = new Map(teams.map((team) => [team.id, team]));
  const campusById = new Map(campuses.map((campus) => [campus.id, campus]));
  const byPlayer = new Map<string, DirectorEnrollment[]>();
  for (const enrollment of enrollments) {
    const rows = byPlayer.get(enrollment.player_id) ?? [];
    rows.push(enrollment); byPlayer.set(enrollment.player_id, rows);
  }
  return players.flatMap((player) => {
    const rows = (byPlayer.get(player.id) ?? []).sort((a, b) => (b.end_date ?? b.start_date).localeCompare(a.end_date ?? a.start_date));
    const active = rows.find((row) => row.status === "active");
    const enrollment = active ?? rows[0];
    const campus = enrollment && campusById.get(enrollment.campus_id);
    if (!enrollment || !campus) return [];
    const contacts = guardians.filter((row) => row.playerId === player.id);
    const assignment = assignments.find((row) => row.enrollment_id === enrollment.id && row.is_primary)
      ?? assignments.find((row) => row.enrollment_id === enrollment.id);
    const team = assignment && teamsById.get(assignment.team_id);
    return [{
      id: player.id, publicPlayerId: player.public_player_id, fullName: `${player.first_name} ${player.last_name}`,
      birthDate: player.birth_date, birthYear: Number(player.birth_date.slice(0, 4)), status: player.status,
      gender: player.gender, isGoalkeeper: player.is_goalkeeper, campusName: campus.name, campusCode: campus.code,
      campusId: enrollment.campus_id, active: Boolean(active), startDate: enrollment.start_date, endDate: enrollment.end_date,
      primaryPhone: contacts.find((row) => row.phone_primary)?.phone_primary ?? null,
      searchPhones: contacts.flatMap((row) => [row.phone_primary, row.phone_secondary]).filter(Boolean).join(" "),
      teamType: team?.type ?? null, teamName: team?.name ?? null, level: team?.level ?? player.level,
      uniformStatus: null, enrollmentId: enrollment.id, activeIncident: null,
      // Server-only compatibility slots; never serialize these as an API DTO.
      balance: 0, hasPendingSelectedMonth: false,
    } satisfies ListRow & { campusId: string; active: boolean; startDate: string; endDate: string | null; searchPhones: string }];
  });
}

export async function readDirectorPlayer(context: PermissionContext, playerId: string): Promise<Detail | null> {
  const [player] = await readDirectorRows<DirectorPlayer>(context, "players", { ids: [playerId] });
  if (!player) return null;
  const enrollmentRows = await readDirectorRows<DirectorEnrollment>(context, "enrollments", { key: "player_id", ids: [playerId] });
  if (!enrollmentRows.length) return null;
  enrollmentRows.sort((a, b) => b.start_date.localeCompare(a.start_date) || a.id.localeCompare(b.id));
  const campuses = await readDirectorRows<DirectorCampus>(context, "campuses", { ids: enrollmentRows.map((row) => row.campus_id) });
  const campusById = new Map(campuses.map((row) => [row.id, row]));
  const guardians = await readGuardians(context, [playerId]);
  const enrollments = enrollmentRows.map((row) => ({
    id: row.id, status: row.status, startDate: row.start_date, endDate: row.end_date,
    inscriptionDate: row.inscription_date, campusName: campusById.get(row.campus_id)?.name ?? "-",
    campusCode: campusById.get(row.campus_id)?.code ?? "-", dropoutReason: null, dropoutNotes: null,
    pricingPlanName: "", currency: "MXN", totalCharges: 0, totalPayments: 0, balance: 0,
  }));
  const activeEnrollment = enrollments.find((row) => row.status === "active") ?? null;
  const historicalEnrollments = enrollments.filter((row) => row.status !== "active");
  let activeTrainingGroup: Detail["activeTrainingGroup"] = null;
  let competitionTeams: Detail["competitionTeams"] = [];
  if (activeEnrollment) {
    const assignments = await readDirectorRows<DirectorGroupAssignment>(context, "training_group_assignments", { key: "enrollment_id", ids: [activeEnrollment.id], nullKey: "end_date" });
    assignments.sort((a, b) => b.start_date.localeCompare(a.start_date) || a.id.localeCompare(b.id));
    const [group] = await readDirectorRows<DirectorGroup>(context, "training_groups", { ids: assignments.slice(0, 1).map((row) => row.training_group_id) });
    if (group) activeTrainingGroup = {
      id: group.id, name: formatTrainingGroupDisplayName(group), program: group.program,
      levelLabel: group.level_label, groupCode: group.group_code, gender: group.gender,
      birthYearMin: group.birth_year_min, birthYearMax: group.birth_year_max,
    };
    const links = await readDirectorRows<TeamAssignment>(context, "team_assignments", { key: "enrollment_id", ids: [activeEnrollment.id], nullKey: "end_date" });
    const teams = await readDirectorRows<Team>(context, "teams", { ids: links.map((row) => row.team_id) });
    const coaches = await readDirectorRows<Coach>(context, "coaches", { ids: teams.flatMap((team) => team.coach_id ? [team.coach_id] : []) });
    const byId = new Map(coaches.map((coach) => [coach.id, coach]));
    competitionTeams = teams.filter((team) => team.type === "competition").map((team) => {
      const coach = team.coach_id ? byId.get(team.coach_id) : null;
      return { id: team.id, name: team.name, birthYear: team.birth_year, gender: team.gender, level: team.level,
        coachName: coach ? `${coach.first_name} ${coach.last_name}`.trim() : null };
    });
  }
  return {
    id: player.id, publicPlayerId: player.public_player_id, firstName: player.first_name, lastName: player.last_name,
    fullName: `${player.first_name} ${player.last_name}`, birthDate: player.birth_date, status: player.status, gender: player.gender,
    medicalNotes: null, uniformSize: player.uniform_size, isGoalkeeper: player.is_goalkeeper, level: player.level, jerseyNumber: player.jersey_number,
    guardians: guardians.map(({ playerId: _playerId, ...guardian }) => guardian), enrollments, activeEnrollment, historicalEnrollments,
    latestEndedEnrollment: [...historicalEnrollments].sort((a, b) => (b.endDate ?? b.startDate).localeCompare(a.endDate ?? a.startDate))[0] ?? null,
    hasActiveEnrollment: Boolean(activeEnrollment), activeEnrollmentLedger: null, activeIncident: null, activeTrainingGroup, activeTeam: null, competitionTeams,
  };
}
