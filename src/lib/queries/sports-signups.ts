import { getOperationalCampusAccess } from "@/lib/auth/campuses";
import { getPermissionContext } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

type ChargeRow = {
  id: string;
  enrollment_id: string;
  description: string | null;
  amount: number;
  created_at: string;
  products: {
    name: string | null;
  } | null;
  enrollments: {
    id: string;
    player_id: string;
    campus_id: string;
    players: {
      first_name: string;
      last_name: string;
      birth_date: string | null;
      gender: string | null;
    } | null;
  } | null;
};

type AllocationRow = {
  charge_id: string;
  amount: number;
};

type ActiveEnrollmentRow = {
  id: string;
  player_id: string;
  campus_id: string;
  players: {
    first_name: string;
    last_name: string;
    birth_date: string | null;
    gender: string | null;
  } | null;
};

type FamilyConfig = {
  key: "superliga_regia" | "rosa_power_cup" | "cecaff";
  label: string;
  tokens: string[];
  isEligible: (birthYear: number | null, gender: "male" | "female" | null) => boolean;
};

const FAMILY_CONFIG: readonly FamilyConfig[] = [
  {
    key: "superliga_regia",
    label: "Superliga Regia",
    tokens: ["superliga regia", "super liga regia", "slr"],
    isEligible: (birthYear, gender) => {
      if (birthYear === null) return false;
      if (birthYear >= 2015) return true;
      return gender === "male";
    },
  },
  {
    key: "rosa_power_cup",
    label: "Rosa Power Cup",
    tokens: ["rosa power cup", "rosa power", "rpc"],
    isEligible: (_birthYear, gender) => gender === "female",
  },
  {
    key: "cecaff",
    label: "CECAFF",
    tokens: ["cecaff", "cecaf"],
    isEligible: () => true,
  },
] as const;

export type FamilyKey = (typeof FAMILY_CONFIG)[number]["key"];

export type CompetitionSignupPlayerRow = {
  enrollmentId: string;
  playerId: string;
  playerName: string;
  birthYear: number | null;
  campusId: string;
  campusName: string;
  familyKey: FamilyKey;
  familyLabel: string;
};

export type CompetitionSignupCategoryGroup = {
  key: string;
  label: string;
  birthYear: number | null;
  confirmedCount: number;
  eligibleCount: number;
  players: CompetitionSignupPlayerRow[];
};

export type CompetitionSignupFamilyGroup = {
  key: FamilyKey;
  label: string;
  totalConfirmed: number;
  totalEligible: number;
  categories: CompetitionSignupCategoryGroup[];
};

export type CompetitionSignupCampusBoard = {
  campusId: string;
  campusName: string;
  families: CompetitionSignupFamilyGroup[];
};

export type CompetitionSignupDashboardData = {
  campuses: Array<{ id: string; name: string }>;
  selectedCampusId: string;
  campusBoards: CompetitionSignupCampusBoard[];
  loadError: string | null;
};

export type CompetitionSignupExportRow = {
  playerName: string;
  birthYear: number | null;
  campusName: string;
  superligaRegia: string;
  rosaPowerCup: string;
  cecaff: string;
};

function normalizeText(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function normalizeGender(value: string | null | undefined): "male" | "female" | null {
  if (value === "male" || value === "female") return value;
  return null;
}

function getBirthYear(value: string | null | undefined) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.getUTCFullYear();
}

