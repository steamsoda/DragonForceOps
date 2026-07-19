import { canAccessAttendanceCampus, getAttendanceCampusAccess } from "@/lib/auth/campuses";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMonterreyMonthBounds, getMonterreyMonthString } from "@/lib/time";

const PAGE_SIZE = 1000;
const SESSION_CHUNK_SIZE = 100;
const UNASSIGNED_COACH_ID = "__unassigned__";

type AssignmentRow = {
  id: string;
  training_group_id: string;
  player_id: string;
  training_groups: {
    id: string;
    name: string | null;
    campus_id: string;
    status: string;
    campuses: { name: string | null } | null;
  } | null;
  enrollments: {
    id: string;
    status: string;
    players: {
      id: string;
      first_name: string | null;
      last_name: string | null;
      birth_date: string | null;
      status: string | null;
    } | null;
  } | null;
};

type CoachLinkRow = {
  id: string;
  training_group_id: string;
  coach_id: string;
  is_primary: boolean;
  coaches: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    is_active: boolean;
  } | null;
};

type SessionRow = {
  id: string;
  training_group_id: string;
};

type AttendanceRecordRow = {
  id: string;
  session_id: string;
  player_id: string;
  status: string;
};

type CoachAssignment = {
  id: string;
  name: string;
  role: "Principal" | "Auxiliar" | "Sin asignar";
};

export type CoachAttendancePlayer = {
  playerId: string;
  playerName: string;
  attended: boolean;
  evaluated: boolean;
};

export type CoachAttendanceGroupMetric = {
  trainingGroupId: string;
  trainingGroupName: string;
  coachId: string;
  coachName: string;
  coachRole: CoachAssignment["role"];
  completedSessions: number;
  rosterCount: number;
  attendedCount: number;
  notAttendedCount: number;
  participationRate: number | null;
  players: CoachAttendancePlayer[];
};

export type CoachAttendanceCoachSection = {
  coachId: string;
  coachName: string;
  groups: CoachAttendanceGroupMetric[];
};

export type CoachAttendanceBirthYearSection = {
  birthYear: number | null;
  label: string;
  coaches: CoachAttendanceCoachSection[];
};

export type CoachAttendanceCampusSection = {
  campusId: string;
  campusName: string;
  birthYears: CoachAttendanceBirthYearSection[];
};

export type CoachAttendanceSummary = {
  coachId: string;
  coachName: string;
  groups: number;
  groupsWithoutSessions: number;
  rosterCount: number;
  evaluatedCount: number;
  attendedCount: number;
  notAttendedCount: number;
  participationRate: number | null;
};

export type CoachAttendanceReportData = {
  campuses: Array<{ id: string; name: string }>;
  selectedCampusId: string | null;
  selectedMonth: string;
  selectedCoachId: string;
  coachOptions: Array<{ id: string; name: string }>;
  coachSummaries: CoachAttendanceSummary[];
  selectedCoachSummary: CoachAttendanceSummary | null;
  campusSections: CoachAttendanceCampusSection[];
  totals: {
    campuses: number;
    coaches: number;
    groups: number;
    groupsWithoutSessions: number;
    rosterCount: number;
    evaluatedCount: number;
    attendedCount: number;
    notAttendedCount: number;
    participationRate: number | null;
  };
};

function normalizeMonth(value: string | null | undefined) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value ?? "") ? value! : getMonterreyMonthString();
}

function playerName(player: { first_name: string | null; last_name: string | null } | null) {
  return `${player?.first_name ?? ""} ${player?.last_name ?? ""}`.replace(/\s+/g, " ").trim() || "Sin nombre";
}

function coachName(coach: CoachLinkRow["coaches"]) {
  return `${coach?.first_name ?? ""} ${coach?.last_name ?? ""}`.replace(/\s+/g, " ").trim() || "Sin coach";
}

function birthYearFromDate(value: string | null | undefined) {
  const year = Number(value?.slice(0, 4));
  return Number.isFinite(year) && year > 1900 ? year : null;
}

function percent(part: number, total: number) {
  return total > 0 ? Math.round((part / total) * 100) : null;
}

async function loadActiveAssignments(campusIds: string[]) {
  const admin = createAdminClient();
  const rows: AssignmentRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await admin
      .from("training_group_assignments")
      .select("id, training_group_id, player_id, training_groups!inner(id, name, campus_id, status, campuses(name)), enrollments!inner(id, status, players!inner(id, first_name, last_name, birth_date, status))")
      .is("end_date", null)
      .in("training_groups.campus_id", campusIds)
      .eq("training_groups.status", "active")
      .eq("enrollments.status", "active")
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1)
      .returns<AssignmentRow[]>();
    if (error) throw error;
    rows.push(...(data ?? []));
    if ((data ?? []).length < PAGE_SIZE) break;
  }
  return rows.filter((row) => row.training_groups && row.enrollments?.players?.status === "active");
}

