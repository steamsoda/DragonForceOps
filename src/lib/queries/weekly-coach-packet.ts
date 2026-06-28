import { canAccessAttendanceCampus, getAttendanceCampusAccess } from "@/lib/auth/campuses";
import { getPlayerAttendanceRiskByPlayerIds } from "@/lib/queries/attendance";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMonterreyDateString } from "@/lib/time";

const MS_PER_DAY = 86_400_000;

type AssignmentRow = {
  enrollment_id: string;
  training_group_id: string;
  start_date: string;
  training_groups: {
    id: string;
    name: string | null;
    campus_id: string;
    birth_year_min: number | null;
    birth_year_max: number | null;
    campuses: { name: string | null } | null;
  } | null;
  enrollments: {
    id: string;
    player_id: string;
    campus_id: string;
    start_date: string | null;
    status: string;
    players: {
      id: string;
      public_player_id: string | null;
      first_name: string | null;
      last_name: string | null;
      birth_date: string | null;
      status: string | null;
    } | null;
  } | null;
};

type CoachRow = {
  training_group_id: string;
  is_primary: boolean;
  coaches: {
    first_name: string | null;
    last_name: string | null;
  } | null;
};

type ChargeRow = {
  enrollment_id: string;
  amount: number;
  payment_allocations: Array<{ amount: number }> | null;
};

type SessionRow = {
  id: string;
  training_group_id: string | null;
};

type RecordRow = {
  session_id: string;
  player_id: string;
  status: string;
};

export type WeeklyCoachPacketWeek = {
  value: string;
  label: string;
  startDate: string;
  endDate: string;
};

export type WeeklyCoachPacketPlayer = {
  enrollmentId: string;
  playerId: string;
  publicPlayerId: string | null;
  playerName: string;
  birthYear: number | null;
  enrollmentStartDate: string | null;
  isNewThisWeek: boolean;
  hasPendingPayment: boolean;
  hasAbsenceRisk: boolean;
  attendedCount: number;
  sessionCount: number;
};

export type WeeklyCoachPacketGroup = {
  trainingGroupId: string;
  trainingGroupName: string;
  campusId: string;
  campusName: string;
  birthYearLabel: string;
  coachLabel: string;
  coachKeys: string[];
  players: WeeklyCoachPacketPlayer[];
};

export type WeeklyCoachPacketCoachSection = {
  coachKey: string;
  coachLabel: string;
  groups: WeeklyCoachPacketGroup[];
};

export type WeeklyCoachPacketData = {
  campuses: Array<{ id: string; name: string }>;
  selectedCampusId: string | null;
  selectedCoachKey: string;
  week: WeeklyCoachPacketWeek;
  coachOptions: Array<{ key: string; label: string }>;
  sections: WeeklyCoachPacketCoachSection[];
  totals: {
    coaches: number;
    groups: number;
    players: number;
    newPlayers: number;
    pendingPayment: number;
    absenceRisk: number;
  };
};

function dateOnlyFromUtc(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function utcDateFromDateOnly(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0));
}

function isoWeekInfo(dateOnly: string) {
  const date = utcDateFromDateOnly(dateOnly);
  const day = date.getUTCDay() || 7;
  const thursday = new Date(date);
  thursday.setUTCDate(date.getUTCDate() + 4 - day);
  const weekYear = thursday.getUTCFullYear();
  const yearStart = new Date(Date.UTC(weekYear, 0, 1, 12, 0, 0, 0));
  const weekNumber = Math.ceil(((thursday.getTime() - yearStart.getTime()) / MS_PER_DAY + 1) / 7);
  return { weekYear, weekNumber };
}

function mondayFromIsoWeek(weekYear: number, weekNumber: number) {
  const jan4 = new Date(Date.UTC(weekYear, 0, 4, 12, 0, 0, 0));
  const jan4Day = jan4.getUTCDay() || 7;
  const monday = new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate() - jan4Day + 1 + (weekNumber - 1) * 7);
  return monday;
}

function formatWeekDate(value: string) {
  const date = utcDateFromDateOnly(value);
  return new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  }).format(date).replace(".", "");
}

