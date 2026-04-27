import { canAccessCampus, getOperationalCampusAccess, type AccessibleCampus } from "@/lib/auth/campuses";
import { createClient } from "@/lib/supabase/server";
import { getMonterreyDateParts } from "@/lib/time";
import {
  TRAINING_GROUP_GENDER_LABELS,
  TRAINING_GROUP_PROGRAM_LABELS,
  formatTrainingGroupBirthYearRange,
} from "@/lib/training-groups/shared";

const PAGE_SIZE = 500;

type RosterEnrollmentRow = {
  id: string;
  campus_id: string;
  start_date: string;
  inscription_date: string;
  campuses: { name: string | null; code: string | null } | null;
  players: {
    id: string;
    public_player_id: string | null;
    first_name: string | null;
    last_name: string | null;
    birth_date: string | null;
    gender: string | null;
    level: string | null;
    status: string;
  } | null;
};

type TrainingGroupRow = {
  id: string;
  campus_id: string;
  name: string;
  program: string;
  level_label: string | null;
  group_code: string | null;
  gender: string;
  birth_year_min: number | null;
  birth_year_max: number | null;
  start_time: string | null;
  end_time: string | null;
  status: string;
};

type TrainingGroupAssignmentRow = {
  enrollment_id: string;
  training_group_id: string;
  training_groups: TrainingGroupRow | null;
};

type TuitionChargeRow = {
  id: string;
  enrollment_id: string;
  amount: number | string;
  status: string;
  period_month: string | null;
  payment_allocations: Array<{
    amount: number | string | null;
    payments: {
      paid_at: string | null;
      method: string | null;
      external_source: string | null;
      status: string | null;
    } | null;
  }> | null;
};

export type RosterTuitionMonth = {
  key: string;
  periodMonth: string;
  label: string;
};

export type RosterTuitionCell = {
  periodMonth: string;
  label: string;
  value: string;
  state: "paid" | "platform" | "pending" | "empty";
};

export type PlayerRosterGroupRow = {
  enrollmentId: string;
  playerId: string;
  publicPlayerId: string;
  fullName: string;
  birthYear: number | null;
  levelGroup: string;
  inscriptionDate: string;
  startDate: string;
  tuition: RosterTuitionCell[];
};

export type PlayerRosterGroupSection = {
  id: string;
  name: string;
  subtitle: string;
  program: string | null;
  programLabel: string;
  levelLabel: string | null;
  sortKey: string;
  rows: PlayerRosterGroupRow[];
};

export type PlayerRosterGroupsData = {
  campuses: AccessibleCampus[];
  selectedCampusId: string;
  selectedCampusName: string;
  selectedGender: "male" | "female" | "";
  selectedBirthYear: number | null;
  birthYears: number[];
  months: RosterTuitionMonth[];
  sections: PlayerRosterGroupSection[];
  totalPlayers: number;
  unassignedCount: number;
};

function parseAmount(value: number | string | null | undefined) {
  const amount = typeof value === "string" ? Number(value) : (value ?? 0);
  return Number.isFinite(amount) ? amount : 0;
}

async function fetchAll<T>(loadPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message?: string } | null }>, label: string) {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await loadPage(from, from + PAGE_SIZE - 1);
    if (error) {
      throw new Error(`${label}: ${error.message ?? "query failed"}`);
    }
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return rows;
}

function getRosterMonths(anchor: Date = new Date()): RosterTuitionMonth[] {
  const { year, month } = getMonterreyDateParts(anchor);
  const start = new Date(Date.UTC(Number(year), Number(month) - 1, 1, 12, 0, 0, 0));
  return [-2, -1, 0].map((offset) => {
    const date = new Date(start);
    date.setUTCMonth(start.getUTCMonth() + offset);
    const yyyy = date.getUTCFullYear();
    const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
    const label = new Intl.DateTimeFormat("es-MX", { month: "long", timeZone: "UTC" }).format(date).toUpperCase();
    return {
      key: `${yyyy}-${mm}`,
      periodMonth: `${yyyy}-${mm}-01`,
      label,
    };
  });
}

function formatDateShort(value: string | null | undefined) {
  if (!value) return "Pagado";
  const formatter = new Intl.DateTimeFormat("es-MX", {
    timeZone: "America/Monterrey",
    day: "2-digit",
    month: "short",
  });
  const parts = formatter.formatToParts(new Date(value));
  const day = parts.find((part) => part.type === "day")?.value ?? "";
  const month = parts.find((part) => part.type === "month")?.value ?? "";
  return `${day}-${month.replace(".", "").toLowerCase()}`;
}

function formatDateOnly(value: string | null | undefined) {
  if (!value) return "-";
  const [y, m, d] = value.split("-");
  return d ? `${d}/${m}/${y}` : value;
}