function getCompetitionFamily(productName: string | null, chargeDescription: string | null): FamilyKey | null {
  const haystack = `${normalizeText(productName)} ${normalizeText(chargeDescription)}`;
  const match = FAMILY_CONFIG.find((family) => family.tokens.some((token) => haystack.includes(token)));
  return match?.key ?? null;
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function sortPlayerRows(players: CompetitionSignupPlayerRow[]) {
  return [...players].sort((a, b) => a.playerName.localeCompare(b.playerName, "es-MX"));
}

function sortCategoryGroups(categories: CompetitionSignupCategoryGroup[]) {
  return [...categories].sort((a, b) => {
    if (a.birthYear === null && b.birthYear === null) return a.label.localeCompare(b.label, "es-MX");
    if (a.birthYear === null) return 1;
    if (b.birthYear === null) return -1;
    return b.birthYear - a.birthYear;
  });
}

async function loadChargeRows(admin: SupabaseServerClient, campusIds: string[]) {
  const pageSize = 1000;
  const rows: ChargeRow[] = [];

  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1;
    const { data, error } = await admin
      .from("charges")
      .select(
        "id, enrollment_id, description, amount, created_at, products(name), enrollments!inner(id, player_id, campus_id, players(first_name, last_name, birth_date, gender))"
      )
      .neq("status", "void")
      .gt("amount", 0)
      .in("enrollments.campus_id", campusIds)
      .order("created_at", { ascending: true })
      .range(from, to)
      .returns<ChargeRow[]>();

    if (error) throw error;
    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < pageSize) break;
  }

  return rows;
}

async function loadActiveEnrollments(admin: SupabaseServerClient, campusIds: string[]) {
  const pageSize = 1000;
  const rows: ActiveEnrollmentRow[] = [];

  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1;
    const { data, error } = await admin
      .from("enrollments")
      .select("id, player_id, campus_id, players!inner(first_name, last_name, birth_date, gender)")
      .eq("status", "active")
      .in("campus_id", campusIds)
      .order("start_date", { ascending: false })
      .range(from, to)
      .returns<ActiveEnrollmentRow[]>();

    if (error) throw error;
    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < pageSize) break;
  }

  return rows;
}

async function loadAllocationTotals(admin: SupabaseServerClient, chargeIds: string[]) {
  const chunkSize = 500;
  const allocationTotals = new Map<string, number>();

  for (let index = 0; index < chargeIds.length; index += chunkSize) {
    const chunk = chargeIds.slice(index, index + chunkSize);
    const { data, error } = await admin
      .from("payment_allocations")
      .select("charge_id, amount")
      .in("charge_id", chunk)
      .returns<AllocationRow[]>();

    if (error) throw error;

    for (const allocation of data ?? []) {
      allocationTotals.set(
        allocation.charge_id,
        roundMoney((allocationTotals.get(allocation.charge_id) ?? 0) + allocation.amount),
      );
    }
  }

  return allocationTotals;
}

function buildEmptyFamilies(): CompetitionSignupFamilyGroup[] {
  return FAMILY_CONFIG.map((family) => ({
    key: family.key,
    label: family.label,
    totalConfirmed: 0,
    totalEligible: 0,
    categories: [],
  }));
}