function normalizeWeek(value: string | null | undefined): WeeklyCoachPacketWeek {
  const raw = value?.trim() ?? "";
  let monday: Date;

  const weekMatch = /^(\d{4})-W(\d{2})$/.exec(raw);
  if (weekMatch) {
    monday = mondayFromIsoWeek(Number(weekMatch[1]), Number(weekMatch[2]));
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const date = utcDateFromDateOnly(raw);
    const day = date.getUTCDay() || 7;
    monday = new Date(date);
    monday.setUTCDate(date.getUTCDate() - day + 1);
  } else {
    const today = getMonterreyDateString();
    const date = utcDateFromDateOnly(today);
    const day = date.getUTCDay() || 7;
    monday = new Date(date);
    monday.setUTCDate(date.getUTCDate() - day + 1);
  }

  const startDate = dateOnlyFromUtc(monday);
  const end = new Date(monday);
  end.setUTCDate(monday.getUTCDate() + 6);
  const endDate = dateOnlyFromUtc(end);
  const { weekYear, weekNumber } = isoWeekInfo(startDate);
  const valueString = `${weekYear}-W${String(weekNumber).padStart(2, "0")}`;

  return {
    value: valueString,
    label: `Semana ${weekNumber} - ${formatWeekDate(startDate)} al ${formatWeekDate(endDate)}`,
    startDate,
    endDate,
  };
}

function getBirthYear(value: string | null | undefined) {
  if (!value) return null;
  const year = Number(value.slice(0, 4));
  return Number.isFinite(year) ? year : null;
}

function getPlayerName(player: NonNullable<AssignmentRow["enrollments"]>["players"]) {
  return `${player?.first_name ?? ""} ${player?.last_name ?? ""}`.replace(/\s+/g, " ").trim() || "Sin nombre";
}

function coachName(coach: CoachRow["coaches"]) {
  return `${coach?.first_name ?? ""} ${coach?.last_name ?? ""}`.replace(/\s+/g, " ").trim();
}

function groupBirthYearLabel(group: AssignmentRow["training_groups"]) {
  if (!group?.birth_year_min && !group?.birth_year_max) return "Sin categoria";
  if (group.birth_year_min && group.birth_year_max && group.birth_year_min !== group.birth_year_max) {
    return `${group.birth_year_min}/${group.birth_year_max}`;
  }
  return String(group.birth_year_min ?? group.birth_year_max);
}

function selectedCoachKey(value: string | null | undefined) {
  return value?.trim() || "";
}

async function loadCoachMap(trainingGroupIds: string[]) {
  if (trainingGroupIds.length === 0) return new Map<string, { label: string; keys: string[] }>();
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("training_group_coaches")
    .select("training_group_id, is_primary, coaches(first_name, last_name)")
    .in("training_group_id", trainingGroupIds)
    .returns<CoachRow[]>();

  if (error) throw error;

  const byGroup = new Map<string, Array<{ isPrimary: boolean; name: string }>>();
  for (const row of data ?? []) {
    const name = coachName(row.coaches);
    if (!name) continue;
    byGroup.set(row.training_group_id, [...(byGroup.get(row.training_group_id) ?? []), { isPrimary: row.is_primary, name }]);
  }

  const result = new Map<string, { label: string; keys: string[] }>();
  for (const [groupId, coaches] of byGroup) {
    const sorted = coaches.sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.name.localeCompare(b.name, "es-MX"));
    const names = [...new Set(sorted.map((coach) => coach.name))];
    result.set(groupId, { label: names.join(", "), keys: names });
  }

  return result;
}

async function loadPendingPaymentEnrollmentSet(enrollmentIds: string[]) {
  const admin = createAdminClient();
  const result = new Set<string>();
  const chunkSize = 100;
  const pageSize = 500;

  for (let index = 0; index < enrollmentIds.length; index += chunkSize) {
    const chunk = enrollmentIds.slice(index, index + chunkSize);
    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await admin
        .from("charges")
        .select("enrollment_id, amount, payment_allocations(amount), charge_types!inner(code)")
        .in("enrollment_id", chunk)
        .eq("charge_types.code", "monthly_tuition")
        .neq("status", "void")
        .range(offset, offset + pageSize - 1)
        .returns<ChargeRow[]>();

      if (error) throw error;

      for (const row of data ?? []) {
        const allocated = (row.payment_allocations ?? []).reduce((sum, allocation) => sum + Number(allocation.amount ?? 0), 0);
        if (Number(row.amount ?? 0) - allocated > 0.009) result.add(row.enrollment_id);
      }

      if ((data ?? []).length < pageSize) break;
    }
  }

  return result;
}

