import { canAccessAttendanceCampus, canWriteAttendanceCampus, getAttendanceCampusAccess } from "@/lib/auth/campuses";
import { getPermissionContext } from "@/lib/auth/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMonterreyDateString, getMonterreyMonthBounds, getMonterreyMonthString, getMonterreyWeekBounds } from "@/lib/time";

export const ATTENDANCE_STATUS_LABELS: Record<string, string> = {
  present: "Presente",
  absent: "Ausente",
  injury: "Lesion",
  justified: "Justificada",
};

export const ATTENDANCE_SESSION_TYPE_LABELS: Record<string, string> = {
  training: "Entrenamiento",
  match: "Partido",
  special: "Especial",
};

export type AttendanceCampusOption = {
  id: string;
  name: string;
  code: string;
};

export type AttendanceSessionListItem = {
  id: string;
  campusId: string;
  campusName: string;
  teamId: string;
  teamName: string;
  coachName: string | null;
  sessionType: string;
  status: string;
  sessionDate: string;
  startTime: string;
  endTime: string;
  rosterCount: number;
  recordedCount: number;
};

export type AttendanceScheduleTemplate = {
  id: string;
  campusId: string;
  campusName: string;
  teamId: string;
  teamName: string;
  coachName: string | null;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  effectiveStart: string;
  effectiveEnd: string | null;
  isActive: boolean;
};

export type AttendanceTeamOption = {
  id: string;
  campusId: string;
  campusName: string;
  name: string;
  type: string;
};

export type AttendanceSessionDetail = AttendanceSessionListItem & {
  notes: string | null;
  opponentName: string | null;
  cancelledReasonCode: string | null;
  cancelledReason: string | null;
  canWrite: boolean;
  canCorrect: boolean;
  roster: AttendanceRosterPlayer[];
};

export type AttendanceRosterPlayer = {
  assignmentId: string;
  enrollmentId: string;
  playerId: string;
  playerName: string;
  birthYear: number | null;
  currentStatus: "present" | "absent" | "injury" | "justified";
  source: "default" | "incident" | "manual" | "correction";
  incidentId: string | null;
  incidentNote: string | null;
  note: string | null;
  recordId: string | null;
};

export type AttendancePlayerSummary = {
  lastFive: Array<{
    sessionId: string;
    sessionDate: string;
    sessionType: string;
    status: string;
  }>;
  currentMonth: {
    label: string;
    covered: number;
    total: number;
    rate: number | null;
  };
  recentMonths: Array<{ label: string; rate: number | null }>;
};

export type AttendanceInactivePlayerRow = {
  playerId: string;
  playerName: string;
  campusName: string;
  birthYear: number | null;
  teamName: string;
  total: number;
  absent: number;
  rate: number | null;
};

export type AttendanceTeamReportRow = {
  teamId: string;
  teamName: string;
  campusName: string;
  coachName: string | null;
  completedSessions: number;
  totalRecords: number;
  absent: number;
  rate: number | null;
};

type SessionRow = {
  id: string;
  campus_id: string;
  team_id: string;
  session_type: string;
  status: string;
  session_date: string;
  start_time: string;
  end_time: string;
  opponent_name: string | null;
  notes: string | null;
  cancelled_reason_code: string | null;
  cancelled_reason: string | null;
  campuses: { name: string | null; code?: string | null } | null;
  teams: {
    name: string | null;
    coaches: { first_name: string | null; last_name: string | null } | null;
  } | null;
};

function coachName(coach: { first_name: string | null; last_name: string | null } | null | undefined) {
  if (!coach?.first_name && !coach?.last_name) return null;
  return `${coach.first_name ?? ""} ${coach.last_name ?? ""}`.replace(/\s+/g, " ").trim();
}

function normalizeTime(value: string) {
  return value.slice(0, 5);
}

function birthYear(value: string | null | undefined) {
  return value ? Number(value.slice(0, 4)) : null;
}