function buildCampusBoard(
  campusId: string,
  campusName: string,
  campusCharges: ChargeRow[],
  campusActiveEnrollments: ActiveEnrollmentRow[],
  allocationTotals: Map<string, number>,
): CompetitionSignupCampusBoard {
  const families = FAMILY_CONFIG.map<CompetitionSignupFamilyGroup>((family) => {
    const confirmedPlayers = new Map<string, CompetitionSignupPlayerRow>();

    for (const charge of campusCharges) {
      const totalAllocated = allocationTotals.get(charge.id) ?? 0;
      if (totalAllocated + 0.009 < charge.amount) continue;

      const familyKey = getCompetitionFamily(charge.products?.name ?? null, charge.description);
      if (familyKey !== family.key) continue;

      const enrollment = charge.enrollments;
      if (!enrollment || confirmedPlayers.has(enrollment.id)) continue;

      const playerName = enrollment.players
        ? `${enrollment.players.first_name} ${enrollment.players.last_name}`.trim()
        : "Jugador";

      confirmedPlayers.set(enrollment.id, {
        enrollmentId: enrollment.id,
        playerId: enrollment.player_id,
        playerName,
        birthYear: getBirthYear(enrollment.players?.birth_date),
        campusId: enrollment.campus_id,
        campusName,
        familyKey: family.key,
        familyLabel: family.label,
      });
    }

    const categoryMap = new Map<string, CompetitionSignupCategoryGroup>();
    const eligibleEnrollmentIds = new Set<string>();

    for (const enrollment of campusActiveEnrollments) {
      const birthYear = getBirthYear(enrollment.players?.birth_date);
      const gender = normalizeGender(enrollment.players?.gender);
      if (!family.isEligible(birthYear, gender)) continue;

      eligibleEnrollmentIds.add(enrollment.id);

      const categoryKey = birthYear !== null ? String(birthYear) : "sin_categoria";
      const categoryLabel = birthYear !== null ? `CAT ${birthYear}` : "SIN CATEGORÍA";
      const category =
        categoryMap.get(categoryKey) ??
        {
          key: categoryKey,
          label: categoryLabel,
          birthYear,
          confirmedCount: 0,
          eligibleCount: 0,
          players: [],
        };

      category.eligibleCount += 1;
      categoryMap.set(categoryKey, category);
    }

    for (const player of confirmedPlayers.values()) {
      const categoryKey = player.birthYear !== null ? String(player.birthYear) : "sin_categoria";
      const categoryLabel = player.birthYear !== null ? `CAT ${player.birthYear}` : "SIN CATEGORÍA";
      const category =
        categoryMap.get(categoryKey) ??
        {
          key: categoryKey,
          label: categoryLabel,
          birthYear: player.birthYear,
          confirmedCount: 0,
          eligibleCount: 0,
          players: [],
        };

      category.confirmedCount += 1;
      category.players.push(player);
      categoryMap.set(categoryKey, category);
    }

    return {
      key: family.key,
      label: family.label,
      totalConfirmed: confirmedPlayers.size,
      totalEligible: eligibleEnrollmentIds.size,
      categories: sortCategoryGroups(
        Array.from(categoryMap.values()).map((category) => ({
          ...category,
          players: sortPlayerRows(category.players),
        })),
      ),
    };
  });

  return {
    campusId,
    campusName,
    families,
  };
}

function getFamilyStatus(
  charges: ChargeRow[],
  allocationTotals: Map<string, number>,
  familyKey: FamilyKey,
) {
  let fullyPaidCount = 0;
  let pendingCount = 0;

  for (const charge of charges) {
    const detectedFamily = getCompetitionFamily(charge.products?.name ?? null, charge.description);
    if (detectedFamily !== familyKey) continue;

    const totalAllocated = allocationTotals.get(charge.id) ?? 0;
    if (totalAllocated + 0.009 >= charge.amount) {
      fullyPaidCount += 1;
    } else {
      pendingCount += 1;
    }
  }

  if (fullyPaidCount > 1) return "Duplicado";
  if (fullyPaidCount === 1) return "Pagado";
  if (pendingCount > 0) return "Pendiente";
  return "";
}

export async function getCompetitionSignupDashboardData(filters?: {
  campusId?: string | null;
}): Promise<CompetitionSignupDashboardData | null> {
  const permissionContext = await getPermissionContext();
  if (!permissionContext || (!permissionContext.hasOperationalAccess && !permissionContext.hasSportsAccess)) {
    return null;
  }

  const campusAccess = await getOperationalCampusAccess();
  if (!campusAccess || campusAccess.campuses.length === 0) return null;

  const selectedCampusId =
    filters?.campusId && campusAccess.campusIds.includes(filters.campusId)
      ? filters.campusId
      : (campusAccess.defaultCampusId ?? campusAccess.campuses[0]?.id ?? "");

  if (!selectedCampusId) return null;

  const emptyDashboard: CompetitionSignupDashboardData = {
    campuses: campusAccess.campuses.map((campus) => ({ id: campus.id, name: campus.name })),
    selectedCampusId,
    campusBoards: campusAccess.campuses.map((campus) => ({
      campusId: campus.id,
      campusName: campus.name,
      families: buildEmptyFamilies(),
    })),
    loadError: null,
  };

  try {
    const admin = permissionContext.supabase;
    const campusIds = campusAccess.campusIds;
    const [availableCharges, activeEnrollments] = await Promise.all([
      loadChargeRows(admin, campusIds),
      loadActiveEnrollments(admin, campusIds),
    ]);

    const allocationTotals = await loadAllocationTotals(
      admin,
      availableCharges.map((charge) => charge.id),
    );

    const chargesByCampus = new Map<string, ChargeRow[]>();
    for (const charge of availableCharges) {
      const campusId = charge.enrollments?.campus_id;
      if (!campusId) continue;
      const current = chargesByCampus.get(campusId) ?? [];
      current.push(charge);
      chargesByCampus.set(campusId, current);
    }

    const activeEnrollmentsByCampus = new Map<string, ActiveEnrollmentRow[]>();
    for (const enrollment of activeEnrollments) {
      const current = activeEnrollmentsByCampus.get(enrollment.campus_id) ?? [];
      current.push(enrollment);
      activeEnrollmentsByCampus.set(enrollment.campus_id, current);
    }

    const campusBoards = campusAccess.campuses.map((campus) =>
      buildCampusBoard(
        campus.id,
        campus.name,
        chargesByCampus.get(campus.id) ?? [],
        activeEnrollmentsByCampus.get(campus.id) ?? [],
        allocationTotals,
      ),
    );

    return {
      ...emptyDashboard,
      campusBoards,
    };
  } catch (error) {
    console.error("sports-signups query failed", error);
    return {
      ...emptyDashboard,
      loadError: "No se pudieron cargar las inscripciones de torneos.",
    };
  }
}

