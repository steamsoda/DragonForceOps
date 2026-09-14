import "server-only";
import type { PermissionContext } from "@/lib/auth/permissions";
import type { AssignmentRow, CoachLinkRow, SessionRow, AttendanceRecordRow } from "@/lib/queries/coach-attendance-report";
import { getMonterreyMonthBounds } from "@/lib/time";

type Client = PermissionContext["supabase"];
const PAGE_SIZE = 500;
async function pages<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>) {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const result = await build(from, from + PAGE_SIZE - 1);
    if (result.error) throw new Error("attendance_readonly_projection_unavailable");
    rows.push(...(result.data ?? []));
    if ((result.data?.length ?? 0) < PAGE_SIZE) return rows;
  }
}
async function byIds<T>(ids: string[], build: (ids: string[], from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>) {
  const unique = [...new Set(ids)];
  const rows: T[] = [];
  for (let offset = 0; offset < unique.length; offset += 100) {
    rows.push(...await pages((from, to) => build(unique.slice(offset, offset + 100), from, to)));
  }
  return rows;
}

export async function requireReadOnlyAttendanceDatabase(client: Client) {
  const result = await client.rpc("is_director_readonly");
  if (result.error || result.data !== true) throw new Error("attendance_readonly_database_access_required");
}

// Explicit ID joins: safe views intentionally do not expose raw-table relationships.
export async function getReadOnlyCoachAttendanceInputs(client: Client, campusIds: string[], month: string) {
  await requireReadOnlyAttendanceDatabase(client);
  type Group = { id: string; name: string; campus_id: string; status: string };
  type Enrollment = { id: string; player_id: string; status: string; campus_id: string };
  type Assignment = { id: string; training_group_id: string; enrollment_id: string; player_id: string };
  type Player = NonNullable<NonNullable<AssignmentRow["enrollments"]>["players"]>;
  type Coach = NonNullable<CoachLinkRow["coaches"]>;
  type Link = Omit<CoachLinkRow, "coaches">;
  const groups = await byIds<Group>(campusIds, (ids, from, to) => client.from("v_director_readonly_training_groups")
    .select("id,name,campus_id,status").in("campus_id", ids).eq("status", "active").order("id").range(from, to).returns<Group[]>());
  const campuses = await byIds<{ id: string; name: string }>(campusIds, (ids, from, to) => client.from("v_director_readonly_campuses")
    .select("id,name").in("id", ids).order("id").range(from, to).returns<Array<{ id: string; name: string }>>());
  const rawAssignments = await byIds<Assignment>(groups.map(g => g.id), (ids, from, to) => client.from("v_director_readonly_training_group_assignments")
    .select("id,training_group_id,enrollment_id,player_id").in("training_group_id", ids).is("end_date", null)
    .order("id").range(from, to).returns<Assignment[]>());
  const enrollments = await byIds<Enrollment>(rawAssignments.map(a => a.enrollment_id), (ids, from, to) => client.from("v_director_readonly_enrollments")
    .select("id,player_id,status,campus_id").in("id", ids).eq("status", "active").order("id").range(from, to).returns<Enrollment[]>());
  const players = await byIds<Player>(enrollments.map(e => e.player_id), (ids, from, to) => client.from("v_director_readonly_players")
    .select("id,first_name,last_name,birth_date,status").in("id", ids).eq("status", "active").order("id").range(from, to).returns<Player[]>());
  const groupMap = new Map(groups.map(g => [g.id, g]));
  const enrollmentMap = new Map(enrollments.filter(e => campusIds.includes(e.campus_id)).map(e => [e.id, e]));
  const playerMap = new Map(players.map(p => [p.id, p]));
  const campusMap = new Map(campuses.map(c => [c.id, c]));
  const assignments: AssignmentRow[] = rawAssignments.flatMap(a => {
    const group = groupMap.get(a.training_group_id);
    const enrollment = enrollmentMap.get(a.enrollment_id);
    const player = enrollment && playerMap.get(enrollment.player_id);
    if (!group || !enrollment || !player || enrollment.campus_id !== group.campus_id || a.player_id !== player.id) return [];
    return [{ id: a.id, training_group_id: a.training_group_id, player_id: a.player_id,
      training_groups: { ...group, campuses: campusMap.get(group.campus_id) ?? null },
      enrollments: { id: enrollment.id, status: enrollment.status, players: player } }];
  });
  const groupIds = assignments.map(a => a.training_group_id);
  const links = await byIds<Link>(groupIds, (ids, from, to) => client.from("v_director_readonly_training_group_coaches")
    .select("id,training_group_id,coach_id,is_primary").in("training_group_id", ids).order("id").range(from, to).returns<Link[]>());
  const coaches = await byIds<Coach>(links.map(l => l.coach_id), (ids, from, to) => client.from("v_director_readonly_coaches")
    .select("id,first_name,last_name,is_active").in("id", ids).order("id").range(from, to).returns<Coach[]>());
  const coachMap = new Map(coaches.map(c => [c.id, c]));
  const coachLinks: CoachLinkRow[] = links.map(l => ({ ...l, coaches: coachMap.get(l.coach_id) ?? null }))
    .filter(l => l.coaches?.is_active !== false);
  const bounds = getMonterreyMonthBounds(month);
  const sessions = await byIds<SessionRow>(groupIds, (ids, from, to) => client.from("v_director_readonly_attendance_sessions")
    .select("id,training_group_id").in("training_group_id", ids).eq("status", "completed")
    .gte("session_date", bounds.periodMonth).lt("session_date", bounds.end.slice(0, 10)).order("id").range(from, to).returns<SessionRow[]>());
  const presentRecords = await byIds<AttendanceRecordRow>(sessions.map(s => s.id), (ids, from, to) => client.from("v_director_readonly_attendance_records")
    .select("id,session_id,player_id,status").in("session_id", ids).eq("status", "present")
    .order("id").range(from, to).returns<AttendanceRecordRow[]>());
  return { assignments, coachLinks, sessions, presentRecords };
}