function monthLabel(month: string) {
  const [, m] = month.split("-");
  const labels = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  return labels[Number(m) - 1] ?? month;
}

function rateFromCounts(covered: number, total: number) {
  if (total <= 0) return null;
  return Math.round((covered / total) * 100);
}

async function getAttendanceScope() {
  const access = await getAttendanceCampusAccess();
  if (!access || access.campusIds.length === 0) return null;
  return access;
}

export async function listAttendanceCampuses(): Promise<AttendanceCampusOption[]> {
  const access = await getAttendanceScope();
  return access?.campuses ?? [];
}

export async function listAttendanceSessions(filters: { date?: string; campusId?: string }) {
  const access = await getAttendanceScope();
  const selectedDate = filters.date ?? getMonterreyDateString();
  if (!access) return { selectedDate, selectedCampusId: null, campuses: [], sessions: [] };

  const selectedCampusIds = filters.campusId && canAccessAttendanceCampus(access, filters.campusId)
    ? [filters.campusId]
    : access.campusIds;
  if (selectedCampusIds.length === 0) return { selectedDate, selectedCampusId: filters.campusId ?? null, campuses: access.campuses, sessions: [] };

  const admin = createAdminClient();
  const [{ data: sessions }, { data: rosterCounts }, { data: recordCounts }] = await Promise.all([
    admin
      .from("attendance_sessions")
      .select("id, campus_id, team_id, session_type, status, session_date, start_time, end_time, opponent_name, notes, cancelled_reason_code, cancelled_reason, campuses(name, code), teams(name, coaches(first_name, last_name))")
      .in("campus_id", selectedCampusIds)
      .eq("session_date", selectedDate)
      .order("campus_id", { ascending: true })
      .order("start_time", { ascending: true })
      .returns<SessionRow[]>(),
    admin
      .from("team_assignments")
      .select("team_id")
      .is("end_date", null)
      .eq("is_primary", true)
      .returns<Array<{ team_id: string }>>(),
    admin
      .from("attendance_records")
      .select("session_id")
      .returns<Array<{ session_id: string }>>(),
  ]);

  const rosterCountMap = new Map<string, number>();
  for (const row of rosterCounts ?? []) rosterCountMap.set(row.team_id, (rosterCountMap.get(row.team_id) ?? 0) + 1);
  const recordCountMap = new Map<string, number>();
  for (const row of recordCounts ?? []) recordCountMap.set(row.session_id, (recordCountMap.get(row.session_id) ?? 0) + 1);

  const items: AttendanceSessionListItem[] = (sessions ?? []).map((row) => ({
    id: row.id,
    campusId: row.campus_id,
    campusName: row.campuses?.name ?? "Campus",
    teamId: row.team_id,
    teamName: row.teams?.name ?? "Equipo",
    coachName: coachName(row.teams?.coaches),
    sessionType: row.session_type,
    status: row.status,
    sessionDate: row.session_date,
    startTime: normalizeTime(row.start_time),
    endTime: normalizeTime(row.end_time),
    rosterCount: rosterCountMap.get(row.team_id) ?? 0,
    recordedCount: recordCountMap.get(row.id) ?? 0,
  }));

  return {
    selectedDate,
    selectedCampusId: filters.campusId ?? null,
    campuses: access.campuses,
    sessions: items,
  };
}