async function loadCoachLinks(groupIds: string[]) {
  if (groupIds.length === 0) return [];
  const admin = createAdminClient();
  const rows: CoachLinkRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await admin
      .from("training_group_coaches")
      .select("id, training_group_id, coach_id, is_primary, coaches(id, first_name, last_name, is_active)")
      .in("training_group_id", groupIds)
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1)
      .returns<CoachLinkRow[]>();
    if (error) throw error;
    rows.push(...(data ?? []));
    if ((data ?? []).length < PAGE_SIZE) break;
  }
  return rows.filter((row) => row.coaches?.is_active !== false);
}

async function loadCompletedSessions(groupIds: string[], selectedMonth: string) {
  if (groupIds.length === 0) return [];
  const bounds = getMonterreyMonthBounds(selectedMonth);
  const admin = createAdminClient();
  const rows: SessionRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await admin
      .from("attendance_sessions")
      .select("id, training_group_id")
      .in("training_group_id", groupIds)
      .eq("status", "completed")
      .gte("session_date", bounds.periodMonth)
      .lt("session_date", bounds.end.slice(0, 10))
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1)
      .returns<SessionRow[]>();
    if (error) throw error;
    rows.push(...(data ?? []));
    if ((data ?? []).length < PAGE_SIZE) break;
  }
  return rows;
}

async function loadPresentRecords(sessionIds: string[]) {
  const admin = createAdminClient();
  const rows: AttendanceRecordRow[] = [];
  for (let index = 0; index < sessionIds.length; index += SESSION_CHUNK_SIZE) {
    const chunk = sessionIds.slice(index, index + SESSION_CHUNK_SIZE);
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await admin
        .from("attendance_records")
        .select("id, session_id, player_id, status")
        .in("session_id", chunk)
        .eq("status", "present")
        .order("id", { ascending: true })
        .range(from, from + PAGE_SIZE - 1)
        .returns<AttendanceRecordRow[]>();
      if (error) throw error;
      rows.push(...(data ?? []));
      if ((data ?? []).length < PAGE_SIZE) break;
    }
  }
  return rows;
}

function summarizeCoachMetrics(metrics: CoachAttendanceGroupMetric[]) {
  const summaries = new Map<string, {
    coachName: string;
    groups: Set<string>;
    groupsWithoutSessions: Set<string>;
    roster: Set<string>;
    evaluated: Set<string>;
    attended: Set<string>;
  }>();

  for (const metric of metrics) {
    const summary = summaries.get(metric.coachId) ?? {
      coachName: metric.coachName,
      groups: new Set<string>(),
      groupsWithoutSessions: new Set<string>(),
      roster: new Set<string>(),
      evaluated: new Set<string>(),
      attended: new Set<string>(),
    };
    summary.groups.add(metric.trainingGroupId);
    if (metric.completedSessions === 0) summary.groupsWithoutSessions.add(metric.trainingGroupId);
    for (const player of metric.players) {
      summary.roster.add(player.playerId);
      if (player.evaluated) summary.evaluated.add(player.playerId);
      if (player.attended) summary.attended.add(player.playerId);
    }
    summaries.set(metric.coachId, summary);
  }

  return [...summaries.entries()]
    .map(([coachId, summary]): CoachAttendanceSummary => ({
      coachId,
      coachName: summary.coachName,
      groups: summary.groups.size,
      groupsWithoutSessions: summary.groupsWithoutSessions.size,
      rosterCount: summary.roster.size,
      evaluatedCount: summary.evaluated.size,
      attendedCount: summary.attended.size,
      notAttendedCount: summary.evaluated.size - summary.attended.size,
      participationRate: percent(summary.attended.size, summary.evaluated.size),
    }))
    .sort((a, b) => (b.participationRate ?? -1) - (a.participationRate ?? -1) || a.coachName.localeCompare(b.coachName, "es-MX"));
}

