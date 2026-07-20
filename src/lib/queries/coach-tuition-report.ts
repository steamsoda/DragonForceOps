import { canAccessAttendanceCampus, getAttendanceCampusAccess } from "@/lib/auth/campuses";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMonterreyMonthString } from "@/lib/time";

const PAGE_SIZE = 500;
const ID_CHUNK_SIZE = 100;
const UNASSIGNED_GROUP_ID = "__unassigned_group__";
const UNASSIGNED_COACH_ID = "__unassigned_coach__";

export type TuitionReportStatus = "paid" | "pending" | "scholarship" | "omitted" | "missing" | "review";

type EnrollmentRow = {
  id: string;
  player_id: string;
  campus_id: string;
  start_date: string;
  scholarship_status: "none" | "half" | "full" | "custom";
  players: { id: string; first_name: string | null; last_name: string | null; birth_date: string | null; status: string | null } | null;
  campuses: { id: string; name: string | null } | null;
};

type AssignmentRow = {
  id: string;
  enrollment_id: string;
  training_group_id: string;
  training_groups: { id: string; name: string | null; campus_id: string; status: string; campuses: { name: string | null } | null } | null;
};

type CoachLinkRow = {
  id: string;
  training_group_id: string;
  coach_id: string;
  is_primary: boolean;
  coaches: { id: string; first_name: string | null; last_name: string | null; is_active: boolean } | null;
};

type ChargeRow = {
  id: string;
  enrollment_id: string;
  amount: number;
  period_month: string | null;
  payment_allocations: Array<{ amount: number }> | null;
};

type IncidentRow = { id: string; enrollment_id: string; omit_period_month: string | null };

type CoachAssignment = { id: string; name: string; role: "Principal" | "Auxiliar" | "Sin asignar" };

export type CoachTuitionPlayer = {
  enrollmentId: string;
  playerId: string;
  playerName: string;
  status: TuitionReportStatus;
  previousPendingMonths: number;
};

export type CoachTuitionGroupMetric = {
  trainingGroupId: string;
  trainingGroupName: string;
  coachId: string;
  coachName: string;
  coachRole: CoachAssignment["role"];
  rosterCount: number;
  expectedCount: number;
  paidCount: number;
  pendingCount: number;
  scholarshipCount: number;
  omittedCount: number;
  missingCount: number;
  reviewCount: number;
  collectionRate: number | null;
  players: CoachTuitionPlayer[];
};

export type CoachTuitionSummary = Omit<CoachTuitionGroupMetric, "trainingGroupId" | "trainingGroupName" | "coachRole" | "players"> & { groups: number };

export type CoachTuitionCampusSection = {
  campusId: string;
  campusName: string;
  birthYears: Array<{
    birthYear: number | null;
    label: string;
    coaches: Array<{ coachId: string; coachName: string; groups: CoachTuitionGroupMetric[] }>;
  }>;
};

export type CoachTuitionReportData = {
  campuses: Array<{ id: string; name: string }>;
  selectedCampusId: string | null;
  selectedMonth: string;
  selectedCoachId: string;
  coachOptions: Array<{ id: string; name: string }>;
  coachSummaries: CoachTuitionSummary[];
  selectedCoachSummary: CoachTuitionSummary | null;
  campusSections: CoachTuitionCampusSection[];
  totals: Omit<CoachTuitionSummary, "coachId" | "coachName" | "groups"> & { groups: number; campuses: number; coaches: number };
};

function normalizeMonth(value: string | null | undefined) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value ?? "") ? value! : getMonterreyMonthString();
}

function nextMonthStart(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const next = new Date(Date.UTC(year, monthNumber, 1));
  return next.toISOString().slice(0, 10);
}

function playerName(player: EnrollmentRow["players"]) {
  return `${player?.first_name ?? ""} ${player?.last_name ?? ""}`.replace(/\s+/g, " ").trim() || "Sin nombre";
}

function coachName(coach: CoachLinkRow["coaches"]) {
  return `${coach?.first_name ?? ""} ${coach?.last_name ?? ""}`.replace(/\s+/g, " ").trim() || "Sin coach";
}