async function loadWeekAttendanceCounts(groupIds: string[], playerIds: string[], week: WeeklyCoachPacketWeek) {
  const admin = createAdminClient();
  if (groupIds.length === 0 || playerIds.length === 0) {
    return {
      sessionsByGroup: new Map<string, number>(),
      attendedByPlayerGroup: new Map<string, number>(),
    };
  }

  const endExclusive = new Date(utcDateFromDateOnly(week.endDate));
  endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
  const { data: sessions, error: sessionError } = await admin
    .from("attendance_sessions")
    .select("id, training_group_id")
    .in("training_group_id", groupIds)
    .eq("status", "completed")
    .gte("session_date", week.startDate)
    .lt("session_date", dateOnlyFromUtc(endExclusive))
    .returns<SessionRow[]>();

  if (sessionError) throw sessionError;

  const sessionRows = sessions ?? [];
  const sessionIds = sessionRows.map((row) => row.id);
  const groupBySession = new Map(sessionRows.map((row) => [row.id, row.training_group_id ?? ""]));
  const sessionsByGroup = new Map<string, number>();
  for (const row of sessionRows) {
    if (!row.training_group_id) continue;
    sessionsByGroup.set(row.training_group_id, (sessionsByGroup.get(row.training_group_id) ?? 0) + 1);
  }

  const attendedByPlayerGroup = new Map<string, number>();
  const sessionChunkSize = 100;
  const playerSet = new Set(playerIds);
  for (let index = 0; index < sessionIds.length; index += sessionChunkSize) {
    const chunk = sessionIds.slice(index, index + sessionChunkSize);
    const { data: records, error: recordError } = await admin
      .from("attendance_records")
      .select("session_id, player_id, status")
      .in("session_id", chunk)
      .returns<RecordRow[]>();

    if (recordError) throw recordError;

    for (const record of records ?? []) {
      if (!playerSet.has(record.player_id)) continue;
      if (record.status !== "present" && record.status !== "injury" && record.status !== "justified") continue;
      const groupId = groupBySession.get(record.session_id);
      if (!groupId) continue;
      const key = `${record.player_id}:${groupId}`;
      attendedByPlayerGroup.set(key, (attendedByPlayerGroup.get(key) ?? 0) + 1);
    }
  }

  return { sessionsByGroup, attendedByPlayerGroup };
}

export function getWeeklyCoachPacketWeek(value?: string | null) {
  return normalizeWeek(value);
}