export async function getCoachAttendanceReport(filters: { campusId?: string; month?: string; coachId?: string }): Promise<CoachAttendanceReportData> {
  const access = await getAttendanceCampusAccess();
  const selectedMonth = normalizeMonth(filters.month);
  const emptyTotals = {
    campuses: 0,
    coaches: 0,
    groups: 0,
    groupsWithoutSessions: 0,
    rosterCount: 0,
    evaluatedCount: 0,
    attendedCount: 0,
    notAttendedCount: 0,
    participationRate: null,
  };
  if (!access || access.campusIds.length === 0) {
    return { campuses: [], selectedCampusId: null, selectedMonth, selectedCoachId: "", coachOptions: [], coachSummaries: [], selectedCoachSummary: null, campusSections: [], totals: emptyTotals };
  }

  const selectedCampusId = filters.campusId && canAccessAttendanceCampus(access, filters.campusId) ? filters.campusId : null;
  const campusIds = selectedCampusId ? [selectedCampusId] : access.campusIds;
  const assignments = await loadActiveAssignments(campusIds);
  const groupIds = [...new Set(assignments.map((row) => row.training_group_id))];
  const [coachLinks, sessions] = await Promise.all([
    loadCoachLinks(groupIds),
    loadCompletedSessions(groupIds, selectedMonth),
  ]);
  const presentRecords = await loadPresentRecords(sessions.map((session) => session.id));

  const coachesByGroup = new Map<string, CoachAssignment[]>();
  for (const row of coachLinks) {
    const coach: CoachAssignment = {
      id: row.coach_id,
      name: coachName(row.coaches),
      role: row.is_primary ? "Principal" : "Auxiliar",
    };
    coachesByGroup.set(row.training_group_id, [...(coachesByGroup.get(row.training_group_id) ?? []), coach]);
  }
  for (const groupId of groupIds) {
    const coaches = coachesByGroup.get(groupId) ?? [];
    const roleRank: Record<CoachAssignment["role"], number> = { Principal: 0, Auxiliar: 1, "Sin asignar": 2 };
    coachesByGroup.set(groupId, coaches.length > 0 ? coaches.sort((a, b) => roleRank[a.role] - roleRank[b.role] || a.name.localeCompare(b.name, "es-MX")) : [{ id: UNASSIGNED_COACH_ID, name: "Sin coach", role: "Sin asignar" }]);
  }

  const sessionGroupById = new Map(sessions.map((session) => [session.id, session.training_group_id]));
  const sessionsByGroup = new Map<string, Set<string>>();
  for (const session of sessions) {
    const groupSessions = sessionsByGroup.get(session.training_group_id) ?? new Set<string>();
    groupSessions.add(session.id);
    sessionsByGroup.set(session.training_group_id, groupSessions);
  }
  const presentPlayerGroupKeys = new Set<string>();
  for (const record of presentRecords) {
    const groupId = sessionGroupById.get(record.session_id);
    if (groupId) presentPlayerGroupKeys.add(`${groupId}:${record.player_id}`);
  }

  const validCoachIds = new Set(coachLinks.map((row) => row.coach_id));
  if (groupIds.some((groupId) => (coachesByGroup.get(groupId) ?? []).some((coach) => coach.id === UNASSIGNED_COACH_ID))) validCoachIds.add(UNASSIGNED_COACH_ID);
  const selectedCoachId = filters.coachId && validCoachIds.has(filters.coachId) ? filters.coachId : "";

  const playersByGroupYear = new Map<string, { campusId: string; campusName: string; groupName: string; birthYear: number | null; players: CoachAttendancePlayer[] }>();
  const seenGroupPlayers = new Set<string>();
  for (const row of assignments) {
    const group = row.training_groups;
    const player = row.enrollments?.players;
    if (!group || !player) continue;
    const uniqueKey = `${row.training_group_id}:${row.player_id}`;
    if (seenGroupPlayers.has(uniqueKey)) continue;
    seenGroupPlayers.add(uniqueKey);
    const birthYear = birthYearFromDate(player.birth_date);
    const key = `${row.training_group_id}:${birthYear ?? "none"}`;
    const completedSessions = sessionsByGroup.get(row.training_group_id)?.size ?? 0;
    const entry = playersByGroupYear.get(key) ?? {
      campusId: group.campus_id,
      campusName: group.campuses?.name ?? "Campus",
      groupName: group.name ?? "Grupo",
      birthYear,
      players: [],
    };
    entry.players.push({
      playerId: row.player_id,
      playerName: playerName(player),
      evaluated: completedSessions > 0,
      attended: completedSessions > 0 && presentPlayerGroupKeys.has(`${row.training_group_id}:${row.player_id}`),
    });
    playersByGroupYear.set(key, entry);
  }

  const metrics: Array<CoachAttendanceGroupMetric & { campusId: string; campusName: string; birthYear: number | null }> = [];
  for (const [key, entry] of playersByGroupYear) {
    const groupId = key.split(":")[0];
    const completedSessions = sessionsByGroup.get(groupId)?.size ?? 0;
    for (const coach of coachesByGroup.get(groupId) ?? []) {
      if (selectedCoachId && coach.id !== selectedCoachId) continue;
      const players = [...entry.players].sort((a, b) => a.playerName.localeCompare(b.playerName, "es-MX"));
      const attendedCount = players.filter((player) => player.attended).length;
      metrics.push({
        campusId: entry.campusId,
        campusName: entry.campusName,
        birthYear: entry.birthYear,
        trainingGroupId: groupId,
        trainingGroupName: entry.groupName,
        coachId: coach.id,
        coachName: coach.name,
        coachRole: coach.role,
        completedSessions,
        rosterCount: players.length,
        attendedCount,
        notAttendedCount: completedSessions > 0 ? players.length - attendedCount : 0,
        participationRate: completedSessions > 0 ? percent(attendedCount, players.length) : null,
        players,
      });
    }
  }

  const campusMap = new Map<string, { name: string; years: Map<string, CoachAttendanceGroupMetric[]> }>();
  for (const metric of metrics) {
    const campus = campusMap.get(metric.campusId) ?? { name: metric.campusName, years: new Map<string, CoachAttendanceGroupMetric[]>() };
    const yearKey = metric.birthYear == null ? "none" : String(metric.birthYear);
    campus.years.set(yearKey, [...(campus.years.get(yearKey) ?? []), metric]);
    campusMap.set(metric.campusId, campus);
  }
  const campusSections = [...campusMap.entries()]
    .map(([campusId, campus]): CoachAttendanceCampusSection => ({
      campusId,
      campusName: campus.name,
      birthYears: [...campus.years.entries()]
        .sort(([a], [b]) => a === "none" ? 1 : b === "none" ? -1 : Number(b) - Number(a))
        .map(([yearKey, yearMetrics]) => {
          const coachMap = new Map<string, CoachAttendanceGroupMetric[]>();
          for (const metric of yearMetrics) coachMap.set(metric.coachId, [...(coachMap.get(metric.coachId) ?? []), metric]);
          return {
            birthYear: yearKey === "none" ? null : Number(yearKey),
            label: yearKey === "none" ? "Sin categoria" : `Categoria ${yearKey}`,
            coaches: [...coachMap.entries()]
              .map(([coachId, groups]) => ({ coachId, coachName: groups[0]?.coachName ?? "Sin coach", groups: groups.sort((a, b) => a.trainingGroupName.localeCompare(b.trainingGroupName, "es-MX")) }))
              .sort((a, b) => a.coachName.localeCompare(b.coachName, "es-MX")),
          };
        }),
    }))
    .sort((a, b) => a.campusName.localeCompare(b.campusName, "es-MX"));

  const coachOptions = [...new Map(coachLinks.map((row) => [row.coach_id, coachName(row.coaches)])).entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name, "es-MX"));
  if (validCoachIds.has(UNASSIGNED_COACH_ID)) coachOptions.push({ id: UNASSIGNED_COACH_ID, name: "Sin coach" });

  const coachSummaries = summarizeCoachMetrics(metrics);
  const allPlayers = new Set<string>();
  const evaluatedPlayers = new Set<string>();
  const attendedPlayers = new Set<string>();
  const uniqueGroups = new Set<string>();
  const groupsWithoutSessions = new Set<string>();
  const uniqueCoaches = new Set<string>();
  for (const metric of metrics) {
    uniqueGroups.add(metric.trainingGroupId);
    uniqueCoaches.add(metric.coachId);
    if (metric.completedSessions === 0) groupsWithoutSessions.add(metric.trainingGroupId);
    for (const player of metric.players) {
      allPlayers.add(player.playerId);
      if (player.evaluated) evaluatedPlayers.add(player.playerId);
      if (player.attended) attendedPlayers.add(player.playerId);
    }
  }

  const totals = {
    campuses: campusSections.length,
    coaches: uniqueCoaches.size,
    groups: uniqueGroups.size,
    groupsWithoutSessions: groupsWithoutSessions.size,
    rosterCount: allPlayers.size,
    evaluatedCount: evaluatedPlayers.size,
    attendedCount: attendedPlayers.size,
    notAttendedCount: evaluatedPlayers.size - attendedPlayers.size,
    participationRate: percent(attendedPlayers.size, evaluatedPlayers.size),
  };

  return {
    campuses: access.campuses.map((campus) => ({ id: campus.id, name: campus.name })),
    selectedCampusId,
    selectedMonth,
    selectedCoachId,
    coachOptions,
    coachSummaries,
    selectedCoachSummary: selectedCoachId ? coachSummaries.find((coach) => coach.coachId === selectedCoachId) ?? null : null,
    campusSections,
    totals,
  };
}