function getBirthYear(value: string | null | undefined) {
  if (!value) return null;
  const year = Number.parseInt(value.slice(0, 4), 10);
  return Number.isFinite(year) ? year : null;
}

function groupSubtitle(group: TrainingGroupRow) {
  const parts = [
    TRAINING_GROUP_PROGRAM_LABELS[group.program] ?? group.program,
    `Cat. ${formatTrainingGroupBirthYearRange(group.birth_year_min, group.birth_year_max)}`,
    TRAINING_GROUP_GENDER_LABELS[group.gender] ?? group.gender,
  ];
  if (group.start_time && group.end_time) parts.push(`${group.start_time.slice(0, 5)}-${group.end_time.slice(0, 5)}`);
  return parts.join(" | ");
}

function groupCategoryLabel(group: TrainingGroupRow) {
  return formatTrainingGroupBirthYearRange(group.birth_year_min, group.birth_year_max);
}

function groupSortYear(group: TrainingGroupRow) {
  const years = [group.birth_year_min, group.birth_year_max].filter((year): year is number => year != null);
  return years.length > 0 ? Math.max(...years) : -1;
}

function groupOldestYear(group: TrainingGroupRow) {
  const years = [group.birth_year_min, group.birth_year_max].filter((year): year is number => year != null);
  return years.length > 0 ? Math.min(...years) : -1;
}

function stripGroupTitlePrefix(value: string) {
  return value
    .replace(/^\s*\d{4}(?:\s*[\/-]\s*\d{4})?\s*[-–—:]?\s*/i, "")
    .replace(/^\s*femenil\s*[-–—:]?\s*/i, "")
    .trim();
}

function formatGroupDisplayName(group: TrainingGroupRow) {
  const groupName = stripGroupTitlePrefix(group.name) || group.level_label?.trim() || group.group_code?.trim() || "Grupo";
  const parts = [groupCategoryLabel(group)];
  if (group.gender === "female") parts.push("Femenil");
  parts.push(groupName);
  return parts.join(" - ");
}

function programRank(program: string | null) {
  if (program === "selectivo") return 0;
  if (program === "futbol_para_todos") return 1;
  if (program === "little_dragons") return 2;
  return 9;
}

function levelRank(value: string) {
  const normalized = value.trim().toLowerCase();
  if (normalized.includes("selectivo") || normalized === "sel") return 0;
  if (normalized === "b1") return 1;
  if (normalized === "b2") return 2;
  if (normalized === "b3") return 3;
  if (normalized.includes("little")) return 4;
  if (normalized === "sin nivel") return 9;
  return 5;
}

function normalizeGenderFilter(value: string | null | undefined): "male" | "female" | "" {
  return value === "male" || value === "female" ? value : "";
}

function groupMatchesGender(group: TrainingGroupRow, gender: "male" | "female" | "") {
  if (!gender) return true;
  return group.gender === gender || group.gender === "mixed";
}

function normalizeBirthYearFilter(value: string | number | null | undefined) {
  const year = typeof value === "number" ? value : Number.parseInt(value ?? "", 10);
  return Number.isFinite(year) && year >= 2000 && year <= 2100 ? year : null;
}

function groupMatchesBirthYear(group: TrainingGroupRow, birthYear: number | null) {
  if (!birthYear) return true;
  const min = group.birth_year_min;
  const max = group.birth_year_max;
  if (min == null && max == null) return true;
  if (min != null && max != null) return birthYear >= min && birthYear <= max;
  return birthYear === (min ?? max);
}

function buildTuitionCells(months: RosterTuitionMonth[], charges: TuitionChargeRow[]) {
  const byPeriod = new Map<string, TuitionChargeRow[]>();
  for (const charge of charges) {
    if (!charge.period_month) continue;
    const arr = byPeriod.get(charge.period_month) ?? [];
    arr.push(charge);
    byPeriod.set(charge.period_month, arr);
  }

  return months.map((month): RosterTuitionCell => {
    const periodCharges = byPeriod.get(month.periodMonth) ?? [];
    if (periodCharges.length === 0) {
      return { periodMonth: month.periodMonth, label: month.label, value: "-", state: "empty" };
    }

    let total = 0;
    let allocated = 0;
    let latestPaidAt: string | null = null;
    let hasPlatformPayment = false;

    for (const charge of periodCharges) {
      total += parseAmount(charge.amount);
      for (const allocation of charge.payment_allocations ?? []) {
        const payment = allocation.payments;
        if (payment?.status && payment.status !== "posted") continue;
        const allocationAmount = parseAmount(allocation.amount);
        allocated += allocationAmount;
        if (allocationAmount > 0 && payment?.method === "stripe_360player") hasPlatformPayment = true;
        if (payment?.paid_at && (!latestPaidAt || payment.paid_at > latestPaidAt)) latestPaidAt = payment.paid_at;
      }
    }

    if (total - allocated > 0.009) {
      return { periodMonth: month.periodMonth, label: month.label, value: "Pendiente", state: "pending" };
    }

    if (hasPlatformPayment) {
      return { periodMonth: month.periodMonth, label: month.label, value: "MES P", state: "platform" };
    }

    return { periodMonth: month.periodMonth, label: month.label, value: formatDateShort(latestPaidAt), state: "paid" };
  });
}

