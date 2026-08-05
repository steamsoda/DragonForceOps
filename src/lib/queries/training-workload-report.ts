import { canAccessAttendanceCampus, getAttendanceCampusAccess } from "@/lib/auth/campuses";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMonterreyDateString } from "@/lib/time";

type CoachSnapshot = {
  coach_id?: string;
  name?: string;
  is_primary?: boolean;
};

type WorkloadRpcRow = {
  campus_id: string;
  campus_name: string;
  training_group_id: string;
  training_group_name: string;
  birth_year_min: number | null;
  birth_year_max: number | null;
  session_id: string;
  session_date: string;
  start_time: string;
  end_time: string;
  session_status: string;
  coach_snapshot: CoachSnapshot[] | null;
  coach_snapshot_source: string | null;
  official_attended_count: number | string;
  tryout_count: number | string;
  total_served_count: number | string;
};

export type TrainingWorkloadSessionCell = {
  sessionId: string;
  sessionKey: string;
  sessionDate: string;
  startTime: string;
  status: "completed" | "unregistered";
  officialAttended: number;
  tryouts: number;
  totalServed: number;
};

export type TrainingWorkloadGroupRow = {
  rowKey: string;
  trainingGroupId: string;
  trainingGroupName: string;
  birthYearLabel: string;
  scheduleLabel: string;
  completedSessions: number;
  unregisteredSessions: number;
  officialAverage: number | null;
  tryoutAverage: number | null;
  totalAverage: number | null;
  cells: Record<string, TrainingWorkloadSessionCell>;
};

export type TrainingWorkloadCoachSection = {
  coachUnitKey: string;
  coachUnitName: string;
  legacySessions: number;
  sessionColumns: Array<{ key: string; date: string }>;
  groups: TrainingWorkloadGroupRow[];
};

export type TrainingWorkloadReportData = {
  campuses: Array<{ id: string; name: string }>;
  selectedCampusId: string | null;
  selectedCampusName: string | null;
  periodStart: string;
  periodEnd: string;
  coachSections: TrainingWorkloadCoachSection[];
  totals: {
    coachUnits: number;
    groups: number;
    completedSessions: number;
    unregisteredSessions: number;
    officialAttended: number;
    tryouts: number;
    totalServed: number;
    officialAverage: number | null;
    tryoutAverage: number | null;
    totalAverage: number | null;
    legacySessions: number;
  };
};