function birthYear(value: string | null | undefined) {
  const year = Number(value?.slice(0, 4));
  return Number.isFinite(year) && year > 1900 ? year : null;
}

function money(value: number) {
  return Math.round(value * 100) / 100;
}

function rate(paid: number, expected: number) {
  return expected > 0 ? Math.round((paid / expected) * 100) : null;
}

async function loadEnrollments(campusIds: string[], selectedMonth: string) {
  const admin = createAdminClient();
  const rows: EnrollmentRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await admin
      .from("enrollments")
      .select("id, player_id, campus_id, start_date, scholarship_status, players!inner(id, first_name, last_name, birth_date, status), campuses(id, name)")
      .eq("status", "active")
      .eq("players.status", "active")
      .in("campus_id", campusIds)
      .lt("start_date", nextMonthStart(selectedMonth))
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1)
      .returns<EnrollmentRow[]>();
    if (error) throw error;
    rows.push(...(data ?? []));
    if ((data ?? []).length < PAGE_SIZE) break;
  }
  return rows;
}

async function loadAssignments(enrollmentIds: string[]) {
  const admin = createAdminClient();
  const rows: AssignmentRow[] = [];
  for (let index = 0; index < enrollmentIds.length; index += ID_CHUNK_SIZE) {
    const chunk = enrollmentIds.slice(index, index + ID_CHUNK_SIZE);
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await admin
        .from("training_group_assignments")
        .select("id, enrollment_id, training_group_id, training_groups!inner(id, name, campus_id, status, campuses(name))")
        .in("enrollment_id", chunk)
        .is("end_date", null)
        .eq("training_groups.status", "active")
        .order("id", { ascending: true })
        .range(from, from + PAGE_SIZE - 1)
        .returns<AssignmentRow[]>();
      if (error) throw error;
      rows.push(...(data ?? []));
      if ((data ?? []).length < PAGE_SIZE) break;
    }
  }
  return rows;
}

async function loadCoachLinks(groupIds: string[]) {
  const admin = createAdminClient();
  const rows: CoachLinkRow[] = [];
  for (let index = 0; index < groupIds.length; index += ID_CHUNK_SIZE) {
    const chunk = groupIds.slice(index, index + ID_CHUNK_SIZE);
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await admin
        .from("training_group_coaches")
        .select("id, training_group_id, coach_id, is_primary, coaches(id, first_name, last_name, is_active)")
        .in("training_group_id", chunk)
        .order("id", { ascending: true })
        .range(from, from + PAGE_SIZE - 1)
        .returns<CoachLinkRow[]>();
      if (error) throw error;
      rows.push(...(data ?? []));
      if ((data ?? []).length < PAGE_SIZE) break;
    }
  }
  return rows.filter((row) => row.coaches?.is_active !== false);
}

async function loadCharges(enrollmentIds: string[], selectedPeriod: string) {
  const admin = createAdminClient();
  const rows: ChargeRow[] = [];
  for (let index = 0; index < enrollmentIds.length; index += ID_CHUNK_SIZE) {
    const chunk = enrollmentIds.slice(index, index + ID_CHUNK_SIZE);
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await admin
        .from("charges")
        .select("id, enrollment_id, amount, period_month, charge_types!inner(code), payment_allocations(amount)")
        .in("enrollment_id", chunk)
        .eq("charge_types.code", "monthly_tuition")
        .neq("status", "void")
        .not("period_month", "is", null)
        .lte("period_month", selectedPeriod)
        .order("id", { ascending: true })
        .range(from, from + PAGE_SIZE - 1)
        .returns<ChargeRow[]>();
      if (error) throw error;
      rows.push(...(data ?? []));
      if ((data ?? []).length < PAGE_SIZE) break;
    }
  }
  return rows;
}