export async function getPlayerRosterGroupsData(filters: { campusId?: string; gender?: string; birthYear?: string | number } = {}): Promise<PlayerRosterGroupsData | null> {
  const campusAccess = await getOperationalCampusAccess();
  if (!campusAccess || campusAccess.campusIds.length === 0) return null;

  const selectedCampusId =
    filters.campusId && canAccessCampus(campusAccess, filters.campusId)
      ? filters.campusId
      : campusAccess.defaultCampusId ?? campusAccess.campusIds[0];

  if (!selectedCampusId) return null;

  const selectedCampus = campusAccess.campuses.find((campus) => campus.id === selectedCampusId) ?? campusAccess.campuses[0];
  const selectedGender = normalizeGenderFilter(filters.gender);
  const selectedBirthYear = normalizeBirthYearFilter(filters.birthYear);
  const months = getRosterMonths();
  const supabase = await createClient();

  const buildEnrollmentQuery = (from: number, to: number) => {
    let query = supabase
      .from("enrollments")
      .select("id, campus_id, start_date, inscription_date, campuses(name, code), players!inner(id, public_player_id, first_name, last_name, birth_date, gender, level, status)")
      .eq("status", "active")
      .eq("campus_id", selectedCampusId)
      .eq("players.status", "active")
      .order("start_date", { ascending: true })
      .range(from, to);

    if (selectedGender) {
      query = query.eq("players.gender", selectedGender);
    }

    return query.returns<RosterEnrollmentRow[]>();
  };

  const buildGroupsQuery = (from: number, to: number) => {
    let query = supabase
      .from("training_groups")
      .select("id, campus_id, name, program, level_label, group_code, gender, birth_year_min, birth_year_max, start_time, end_time, status")
      .eq("campus_id", selectedCampusId)
      .eq("status", "active")
      .order("program", { ascending: true })
      .order("start_time", { ascending: true })
      .range(from, to);

    if (selectedGender) {
      query = query.in("gender", [selectedGender, "mixed"]);
    }

    return query.returns<TrainingGroupRow[]>();
  };

  const [enrollments, groups, assignments, charges] = await Promise.all([
    fetchAll<RosterEnrollmentRow>(
      buildEnrollmentQuery,
      "player roster enrollments",
    ),
    fetchAll<TrainingGroupRow>(
      buildGroupsQuery,
      "player roster training groups",
    ),
    fetchAll<TrainingGroupAssignmentRow>(
      (from, to) =>
        supabase
          .from("training_group_assignments")
          .select("enrollment_id, training_group_id, training_groups!inner(id, campus_id, name, program, level_label, group_code, gender, birth_year_min, birth_year_max, start_time, end_time, status)")
          .is("end_date", null)
          .eq("training_groups.campus_id", selectedCampusId)
          .range(from, to)
          .returns<TrainingGroupAssignmentRow[]>(),
      "player roster training group assignments",
    ),
    fetchAll<TuitionChargeRow>(
      (from, to) =>
        supabase
          .from("charges")
          .select("id, enrollment_id, amount, status, period_month, charge_types!inner(code), enrollments!inner(campus_id, status), payment_allocations(amount, payments(paid_at, method, external_source, status))")
          .eq("charge_types.code", "monthly_tuition")
          .eq("enrollments.campus_id", selectedCampusId)
          .eq("enrollments.status", "active")
          .in("period_month", months.map((month) => month.periodMonth))
          .neq("status", "void")
          .range(from, to)
          .returns<TuitionChargeRow[]>(),
      "player roster tuition charges",
    ),
  ]);

  const birthYears = [...new Set(enrollments.map((row) => getBirthYear(row.players?.birth_date)).filter((year): year is number => year != null))].sort((a, b) => b - a);
  const visibleEnrollments = selectedBirthYear
    ? enrollments.filter((row) => getBirthYear(row.players?.birth_date) === selectedBirthYear)
    : enrollments;
  const groupsById = new Map(groups.map((group) => [group.id, group]));
  const assignmentByEnrollment = new Map(assignments.map((assignment) => [assignment.enrollment_id, assignment.training_groups]));
  const chargesByEnrollment = new Map<string, TuitionChargeRow[]>();

  for (const charge of charges) {
    const arr = chargesByEnrollment.get(charge.enrollment_id) ?? [];
    arr.push(charge);
    chargesByEnrollment.set(charge.enrollment_id, arr);
  }

  const sectionMap = new Map<string, PlayerRosterGroupSection>();
  for (const group of [...groups].sort((a, b) => {
    const youngestDiff = groupSortYear(b) - groupSortYear(a);
    if (youngestDiff !== 0) return youngestDiff;
    const oldestDiff = groupOldestYear(b) - groupOldestYear(a);
    if (oldestDiff !== 0) return oldestDiff;
    const startDiff = (a.start_time ?? "99:99").localeCompare(b.start_time ?? "99:99");
    if (startDiff !== 0) return startDiff;
    const programDiff = programRank(a.program) - programRank(b.program);
    if (programDiff !== 0) return programDiff;
    const genderDiff = a.gender.localeCompare(b.gender, "es-MX");
    if (genderDiff !== 0) return genderDiff;
    return a.name.localeCompare(b.name, "es-MX");
  }).filter((group) => groupMatchesGender(group, selectedGender) && groupMatchesBirthYear(group, selectedBirthYear))) {
    sectionMap.set(group.id, {
      id: group.id,
      name: formatGroupDisplayName(group),
      subtitle: groupSubtitle(group),
      program: group.program,
      programLabel: TRAINING_GROUP_PROGRAM_LABELS[group.program] ?? group.program,
      levelLabel: group.level_label,
      sortKey: `${String(9999 - groupSortYear(group)).padStart(4, "0")}:${String(9999 - groupOldestYear(group)).padStart(4, "0")}:${group.start_time ?? "99:99"}:${programRank(group.program)}:${group.gender}:${group.name}`,
      rows: [],
    });
  }

  const unassignedSection: PlayerRosterGroupSection = {
    id: "sin-grupo",
    name: "Sin grupo",
    subtitle: "Jugadores activos sin grupo de entrenamiento asignado",
    program: null,
    programLabel: "Sin grupo",
    levelLabel: null,
    sortKey: "zzzz:sin-grupo",
    rows: [],
  };

  for (const enrollment of visibleEnrollments) {
    const player = enrollment.players;
    if (!player) continue;
    const assignedGroup = assignmentByEnrollment.get(enrollment.id) ?? null;
    const canonicalGroup = assignedGroup?.id ? groupsById.get(assignedGroup.id) ?? assignedGroup : null;
    const targetSection = canonicalGroup?.id ? sectionMap.get(canonicalGroup.id) ?? unassignedSection : unassignedSection;
    const fullName = `${player.first_name ?? ""} ${player.last_name ?? ""}`.replace(/\s+/g, " ").trim();
    const levelGroup =
      canonicalGroup?.level_label?.trim() ||
      canonicalGroup?.group_code?.trim() ||
      player.level?.trim() ||
      canonicalGroup?.name ||
      "Sin nivel";

    targetSection.rows.push({
      enrollmentId: enrollment.id,
      playerId: player.id,
      publicPlayerId: player.public_player_id ?? "Pendiente",
      fullName,
      birthYear: getBirthYear(player.birth_date),
      levelGroup,
      inscriptionDate: formatDateOnly(enrollment.inscription_date ?? enrollment.start_date),
      startDate: enrollment.start_date,
      tuition: buildTuitionCells(months, chargesByEnrollment.get(enrollment.id) ?? []),
    });
  }

  const sections = [...sectionMap.values(), ...(unassignedSection.rows.length > 0 ? [unassignedSection] : [])]
    .map((section) => ({
      ...section,
      rows: [...section.rows].sort((a, b) => {
        const levelDiff = levelRank(a.levelGroup) - levelRank(b.levelGroup);
        if (levelDiff !== 0) return levelDiff;
        const yearDiff = (a.birthYear ?? 9999) - (b.birthYear ?? 9999);
        if (yearDiff !== 0) return yearDiff;
        return a.fullName.localeCompare(b.fullName, "es-MX");
      }),
    }))
    .sort((a, b) => a.sortKey.localeCompare(b.sortKey, "es-MX"));

  return {
    campuses: campusAccess.campuses,
    selectedCampusId,
    selectedCampusName: selectedCampus?.name ?? "-",
    selectedGender,
    selectedBirthYear,
    birthYears,
    months,
    sections,
    totalPlayers: visibleEnrollments.length,
    unassignedCount: unassignedSection.rows.length,
  };
}