export async function listAttendanceScheduleTemplates() {
  const access = await getAttendanceScope();
  if (!access) return { campuses: [], templates: [], classTeams: [], allTeams: [], canManageSchedules: false, canCreateManualSessions: false };

  const admin = createAdminClient();
  const [{ data: templates }, { data: teams }] = await Promise.all([
    admin
      .from("attendance_schedule_templates")
      .select("id, campus_id, team_id, day_of_week, start_time, end_time, effective_start, effective_end, is_active, campuses(name), teams(name, coaches(first_name, last_name))")
      .in("campus_id", access.campusIds)
      .order("day_of_week", { ascending: true })
      .order("start_time", { ascending: true })
      .returns<Array<{
        id: string;
        campus_id: string;
        team_id: string;
        day_of_week: number;
        start_time: string;
        end_time: string;
        effective_start: string;
        effective_end: string | null;
        is_active: boolean;
        campuses: { name: string | null } | null;
        teams: { name: string | null; coaches: { first_name: string | null; last_name: string | null } | null } | null;
      }>>(),
    admin
      .from("teams")
      .select("id, name, type, campus_id, campuses(name)")
      .in("campus_id", access.campusIds)
      .eq("is_active", true)
      .order("name", { ascending: true })
      .returns<Array<{ id: string; name: string; type: string; campus_id: string; campuses: { name: string | null } | null }>>(),
  ]);

  const teamOptions: AttendanceTeamOption[] = (teams ?? []).map((team) => ({
    id: team.id,
    campusId: team.campus_id,
    campusName: team.campuses?.name ?? "Campus",
    name: team.name,
    type: team.type,
  }));

  return {
    campuses: access.campuses,
    templates: (templates ?? []).map((row): AttendanceScheduleTemplate => ({
      id: row.id,
      campusId: row.campus_id,
      campusName: row.campuses?.name ?? "Campus",
      teamId: row.team_id,
      teamName: row.teams?.name ?? "Equipo",
      coachName: coachName(row.teams?.coaches),
      dayOfWeek: row.day_of_week,
      startTime: normalizeTime(row.start_time),
      endTime: normalizeTime(row.end_time),
      effectiveStart: row.effective_start,
      effectiveEnd: row.effective_end,
      isActive: row.is_active,
    })),
    classTeams: teamOptions.filter((team) => team.type === "class"),
    allTeams: teamOptions,
    canManageSchedules: access.isDirector || access.isSportsDirector,
    canCreateManualSessions: access.isDirector || access.isSportsDirector,
  };
}

