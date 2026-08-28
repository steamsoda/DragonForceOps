import { canAccessAttendanceCampus, getAttendanceCampusAccess } from "@/lib/auth/campuses";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMonterreyWeekBounds } from "@/lib/time";

const WEEK_COUNT = 8;

type FrequencyRpcRow = {
  campus_id: string;
  campus_name: string;
  training_group_id: string;
  training_group_name: string;
  birth_year_min: number | null;
  birth_year_max: number | null;
  week_start: string;
  week_end: string;
  coach_ids: string[] | null;
  coach_names: string;
  sessions_offered: number | string;
  player_weeks: number | string;
  bucket_0: number | string;
  bucket_1: number | string;
  bucket_2: number | string;
  bucket_3: number | string;
  bucket_4_plus: number | string;
  attended_session_records: number | string;
  opportunity_records: number | string;
  average_sessions_attended: number | string | null;
  attendance_rate: number | string | null;
};

export type WeeklyFrequencyBucketKey = "zero" | "one" | "two" | "three";

export type WeeklyAttendanceFrequencyRow = {
  campusId: string;
  campusName: string;
  trainingGroupId: string;
  trainingGroupName: string;
  birthYearLabel: string;
  weekStart: string;
  weekEnd: string;
  coachIds: string[];
  coachNames: string;
  sessionsOffered: number;
  playerWeeks: number;
  buckets: Record<WeeklyFrequencyBucketKey, number>;
  attendedSessionRecords: number;
  opportunityRecords: number;
  averageSessionsAttended: number | null;
  attendanceRate: number | null;
};

export type WeeklyAttendanceFrequencySummary = {
  key: string;
  label: string;
  weekStart?: string;
  weekEnd?: string;
  sessionsOffered: number;
  evaluatedWeeks: number;
  playerWeeks: number;
  averagePlayersPerWeek: number | null;
  buckets: Record<WeeklyFrequencyBucketKey, number>;
  averageBuckets: Record<WeeklyFrequencyBucketKey, number | null>;
  bucketRates: Record<WeeklyFrequencyBucketKey, number | null>;
  attendedSessionRecords: number;
  opportunityRecords: number;
  averageSessionsAttended: number | null;
  attendanceRate: number | null;
};

