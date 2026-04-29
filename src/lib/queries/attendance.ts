import { canAccessAttendanceCampus, canWriteAttendanceCampus, getAttendanceCampusAccess } from "@/lib/auth/campuses";
import { getPermissionContext } from "@/lib/auth/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMonterreyDateString, getMonterreyMonthBounds, getMonterreyMonthString, getMonterreyWeekBounds } from "@/lib/time";
import {
  TRAINING_GROUP_GENDER_LABELS,
  TRAINING_GROUP_PROGRAM_LABELS,
  formatTrainingGroupBirthYearRange,
} from "@/lib/training-groups/shared";

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
  teamId: string | null;
  trainingGroupId: string | null;
  teamName: string;
  coachName: string | null;
  sessionType: string;
  status: string;
  sessionDate: string;
  startTime: string;
  endTime: string;
  rosterCount: number;
  recordedCount: number;
  sourceType: "team" | "training_group";
};

export type AttendanceScheduleTemplate = {
  id: string;
  campusId: string;
  campusName: string;
  teamId: string | null;
  trainingGroupId: string | null;
  teamName: string;
  coachName: string | null;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  effectiveStart: string;
  effectiveEnd: string | null;
  isActive: boolean;
  sourceType: "team" | "training_group";
};

export type AttendanceTeamOption = {
  id: string;
  campusId: string;
  campusName: string;
  name: string;
  type: string;
};

