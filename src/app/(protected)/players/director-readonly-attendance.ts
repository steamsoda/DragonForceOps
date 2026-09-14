import "server-only";
import type { PermissionContext } from "@/lib/auth/permissions";
import type { AttendancePlayerSummary, PlayerAttendanceRisk, RecentPlayerAttendanceItem } from "@/lib/queries/attendance";
import { getAttendanceRiskTier } from "@/lib/attendance/risk";
import { getMonterreyDateString } from "@/lib/time";
import { readDirectorRows } from "./director-readonly-data";

type RecordRow = { id: string; player_id: string; enrollment_id: string; session_id: string; status: RecentPlayerAttendanceItem["status"] };
type SessionRow = { id: string; campus_id: string; session_date: string; session_type: string; start_time: string | null; status: string };
type Entry = RecentPlayerAttendanceItem & { recordId: string; enrollmentId: string; startTime: string; completed: boolean };
const validStatuses = new Set(["present", "absent", "injury", "justified"]);

export async function readDirectorAttendance(context: PermissionContext, playerIds: string[], today = getMonterreyDateString()) {
  const records = await readDirectorRows<RecordRow>(context, "attendance_records", { key: "player_id", ids: playerIds });
  const sessions = await readDirectorRows<SessionRow>(context, "attendance_sessions", { ids: records.map((row) => row.session_id) });
  const sessionsById = new Map(sessions.map((session) => [session.id, session]));
  const result = new Map<string, Entry[]>();
  for (const record of records) {
    const session = sessionsById.get(record.session_id);
    if (!session || session.status === "cancelled" || session.session_date > today || !validStatuses.has(record.status)) continue;
    const entries = result.get(record.player_id) ?? [];
    entries.push({ recordId: record.id, enrollmentId: record.enrollment_id, sessionId: session.id,
      sessionDate: session.session_date, sessionType: session.session_type, status: record.status,
      startTime: session.start_time ?? "", completed: session.status === "completed" });
    result.set(record.player_id, entries);
  }
  for (const entries of result.values()) entries.sort((a, b) => b.sessionDate.localeCompare(a.sessionDate)
    || b.startTime.localeCompare(a.startTime) || b.recordId.localeCompare(a.recordId));
  return result;
}

export function recentDirectorAttendance(entries: Entry[], limit = 15): RecentPlayerAttendanceItem[] {
  return entries.filter((row) => row.completed).slice(0, limit).map(({ sessionId, sessionDate, sessionType, status }) => ({ sessionId, sessionDate, sessionType, status }));
}

export function directorAttendanceRisk(playerId: string, enrollmentId: string | null, entries: Entry[], today = getMonterreyDateString()): PlayerAttendanceRisk {
  const completed = entries.filter((entry) => entry.completed);
  const firstCovered = completed.findIndex((entry) => entry.status !== "absent");
  const absenceStreak = firstCovered === -1 ? completed.length : firstCovered;
  const lastAttendanceDate = completed.find((entry) => entry.status !== "absent")?.sessionDate ?? null;
  const daysSinceLastAttendance = lastAttendanceDate ? Math.max(0, Math.round((Date.parse(today) - Date.parse(lastAttendanceDate)) / 86400000)) : null;
  return { playerId, enrollmentId, absenceStreak, lastAttendanceDate, daysSinceLastAttendance,
    lastAbsentDate: completed.find((entry) => entry.status === "absent")?.sessionDate ?? null,
    recentStatuses: completed.slice(0, 5).map((entry) => entry.status),
    tier: getAttendanceRiskTier({ absenceStreak, daysSinceLastAttendance }, today) };
}

export async function readDirectorAttendanceSummary(context: PermissionContext, playerId: string, today = getMonterreyDateString()): Promise<AttendancePlayerSummary> {
  const entries = (await readDirectorAttendance(context, [playerId], today)).get(playerId) ?? [];
  const month = today.slice(0, 7);
  const label = (value: string) => new Intl.DateTimeFormat("es-MX", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}-01T12:00:00Z`));
  const counts = (value: string) => {
    const rows = entries.filter((entry) => entry.sessionDate.startsWith(value));
    const covered = rows.filter((entry) => entry.status !== "absent").length;
    return { covered, total: rows.length, rate: rows.length ? Math.round(100 * covered / rows.length) : null };
  };
  return {
    lastFive: entries.slice(0, 5).map(({ sessionId, sessionDate, sessionType, status }) => ({ sessionId, sessionDate, sessionType, status })),
    currentMonth: { label: label(month), ...counts(month) },
    recentMonths: Array.from({ length: 3 }, (_, index) => {
      const anchor = new Date(`${month}-01T12:00:00Z`); anchor.setUTCMonth(anchor.getUTCMonth() - index - 1);
      const previous = anchor.toISOString().slice(0, 7);
      return { label: label(previous), rate: counts(previous).rate };
    }),
  };
}