export async function getWeeklyCoachPacket(filters: { campusId?: string; week?: string; coach?: string }): Promise<WeeklyCoachPacketData> {
  const access = await getAttendanceCampusAccess();
  const week = normalizeWeek(filters.week);
  const emptyTotals = { coaches: 0, groups: 0, players: 0, newPlayers: 0, pendingPayment: 0, absenceRisk: 0 };

  if (!access || access.campusIds.length === 0) {
    return {
      campuses: [],
      selectedCampusId: null,
      selectedCoachKey: selectedCoachKey(filters.coach),
      week,
      coachOptions: [],
      sections: [],
      totals: emptyTotals,
    };
  }

  const selectedCampusId = filters.campusId && canAccessAttendanceCampus(access, filters.campusId) ? filters.campusId : null;
  const selectedCampusIds = selectedCampusId ? [selectedCampusId] : access.campusIds;
  const coachFilter = selectedCoachKey(filters.coach);
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("training_group_assignments")
    .select("enrollment_id, training_group_id, start_date, training_groups!inner(id, name, campus_id, birth_year_min, birth_year_max, campuses(name)), enrollments!inner(id, player_id, campus_id, start_date, status, players!inner(id, public_player_id, first_name, last_name, birth_date, status))")
    .is("end_date", null)
    .in("training_groups.campus_id", selectedCampusIds)
    .eq("enrollments.status", "active")
    .returns<AssignmentRow[]>();

  if (error) throw error;

  const activeRows = (data ?? []).filter((row) => row.training_groups && row.enrollments?.players?.status === "active");
  const enrollmentIds = activeRows.map((row) => row.enrollment_id);
  const playerIds = [...new Set(activeRows.map((row) => row.enrollments?.player_id).filter((value): value is string => Boolean(value)))];
  const groupIds = [...new Set(activeRows.map((row) => row.training_group_id))];

  const [coachByGroup, pendingEnrollmentIds, riskByPlayer, weekCounts] = await Promise.all([
    loadCoachMap(groupIds),
    loadPendingPaymentEnrollmentSet(enrollmentIds),
    getPlayerAttendanceRiskByPlayerIds(playerIds, { supabase: admin }),
    loadWeekAttendanceCounts(groupIds, playerIds, week),
  ]);

  const coachOptionMap = new Map<string, string>();
  for (const groupId of groupIds) {
    const coachKeys = coachByGroup.get(groupId)?.keys ?? ["Sin coach"];
    for (const key of coachKeys) {
      coachOptionMap.set(key, key);
    }
  }
  const effectiveCoachFilter = coachFilter && coachOptionMap.has(coachFilter) ? coachFilter : "";

  const groupMap = new Map<string, WeeklyCoachPacketGroup>();
  for (const row of activeRows) {
    const enrollment = row.enrollments;
    const player = enrollment?.players;
    const group = row.training_groups;
    if (!enrollment || !player || !group) continue;

    const coach = coachByGroup.get(row.training_group_id) ?? { label: "Sin coach", keys: ["Sin coach"] };
    if (effectiveCoachFilter && !coach.keys.includes(effectiveCoachFilter)) continue;

    const existing = groupMap.get(row.training_group_id) ?? {
      trainingGroupId: row.training_group_id,
      trainingGroupName: group.name ?? "Grupo",
      campusId: group.campus_id,
      campusName: group.campuses?.name ?? "Campus",
      birthYearLabel: groupBirthYearLabel(group),
      coachLabel: coach.label,
      coachKeys: coach.keys,
      players: [],
    };

    const hasPendingPayment = pendingEnrollmentIds.has(row.enrollment_id);
    const hasAbsenceRisk = Boolean(riskByPlayer.get(enrollment.player_id)?.tier);
    existing.players.push({
      enrollmentId: row.enrollment_id,
      playerId: enrollment.player_id,
      publicPlayerId: player.public_player_id,
      playerName: getPlayerName(player),
      birthYear: getBirthYear(player.birth_date),
      enrollmentStartDate: enrollment.start_date,
      isNewThisWeek: Boolean(enrollment.start_date && enrollment.start_date >= week.startDate && enrollment.start_date <= week.endDate),
      hasPendingPayment,
      hasAbsenceRisk,
      attendedCount: weekCounts.attendedByPlayerGroup.get(`${enrollment.player_id}:${row.training_group_id}`) ?? 0,
      sessionCount: weekCounts.sessionsByGroup.get(row.training_group_id) ?? 0,
    });
    groupMap.set(row.training_group_id, existing);
  }

  const groups = [...groupMap.values()].map((group) => ({
    ...group,
    players: group.players.sort((a, b) => a.playerName.localeCompare(b.playerName, "es-MX")),
  }));

  const sectionMap = new Map<string, WeeklyCoachPacketCoachSection>();
  for (const group of groups) {
    const sectionKey = effectiveCoachFilter || group.coachLabel || "Sin coach";
    const sectionLabel = effectiveCoachFilter || group.coachLabel || "Sin coach";
    const section = sectionMap.get(sectionKey) ?? { coachKey: sectionKey, coachLabel: sectionLabel, groups: [] };
    section.groups.push(group);
    sectionMap.set(sectionKey, section);
  }

  const sections = [...sectionMap.values()]
    .map((section) => ({
      ...section,
      groups: section.groups.sort(
        (a, b) =>
          a.campusName.localeCompare(b.campusName, "es-MX") ||
          a.trainingGroupName.localeCompare(b.trainingGroupName, "es-MX"),
      ),
    }))
    .sort((a, b) => a.coachLabel.localeCompare(b.coachLabel, "es-MX"));

  const players = groups.flatMap((group) => group.players);

  return {
    campuses: access.campuses.map((campus) => ({ id: campus.id, name: campus.name })),
    selectedCampusId,
    selectedCoachKey: effectiveCoachFilter,
    week,
    coachOptions: [...coachOptionMap.values()].sort((a, b) => a.localeCompare(b, "es-MX")).map((label) => ({ key: label, label })),
    sections,
    totals: {
      coaches: sections.length,
      groups: groups.length,
      players: players.length,
      newPlayers: players.filter((player) => player.isNewThisWeek).length,
      pendingPayment: players.filter((player) => player.hasPendingPayment).length,
      absenceRisk: players.filter((player) => player.hasAbsenceRisk).length,
    },
  };
}