function numberValue(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function addDays(date: string, days: number) {
  const [year, month, day] = date.split("-").map(Number);
  const value = new Date(Date.UTC(year, month - 1, day, 12));
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function normalizeTime(value: string) {
  return value.slice(0, 5);
}

function average(values: number[]) {
  if (values.length === 0) return null;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;
}

function birthYearLabel(min: number | null, max: number | null) {
  if (min == null && max == null) return "Sin categoria";
  if (min == null) return String(max);
  if (max == null || min === max) return String(min);
  const [first, second] = [min, max].sort((a, b) => b - a);
  return `${first}/${second}`;
}

function normalizedCoachSnapshot(snapshot: CoachSnapshot[] | null) {
  return [...(snapshot ?? [])]
    .filter((coach) => coach.coach_id || coach.name)
    .map((coach) => ({
      id: coach.coach_id?.trim() || coach.name?.trim() || "unknown",
      name: coach.name?.trim() || "Coach sin nombre",
      isPrimary: coach.is_primary === true,
    }))
    .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.name.localeCompare(b.name, "es-MX"));
}

function coachUnit(snapshot: CoachSnapshot[] | null) {
  const coaches = normalizedCoachSnapshot(snapshot);
  if (coaches.length === 0) return { key: "__unassigned__", name: "Sin coach asignado" };
  const key = coaches.map((coach) => coach.id).sort().join(":");
  return { key, name: coaches.map((coach) => coach.name).join(" + ") };
}

function sessionKey(row: WorkloadRpcRow) {
  return row.session_date;
}

export async function getTrainingWorkloadReport(filters: { campusId?: string }): Promise<TrainingWorkloadReportData> {
  const access = await getAttendanceCampusAccess();
  const periodEnd = getMonterreyDateString();
  const periodStart = addDays(periodEnd, -29);
  const emptyTotals = {
    coachUnits: 0,
    groups: 0,
    completedSessions: 0,
    unregisteredSessions: 0,
    officialAttended: 0,
    tryouts: 0,
    totalServed: 0,
    officialAverage: null,
    tryoutAverage: null,
    totalAverage: null,
    legacySessions: 0,
  };

  if (!access || access.campuses.length === 0) {
    return {
      campuses: [],
      selectedCampusId: null,
      selectedCampusName: null,
      periodStart,
      periodEnd,
      coachSections: [],
      totals: emptyTotals,
    };
  }

  const selectedCampusId = filters.campusId && canAccessAttendanceCampus(access, filters.campusId)
    ? filters.campusId
    : access.defaultCampusId ?? access.campuses[0]?.id ?? null;
  const selectedCampus = access.campuses.find((campus) => campus.id === selectedCampusId) ?? null;

  if (!selectedCampusId) {
    return {
      campuses: access.campuses.map((campus) => ({ id: campus.id, name: campus.name })),
      selectedCampusId: null,
      selectedCampusName: null,
      periodStart,
      periodEnd,
      coachSections: [],
      totals: emptyTotals,
    };
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .rpc("get_training_workload_30d", {
      p_campus_id: selectedCampusId,
      p_as_of: new Date().toISOString(),
    });
  if (error) throw error;
  const rows = (data ?? []) as unknown as WorkloadRpcRow[];

  const sectionMap = new Map<string, {
    name: string;
    legacySessions: number;
    sessions: WorkloadRpcRow[];
  }>();
  for (const row of rows) {
    const unit = coachUnit(row.coach_snapshot);
    const section = sectionMap.get(unit.key) ?? { name: unit.name, legacySessions: 0, sessions: [] };
    section.sessions.push(row);
    if (row.coach_snapshot_source === "legacy_backfill_current_assignment") section.legacySessions += 1;
    sectionMap.set(unit.key, section);
  }

  const coachSections = [...sectionMap.entries()]
    .map(([coachUnitKey, section]): TrainingWorkloadCoachSection => {
      const columnMap = new Map<string, { key: string; date: string }>();
      const groupMap = new Map<string, WorkloadRpcRow[]>();
      for (const row of section.sessions) {
        const key = sessionKey(row);
        columnMap.set(key, { key, date: row.session_date });
        const groupKey = `${row.training_group_id}:${normalizeTime(row.start_time)}:${normalizeTime(row.end_time)}`;
        groupMap.set(groupKey, [...(groupMap.get(groupKey) ?? []), row]);
      }

      const groups = [...groupMap.entries()]
        .map(([rowKey, rows]): TrainingWorkloadGroupRow => {
          const completed = rows.filter((row) => row.session_status === "completed");
          const cells: Record<string, TrainingWorkloadSessionCell> = Object.fromEntries(rows.map((row) => {
            const key = sessionKey(row);
            const officialAttended = numberValue(row.official_attended_count);
            const tryouts = numberValue(row.tryout_count);
            return [key, {
              sessionId: row.session_id,
              sessionKey: key,
              sessionDate: row.session_date,
              startTime: normalizeTime(row.start_time),
              status: row.session_status === "completed" ? "completed" as const : "unregistered" as const,
              officialAttended,
              tryouts,
              totalServed: officialAttended + tryouts,
            }];
          }));
          const first = rows[0];
          return {
            rowKey,
            trainingGroupId: first.training_group_id,
            trainingGroupName: first.training_group_name,
            birthYearLabel: birthYearLabel(first.birth_year_min, first.birth_year_max),
            scheduleLabel: `${normalizeTime(first.start_time)}-${normalizeTime(first.end_time)}`,
            completedSessions: completed.length,
            unregisteredSessions: rows.length - completed.length,
            officialAverage: average(completed.map((row) => numberValue(row.official_attended_count))),
            tryoutAverage: average(completed.map((row) => numberValue(row.tryout_count))),
            totalAverage: average(completed.map((row) => numberValue(row.total_served_count))),
            cells,
          };
        })
        .sort((a, b) => a.scheduleLabel.localeCompare(b.scheduleLabel) || a.birthYearLabel.localeCompare(b.birthYearLabel, "es-MX") || a.trainingGroupName.localeCompare(b.trainingGroupName, "es-MX"));

      return {
        coachUnitKey,
        coachUnitName: section.name,
        legacySessions: section.legacySessions,
        sessionColumns: [...columnMap.values()].sort((a, b) => a.date.localeCompare(b.date)),
        groups,
      };
    })
    .sort((a, b) => a.coachUnitName.localeCompare(b.coachUnitName, "es-MX"));

  const allRows = rows.filter((row) => row.session_status === "completed");
  const uniqueGroups = new Set(rows.map((row) => row.training_group_id));
  const officialValues = allRows.map((row) => numberValue(row.official_attended_count));
  const tryoutValues = allRows.map((row) => numberValue(row.tryout_count));
  const totalValues = allRows.map((row) => numberValue(row.total_served_count));

  return {
    campuses: access.campuses.map((campus) => ({ id: campus.id, name: campus.name })),
    selectedCampusId,
    selectedCampusName: selectedCampus?.name ?? null,
    periodStart,
    periodEnd,
    coachSections,
    totals: {
      coachUnits: coachSections.length,
      groups: uniqueGroups.size,
      completedSessions: allRows.length,
      unregisteredSessions: rows.length - allRows.length,
      officialAttended: officialValues.reduce((sum, value) => sum + value, 0),
      tryouts: tryoutValues.reduce((sum, value) => sum + value, 0),
      totalServed: totalValues.reduce((sum, value) => sum + value, 0),
      officialAverage: average(officialValues),
      tryoutAverage: average(tryoutValues),
      totalAverage: average(totalValues),
      legacySessions: rows.filter((row) => row.coach_snapshot_source === "legacy_backfill_current_assignment").length,
    },
  };
}