export async function getAttendanceSessionDetail(sessionId: string): Promise<AttendanceSessionDetail | null> {
  const access = await getAttendanceScope();
  if (!access) return null;
  const context = await getPermissionContext();
  if (!context) return null;
  const admin = createAdminClient();

  const { data: session } = await admin
    .from("attendance_sessions")
    .select("id, campus_id, team_id, session_type, status, session_date, start_time, end_time, opponent_name, notes, cancelled_reason_code, cancelled_reason, campuses(name, code), teams(name, coaches(first_name, last_name))")
    .eq("id", sessionId)
    .maybeSingle<SessionRow | null>();

  if (!session || !canAccessAttendanceCampus(access, session.campus_id)) return null;

  const canWrite = canWriteAttendanceCampus(access, session.campus_id);
  const canCorrect = context.isDirector;

  const { data: rosterRows } = await admin
    .from("team_assignments")
    .select("id, enrollment_id, start_date, end_date, enrollments!inner(id, player_id, status, players!inner(id, first_name, last_name, birth_date))")
    .eq("team_id", session.team_id)
    .eq("is_primary", true)
    .lte("start_date", session.session_date)
    .or(`end_date.is.null,end_date.gte.${session.session_date}`)
    .eq("enrollments.status", "active")
    .order("start_date", { ascending: true })
    .returns<Array<{
      id: string;
      enrollment_id: string;
      enrollments: {
        id: string;
        player_id: string;
        status: string;
        players: { id: string; first_name: string | null; last_name: string | null; birth_date: string | null } | null;
      } | null;
    }>>();

  const rosterEnrollmentIds = (rosterRows ?? []).map((row) => row.enrollment_id);
  const [{ data: records }, incidentsResult] = await Promise.all([
    admin
      .from("attendance_records")
      .select("id, team_assignment_id, enrollment_id, player_id, status, source, incident_id, note")
      .eq("session_id", sessionId)
      .returns<Array<{
        id: string;
        team_assignment_id: string;
        enrollment_id: string;
        player_id: string;
        status: "present" | "absent" | "injury" | "justified";
        source: "default" | "incident" | "manual" | "correction";
        incident_id: string | null;
        note: string | null;
      }>>(),
    rosterEnrollmentIds.length === 0
      ? Promise.resolve({ data: [] as Array<{ id: string; enrollment_id: string; incident_type: string; note: string | null; starts_on: string | null; ends_on: string | null }> })
      : admin
          .from("enrollment_incidents")
          .select("id, enrollment_id, incident_type, note, starts_on, ends_on, cancelled_at")
          .in("enrollment_id", rosterEnrollmentIds)
          .in("incident_type", ["injury", "absence"])
          .is("cancelled_at", null)
          .or(`starts_on.is.null,starts_on.lte.${session.session_date}`)
          .or(`ends_on.is.null,ends_on.gte.${session.session_date}`)
          .returns<Array<{ id: string; enrollment_id: string; incident_type: string; note: string | null; starts_on: string | null; ends_on: string | null }>>(),
  ]);
  const incidents = incidentsResult.data;

  const recordByEnrollment = new Map((records ?? []).map((record) => [record.enrollment_id, record]));
  const incidentsByEnrollment = new Map<string, Array<{ id: string; incident_type: string; note: string | null }>>();
  for (const incident of incidents ?? []) {
    incidentsByEnrollment.set(incident.enrollment_id, [...(incidentsByEnrollment.get(incident.enrollment_id) ?? []), incident]);
  }

  const roster: AttendanceRosterPlayer[] = (rosterRows ?? [])
    .filter((row) => row.enrollments?.players)
    .map((row) => {
      const record = recordByEnrollment.get(row.enrollment_id);
      const enrollmentIncidents = incidentsByEnrollment.get(row.enrollment_id) ?? [];
      const injury = enrollmentIncidents.find((incident) => incident.incident_type === "injury");
      const absence = enrollmentIncidents.find((incident) => incident.incident_type === "absence");
      const incident = injury ?? absence ?? null;
      const incidentStatus = injury ? "injury" : absence ? "justified" : null;
      const player = row.enrollments!.players!;
      return {
        assignmentId: row.id,
        enrollmentId: row.enrollment_id,
        playerId: player.id,
        playerName: `${player.first_name ?? ""} ${player.last_name ?? ""}`.replace(/\s+/g, " ").trim() || "Jugador",
        birthYear: birthYear(player.birth_date),
        currentStatus: record?.status ?? incidentStatus ?? "present",
        source: record?.source ?? (incident ? "incident" : "default"),
        incidentId: record?.incident_id ?? incident?.id ?? null,
        incidentNote: incident?.note ?? null,
        note: record?.note ?? null,
        recordId: record?.id ?? null,
      };
    })
    .sort((a, b) => a.playerName.localeCompare(b.playerName, "es-MX"));

  return {
    id: session.id,
    campusId: session.campus_id,
    campusName: session.campuses?.name ?? "Campus",
    teamId: session.team_id,
    teamName: session.teams?.name ?? "Equipo",
    coachName: coachName(session.teams?.coaches),
    sessionType: session.session_type,
    status: session.status,
    sessionDate: session.session_date,
    startTime: normalizeTime(session.start_time),
    endTime: normalizeTime(session.end_time),
    opponentName: session.opponent_name,
    notes: session.notes,
    cancelledReasonCode: session.cancelled_reason_code,
    cancelledReason: session.cancelled_reason,
    rosterCount: roster.length,
    recordedCount: records?.length ?? 0,
    canWrite,
    canCorrect,
    roster,
  };
}

