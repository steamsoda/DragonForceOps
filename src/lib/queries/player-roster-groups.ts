import { canAccessCampus, getOperationalCampusAccess, type AccessibleCampus } from "@/lib/auth/campuses";
import { createClient } from "@/lib/supabase/server";
import { getMonterreyDateParts } from "@/lib/time";
import {
  TRAINING_GROUP_GENDER_LABELS,
  TRAINING_GROUP_PROGRAM_LABELS,
  formatTrainingGroupBirthYearRange,
} from "@/lib/training-groups/shared";

const PAGE_SIZE = 1000;

type RosterEnrollmentRow = {
  players: { birth_date: string | null } | null;
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

type RosterRpcRow = {
  enrollment_id: string;
  player_id: string;
  public_player_id: string | null;
  full_name: string | null;
  birth_year: number | null;
  player_level: string | null;
  inscription_date: string | null;
  start_date: string;
  training_group_id: string | null;
  month_1_state: RosterTuitionCell["state"];
  month_1_latest_paid_at: string | null;
  month_2_state: RosterTuitionCell["state"];
  month_2_latest_paid_at: string | null;
  month_3_state: RosterTuitionCell["state"];
  month_3_latest_paid_at: string | null;
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

function buildTuitionCell(month: RosterTuitionMonth, state: RosterTuitionCell["state"], latestPaidAt: string | null): RosterTuitionCell {
  if (state === "empty") return { periodMonth: month.periodMonth, label: month.label, value: "-", state };
  if (state === "pending") return { periodMonth: month.periodMonth, label: month.label, value: "Pendiente", state };
  if (state === "platform") return { periodMonth: month.periodMonth, label: month.label, value: "MES P", state };
  return { periodMonth: month.periodMonth, label: month.label, value: formatDateShort(latestPaidAt), state: "paid" };
}

function buildTuitionCellsFromRpc(months: RosterTuitionMonth[], row: RosterRpcRow) {
  return [
    buildTuitionCell(months[0], row.month_1_state, row.month_1_latest_paid_at),
    buildTuitionCell(months[1], row.month_2_state, row.month_2_latest_paid_at),
    buildTuitionCell(months[2], row.month_3_state, row.month_3_latest_paid_at),
  ];
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

  const buildBirthYearsQuery = (from: number, to: number) => {
    let query = supabase
      .from("enrollments")
      .select("players!inner(birth_date, gender, status)")
      .eq("status", "active")
      .eq("campus_id", selectedCampusId)
      .eq("players.status", "active")
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

  const [birthYearRows, groups, rosterRows] = await Promise.all([
    fetchAll<RosterEnrollmentRow>(
      buildBirthYearsQuery,
      "player roster birth years",
    ),
    fetchAll<TrainingGroupRow>(
      buildGroupsQuery,
      "player roster training groups",
    ),
    fetchAll<RosterRpcRow>(
      async (from, to) => {
        const response = await supabase
          .rpc("get_player_roster_group_rows", {
            p_campus_id: selectedCampusId,
            p_month_1: months[0].periodMonth,
            p_month_2: months[1].periodMonth,
            p_month_3: months[2].periodMonth,
            p_gender: selectedGender || null,
            p_birth_year: selectedBirthYear,
          })
          .range(from, to);

        return response as unknown as { data: RosterRpcRow[] | null; error: { message?: string } | null };
      },
      "player roster rpc rows",
    ),
  ]);

  const birthYears = [...new Set(birthYearRows.map((row) => getBirthYear(row.players?.birth_date)).filter((year): year is number => year != null))].sort((a, b) => b - a);
  const groupsById = new Map(groups.map((group) => [group.id, group]));

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

  for (const row of rosterRows) {
    const canonicalGroup = row.training_group_id ? groupsById.get(row.training_group_id) ?? null : null;
    const targetSection = canonicalGroup?.id ? sectionMap.get(canonicalGroup.id) ?? unassignedSection : unassignedSection;
    const fullName = row.full_name?.replace(/\s+/g, " ").trim() || "Jugador";
    const levelGroup =
      canonicalGroup?.level_label?.trim() ||
      canonicalGroup?.group_code?.trim() ||
      row.player_level?.trim() ||
      canonicalGroup?.name ||
      "Sin nivel";

    targetSection.rows.push({
      enrollmentId: row.enrollment_id,
      playerId: row.player_id,
      publicPlayerId: row.public_player_id ?? "Pendiente",
      fullName,
      birthYear: row.birth_year,
      levelGroup,
      inscriptionDate: formatDateOnly(row.inscription_date ?? row.start_date),
      startDate: row.start_date,
      tuition: buildTuitionCellsFromRpc(months, row),
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
    totalPlayers: rosterRows.length,
    unassignedCount: unassignedSection.rows.length,
  };
}
