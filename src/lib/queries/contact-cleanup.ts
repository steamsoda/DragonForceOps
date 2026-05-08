import { canAccessCampus, getOperationalCampusAccess, type AccessibleCampus } from "@/lib/auth/campuses";
import { createClient } from "@/lib/supabase/server";

const PAGE_SIZE = 1000;
const IN_FILTER_CHUNK_SIZE = 100;

export type ContactCleanupStatus =
  | "incomplete"
  | "missing_primary_phone"
  | "missing_secondary_phone"
  | "missing_email"
  | "missing_guardian"
  | "all";

export type ContactCleanupGender = "male" | "female" | "";

export type ContactCleanupGuardian = {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  phonePrimary: string;
  phoneSecondary: string;
  email: string;
  relationshipLabel: string;
  isPrimary: boolean;
};

export type ContactCleanupRow = {
  enrollmentId: string;
  playerId: string;
  publicPlayerId: string;
  playerName: string;
  birthYear: number | null;
  campusId: string;
  campusName: string;
  campusCode: string;
  trainingGroupName: string;
  trainingGroupSubtitle: string;
  guardians: ContactCleanupGuardian[];
  primaryGuardian: ContactCleanupGuardian | null;
  missingGuardian: boolean;
  missingGuardianName: boolean;
  missingPrimaryPhone: boolean;
  missingSecondaryPhone: boolean;
  missingEmail: boolean;
};

export type ContactCleanupData = {
  campuses: AccessibleCampus[];
  selectedCampusId: string;
  selectedBirthYear: number | null;
  selectedGender: ContactCleanupGender;
  birthYears: number[];
  q: string;
  status: ContactCleanupStatus;
  rows: ContactCleanupRow[];
  counts: Record<ContactCleanupStatus, number>;
};

type EnrollmentContactRow = {
  id: string;
  campus_id: string;
  players: {
    id: string;
    public_player_id: string | null;
    first_name: string | null;
    last_name: string | null;
    birth_date: string | null;
    gender: string | null;
    status: string | null;
  } | null;
  campuses: {
    id: string;
    name: string | null;
    code: string | null;
  } | null;
};

type GuardianLinkRow = {
  player_id: string;
  is_primary: boolean;
  guardians: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    phone_primary: string | null;
    phone_secondary: string | null;
    email: string | null;
    relationship_label: string | null;
  } | null;
};

type TrainingGroupAssignmentRow = {
  enrollment_id: string;
  training_groups: {
    name: string | null;
    program: string | null;
    level_label: string | null;
    group_code: string | null;
    birth_year_min: number | null;
    birth_year_max: number | null;
  } | null;
};

type BirthYearRow = {
  players: {
    birth_date: string | null;
  } | null;
};

async function fetchAll<T>(
  loadPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message?: string } | null }>,
  label: string,
) {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await loadPage(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`${label}: ${error.message ?? "query failed"}`);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return rows;
}

async function fetchInChunks<T>(
  ids: string[],
  loadChunk: (chunk: string[]) => PromiseLike<{ data: T[] | null; error: { message?: string } | null }>,
  label: string,
) {
  const rows: T[] = [];
  for (let index = 0; index < ids.length; index += IN_FILTER_CHUNK_SIZE) {
    const chunk = ids.slice(index, index + IN_FILTER_CHUNK_SIZE);
    const { data, error } = await loadChunk(chunk);
    if (error) throw new Error(`${label}: ${error.message ?? "query failed"}`);
    rows.push(...(data ?? []));
  }
  return rows;
}

function normalizeText(value: string | null | undefined) {
  return (value ?? "").trim();
}

function formatName(firstName: string | null | undefined, lastName: string | null | undefined) {
  return `${normalizeText(firstName)} ${normalizeText(lastName)}`.replace(/\s+/g, " ").trim();
}

function getBirthYear(value: string | null | undefined) {
  if (!value) return null;
  const year = Number.parseInt(value.slice(0, 4), 10);
  return Number.isFinite(year) ? year : null;
}

function parseBirthYear(value: string | undefined) {
  if (!value) return null;
  const year = Number.parseInt(value, 10);
  return Number.isFinite(year) && year > 1900 && year < 2100 ? year : null;
}

function groupSubtitle(group: TrainingGroupAssignmentRow["training_groups"]) {
  if (!group) return "Sin grupo de entrenamiento";
  const yearRange =
    group.birth_year_min && group.birth_year_max
      ? group.birth_year_min === group.birth_year_max
        ? `Cat. ${group.birth_year_min}`
        : `Cat. ${group.birth_year_min}-${group.birth_year_max}`
      : null;
  return [group.program, yearRange, group.level_label].filter(Boolean).join(" | ") || "Grupo activo";
}