export async function getPlayerAttendanceSummary(playerId: string): Promise<AttendancePlayerSummary | null> {
  const context = await getPermissionContext();
  if (!context?.hasAttendanceReadAccess && !context?.hasOperationalAccess) return null;
  const admin = createAdminClient();
  const { data: rows } = await admin
    .from("attendance_records")
    .select("status, recorded_at, attendance_sessions!inner(id, session_date, session_type, status)")
    .eq("player_id", playerId)
    .neq("attendance_sessions.status", "cancelled")
    .order("recorded_at", { ascending: false })
    .limit(80)
    .returns<Array<{
      status: string;
      recorded_at: string;
      attendance_sessions: { id: string; session_date: string; session_type: string; status: string } | null;
    }>>();

  const validRows = (rows ?? []).filter((row) => row.attendance_sessions);
  const currentMonth = getMonterreyMonthString();
  const monthBounds = getMonterreyMonthBounds(currentMonth);
  const currentMonthRows = validRows.filter((row) => {
    const date = row.attendance_sessions!.session_date;
    return date >= monthBounds.periodMonth && date < monthBounds.end.slice(0, 10);
  });
  const covered = currentMonthRows.filter((row) => row.status !== "absent").length;

  const recentMonths = Array.from({ length: 3 }, (_, index) => {
    const anchor = new Date(`${currentMonth}-01T12:00:00.000Z`);
    anchor.setUTCMonth(anchor.getUTCMonth() - index - 1);
    const month = `${anchor.getUTCFullYear()}-${String(anchor.getUTCMonth() + 1).padStart(2, "0")}`;
    const monthRows = validRows.filter((row) => row.attendance_sessions!.session_date.startsWith(month));
    return {
      label: monthLabel(month),
      rate: rateFromCounts(monthRows.filter((row) => row.status !== "absent").length, monthRows.length),
    };
  });

  return {
    lastFive: validRows.slice(0, 5).map((row) => ({
      sessionId: row.attendance_sessions!.id,
      sessionDate: row.attendance_sessions!.session_date,
      sessionType: row.attendance_sessions!.session_type,
      status: row.status,
    })),
    currentMonth: {
      label: monthLabel(currentMonth),
      covered,
      total: currentMonthRows.length,
      rate: rateFromCounts(covered, currentMonthRows.length),
    },
    recentMonths,
  };
}