async function loadOmissions(enrollmentIds: string[], selectedPeriod: string) {
  const admin = createAdminClient();
  const rows: IncidentRow[] = [];
  for (let index = 0; index < enrollmentIds.length; index += ID_CHUNK_SIZE) {
    const chunk = enrollmentIds.slice(index, index + ID_CHUNK_SIZE);
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await admin
        .from("enrollment_incidents")
        .select("id, enrollment_id, omit_period_month")
        .in("enrollment_id", chunk)
        .eq("omit_period_month", selectedPeriod)
        .is("cancelled_at", null)
        .order("id", { ascending: true })
        .range(from, from + PAGE_SIZE - 1)
        .returns<IncidentRow[]>();
      if (error) throw error;
      rows.push(...(data ?? []));
      if ((data ?? []).length < PAGE_SIZE) break;
    }
  }
  return rows;
}

function classifyPlayer(enrollment: EnrollmentRow, monthCharges: ChargeRow[], omitted: boolean): TuitionReportStatus {
  if (monthCharges.length > 0) {
    if (enrollment.scholarship_status === "full" || omitted) return "review";
    const amount = monthCharges.reduce((sum, charge) => sum + Number(charge.amount ?? 0), 0);
    const allocated = monthCharges.reduce((sum, charge) => sum + (charge.payment_allocations ?? []).reduce((subtotal, allocation) => subtotal + Number(allocation.amount ?? 0), 0), 0);
    return money(amount - allocated) <= 0.009 ? "paid" : "pending";
  }
  if (enrollment.scholarship_status === "full") return "scholarship";
  if (omitted) return "omitted";
  return "missing";
}

function statusCounts(players: CoachTuitionPlayer[]) {
  const count = (status: TuitionReportStatus) => players.filter((player) => player.status === status).length;
  const paidCount = count("paid");
  const pendingCount = count("pending");
  const missingCount = count("missing");
  const expectedCount = paidCount + pendingCount + missingCount;
  return {
    rosterCount: players.length,
    expectedCount,
    paidCount,
    pendingCount,
    scholarshipCount: count("scholarship"),
    omittedCount: count("omitted"),
    missingCount,
    reviewCount: count("review"),
    collectionRate: rate(paidCount, expectedCount),
  };
}

function summarizeCoaches(metrics: CoachTuitionGroupMetric[]) {
  const grouped = new Map<string, { name: string; groups: Set<string>; players: Map<string, CoachTuitionPlayer> }>();
  for (const metric of metrics) {
    const entry = grouped.get(metric.coachId) ?? { name: metric.coachName, groups: new Set<string>(), players: new Map<string, CoachTuitionPlayer>() };
    entry.groups.add(metric.trainingGroupId);
    for (const player of metric.players) entry.players.set(player.enrollmentId, player);
    grouped.set(metric.coachId, entry);
  }
  return [...grouped.entries()].map(([coachId, entry]): CoachTuitionSummary => ({
    coachId,
    coachName: entry.name,
    groups: entry.groups.size,
    ...statusCounts([...entry.players.values()]),
  })).sort((a, b) => (b.collectionRate ?? -1) - (a.collectionRate ?? -1) || a.coachName.localeCompare(b.coachName, "es-MX"));
}