export type AttendanceTrainingGroupOption = {
  id: string;
  campusId: string;
  campusName: string;
  name: string;
  coachName: string | null;
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
  assignmentSource: "team" | "training_group";
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

export type AttendanceGroupMonthlyCard = {
  groupId: string;
  campusId: string;
  campusName: string;
  groupName: string;
  programLabel: string;
  genderLabel: string;
  birthYearLabel: string;
  subgroupLabel: string | null;
  coachName: string | null;
  startTime: string | null;
  endTime: string | null;
  activePlayers: number;
  completedSessions: number;
  cancelledSessions: number;
  totalRecords: number;
  absent: number;
  injury: number;
  justified: number;
  rate: number | null;
};

export type AttendanceGroupMonthlyPlayerRow = {
  playerId: string;
  enrollmentId: string;
  publicPlayerId: string | null;
  playerName: string;
  birthYear: number | null;
  attended: number;
  absent: number;
  injury: number;
  justified: number;
  total: number;
  rate: number | null;
  lastStatus: string | null;
  lastSessionDate: string | null;
  statusesBySession: Record<string, string | null>;
};

export type AttendanceGroupsMonthlyData = {
  campuses: AttendanceCampusOption[];
  selectedCampusId: string | null;
  selectedMonth: string;
  selectedGroupId: string | null;
  groups: AttendanceGroupMonthlyCard[];
  selectedGroup: AttendanceGroupMonthlyCard | null;
  selectedGroupSessions: Array<{ sessionId: string; sessionDate: string }>;
  players: AttendanceGroupMonthlyPlayerRow[];
};

export type AttendanceCalendarSession = {
  id: string;
  campusId: string;
  campusName: string;
  sourceName: string;
  coachName: string | null;
  sourceType: "team" | "training_group";
  sessionType: string;
  status: string;
  startTime: string;
  endTime: string;
};

export type AttendanceCalendarDay = {
  date: string;
  dayOfMonth: number;
  weekdayLabel: string;
  isToday: boolean;
  total: number;
  scheduled: number;
  completed: number;
  cancelled: number;
  sessions: AttendanceCalendarSession[];
};

export type AttendanceCalendarData = {
  campuses: AttendanceCampusOption[];
  selectedCampusId: string | null;
  selectedMonth: string;
  days: AttendanceCalendarDay[];
  totals: {
    total: number;
    scheduled: number;
    completed: number;
    cancelled: number;
  };
};

type SessionRow = {
  id: string;
  campus_id: string;
  team_id: string | null;
  training_group_id: string | null;
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
  training_groups: { name: string | null } | null;
};

type TemplateRow = {
  id: string;
  campus_id: string;
  team_id: string | null;
  training_group_id: string | null;
  day_of_week: number;
  start_time: string;
  end_time: string;
  effective_start: string;
  effective_end: string | null;
  is_active: boolean;
  campuses: { name: string | null } | null;
  teams: { name: string | null; coaches: { first_name: string | null; last_name: string | null } | null } | null;
  training_groups: { name: string | null } | null;
};

type AttendanceGroupRow = {
  id: string;
  campus_id: string;
  name: string;
  program: string;
  gender: string;
  birth_year_min: number | null;
  birth_year_max: number | null;
  level_label: string | null;
  group_code: string | null;
  start_time: string | null;
  end_time: string | null;
  campuses: { name: string | null; code?: string | null } | null;
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

function isMonthOnly(value: string | null | undefined) {
  return Boolean(value && /^\d{4}-\d{2}$/.test(value));
}

function listDatesBetween(startDate: string, endDateExclusive: string) {
  const [startYear, startMonth, startDay] = startDate.split("-").map(Number);
  const [endYear, endMonth, endDay] = endDateExclusive.split("-").map(Number);
  const cursor = new Date(Date.UTC(startYear, startMonth - 1, startDay, 12));
  const end = new Date(Date.UTC(endYear, endMonth - 1, endDay, 12));
  const dates: string[] = [];
  while (cursor < end) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

function weekdayLabel(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("es-MX", { weekday: "short" })
    .format(new Date(Date.UTC(year, month - 1, day, 12)))
    .replace(".", "");
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

async function getTrainingGroupCoachMap(trainingGroupIds: string[]) {
  if (trainingGroupIds.length === 0) return new Map<string, string | null>();
  const admin = createAdminClient();
  const { data } = await admin
    .from("training_group_coaches")
    .select("training_group_id, is_primary, coaches(first_name, last_name)")
    .in("training_group_id", trainingGroupIds)
    .returns<Array<{
      training_group_id: string;
      is_primary: boolean;
      coaches: { first_name: string | null; last_name: string | null } | null;
    }>>();

  const byGroup = new Map<string, Array<{ isPrimary: boolean; name: string | null }>>();
  for (const row of data ?? []) {
    const arr = byGroup.get(row.training_group_id) ?? [];
    arr.push({ isPrimary: row.is_primary, name: coachName(row.coaches) });
    byGroup.set(row.training_group_id, arr);
  }

  const result = new Map<string, string | null>();
  for (const [groupId, entries] of byGroup) {
    const sorted = [...entries].sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary));
    result.set(groupId, sorted.map((entry) => entry.name).filter(Boolean).join(", ") || null);
  }
  return result;
}

function getSessionSource(row: { team_id: string | null; training_group_id: string | null; teams?: { name: string | null; coaches?: { first_name: string | null; last_name: string | null } | null } | null; training_groups?: { name: string | null } | null }, trainingGroupCoachMap: Map<string, string | null>) {
  if (row.training_group_id) {
    return {
      sourceType: "training_group" as const,
      name: row.training_groups?.name ?? "Grupo",
      coach: trainingGroupCoachMap.get(row.training_group_id) ?? null,
    };
  }

  return {
    sourceType: "team" as const,
    name: row.teams?.name ?? "Equipo",
    coach: coachName(row.teams?.coaches),
  };
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
  const [{ data: sessions }, { data: teamRosterRows }, { data: groupRosterRows }, { data: recordCounts }] = await Promise.all([
    admin
      .from("attendance_sessions")
      .select("id, campus_id, team_id, training_group_id, session_type, status, session_date, start_time, end_time, opponent_name, notes, cancelled_reason_code, cancelled_reason, campuses(name, code), teams(name, coaches(first_name, last_name)), training_groups(name)")
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
      .from("training_group_assignments")
      .select("training_group_id")
      .is("end_date", null)
      .returns<Array<{ training_group_id: string }>>(),
    admin
      .from("attendance_records")
      .select("session_id")
      .returns<Array<{ session_id: string }>>(),
  ]);

  const trainingGroupIds = [...new Set((sessions ?? []).map((row) => row.training_group_id).filter((value): value is string => Boolean(value)))];
  const trainingGroupCoachMap = await getTrainingGroupCoachMap(trainingGroupIds);

  const teamRosterCountMap = new Map<string, number>();
  for (const row of teamRosterRows ?? []) teamRosterCountMap.set(row.team_id, (teamRosterCountMap.get(row.team_id) ?? 0) + 1);
  const groupRosterCountMap = new Map<string, number>();
  for (const row of groupRosterRows ?? []) groupRosterCountMap.set(row.training_group_id, (groupRosterCountMap.get(row.training_group_id) ?? 0) + 1);
  const recordCountMap = new Map<string, number>();
  for (const row of recordCounts ?? []) recordCountMap.set(row.session_id, (recordCountMap.get(row.session_id) ?? 0) + 1);

  const items: AttendanceSessionListItem[] = (sessions ?? []).map((row) => {
    const source = getSessionSource(row, trainingGroupCoachMap);
    return {
      id: row.id,
      campusId: row.campus_id,
      campusName: row.campuses?.name ?? "Campus",
      teamId: row.team_id,
      trainingGroupId: row.training_group_id,
      teamName: source.name,
      coachName: source.coach,
      sessionType: row.session_type,
      status: row.status,
      sessionDate: row.session_date,
      startTime: normalizeTime(row.start_time),
      endTime: normalizeTime(row.end_time),
      rosterCount: row.training_group_id
        ? (groupRosterCountMap.get(row.training_group_id) ?? 0)
        : (row.team_id ? (teamRosterCountMap.get(row.team_id) ?? 0) : 0),
      recordedCount: recordCountMap.get(row.id) ?? 0,
      sourceType: source.sourceType,
    };
  });

  return {
    selectedDate,
    selectedCampusId: filters.campusId ?? null,
    campuses: access.campuses,
    sessions: items,
  };
}

export async function listAttendanceScheduleTemplates() {
  const access = await getAttendanceScope();
  if (!access) {
    return {
      campuses: [],
      templates: [],
      trainingGroups: [],
      allTeams: [],
      canManageSchedules: false,
      canCreateManualSessions: false,
    };
  }

  const admin = createAdminClient();
  const [{ data: templates }, { data: teams }, { data: trainingGroups }] = await Promise.all([
    admin
      .from("attendance_schedule_templates")
      .select("id, campus_id, team_id, training_group_id, day_of_week, start_time, end_time, effective_start, effective_end, is_active, campuses(name), teams(name, coaches(first_name, last_name)), training_groups(name)")
      .in("campus_id", access.campusIds)
      .order("day_of_week", { ascending: true })
      .order("start_time", { ascending: true })
      .returns<TemplateRow[]>(),
    admin
      .from("teams")
      .select("id, name, type, campus_id, campuses(name)")
      .in("campus_id", access.campusIds)
      .eq("is_active", true)
      .order("name", { ascending: true })
      .returns<Array<{ id: string; name: string; type: string; campus_id: string; campuses: { name: string | null } | null }>>(),
    admin
      .from("training_groups")
      .select("id, name, campus_id, campuses(name)")
      .in("campus_id", access.campusIds)
      .eq("status", "active")
      .order("name", { ascending: true })
      .returns<Array<{ id: string; name: string; campus_id: string; campuses: { name: string | null } | null }>>(),
  ]);

  const relevantTrainingGroupIds = [...new Set([
    ...(templates ?? []).map((row) => row.training_group_id).filter((value): value is string => Boolean(value)),
    ...(trainingGroups ?? []).map((row) => row.id),
  ])];
  const trainingGroupCoachMap = await getTrainingGroupCoachMap(relevantTrainingGroupIds);

  const teamOptions: AttendanceTeamOption[] = (teams ?? []).map((team) => ({
    id: team.id,
    campusId: team.campus_id,
    campusName: team.campuses?.name ?? "Campus",
    name: team.name,
    type: team.type,
  }));

  const trainingGroupOptions: AttendanceTrainingGroupOption[] = (trainingGroups ?? []).map((group) => ({
    id: group.id,
    campusId: group.campus_id,
    campusName: group.campuses?.name ?? "Campus",
    name: group.name,
    coachName: trainingGroupCoachMap.get(group.id) ?? null,
  }));

  return {
    campuses: access.campuses,
    templates: (templates ?? []).map((row): AttendanceScheduleTemplate => {
      const source = getSessionSource(row, trainingGroupCoachMap);
      return {
        id: row.id,
        campusId: row.campus_id,
        campusName: row.campuses?.name ?? "Campus",
        teamId: row.team_id,
        trainingGroupId: row.training_group_id,
        teamName: source.name,
        coachName: source.coach,
        dayOfWeek: row.day_of_week,
        startTime: normalizeTime(row.start_time),
        endTime: normalizeTime(row.end_time),
        effectiveStart: row.effective_start,
        effectiveEnd: row.effective_end,
        isActive: row.is_active,
        sourceType: source.sourceType,
      };
    }),
    trainingGroups: trainingGroupOptions,
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
    .select("id, campus_id, team_id, training_group_id, session_type, status, session_date, start_time, end_time, opponent_name, notes, cancelled_reason_code, cancelled_reason, campuses(name, code), teams(name, coaches(first_name, last_name)), training_groups(name)")
    .eq("id", sessionId)
    .maybeSingle<SessionRow | null>();

  if (!session || !canAccessAttendanceCampus(access, session.campus_id)) return null;

  const canWrite = canWriteAttendanceCampus(access, session.campus_id);
  const canCorrect = context.isDirector;

  const sourceType = session.training_group_id ? "training_group" as const : "team" as const;
  const trainingGroupCoachMap = await getTrainingGroupCoachMap(session.training_group_id ? [session.training_group_id] : []);

  const rosterRows = sourceType === "training_group"
    ? await admin
        .from("training_group_assignments")
        .select("id, enrollment_id, enrollments!inner(id, player_id, status, players!inner(id, first_name, last_name, birth_date))")
        .eq("training_group_id", session.training_group_id!)
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
        }>>()
    : await admin
        .from("team_assignments")
        .select("id, enrollment_id, enrollments!inner(id, player_id, status, players!inner(id, first_name, last_name, birth_date))")
        .eq("team_id", session.team_id!)
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

  const rosterEnrollmentIds = (rosterRows.data ?? []).map((row) => row.enrollment_id);
  const [{ data: records }, incidentsResult] = await Promise.all([
    admin
      .from("attendance_records")
      .select("id, team_assignment_id, training_group_assignment_id, enrollment_id, player_id, status, source, incident_id, note")
      .eq("session_id", sessionId)
      .returns<Array<{
        id: string;
        team_assignment_id: string | null;
        training_group_assignment_id: string | null;
        enrollment_id: string;
        player_id: string;
        status: "present" | "absent" | "injury" | "justified";
        source: "default" | "incident" | "manual" | "correction";
        incident_id: string | null;
        note: string | null;
      }>>(),
    rosterEnrollmentIds.length === 0
      ? Promise.resolve({ data: [] as Array<{ id: string; enrollment_id: string; incident_type: string; note: string | null }> })
      : admin
          .from("enrollment_incidents")
          .select("id, enrollment_id, incident_type, note, starts_on, ends_on, cancelled_at")
          .in("enrollment_id", rosterEnrollmentIds)
          .in("incident_type", ["injury", "absence"])
          .is("cancelled_at", null)
          .or(`starts_on.is.null,starts_on.lte.${session.session_date}`)
          .or(`ends_on.is.null,ends_on.gte.${session.session_date}`)
          .returns<Array<{ id: string; enrollment_id: string; incident_type: string; note: string | null }>>(),
  ]);
  const incidents = incidentsResult.data;

  const recordByEnrollment = new Map((records ?? []).map((record) => [record.enrollment_id, record]));
  const incidentsByEnrollment = new Map<string, Array<{ id: string; incident_type: string; note: string | null }>>();
  for (const incident of incidents ?? []) {
    incidentsByEnrollment.set(incident.enrollment_id, [...(incidentsByEnrollment.get(incident.enrollment_id) ?? []), incident]);
  }

  const roster: AttendanceRosterPlayer[] = (rosterRows.data ?? [])
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
        assignmentSource: sourceType,
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

  const source = getSessionSource(session, trainingGroupCoachMap);

  return {
    id: session.id,
    campusId: session.campus_id,
    campusName: session.campuses?.name ?? "Campus",
    teamId: session.team_id,
    trainingGroupId: session.training_group_id,
    teamName: source.name,
    coachName: source.coach,
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
    sourceType,
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

  const validRows = (rows ?? [])
    .filter((row) => row.attendance_sessions)
    .sort((a, b) => {
      const dateCompare = b.attendance_sessions!.session_date.localeCompare(a.attendance_sessions!.session_date);
      return dateCompare || b.recorded_at.localeCompare(a.recorded_at);
    });
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

export async function getAttendanceGroupsMonthlyData(filters: { campusId?: string; month?: string; groupId?: string }): Promise<AttendanceGroupsMonthlyData> {
  const access = await getAttendanceScope();
  const selectedMonth = filters.month && /^\d{4}-\d{2}$/.test(filters.month) ? filters.month : getMonterreyMonthString();
  if (!access) {
    return {
      campuses: [],
      selectedCampusId: null,
      selectedMonth,
      selectedGroupId: null,
      groups: [],
      selectedGroup: null,
      selectedGroupSessions: [],
      players: [],
    };
  }

  const selectedCampusIds = filters.campusId && canAccessAttendanceCampus(access, filters.campusId)
    ? [filters.campusId]
    : access.campusIds;
  const selectedCampusId = filters.campusId && canAccessAttendanceCampus(access, filters.campusId) ? filters.campusId : null;
  const admin = createAdminClient();
  const monthBounds = getMonterreyMonthBounds(selectedMonth);
  const monthEndDate = monthBounds.end.slice(0, 10);

  const { data: groups } = await admin
    .from("training_groups")
    .select("id, campus_id, name, program, gender, birth_year_min, birth_year_max, level_label, group_code, start_time, end_time, campuses(name, code)")
    .in("campus_id", selectedCampusIds)
    .eq("status", "active")
    .order("campus_id", { ascending: true })
    .order("birth_year_max", { ascending: false, nullsFirst: false })
    .order("name", { ascending: true })
    .returns<AttendanceGroupRow[]>();

  const groupRows = groups ?? [];
  const groupIds = groupRows.map((group) => group.id);
  const selectedGroupId = filters.groupId && groupIds.includes(filters.groupId) ? filters.groupId : null;

  if (groupIds.length === 0) {
    return {
      campuses: access.campuses,
      selectedCampusId,
      selectedMonth,
      selectedGroupId: null,
      groups: [],
      selectedGroup: null,
      selectedGroupSessions: [],
      players: [],
    };
  }

  const [{ data: assignments }, { data: sessions }, { data: coachRows }] = await Promise.all([
    admin
      .from("training_group_assignments")
      .select("id, training_group_id, enrollment_id, player_id, enrollments!inner(id, status, players!inner(id, first_name, last_name, birth_date, public_player_id))")
      .in("training_group_id", groupIds)
      .is("end_date", null)
      .eq("enrollments.status", "active")
      .returns<Array<{
        id: string;
        training_group_id: string;
        enrollment_id: string;
        player_id: string;
        enrollments: {
          id: string;
          status: string;
          players: {
            id: string;
            first_name: string | null;
            last_name: string | null;
            birth_date: string | null;
            public_player_id: string | null;
          } | null;
        } | null;
      }>>(),
    admin
      .from("attendance_sessions")
      .select("id, training_group_id, status, session_date")
      .in("training_group_id", groupIds)
      .gte("session_date", monthBounds.periodMonth)
      .lt("session_date", monthEndDate)
      .returns<Array<{ id: string; training_group_id: string; status: string; session_date: string }>>(),
    admin
      .from("training_group_coaches")
      .select("training_group_id, is_primary, coaches(first_name, last_name)")
      .in("training_group_id", groupIds)
      .returns<Array<{
        training_group_id: string;
        is_primary: boolean;
        coaches: { first_name: string | null; last_name: string | null } | null;
      }>>(),
  ]);

  const sessionRows = sessions ?? [];
  const sessionIds = sessionRows.map((session) => session.id);
  const { data: records } = sessionIds.length > 0
    ? await admin
        .from("attendance_records")
        .select("status, player_id, enrollment_id, session_id")
        .in("session_id", sessionIds)
        .returns<Array<{ status: string; player_id: string; enrollment_id: string; session_id: string }>>()
    : { data: [] as Array<{ status: string; player_id: string; enrollment_id: string; session_id: string }> };

  const coachMap = new Map<string, string | null>();
  const coachEntries = new Map<string, Array<{ isPrimary: boolean; name: string | null }>>();
  for (const row of coachRows ?? []) {
    const entries = coachEntries.get(row.training_group_id) ?? [];
    entries.push({ isPrimary: row.is_primary, name: coachName(row.coaches) });
    coachEntries.set(row.training_group_id, entries);
  }
  for (const [groupId, entries] of coachEntries) {
    coachMap.set(
      groupId,
      entries
        .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary))
        .map((entry) => entry.name)
        .filter(Boolean)
        .join(", ") || null,
    );
  }

  const activePlayersByGroup = new Map<string, number>();
  for (const assignment of assignments ?? []) {
    activePlayersByGroup.set(assignment.training_group_id, (activePlayersByGroup.get(assignment.training_group_id) ?? 0) + 1);
  }

  const sessionById = new Map(sessionRows.map((session) => [session.id, session]));
  const completedSessionsByGroup = new Map<string, Set<string>>();
  const cancelledSessionsByGroup = new Map<string, number>();
  for (const session of sessionRows) {
    if (session.status === "completed") {
      const set = completedSessionsByGroup.get(session.training_group_id) ?? new Set<string>();
      set.add(session.id);
      completedSessionsByGroup.set(session.training_group_id, set);
    }
    if (session.status === "cancelled") {
      cancelledSessionsByGroup.set(session.training_group_id, (cancelledSessionsByGroup.get(session.training_group_id) ?? 0) + 1);
    }
  }

  const groupRecordCounts = new Map<string, { total: number; absent: number; injury: number; justified: number }>();
  for (const record of records ?? []) {
    const session = sessionById.get(record.session_id);
    if (!session || session.status !== "completed") continue;
    const counts = groupRecordCounts.get(session.training_group_id) ?? { total: 0, absent: 0, injury: 0, justified: 0 };
    counts.total += 1;
    if (record.status === "absent") counts.absent += 1;
    if (record.status === "injury") counts.injury += 1;
    if (record.status === "justified") counts.justified += 1;
    groupRecordCounts.set(session.training_group_id, counts);
  }

  const cards = groupRows
    .map((group): AttendanceGroupMonthlyCard => {
      const counts = groupRecordCounts.get(group.id) ?? { total: 0, absent: 0, injury: 0, justified: 0 };
      return {
        groupId: group.id,
        campusId: group.campus_id,
        campusName: group.campuses?.name ?? "Campus",
        groupName: group.name,
        programLabel: TRAINING_GROUP_PROGRAM_LABELS[group.program] ?? group.program,
        genderLabel: TRAINING_GROUP_GENDER_LABELS[group.gender] ?? group.gender,
        birthYearLabel: formatTrainingGroupBirthYearRange(group.birth_year_min, group.birth_year_max),
        subgroupLabel: group.group_code ?? group.level_label,
        coachName: coachMap.get(group.id) ?? null,
        startTime: group.start_time ? normalizeTime(group.start_time) : null,
        endTime: group.end_time ? normalizeTime(group.end_time) : null,
        activePlayers: activePlayersByGroup.get(group.id) ?? 0,
        completedSessions: completedSessionsByGroup.get(group.id)?.size ?? 0,
        cancelledSessions: cancelledSessionsByGroup.get(group.id) ?? 0,
        totalRecords: counts.total,
        absent: counts.absent,
        injury: counts.injury,
        justified: counts.justified,
        rate: rateFromCounts(counts.total - counts.absent, counts.total),
      };
    })
    .sort((a, b) => b.birthYearLabel.localeCompare(a.birthYearLabel, "es-MX") || a.groupName.localeCompare(b.groupName, "es-MX"));

  const selectedGroup = selectedGroupId ? cards.find((group) => group.groupId === selectedGroupId) ?? null : null;
  const selectedGroupSessions = selectedGroupId
    ? sessionRows
        .filter((session) => session.training_group_id === selectedGroupId && session.status === "completed")
        .sort((a, b) => a.session_date.localeCompare(b.session_date))
        .map((session) => ({ sessionId: session.id, sessionDate: session.session_date }))
    : [];
  const recordsByPlayer = new Map<string, Array<{ status: string; sessionId: string; sessionDate: string }>>();
  if (selectedGroupId) {
    for (const record of records ?? []) {
      const session = sessionById.get(record.session_id);
      if (!session || session.status !== "completed" || session.training_group_id !== selectedGroupId) continue;
      const rows = recordsByPlayer.get(record.player_id) ?? [];
      rows.push({ status: record.status, sessionId: session.id, sessionDate: session.session_date });
      recordsByPlayer.set(record.player_id, rows);
    }
  }

  const players = selectedGroupId
    ? (assignments ?? [])
        .filter((assignment) => assignment.training_group_id === selectedGroupId && assignment.enrollments?.players)
        .map((assignment): AttendanceGroupMonthlyPlayerRow => {
          const player = assignment.enrollments!.players!;
          const playerRecords = [...(recordsByPlayer.get(assignment.player_id) ?? [])].sort((a, b) => b.sessionDate.localeCompare(a.sessionDate));
          const absent = playerRecords.filter((record) => record.status === "absent").length;
          const injury = playerRecords.filter((record) => record.status === "injury").length;
          const justified = playerRecords.filter((record) => record.status === "justified").length;
          const total = playerRecords.length;
          const attended = total - absent;
          const statusMap = new Map(playerRecords.map((record) => [record.sessionId, record.status]));
          return {
            playerId: player.id,
            enrollmentId: assignment.enrollment_id,
            publicPlayerId: player.public_player_id,
            playerName: `${player.first_name ?? ""} ${player.last_name ?? ""}`.replace(/\s+/g, " ").trim() || "Jugador",
            birthYear: birthYear(player.birth_date),
            attended,
            absent,
            injury,
            justified,
            total,
            rate: rateFromCounts(attended, total),
            lastStatus: playerRecords[0]?.status ?? null,
            lastSessionDate: playerRecords[0]?.sessionDate ?? null,
            statusesBySession: Object.fromEntries(selectedGroupSessions.map((session) => [session.sessionId, statusMap.get(session.sessionId) ?? null])),
          };
        })
        .sort((a, b) => (b.birthYear ?? 0) - (a.birthYear ?? 0) || a.playerName.localeCompare(b.playerName, "es-MX"))
    : [];

  return {
    campuses: access.campuses,
    selectedCampusId,
    selectedMonth,
    selectedGroupId,
    groups: cards,
    selectedGroup,
    selectedGroupSessions,
    players,
  };
}

export async function getAttendanceCalendarData(filters: { campusId?: string; month?: string }): Promise<AttendanceCalendarData> {
  const access = await getAttendanceScope();
  const selectedMonth = isMonthOnly(filters.month) ? filters.month! : getMonterreyMonthString();
  const monthBounds = getMonterreyMonthBounds(selectedMonth);
  const monthEndDate = monthBounds.end.slice(0, 10);
  const dates = listDatesBetween(monthBounds.periodMonth, monthEndDate);
  const today = getMonterreyDateString();

  const emptyDays = dates.map((date): AttendanceCalendarDay => ({
    date,
    dayOfMonth: Number(date.slice(8, 10)),
    weekdayLabel: weekdayLabel(date),
    isToday: date === today,
    total: 0,
    scheduled: 0,
    completed: 0,
    cancelled: 0,
    sessions: [],
  }));

  if (!access) {
    return {
      campuses: [],
      selectedCampusId: null,
      selectedMonth,
      days: emptyDays,
      totals: { total: 0, scheduled: 0, completed: 0, cancelled: 0 },
    };
  }

  const selectedCampusIds = filters.campusId && canAccessAttendanceCampus(access, filters.campusId)
    ? [filters.campusId]
    : access.campusIds;
  const selectedCampusId = filters.campusId && canAccessAttendanceCampus(access, filters.campusId) ? filters.campusId : null;
  if (selectedCampusIds.length === 0) {
    return {
      campuses: access.campuses,
      selectedCampusId,
      selectedMonth,
      days: emptyDays,
      totals: { total: 0, scheduled: 0, completed: 0, cancelled: 0 },
    };
  }

  const admin = createAdminClient();
  const { data: sessionRows } = await admin
    .from("attendance_sessions")
    .select("id, campus_id, team_id, training_group_id, session_type, status, session_date, start_time, end_time, opponent_name, notes, cancelled_reason_code, cancelled_reason, campuses(name, code), teams(name, coaches(first_name, last_name)), training_groups(name)")
    .in("campus_id", selectedCampusIds)
    .gte("session_date", monthBounds.periodMonth)
    .lt("session_date", monthEndDate)
    .order("session_date", { ascending: true })
    .order("start_time", { ascending: true })
    .returns<SessionRow[]>();

  const trainingGroupIds = [...new Set((sessionRows ?? []).map((row) => row.training_group_id).filter((value): value is string => Boolean(value)))];
  const trainingGroupCoachMap = await getTrainingGroupCoachMap(trainingGroupIds);
  const byDate = new Map(emptyDays.map((day) => [day.date, { ...day, sessions: [] as AttendanceCalendarSession[] }]));
  const totals = { total: 0, scheduled: 0, completed: 0, cancelled: 0 };

  for (const row of sessionRows ?? []) {
    const source = getSessionSource(row, trainingGroupCoachMap);
    const day = byDate.get(row.session_date);
    if (!day) continue;

    const session: AttendanceCalendarSession = {
      id: row.id,
      campusId: row.campus_id,
      campusName: row.campuses?.name ?? "Campus",
      sourceName: source.name,
      coachName: source.coach,
      sourceType: source.sourceType,
      sessionType: row.session_type,
      status: row.status,
      startTime: normalizeTime(row.start_time),
      endTime: normalizeTime(row.end_time),
    };

    day.sessions.push(session);
    day.total += 1;
    totals.total += 1;
    if (row.status === "scheduled") {
      day.scheduled += 1;
      totals.scheduled += 1;
    }
    if (row.status === "completed") {
      day.completed += 1;
      totals.completed += 1;
    }
    if (row.status === "cancelled") {
      day.cancelled += 1;
      totals.cancelled += 1;
    }
  }

  return {
    campuses: access.campuses,
    selectedCampusId,
    selectedMonth,
    days: dates.map((date) => byDate.get(date)!),
    totals,
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
    .select("status, player_id, enrollment_id, attendance_sessions!inner(id, campus_id, team_id, training_group_id, session_date, status, teams(name), training_groups(name), campuses(name)), players!inner(first_name, last_name, birth_date)")
    .in("attendance_sessions.campus_id", selectedCampusIds)
    .eq("attendance_sessions.status", "completed")
    .gte("attendance_sessions.session_date", sinceDate)
    .returns<Array<{
      status: string;
      player_id: string;
      enrollment_id: string;
      attendance_sessions: {
        id: string;
        campus_id: string;
        team_id: string | null;
        training_group_id: string | null;
        session_date: string;
        status: string;
        teams: { name: string | null } | null;
        training_groups: { name: string | null } | null;
        campuses: { name: string | null } | null;
      } | null;
      players: { first_name: string | null; last_name: string | null; birth_date: string | null } | null;
    }>>();

  const playerMap = new Map<string, AttendanceInactivePlayerRow>();
  for (const row of playerRows ?? []) {
    const by = birthYear(row.players?.birth_date);
    if (filters.birthYear && by !== filters.birthYear) continue;
    const sourceName = row.attendance_sessions?.training_groups?.name ?? row.attendance_sessions?.teams?.name ?? "Equipo";
    const existing = playerMap.get(row.player_id) ?? {
      playerId: row.player_id,
      playerName: `${row.players?.first_name ?? ""} ${row.players?.last_name ?? ""}`.replace(/\s+/g, " ").trim() || "Jugador",
      campusName: row.attendance_sessions?.campuses?.name ?? "Campus",
      birthYear: by,
      teamName: sourceName,
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
  const { data: sourceRows } = await admin
    .from("attendance_records")
    .select("status, attendance_sessions!inner(id, campus_id, team_id, training_group_id, session_date, status, teams(name, coaches(first_name, last_name)), training_groups(name), campuses(name))")
    .in("attendance_sessions.campus_id", selectedCampusIds)
    .eq("attendance_sessions.status", "completed")
    .gte("attendance_sessions.session_date", monthBounds.periodMonth)
    .lt("attendance_sessions.session_date", monthBounds.end.slice(0, 10))
    .returns<Array<{
      status: string;
      attendance_sessions: {
        id: string;
        campus_id: string;
        team_id: string | null;
        training_group_id: string | null;
        session_date: string;
        status: string;
        teams: { name: string | null; coaches: { first_name: string | null; last_name: string | null } | null } | null;
        training_groups: { name: string | null } | null;
        campuses: { name: string | null } | null;
      } | null;
    }>>();

  const reportTrainingGroupIds = [...new Set((sourceRows ?? []).map((row) => row.attendance_sessions?.training_group_id).filter((value): value is string => Boolean(value)))];
  const reportGroupCoachMap = await getTrainingGroupCoachMap(reportTrainingGroupIds);

  const sourceMap = new Map<string, AttendanceTeamReportRow & { sessionIds: Set<string> }>();
  for (const row of sourceRows ?? []) {
    const session = row.attendance_sessions;
    if (!session) continue;
    const sourceKey = session.training_group_id ? `training_group:${session.training_group_id}` : `team:${session.team_id}`;
    const sourceName = session.training_groups?.name ?? session.teams?.name ?? "Equipo";
    const coach = session.training_group_id
      ? reportGroupCoachMap.get(session.training_group_id) ?? null
      : coachName(session.teams?.coaches);
    const existing = sourceMap.get(sourceKey) ?? {
      teamId: sourceKey,
      teamName: sourceName,
      campusName: session.campuses?.name ?? "Campus",
      coachName: coach,
      completedSessions: 0,
      totalRecords: 0,
      absent: 0,
      rate: null,
      sessionIds: new Set<string>(),
    };
    existing.sessionIds.add(session.id);
    existing.completedSessions = existing.sessionIds.size;
    existing.totalRecords += 1;
    if (row.status === "absent") existing.absent += 1;
    existing.rate = rateFromCounts(existing.totalRecords - existing.absent, existing.totalRecords);
    sourceMap.set(sourceKey, existing);
  }

  return {
    campuses: access.campuses,
    selectedCampusId: filters.campusId ?? null,
    periodDays,
    month,
    inactivePlayers: Array.from(playerMap.values()).sort((a, b) => (a.rate ?? 101) - (b.rate ?? 101)),
    teamReports: Array.from(sourceMap.values())
      .map(({ sessionIds: _sessionIds, ...row }) => row)
      .sort((a, b) => (a.rate ?? 101) - (b.rate ?? 101)),
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