export async function getAttendanceReports(filters: { campusId?: string; periodDays?: number; birthYear?: number; month?: string }) {
  const access = await getAttendanceScope();
  if (!access) return { campuses: [], inactivePlayers: [], teamReports: [], selectedCampusId: null, periodDays: 30, month: getMonterreyMonthString() };
  const periodDays = filters.periodDays && [30, 60, 90].includes(filters.periodDays) ? filters.periodDays : 30;
  const selectedCampusIds = filters.campusId && canAccessAttendanceCampus(access, filters.campusId) ? [filters.campusId] : access.campusIds;
  const month = filters.month ?? getMonterreyMonthString();
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - periodDays);
  const sinceDate = since.toISOString().slice(0, 10);
  const admin = createAdminClient();

  const { data: playerRows } = await admin
    .from("attendance_records")
    .select("status, player_id, enrollment_id, attendance_sessions!inner(campus_id, team_id, session_date, status, teams(name), campuses(name)), players!inner(first_name, last_name, birth_date)")
    .in("attendance_sessions.campus_id", selectedCampusIds)
    .eq("attendance_sessions.status", "completed")
    .gte("attendance_sessions.session_date", sinceDate)
    .returns<Array<{
      status: string;
      player_id: string;
      enrollment_id: string;
      attendance_sessions: { campus_id: string; team_id: string; session_date: string; status: string; teams: { name: string | null } | null; campuses: { name: string | null } | null } | null;
      players: { first_name: string | null; last_name: string | null; birth_date: string | null } | null;
    }>>();

  const playerMap = new Map<string, AttendanceInactivePlayerRow>();
  for (const row of playerRows ?? []) {
    const by = birthYear(row.players?.birth_date);
    if (filters.birthYear && by !== filters.birthYear) continue;
    const existing = playerMap.get(row.player_id) ?? {
      playerId: row.player_id,
      playerName: `${row.players?.first_name ?? ""} ${row.players?.last_name ?? ""}`.replace(/\s+/g, " ").trim() || "Jugador",
      campusName: row.attendance_sessions?.campuses?.name ?? "Campus",
      birthYear: by,
      teamName: row.attendance_sessions?.teams?.name ?? "Equipo",
      total: 0,
      absent: 0,
      rate: null,
    };
    existing.total += 1;
    if (row.status === "absent") existing.absent += 1;
    existing.rate = rateFromCounts(existing.total - existing.absent, existing.total);
    playerMap.set(row.player_id, existing);
  }

  const monthBounds = getMonterreyMonthBounds(month);
  const { data: teamRows } = await admin
    .from("attendance_records")
    .select("status, attendance_sessions!inner(campus_id, team_id, session_date, status, teams(name, coaches(first_name, last_name)), campuses(name))")
    .in("attendance_sessions.campus_id", selectedCampusIds)
    .eq("attendance_sessions.status", "completed")
    .gte("attendance_sessions.session_date", monthBounds.periodMonth)
    .lt("attendance_sessions.session_date", monthBounds.end.slice(0, 10))
    .returns<Array<{
      status: string;
      attendance_sessions: { campus_id: string; team_id: string; session_date: string; status: string; teams: { name: string | null; coaches: { first_name: string | null; last_name: string | null } | null } | null; campuses: { name: string | null } | null } | null;
    }>>();

  const teamMap = new Map<string, AttendanceTeamReportRow & { sessionIds: Set<string> }>();
  for (const row of teamRows ?? []) {
    const session = row.attendance_sessions;
    if (!session) continue;
    const existing = teamMap.get(session.team_id) ?? {
      teamId: session.team_id,
      teamName: session.teams?.name ?? "Equipo",
      campusName: session.campuses?.name ?? "Campus",
      coachName: coachName(session.teams?.coaches),
      completedSessions: 0,
      totalRecords: 0,
      absent: 0,
      rate: null,
      sessionIds: new Set<string>(),
    };
    existing.sessionIds.add(`${session.team_id}:${session.session_date}`);
    existing.completedSessions = existing.sessionIds.size;
    existing.totalRecords += 1;
    if (row.status === "absent") existing.absent += 1;
    existing.rate = rateFromCounts(existing.totalRecords - existing.absent, existing.totalRecords);
    teamMap.set(session.team_id, existing);
  }

  return {
    campuses: access.campuses,
    selectedCampusId: filters.campusId ?? null,
    periodDays,
    month,
    inactivePlayers: Array.from(playerMap.values()).sort((a, b) => (a.rate ?? 101) - (b.rate ?? 101)),
    teamReports: Array.from(teamMap.values()).map(({ sessionIds: _sessionIds, ...row }) => row).sort((a, b) => (a.rate ?? 101) - (b.rate ?? 101)),
  };
}

export async function getWeeklyAttendanceRate(filters: { campusId?: string }) {
  const access = await getAttendanceScope();
  if (!access) return null;
  const selectedCampusIds = filters.campusId && canAccessAttendanceCampus(access, filters.campusId) ? [filters.campusId] : access.campusIds;
  if (selectedCampusIds.length === 0) return null;
  const week = getMonterreyWeekBounds();
  const admin = createAdminClient();
  const { data } = await admin
    .from("attendance_records")
    .select("status, attendance_sessions!inner(campus_id, session_date, status)")
    .in("attendance_sessions.campus_id", selectedCampusIds)
    .eq("attendance_sessions.status", "completed")
    .gte("attendance_sessions.session_date", week.startDate)
    .lt("attendance_sessions.session_date", week.end.slice(0, 10))
    .returns<Array<{ status: string }>>();

  const rows = data ?? [];
  return {
    rate: rateFromCounts(rows.filter((row) => row.status !== "absent").length, rows.length),
    total: rows.length,
  };
}