export async function getCoachTuitionReport(filters: { campusId?: string; month?: string; coachId?: string }): Promise<CoachTuitionReportData> {
  const access = await getAttendanceCampusAccess();
  const selectedMonth = normalizeMonth(filters.month);
  const selectedPeriod = `${selectedMonth}-01`;
  const emptyCounts = { rosterCount: 0, expectedCount: 0, paidCount: 0, pendingCount: 0, scholarshipCount: 0, omittedCount: 0, missingCount: 0, reviewCount: 0, collectionRate: null };
  const emptyTotals = { ...emptyCounts, groups: 0, campuses: 0, coaches: 0 };
  if (!access || access.campusIds.length === 0) {
    return { campuses: [], selectedCampusId: null, selectedMonth, selectedCoachId: "", coachOptions: [], coachSummaries: [], selectedCoachSummary: null, campusSections: [], totals: emptyTotals };
  }

  const selectedCampusId = filters.campusId && canAccessAttendanceCampus(access, filters.campusId) ? filters.campusId : null;
  const campusIds = selectedCampusId ? [selectedCampusId] : access.campusIds;
  const enrollments = await loadEnrollments(campusIds, selectedMonth);
  const enrollmentIds = enrollments.map((row) => row.id);
  const assignments = await loadAssignments(enrollmentIds);
  const groupIds = [...new Set(assignments.map((row) => row.training_group_id))];
  const [coachLinks, charges, omissions] = await Promise.all([
    loadCoachLinks(groupIds),
    loadCharges(enrollmentIds, selectedPeriod),
    loadOmissions(enrollmentIds, selectedPeriod),
  ]);

  const assignmentByEnrollment = new Map(assignments.map((row) => [row.enrollment_id, row]));
  const coachesByGroup = new Map<string, CoachAssignment[]>();
  for (const row of coachLinks) {
    const coach: CoachAssignment = { id: row.coach_id, name: coachName(row.coaches), role: row.is_primary ? "Principal" : "Auxiliar" };
    coachesByGroup.set(row.training_group_id, [...(coachesByGroup.get(row.training_group_id) ?? []), coach]);
  }
  for (const groupId of groupIds) {
    const coaches = coachesByGroup.get(groupId) ?? [];
    coachesByGroup.set(groupId, coaches.length > 0 ? coaches.sort((a, b) => Number(b.role === "Principal") - Number(a.role === "Principal") || a.name.localeCompare(b.name, "es-MX")) : [{ id: UNASSIGNED_COACH_ID, name: "Sin coach", role: "Sin asignar" }]);
  }
  coachesByGroup.set(UNASSIGNED_GROUP_ID, [{ id: UNASSIGNED_COACH_ID, name: "Sin coach", role: "Sin asignar" }]);

  const chargesByEnrollmentPeriod = new Map<string, ChargeRow[]>();
  const previousPendingPeriodsByEnrollment = new Map<string, Set<string>>();
  for (const charge of charges) {
    if (!charge.period_month) continue;
    const key = `${charge.enrollment_id}:${charge.period_month}`;
    chargesByEnrollmentPeriod.set(key, [...(chargesByEnrollmentPeriod.get(key) ?? []), charge]);
    if (charge.period_month < selectedPeriod) {
      const allocated = (charge.payment_allocations ?? []).reduce((sum, allocation) => sum + Number(allocation.amount ?? 0), 0);
      if (money(Number(charge.amount ?? 0) - allocated) > 0.009) {
        const periods = previousPendingPeriodsByEnrollment.get(charge.enrollment_id) ?? new Set<string>();
        periods.add(charge.period_month);
        previousPendingPeriodsByEnrollment.set(charge.enrollment_id, periods);
      }
    }
  }
  const omittedEnrollments = new Set(omissions.map((row) => row.enrollment_id));

  const playerEntries = enrollments.map((enrollment) => {
    const assignment = assignmentByEnrollment.get(enrollment.id);
    const groupId = assignment?.training_group_id ?? UNASSIGNED_GROUP_ID;
    const group = assignment?.training_groups;
    const player: CoachTuitionPlayer = {
      enrollmentId: enrollment.id,
      playerId: enrollment.player_id,
      playerName: playerName(enrollment.players),
      status: classifyPlayer(enrollment, chargesByEnrollmentPeriod.get(`${enrollment.id}:${selectedPeriod}`) ?? [], omittedEnrollments.has(enrollment.id)),
      previousPendingMonths: previousPendingPeriodsByEnrollment.get(enrollment.id)?.size ?? 0,
    };
    return {
      campusId: enrollment.campus_id,
      campusName: enrollment.campuses?.name ?? group?.campuses?.name ?? "Campus",
      groupId,
      groupName: group?.name ?? "Sin grupo",
      birthYear: birthYear(enrollment.players?.birth_date),
      player,
    };
  });

  const validCoachIds = new Set(coachLinks.map((row) => row.coach_id));
  if (playerEntries.some((entry) => entry.groupId === UNASSIGNED_GROUP_ID) || groupIds.some((groupId) => (coachesByGroup.get(groupId) ?? []).some((coach) => coach.id === UNASSIGNED_COACH_ID))) validCoachIds.add(UNASSIGNED_COACH_ID);
  const selectedCoachId = filters.coachId && validCoachIds.has(filters.coachId) ? filters.coachId : "";

  const groupedPlayers = new Map<string, typeof playerEntries>();
  for (const entry of playerEntries) {
    const key = `${entry.groupId}:${entry.birthYear ?? "none"}`;
    groupedPlayers.set(key, [...(groupedPlayers.get(key) ?? []), entry]);
  }

  const metrics: Array<CoachTuitionGroupMetric & { campusId: string; campusName: string; birthYear: number | null }> = [];
  for (const entries of groupedPlayers.values()) {
    const first = entries[0];
    const players = entries.map((entry) => entry.player).sort((a, b) => a.playerName.localeCompare(b.playerName, "es-MX"));
    for (const coach of coachesByGroup.get(first.groupId) ?? []) {
      if (selectedCoachId && coach.id !== selectedCoachId) continue;
      metrics.push({
        trainingGroupId: first.groupId,
        trainingGroupName: first.groupName,
        coachId: coach.id,
        coachName: coach.name,
        coachRole: coach.role,
        players,
        ...statusCounts(players),
        campusId: first.campusId,
        campusName: first.campusName,
        birthYear: first.birthYear,
      });
    }
  }

  const allCoachSummaries = summarizeCoaches(metrics);
  const coachOptions = [...new Map([...coachLinks.map((row) => [row.coach_id, coachName(row.coaches)] as const), ...(validCoachIds.has(UNASSIGNED_COACH_ID) ? [[UNASSIGNED_COACH_ID, "Sin coach"] as const] : [])]).entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name, "es-MX"));

  const campusMap = new Map<string, { name: string; years: Map<string, { birthYear: number | null; coaches: Map<string, { name: string; groups: CoachTuitionGroupMetric[] }> }> }>();
  for (const metric of metrics) {
    const campus = campusMap.get(metric.campusId) ?? { name: metric.campusName, years: new Map() };
    const yearKey = metric.birthYear?.toString() ?? "none";
    const year = campus.years.get(yearKey) ?? { birthYear: metric.birthYear, coaches: new Map() };
    const coach = year.coaches.get(metric.coachId) ?? { name: metric.coachName, groups: [] };
    coach.groups.push(metric);
    year.coaches.set(metric.coachId, coach);
    campus.years.set(yearKey, year);
    campusMap.set(metric.campusId, campus);
  }

  const campusSections: CoachTuitionCampusSection[] = [...campusMap.entries()].map(([campusId, campus]) => ({
    campusId,
    campusName: campus.name,
    birthYears: [...campus.years.values()].sort((a, b) => (b.birthYear ?? -1) - (a.birthYear ?? -1)).map((year) => ({
      birthYear: year.birthYear,
      label: year.birthYear ? `Categoria ${year.birthYear}` : "Sin categoria",
      coaches: [...year.coaches.entries()].map(([coachId, coach]) => ({ coachId, coachName: coach.name, groups: coach.groups.sort((a, b) => a.trainingGroupName.localeCompare(b.trainingGroupName, "es-MX")) })).sort((a, b) => a.coachName.localeCompare(b.coachName, "es-MX")),
    })),
  })).sort((a, b) => a.campusName.localeCompare(b.campusName, "es-MX"));

  const uniquePlayers = new Map<string, CoachTuitionPlayer>();
  const uniqueGroups = new Set<string>();
  const uniqueCoaches = new Set<string>();
  for (const metric of metrics) {
    uniqueGroups.add(metric.trainingGroupId);
    uniqueCoaches.add(metric.coachId);
    for (const player of metric.players) uniquePlayers.set(player.enrollmentId, player);
  }
  const totalCounts = statusCounts([...uniquePlayers.values()]);
  const totals = { ...totalCounts, groups: uniqueGroups.size, campuses: new Set(metrics.map((metric) => metric.campusId)).size, coaches: uniqueCoaches.size };

  return {
    campuses: access.campuses.map((campus) => ({ id: campus.id, name: campus.name })),
    selectedCampusId,
    selectedMonth,
    selectedCoachId,
    coachOptions,
    coachSummaries: allCoachSummaries,
    selectedCoachSummary: selectedCoachId ? allCoachSummaries.find((coach) => coach.coachId === selectedCoachId) ?? null : null,
    campusSections,
    totals,
  };
}