function matchesStatus(row: ContactCleanupRow, status: ContactCleanupStatus) {
  switch (status) {
    case "missing_primary_phone":
      return row.missingPrimaryPhone;
    case "missing_secondary_phone":
      return row.missingSecondaryPhone;
    case "missing_email":
      return row.missingEmail;
    case "missing_guardian":
      return row.missingGuardian;
    case "all":
      return true;
    case "incomplete":
    default:
      return row.missingGuardian || row.missingGuardianName || row.missingPrimaryPhone || row.missingEmail;
  }
}

function matchesSearch(row: ContactCleanupRow, q: string) {
  const normalized = q.trim().toLowerCase();
  if (!normalized) return true;
  const haystack = [
    row.playerName,
    row.publicPlayerId,
    row.campusName,
    row.campusCode,
    row.trainingGroupName,
    ...row.guardians.flatMap((guardian) => [
      guardian.fullName,
      guardian.phonePrimary,
      guardian.phoneSecondary,
      guardian.email,
      guardian.relationshipLabel,
    ]),
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(normalized);
}

function normalizeStatus(value: string | undefined): ContactCleanupStatus {
  if (
    value === "incomplete" ||
    value === "missing_primary_phone" ||
    value === "missing_secondary_phone" ||
    value === "missing_email" ||
    value === "missing_guardian" ||
    value === "all"
  ) {
    return value;
  }
  return "incomplete";
}

function normalizeGender(value: string | undefined): ContactCleanupGender {
  return value === "male" || value === "female" ? value : "";
}

export async function getContactCleanupData(filters: {
  campusId?: string;
  birthYear?: string;
  gender?: string;
  status?: string;
  q?: string;
}): Promise<ContactCleanupData> {
  const supabase = await createClient();
  const campusAccess = await getOperationalCampusAccess();
  if (!campusAccess) {
    return {
      campuses: [],
      selectedCampusId: "",
      selectedBirthYear: null,
      selectedGender: normalizeGender(filters.gender),
      birthYears: [],
      q: filters.q ?? "",
      status: normalizeStatus(filters.status),
      rows: [],
      counts: {
        incomplete: 0,
        missing_primary_phone: 0,
        missing_secondary_phone: 0,
        missing_email: 0,
        missing_guardian: 0,
        all: 0,
      },
    };
  }

  const selectedCampusId =
    filters.campusId && canAccessCampus(campusAccess, filters.campusId)
      ? filters.campusId
      : campusAccess.defaultCampusId ?? "";
  const campusIds = selectedCampusId ? [selectedCampusId] : campusAccess.campusIds;
  const selectedBirthYear = parseBirthYear(filters.birthYear);
  const selectedGender = normalizeGender(filters.gender);
  const status = normalizeStatus(filters.status);
  const q = filters.q ?? "";

  const birthYearRows = await fetchAll<BirthYearRow>(
    (from, to) => {
      let query = supabase
        .from("enrollments")
        .select("players!inner(birth_date, status, gender)")
        .eq("status", "active")
        .eq("players.status", "active")
        .in("campus_id", campusIds);

      if (selectedGender) query = query.eq("players.gender", selectedGender);

      return query.range(from, to).returns<BirthYearRow[]>();
    },
    "contact cleanup birth years",
  );
  const birthYears = [
    ...new Set(
      birthYearRows
        .map((row) => getBirthYear(row.players?.birth_date))
        .filter((year): year is number => year !== null),
    ),
  ].sort((a, b) => b - a);

  const enrollmentRows = await fetchAll<EnrollmentContactRow>(
    (from, to) => {
      let query = supabase
        .from("enrollments")
        .select("id, campus_id, players!inner(id, public_player_id, first_name, last_name, birth_date, gender, status), campuses(id, name, code)")
        .eq("status", "active")
        .eq("players.status", "active")
        .in("campus_id", campusIds);

      if (selectedGender) query = query.eq("players.gender", selectedGender);
      if (selectedBirthYear) {
        query = query
          .gte("players.birth_date", `${selectedBirthYear}-01-01`)
          .lt("players.birth_date", `${selectedBirthYear + 1}-01-01`);
      }

      return query.order("campus_id").range(from, to).returns<EnrollmentContactRow[]>();
    },
    "contact cleanup enrollments",
  );

  const playerIds = [...new Set(enrollmentRows.map((row) => row.players?.id).filter((id): id is string => Boolean(id)))];
  const enrollmentIds = enrollmentRows.map((row) => row.id);

  const [guardianRows, trainingGroupRows] = await Promise.all([
    fetchInChunks<GuardianLinkRow>(
      playerIds,
      (chunk) =>
        supabase
          .from("player_guardians")
          .select("player_id, is_primary, guardians(id, first_name, last_name, phone_primary, phone_secondary, email, relationship_label)")
          .in("player_id", chunk)
          .returns<GuardianLinkRow[]>(),
      "contact cleanup guardians",
    ),
    fetchInChunks<TrainingGroupAssignmentRow>(
      enrollmentIds,
      (chunk) =>
        supabase
          .from("training_group_assignments")
          .select("enrollment_id, training_groups(name, program, level_label, group_code, birth_year_min, birth_year_max)")
          .in("enrollment_id", chunk)
          .is("end_date", null)
          .returns<TrainingGroupAssignmentRow[]>(),
      "contact cleanup training groups",
    ),
  ]);

  const guardiansByPlayer = new Map<string, ContactCleanupGuardian[]>();
  for (const link of guardianRows) {
    if (!link.guardians) continue;
    const guardian: ContactCleanupGuardian = {
      id: link.guardians.id,
      firstName: normalizeText(link.guardians.first_name),
      lastName: normalizeText(link.guardians.last_name),
      fullName: formatName(link.guardians.first_name, link.guardians.last_name) || "Tutor sin nombre",
      phonePrimary: normalizeText(link.guardians.phone_primary),
      phoneSecondary: normalizeText(link.guardians.phone_secondary),
      email: normalizeText(link.guardians.email),
      relationshipLabel: normalizeText(link.guardians.relationship_label),
      isPrimary: link.is_primary,
    };
    guardiansByPlayer.set(link.player_id, [...(guardiansByPlayer.get(link.player_id) ?? []), guardian]);
  }

  const groupByEnrollment = new Map(trainingGroupRows.map((row) => [row.enrollment_id, row.training_groups]));

  const allRows = enrollmentRows
    .filter((row) => row.players && row.campuses)
    .map((row): ContactCleanupRow => {
      const player = row.players!;
      const campus = row.campuses!;
      const guardians = [...(guardiansByPlayer.get(player.id) ?? [])].sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary));
      const primaryGuardian = guardians.find((guardian) => guardian.isPrimary) ?? guardians[0] ?? null;
      const group = groupByEnrollment.get(row.id) ?? null;
      const missingGuardian = guardians.length === 0;
      const missingGuardianName = !primaryGuardian || !primaryGuardian.firstName || !primaryGuardian.lastName;
      const missingPrimaryPhone = !primaryGuardian?.phonePrimary;
      const missingSecondaryPhone = !!primaryGuardian && !primaryGuardian.phoneSecondary;
      const missingEmail = !primaryGuardian?.email;

      return {
        enrollmentId: row.id,
        playerId: player.id,
        publicPlayerId: player.public_player_id ?? "-",
        playerName: formatName(player.first_name, player.last_name) || "Jugador sin nombre",
        birthYear: getBirthYear(player.birth_date),
        campusId: campus.id,
        campusName: campus.name ?? "-",
        campusCode: campus.code ?? "-",
        trainingGroupName: group?.name ?? "Sin grupo",
        trainingGroupSubtitle: groupSubtitle(group),
        guardians,
        primaryGuardian,
        missingGuardian,
        missingGuardianName,
        missingPrimaryPhone,
        missingSecondaryPhone,
        missingEmail,
      };
    })
    .sort((a, b) => {
      const campusDiff = a.campusName.localeCompare(b.campusName, "es-MX");
      if (campusDiff !== 0) return campusDiff;
      const groupDiff = a.trainingGroupName.localeCompare(b.trainingGroupName, "es-MX");
      if (groupDiff !== 0) return groupDiff;
      return a.playerName.localeCompare(b.playerName, "es-MX");
    });

  const counts: ContactCleanupData["counts"] = {
    incomplete: allRows.filter((row) => matchesStatus(row, "incomplete")).length,
    missing_primary_phone: allRows.filter((row) => matchesStatus(row, "missing_primary_phone")).length,
    missing_secondary_phone: allRows.filter((row) => matchesStatus(row, "missing_secondary_phone")).length,
    missing_email: allRows.filter((row) => matchesStatus(row, "missing_email")).length,
    missing_guardian: allRows.filter((row) => matchesStatus(row, "missing_guardian")).length,
    all: allRows.length,
  };

  const rows = allRows.filter((row) => matchesStatus(row, status)).filter((row) => matchesSearch(row, q));

  return {
    campuses: campusAccess.campuses,
    selectedCampusId,
    selectedBirthYear,
    selectedGender,
    birthYears,
    q,
    status,
    rows,
    counts,
  };
}