export async function getCompetitionSignupExportData(filters?: {
  campusId?: string | null;
}): Promise<CompetitionSignupExportRow[] | null> {
  const permissionContext = await getPermissionContext();
  if (!permissionContext || (!permissionContext.hasOperationalAccess && !permissionContext.hasSportsAccess)) {
    return null;
  }

  const campusAccess = await getOperationalCampusAccess();
  if (!campusAccess || campusAccess.campuses.length === 0) return null;

  const allowedCampusIds =
    filters?.campusId && campusAccess.campusIds.includes(filters.campusId)
      ? [filters.campusId]
      : campusAccess.campusIds;

  try {
    const admin = permissionContext.supabase;
    const [availableCharges, activeEnrollments] = await Promise.all([
      loadChargeRows(admin, allowedCampusIds),
      loadActiveEnrollments(admin, allowedCampusIds),
    ]);
    const allocationTotals = await loadAllocationTotals(
      admin,
      availableCharges.map((charge) => charge.id),
    );

    const chargesByEnrollment = new Map<string, ChargeRow[]>();
    for (const charge of availableCharges) {
      const current = chargesByEnrollment.get(charge.enrollment_id) ?? [];
      current.push(charge);
      chargesByEnrollment.set(charge.enrollment_id, current);
    }

    return [...activeEnrollments]
      .map((enrollment) => {
        const playerName = enrollment.players
          ? `${enrollment.players.first_name} ${enrollment.players.last_name}`.trim()
          : "Jugador";
        const birthYear = getBirthYear(enrollment.players?.birth_date);
        const campusName =
          campusAccess.campuses.find((campus) => campus.id === enrollment.campus_id)?.name ?? "Campus";
        const enrollmentCharges = chargesByEnrollment.get(enrollment.id) ?? [];

        return {
          playerName,
          birthYear,
          campusName,
          superligaRegia: getFamilyStatus(enrollmentCharges, allocationTotals, "superliga_regia"),
          rosaPowerCup: getFamilyStatus(enrollmentCharges, allocationTotals, "rosa_power_cup"),
          cecaff: getFamilyStatus(enrollmentCharges, allocationTotals, "cecaff"),
        };
      })
      .sort((a, b) => {
        const campusCompare = a.campusName.localeCompare(b.campusName, "es-MX");
        if (campusCompare !== 0) return campusCompare;
        const yearA = a.birthYear ?? 0;
        const yearB = b.birthYear ?? 0;
        if (yearA !== yearB) return yearB - yearA;
        return a.playerName.localeCompare(b.playerName, "es-MX");
      });
  } catch (error) {
    console.error("sports-signups export query failed", error);
    return [];
  }
}