function asNumber(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function addDays(date: string, days: number) {
  const [year, month, day] = date.split("-").map(Number);
  const value = new Date(Date.UTC(year, month - 1, day, 12));
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function birthYearLabel(min: number | null, max: number | null) {
  if (min == null && max == null) return "Sin categoria";
  if (min == null) return String(max);
  if (max == null || min === max) return String(min);
  return `${min}/${max}`;
}

function roundOne(value: number) {
  return Math.round(value * 10) / 10;
}

function summarizeRows(key: string, label: string, rows: WeeklyAttendanceFrequencyRow[], dates?: { weekStart: string; weekEnd: string }): WeeklyAttendanceFrequencySummary {
  const totals = rows.reduce(
    (acc, row) => {
      acc.sessionsOffered += row.sessionsOffered;
      acc.playerWeeks += row.playerWeeks;
      acc.zero += row.buckets.zero;
      acc.one += row.buckets.one;
      acc.two += row.buckets.two;
      acc.three += row.buckets.three;
      acc.attended += row.attendedSessionRecords;
      acc.opportunities += row.opportunityRecords;
      return acc;
    },
    { sessionsOffered: 0, playerWeeks: 0, zero: 0, one: 0, two: 0, three: 0, attended: 0, opportunities: 0 },
  );
  const evaluatedWeeks = new Set(rows.filter((row) => row.playerWeeks > 0).map((row) => row.weekStart)).size;
  const averageFor = (value: number) => evaluatedWeeks > 0 ? roundOne(value / evaluatedWeeks) : null;
  const rateFor = (value: number) => totals.playerWeeks > 0 ? roundOne((value / totals.playerWeeks) * 100) : null;

  return {
    key,
    label,
    ...dates,
    sessionsOffered: totals.sessionsOffered,
    evaluatedWeeks,
    playerWeeks: totals.playerWeeks,
    averagePlayersPerWeek: averageFor(totals.playerWeeks),
    buckets: { zero: totals.zero, one: totals.one, two: totals.two, three: totals.three },
    averageBuckets: { zero: averageFor(totals.zero), one: averageFor(totals.one), two: averageFor(totals.two), three: averageFor(totals.three) },
    bucketRates: { zero: rateFor(totals.zero), one: rateFor(totals.one), two: rateFor(totals.two), three: rateFor(totals.three) },
    attendedSessionRecords: totals.attended,
    opportunityRecords: totals.opportunities,
    averageSessionsAttended: totals.playerWeeks > 0 ? Math.round((totals.attended / totals.playerWeeks) * 100) / 100 : null,
    attendanceRate: totals.opportunities > 0 ? Math.round((totals.attended / totals.opportunities) * 1000) / 10 : null,
  };
}

function compareGroupRows(a: WeeklyAttendanceFrequencySummary, b: WeeklyAttendanceFrequencySummary) {
  return a.label.localeCompare(b.label, "es-MX", { numeric: true });
}

export async function getWeeklyAttendanceFrequencyReport(filters: { campusId?: string; coachId?: string; trainingGroupId?: string } = {}) {
  const access = await getAttendanceCampusAccess();
  const campuses = access?.campuses ?? [];
  const requestedCampusId = filters.campusId?.trim() || "";
  const selectedCampusId = requestedCampusId && canAccessAttendanceCampus(access, requestedCampusId) ? requestedCampusId : "";
  const campusIds = selectedCampusId ? [selectedCampusId] : campuses.map((campus) => campus.id);
  // Campus access is resolved above before bypassing per-row attendance RLS.
  const supabase = createAdminClient();

  const results = await Promise.all(
    campusIds.map((campusId) =>
      supabase.rpc("get_weekly_attendance_frequency_v1", {
        p_campus_id: campusId,
        p_week_count: WEEK_COUNT,
      }),
    ),
  );

  const failed = results.find((result) => result.error);
  if (failed?.error) throw new Error(`weekly_attendance_frequency_failed:${failed.error.message}`);

  const allRows = results.flatMap((result) => (result.data ?? []) as FrequencyRpcRow[]).map<WeeklyAttendanceFrequencyRow>((row) => ({
    campusId: row.campus_id,
    campusName: row.campus_name,
    trainingGroupId: row.training_group_id,
    trainingGroupName: row.training_group_name,
    birthYearLabel: birthYearLabel(row.birth_year_min, row.birth_year_max),
    weekStart: row.week_start,
    weekEnd: row.week_end,
    coachIds: row.coach_ids ?? [],
    coachNames: row.coach_names || "Sin profesor",
    sessionsOffered: asNumber(row.sessions_offered),
    playerWeeks: asNumber(row.player_weeks),
    buckets: {
      zero: asNumber(row.bucket_0),
      one: asNumber(row.bucket_1),
      two: asNumber(row.bucket_2),
      three: asNumber(row.bucket_3) + asNumber(row.bucket_4_plus),
    },
    attendedSessionRecords: asNumber(row.attended_session_records),
    opportunityRecords: asNumber(row.opportunity_records),
    averageSessionsAttended: row.average_sessions_attended == null ? null : asNumber(row.average_sessions_attended),
    attendanceRate: row.attendance_rate == null ? null : asNumber(row.attendance_rate),
  }));

  const coachMap = new Map<string, string>();
  for (const row of allRows) {
    row.coachIds.forEach((coachId, index) => coachMap.set(coachId, row.coachNames.split(", ")[index] ?? row.coachNames));
  }
  const coachOptions = [...coachMap.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, "es-MX"));
  const groupOptions = [...new Map(allRows.map((row) => [row.trainingGroupId, { id: row.trainingGroupId, name: `${row.campusName} | ${row.birthYearLabel} | ${row.trainingGroupName}` }])).values()]
    .sort((a, b) => a.name.localeCompare(b.name, "es-MX", { numeric: true }));

  const selectedCoachId = filters.coachId && coachMap.has(filters.coachId) ? filters.coachId : "";
  const selectedTrainingGroupId = filters.trainingGroupId && groupOptions.some((group) => group.id === filters.trainingGroupId) ? filters.trainingGroupId : "";
  const rows = allRows.filter((row) => (!selectedCoachId || row.coachIds.includes(selectedCoachId)) && (!selectedTrainingGroupId || row.trainingGroupId === selectedTrainingGroupId));

  const currentWeekStart = getMonterreyWeekBounds().startDate;
  const weekKeys = Array.from({ length: WEEK_COUNT }, (_, index) => addDays(currentWeekStart, -7 * (WEEK_COUNT - index)));
  const weeklySummaries = weekKeys.map((weekStart) => {
    const weekRows = rows.filter((row) => row.weekStart === weekStart);
    return summarizeRows(weekStart, weekStart, weekRows, { weekStart, weekEnd: addDays(weekStart, 6) });
  });

  const groupKeys = [...new Set(rows.map((row) => row.trainingGroupId))];
  const groupSummaries = groupKeys.map((groupId) => {
    const groupRows = rows.filter((row) => row.trainingGroupId === groupId);
    const first = groupRows[0];
    return summarizeRows(groupId, `${first.campusName} | ${first.birthYearLabel} | ${first.trainingGroupName} | ${first.coachNames}`, groupRows);
  }).sort(compareGroupRows);

  return {
    weekCount: WEEK_COUNT,
    campuses,
    selectedCampusId,
    coachOptions,
    selectedCoachId,
    groupOptions,
    selectedTrainingGroupId,
    rows,
    weeklySummaries,
    groupSummaries,
    totals: summarizeRows("total", "Total", rows),
  };
}
