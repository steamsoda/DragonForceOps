import { getOperationalCampusAccess } from "@/lib/auth/campuses";
import { getPermissionContext } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

type ChargeRow = {
  id: string;
  enrollment_id: string;
  description: string | null;
  amount: number;
  status: string;
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
    } | null;
  } | null;
};

type AllocationRow = {
  charge_id: string;
  amount: number;
};

const FAMILY_CONFIG = [
  {
    key: "superliga_regia",
    label: "Superliga Regia",
    tokens: ["superliga regia", "super liga regia", "slr"],
  },
  {
    key: "rosa_power_cup",
    label: "Rosa Power Cup",
    tokens: ["rosa power cup", "rosa power", "rpc"],
  },
  {
    key: "cecaff",
    label: "CECAFF",
    tokens: ["cecaff", "cecaf"],
  },
] as const;

type FamilyKey = (typeof FAMILY_CONFIG)[number]["key"];

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
  players: CompetitionSignupPlayerRow[];
};

export type CompetitionSignupCampusGroup = {
  campusId: string;
  campusName: string;
  confirmedCount: number;
  categories: CompetitionSignupCategoryGroup[];
};

export type CompetitionSignupFamilyGroup = {
  key: FamilyKey;
  label: string;
  totalConfirmed: number;
  campuses: CompetitionSignupCampusGroup[];
};

export type CompetitionSignupDashboardData = {
  campuses: Array<{ id: string; name: string }>;
  selectedCampusId: string;
  families: CompetitionSignupFamilyGroup[];
  loadError: string | null;
};

function normalizeText(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
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

async function loadChargeRows(admin: SupabaseServerClient, campusIds: string[]) {
  const pageSize = 1000;
  const rows: ChargeRow[] = [];

  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1;
    const { data, error } = await admin
      .from("charges")
      .select(
        "id, enrollment_id, description, amount, status, created_at, products(name), enrollments!inner(id, player_id, campus_id, players(first_name, last_name, birth_date))"
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

export async function getCompetitionSignupDashboardData(filters?: {
  campusId?: string | null;
}): Promise<CompetitionSignupDashboardData | null> {
  const permissionContext = await getPermissionContext();
  if (!permissionContext || (!permissionContext.hasOperationalAccess && !permissionContext.hasSportsAccess)) {
    return null;
  }

  const campusAccess = await getOperationalCampusAccess();
  if (!campusAccess || campusAccess.campuses.length === 0) return null;

  const admin = permissionContext.supabase;
  const selectedCampusId =
    filters?.campusId && campusAccess.campusIds.includes(filters.campusId) ? filters.campusId : "";
  const targetCampusIds = selectedCampusId ? [selectedCampusId] : campusAccess.campusIds;
  const emptyDashboard = {
    campuses: campusAccess.campuses.map((campus) => ({ id: campus.id, name: campus.name })),
    selectedCampusId,
    families: FAMILY_CONFIG.map((family) => ({
      key: family.key,
      label: family.label,
      totalConfirmed: 0,
      campuses: [],
    })),
  };

  try {
    const availableCharges = await loadChargeRows(admin, targetCampusIds);
    if (availableCharges.length === 0) {
      return {
        ...emptyDashboard,
        loadError: null,
      };
    }

    const allocationTotals = await loadAllocationTotals(
      admin,
      availableCharges.map((charge) => charge.id),
    );

    const campusNameById = new Map(campusAccess.campuses.map((campus) => [campus.id, campus.name]));

    const families = FAMILY_CONFIG.map<CompetitionSignupFamilyGroup>((family) => {
      const playerAccumulator = new Map<string, CompetitionSignupPlayerRow>();

      for (const charge of availableCharges) {
        const totalAllocated = allocationTotals.get(charge.id) ?? 0;
        if (totalAllocated + 0.009 < charge.amount) continue;

        const familyKey = getCompetitionFamily(charge.products?.name ?? null, charge.description);
        if (familyKey !== family.key) continue;

        const enrollment = charge.enrollments;
        if (!enrollment) continue;

        if (playerAccumulator.has(enrollment.id)) continue;

        const playerName = enrollment.players
          ? `${enrollment.players.first_name} ${enrollment.players.last_name}`.trim()
          : "Jugador";

        playerAccumulator.set(enrollment.id, {
          enrollmentId: enrollment.id,
          playerId: enrollment.player_id,
          playerName,
          birthYear: getBirthYear(enrollment.players?.birth_date),
          campusId: enrollment.campus_id,
          campusName: campusNameById.get(enrollment.campus_id) ?? "Campus",
          familyKey: family.key,
          familyLabel: family.label,
        });
      }

      const campusMap = new Map<string, CompetitionSignupCampusGroup>();
      for (const player of playerAccumulator.values()) {
        const campusGroup =
          campusMap.get(player.campusId) ??
          {
            campusId: player.campusId,
            campusName: player.campusName,
            confirmedCount: 0,
            categories: [],
          };

        campusGroup.confirmedCount += 1;

        const categoryKey = player.birthYear !== null ? String(player.birthYear) : "sin_categoria";
        const categoryLabel = player.birthYear !== null ? `Cat. ${player.birthYear}` : "Sin categoria";
        const existingCategory = campusGroup.categories.find((category) => category.key === categoryKey);

        if (existingCategory) {
          existingCategory.confirmedCount += 1;
          existingCategory.players.push(player);
        } else {
          campusGroup.categories.push({
            key: categoryKey,
            label: categoryLabel,
            birthYear: player.birthYear,
            confirmedCount: 1,
            players: [player],
          });
        }

        campusMap.set(player.campusId, campusGroup);
      }

      const campuses = Array.from(campusMap.values())
        .map<CompetitionSignupCampusGroup>((campusGroup) => ({
          ...campusGroup,
          categories: campusGroup.categories
            .map((category) => ({
              ...category,
              players: sortPlayerRows(category.players),
            }))
            .sort((a, b) => {
              if (a.birthYear === null && b.birthYear === null) return a.label.localeCompare(b.label, "es-MX");
              if (a.birthYear === null) return 1;
              if (b.birthYear === null) return -1;
              return b.birthYear - a.birthYear;
            }),
        }))
        .sort((a, b) => a.campusName.localeCompare(b.campusName, "es-MX"));

      return {
        key: family.key,
        label: family.label,
        totalConfirmed: playerAccumulator.size,
        campuses,
      };
    });

    return {
      campuses: campusAccess.campuses.map((campus) => ({ id: campus.id, name: campus.name })),
      selectedCampusId,
      families,
      loadError: null,
    };
  } catch (error) {
    console.error("sports-signups query failed", error);
    return {
      ...emptyDashboard,
      loadError: "No se pudieron cargar las inscripciones de torneos.",
    };
  }
}
