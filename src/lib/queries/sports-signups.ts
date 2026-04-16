import { getOperationalCampusAccess } from "@/lib/auth/campuses";
import { getPermissionContext } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { BASE_TEAM_LEVELS } from "@/lib/teams/shared";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

type CompetitionProductRow = {
  id: string;
  name: string;
  charge_types: {
    code: string | null;
  } | null;
};

type ChargeRow = {
  id: string;
  enrollment_id: string;
  product_id: string | null;
  description: string | null;
  amount: number;
  created_at: string;
  products: {
    id: string;
    name: string | null;
    charge_types: {
      code: string | null;
    } | null;
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
      level: string | null;
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
    level: string | null;
  } | null;
};

type TeamAssignmentRow = {
  enrollment_id: string;
  teams: {
    name: string | null;
    level: string | null;
  } | null;
};

type LegacyBucketConfig = {
  key: string;
  label: string;
  tokens: string[];
};

type ParsedCompetitionBucket =
  | { type: "product"; productId: string }
  | { type: "legacy"; legacyKey: string };

const LEGACY_BUCKETS: readonly LegacyBucketConfig[] = [
  {
    key: "cecaff",
    label: "CECAFF",
    tokens: ["cecaff", "cecaf"],
  },
] as const;

const COMPETITION_CHARGE_TYPE_CODES = new Set(["tournament", "cup", "league"]);

export type CompetitionSignupBucket = {
  id: string;
  label: string;
  productId: string | null;
  legacyKey: string | null;
};

export type CompetitionSignupPlayerRow = {
  enrollmentId: string;
  playerId: string;
  playerName: string;
  birthYear: number | null;
  campusId: string;
  campusName: string;
  competitionId: string;
  competitionLabel: string;
};

export type CompetitionSignupCategoryGroup = {
  key: string;
  label: string;
  birthYear: number | null;
  confirmedCount: number;
  activeCount: number;
  players: CompetitionSignupPlayerRow[];
};

export type CompetitionSignupCompetitionGroup = {
  id: string;
  label: string;
  totalConfirmed: number;
  totalActive: number;
  categories: CompetitionSignupCategoryGroup[];
};

export type CompetitionSignupCampusBoard = {
  campusId: string;
  campusName: string;
  competitions: CompetitionSignupCompetitionGroup[];
};

export type CompetitionSignupDashboardData = {
  campuses: Array<{ id: string; name: string }>;
  selectedCampusId: string;
  competitionOptions: CompetitionSignupBucket[];
  campusBoards: CompetitionSignupCampusBoard[];
  loadError: string | null;
  perf?: {
    totalMs: number;
    steps: Array<{ label: string; durationMs: number }>;
  };
};

export type CompetitionSignupDetailPlayerRow = {
  enrollmentId: string;
  playerId: string;
  playerName: string;
  level: string;
  teamName: string;
};

export type CompetitionSignupDetailLevelGroup = {
  level: string;
  playerCount: number;
  players: CompetitionSignupDetailPlayerRow[];
};

export type CompetitionSignupCategoryDetailData = {
  competitionId: string;
  competitionLabel: string;
  campusId: string;
  campusName: string;
  birthYear: number | null;
  categoryLabel: string;
  totalConfirmed: number;
  totalUnpaid: number;
  paidLevelGroups: CompetitionSignupDetailLevelGroup[];
  unpaidLevelGroups: CompetitionSignupDetailLevelGroup[];
  perf?: {
    totalMs: number;
    steps: Array<{ label: string; durationMs: number }>;
  };
};

export type CompetitionSignupExportRow = {
  playerName: string;
  birthYear: number | null;
  campusName: string;
  level: string;
  teamName: string;
};

export type CompetitionSignupExportData = {
  competitionId: string;
  competitionLabel: string;
  campusId: string;
  campusName: string;
  rows: CompetitionSignupExportRow[];
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

function normalizeLevel(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : "Sin nivel";
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function isCompetitionProduct(product: { charge_types: { code: string | null } | null } | null | undefined) {
  return COMPETITION_CHARGE_TYPE_CODES.has(product?.charge_types?.code ?? "");
}

function detectLegacyBucket(productName: string | null, chargeDescription: string | null) {
  const haystack = `${normalizeText(productName)} ${normalizeText(chargeDescription)}`;
  return LEGACY_BUCKETS.find((bucket) => bucket.tokens.some((token) => haystack.includes(token))) ?? null;
}

function getLegacyBucketByKey(key: string) {
  return LEGACY_BUCKETS.find((bucket) => bucket.key === key) ?? null;
}

function parseCompetitionBucketId(competitionId: string): ParsedCompetitionBucket | null {
  if (competitionId.startsWith("product:")) {
    const productId = competitionId.slice("product:".length).trim();
    return productId ? { type: "product", productId } : null;
  }

  if (competitionId.startsWith("legacy:")) {
    const legacyKey = competitionId.slice("legacy:".length).trim();
    return legacyKey ? { type: "legacy", legacyKey } : null;
  }

  return null;
}

function getCompetitionBucketId(
  charge: Pick<ChargeRow, "product_id" | "products" | "description">,
  productBucketIds: Set<string>,
) {
  if (charge.product_id && productBucketIds.has(charge.product_id)) {
    return `product:${charge.product_id}`;
  }

  const legacyBucket = detectLegacyBucket(charge.products?.name ?? null, charge.description);
  return legacyBucket ? `legacy:${legacyBucket.key}` : null;
}

function sortPlayerRows<T extends { playerName: string }>(players: T[]) {
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

function compareLevels(left: string, right: string) {
  const leftIndex = BASE_TEAM_LEVELS.indexOf(left as (typeof BASE_TEAM_LEVELS)[number]);
  const rightIndex = BASE_TEAM_LEVELS.indexOf(right as (typeof BASE_TEAM_LEVELS)[number]);

  if (leftIndex === -1 && rightIndex === -1) {
    if (left === "Sin nivel" && right === "Sin nivel") return 0;
    if (left === "Sin nivel") return 1;
    if (right === "Sin nivel") return -1;
    return left.localeCompare(right, "es-MX");
  }
  if (leftIndex === -1) return left === "Sin nivel" ? 1 : BASE_TEAM_LEVELS.length;
  if (rightIndex === -1) return right === "Sin nivel" ? -1 : -BASE_TEAM_LEVELS.length;
  return leftIndex - rightIndex;
}

function sortLevelGroups(groups: CompetitionSignupDetailLevelGroup[]) {
  return [...groups].sort((a, b) => compareLevels(a.level, b.level));
}

function startPerf(enabled: boolean) {
  return {
    enabled,
    startedAt: enabled ? Date.now() : 0,
    steps: [] as Array<{ label: string; durationMs: number }>,
  };
}

function recordPerfStep(
  perf: ReturnType<typeof startPerf>,
  label: string,
  startedAt: number,
) {
  if (!perf.enabled) return;
  perf.steps.push({
    label,
    durationMs: Date.now() - startedAt,
  });
}

async function loadCompetitionProducts(admin: SupabaseServerClient) {
  const pageSize = 1000;
  const rows: CompetitionProductRow[] = [];

  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1;
    const { data, error } = await admin
      .from("products")
      .select("id, name, charge_types(code)")
      .order("name", { ascending: true })
      .range(from, to)
      .returns<CompetitionProductRow[]>();

    if (error) throw error;
    const batch = (data ?? []).filter((row) => isCompetitionProduct(row));
    rows.push(...batch);
    if ((data ?? []).length < pageSize) break;
  }

  return rows;
}

async function loadChargeRows(admin: SupabaseServerClient, campusIds: string[]) {
  const pageSize = 1000;
  const rows: ChargeRow[] = [];

  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1;
    const { data, error } = await admin
      .from("charges")
      .select(
        "id, enrollment_id, product_id, description, amount, created_at, products(id, name, charge_types(code)), enrollments!inner(id, player_id, campus_id, players(first_name, last_name, birth_date, gender, level))"
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

async function loadBoardCompetitionChargeRows(
  admin: SupabaseServerClient,
  campusIds: string[],
  competitionProductIds: string[],
) {
  const pageSize = 1000;
  const rowsById = new Map<string, ChargeRow>();

  if (competitionProductIds.length > 0) {
    for (let from = 0; ; from += pageSize) {
      const to = from + pageSize - 1;
      const { data, error } = await admin
        .from("charges")
        .select(
          "id, enrollment_id, product_id, description, amount, created_at, products(id, name, charge_types(code)), enrollments!inner(id, player_id, campus_id, players(first_name, last_name, birth_date, gender, level))"
        )
        .neq("status", "void")
        .gt("amount", 0)
        .in("enrollments.campus_id", campusIds)
        .in("product_id", competitionProductIds)
        .order("created_at", { ascending: true })
        .range(from, to)
        .returns<ChargeRow[]>();

      if (error) throw error;

      const batch = data ?? [];
      for (const row of batch) {
        rowsById.set(row.id, row);
      }
      if (batch.length < pageSize) break;
    }
  }

  for (const bucket of LEGACY_BUCKETS) {
    for (const token of bucket.tokens) {
      for (let from = 0; ; from += pageSize) {
        const to = from + pageSize - 1;
        const { data, error } = await admin
          .from("charges")
          .select(
            "id, enrollment_id, product_id, description, amount, created_at, products(id, name, charge_types(code)), enrollments!inner(id, player_id, campus_id, players(first_name, last_name, birth_date, gender, level))"
          )
          .neq("status", "void")
          .gt("amount", 0)
          .in("enrollments.campus_id", campusIds)
          .ilike("description", `%${token}%`)
          .order("created_at", { ascending: true })
          .range(from, to)
          .returns<ChargeRow[]>();

        if (error) throw error;

        const batch = data ?? [];
        for (const row of batch) {
          rowsById.set(row.id, row);
        }
        if (batch.length < pageSize) break;
      }
    }
  }

  return [...rowsById.values()].sort((a, b) => a.created_at.localeCompare(b.created_at));
}

async function loadChargeRowsForCampus(
  admin: SupabaseServerClient,
  campusId: string,
  filter?: ParsedCompetitionBucket | null,
) {
  const pageSize = 1000;
  const rows: ChargeRow[] = [];

  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1;
    let query = admin
      .from("charges")
      .select(
        "id, enrollment_id, product_id, description, amount, created_at, products(id, name, charge_types(code)), enrollments!inner(id, player_id, campus_id, players(first_name, last_name, birth_date, gender, level))"
      )
      .neq("status", "void")
      .gt("amount", 0)
      .eq("enrollments.campus_id", campusId)
      .order("created_at", { ascending: true })
      .range(from, to);

    if (filter?.type === "product") {
      query = query.eq("product_id", filter.productId);
    }

    const { data, error } = await query.returns<ChargeRow[]>();
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
      .select("id, player_id, campus_id, players!inner(first_name, last_name, birth_date, gender, level)")
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

async function loadActiveEnrollmentsForCampus(admin: SupabaseServerClient, campusId: string) {
  const pageSize = 1000;
  const rows: ActiveEnrollmentRow[] = [];

  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1;
    const { data, error } = await admin
      .from("enrollments")
      .select("id, player_id, campus_id, players!inner(first_name, last_name, birth_date, gender, level)")
      .eq("status", "active")
      .eq("campus_id", campusId)
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

async function loadPrimaryTeamAssignments(admin: SupabaseServerClient, enrollmentIds: string[]) {
  if (enrollmentIds.length === 0) return new Map<string, TeamAssignmentRow["teams"]>();

  const chunkSize = 500;
  const teamByEnrollment = new Map<string, TeamAssignmentRow["teams"]>();

  for (let index = 0; index < enrollmentIds.length; index += chunkSize) {
    const chunk = enrollmentIds.slice(index, index + chunkSize);
    const { data, error } = await admin
      .from("team_assignments")
      .select("enrollment_id, teams(name, level)")
      .in("enrollment_id", chunk)
      .is("end_date", null)
      .eq("is_primary", true)
      .returns<TeamAssignmentRow[]>();

    if (error) throw error;

    for (const row of data ?? []) {
      teamByEnrollment.set(row.enrollment_id, row.teams ?? null);
    }
  }

  return teamByEnrollment;
}

function buildCompetitionBuckets(
  products: CompetitionProductRow[],
  charges: ChargeRow[],
): CompetitionSignupBucket[] {
  const buckets = new Map<string, CompetitionSignupBucket>();

  for (const product of products) {
    buckets.set(`product:${product.id}`, {
      id: `product:${product.id}`,
      label: product.name,
      productId: product.id,
      legacyKey: null,
    });
  }

  const productBucketIds = new Set(products.map((product) => product.id));

  for (const charge of charges) {
    if (charge.product_id && productBucketIds.has(charge.product_id)) continue;

    const legacyBucket = detectLegacyBucket(charge.products?.name ?? null, charge.description);
    if (!legacyBucket) continue;

    const bucketId = `legacy:${legacyBucket.key}`;
    if (!buckets.has(bucketId)) {
      buckets.set(bucketId, {
        id: bucketId,
        label: legacyBucket.label,
        productId: null,
        legacyKey: legacyBucket.key,
      });
    }
  }

  return [...buckets.values()].sort((a, b) => a.label.localeCompare(b.label, "es-MX"));
}

function buildEmptyCompetitions(buckets: CompetitionSignupBucket[]): CompetitionSignupCompetitionGroup[] {
  return buckets.map((bucket) => ({
    id: bucket.id,
    label: bucket.label,
    totalConfirmed: 0,
    totalActive: 0,
    categories: [],
  }));
}

function buildCampusBoard(
  campusId: string,
  campusName: string,
  campusCharges: ChargeRow[],
  campusActiveEnrollments: ActiveEnrollmentRow[],
  allocationTotals: Map<string, number>,
  buckets: CompetitionSignupBucket[],
  productBucketIds: Set<string>,
): CompetitionSignupCampusBoard {
  const competitions = buckets.map<CompetitionSignupCompetitionGroup>((bucket) => {
    const confirmedPlayers = new Map<string, CompetitionSignupPlayerRow>();

    for (const charge of campusCharges) {
      const totalAllocated = allocationTotals.get(charge.id) ?? 0;
      if (totalAllocated + 0.009 < charge.amount) continue;

      const bucketId = getCompetitionBucketId(charge, productBucketIds);
      if (bucketId !== bucket.id) continue;

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
        competitionId: bucket.id,
        competitionLabel: bucket.label,
      });
    }

    const categoryMap = new Map<string, CompetitionSignupCategoryGroup>();

    for (const enrollment of campusActiveEnrollments) {
      const birthYear = getBirthYear(enrollment.players?.birth_date);
      const categoryKey = birthYear !== null ? String(birthYear) : "sin_categoria";
      const categoryLabel = birthYear !== null ? `CAT ${birthYear}` : "Sin categoria";
      const category =
        categoryMap.get(categoryKey) ??
        {
          key: categoryKey,
          label: categoryLabel,
          birthYear,
          confirmedCount: 0,
          activeCount: 0,
          players: [],
        };

      category.activeCount += 1;
      categoryMap.set(categoryKey, category);
    }

    for (const player of confirmedPlayers.values()) {
      const categoryKey = player.birthYear !== null ? String(player.birthYear) : "sin_categoria";
      const categoryLabel = player.birthYear !== null ? `CAT ${player.birthYear}` : "Sin categoria";
      const category =
        categoryMap.get(categoryKey) ??
        {
          key: categoryKey,
          label: categoryLabel,
          birthYear: player.birthYear,
          confirmedCount: 0,
          activeCount: 0,
          players: [],
        };

      category.confirmedCount += 1;
      category.players.push(player);
      categoryMap.set(categoryKey, category);
    }

    return {
      id: bucket.id,
      label: bucket.label,
      totalConfirmed: confirmedPlayers.size,
      totalActive: campusActiveEnrollments.length,
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
    competitions,
  };
}

function resolveSelectedCompetitionId(
  requestedCompetitionId: string | null | undefined,
  competitionOptions: CompetitionSignupBucket[],
) {
  if (requestedCompetitionId && competitionOptions.some((option) => option.id === requestedCompetitionId)) {
    return requestedCompetitionId;
  }

  return competitionOptions[0]?.id ?? "";
}

async function getCompetitionSignupBaseData(options?: { perf?: ReturnType<typeof startPerf> }) {
  const perf = options?.perf;
  const permissionContext = await getPermissionContext();
  if (!permissionContext || (!permissionContext.hasOperationalAccess && !permissionContext.hasSportsAccess)) {
    return null;
  }

  const campusAccess = await getOperationalCampusAccess();
  if (!campusAccess || campusAccess.campuses.length === 0) return null;

  const admin = permissionContext.supabase;
  const campusIds = campusAccess.campusIds;
  const productsStartedAt = Date.now();
  const products = await loadCompetitionProducts(admin);
  if (perf) {
    recordPerfStep(perf, "load products", productsStartedAt);
  }

  const competitionProductIds = products.map((product) => product.id);
  const chargesStartedAt = Date.now();
  const chargesPromise = loadBoardCompetitionChargeRows(admin, campusIds, competitionProductIds);
  const enrollmentsStartedAt = Date.now();
  const activeEnrollmentsPromise = loadActiveEnrollments(admin, campusIds);
  const [charges, activeEnrollments] = await Promise.all([
    chargesPromise,
    activeEnrollmentsPromise,
  ]);
  if (perf) {
    recordPerfStep(perf, "load competition charges", chargesStartedAt);
    recordPerfStep(perf, "load active enrollments", enrollmentsStartedAt);
  }

  const allocationsStartedAt = Date.now();
  const allocationTotals = await loadAllocationTotals(
    admin,
    charges.map((charge) => charge.id),
  );
  if (perf) {
    recordPerfStep(perf, "load allocation totals", allocationsStartedAt);
  }

  const competitionOptions = buildCompetitionBuckets(products, charges);
  const productBucketIds = new Set(
    competitionOptions.flatMap((option) => (option.productId ? [option.productId] : [])),
  );

  return {
    admin,
    campusAccess,
    charges,
    activeEnrollments,
    allocationTotals,
    competitionOptions,
    productBucketIds,
  };
}

async function loadCompetitionProductById(admin: SupabaseServerClient, productId: string) {
  const { data, error } = await admin
    .from("products")
    .select("id, name, charge_types(code)")
    .eq("id", productId)
    .maybeSingle<CompetitionProductRow | null>();

  if (error) throw error;
  return data;
}

async function getCompetitionSignupDetailBaseData(filters: {
  campusId?: string | null;
  competitionId?: string | null;
  perf?: boolean;
}) {
  const perf = startPerf(Boolean(filters.perf));
  const permissionContext = await getPermissionContext();
  if (!permissionContext || (!permissionContext.hasOperationalAccess && !permissionContext.hasSportsAccess)) {
    return null;
  }

  const campusAccess = await getOperationalCampusAccess();
  if (!campusAccess || campusAccess.campuses.length === 0) return null;

  const campusId =
    filters.campusId && campusAccess.campusIds.includes(filters.campusId)
      ? filters.campusId
      : null;
  if (!campusId) return null;

  const parsedBucket = parseCompetitionBucketId((filters.competitionId ?? "").trim());
  if (!parsedBucket) return null;

  const admin = permissionContext.supabase;
  let competitionLabel = "Competencia";
  const productBucketIds = new Set<string>();

  if (parsedBucket.type === "product") {
    const productStartedAt = Date.now();
    const product = await loadCompetitionProductById(admin, parsedBucket.productId);
    recordPerfStep(perf, "load product", productStartedAt);
    if (!product || !isCompetitionProduct(product)) return null;
    competitionLabel = product.name;
    productBucketIds.add(product.id);
  } else {
    const legacyBucket = getLegacyBucketByKey(parsedBucket.legacyKey);
    if (!legacyBucket) return null;
    competitionLabel = legacyBucket.label;
  }

  const chargesStartedAt = Date.now();
  const chargesPromise = loadChargeRowsForCampus(admin, campusId, parsedBucket);
  const enrollmentsStartedAt = Date.now();
  const enrollmentsPromise = loadActiveEnrollmentsForCampus(admin, campusId);
  const [charges, activeEnrollments] = await Promise.all([
    chargesPromise,
    enrollmentsPromise,
  ]);
  recordPerfStep(perf, "load charges", chargesStartedAt);
  recordPerfStep(perf, "load active enrollments", enrollmentsStartedAt);

  const allocationsStartedAt = Date.now();
  const allocationTotals = await loadAllocationTotals(
    admin,
    charges.map((charge) => charge.id),
  );
  recordPerfStep(perf, "load allocation totals", allocationsStartedAt);

  return {
    admin,
    campusAccess,
    campusId,
    competitionId: (filters.competitionId ?? "").trim(),
    competitionLabel,
    parsedBucket,
    charges,
    activeEnrollments,
    allocationTotals,
    productBucketIds,
    perf,
  };
}

export async function getCompetitionSignupDashboardData(filters?: {
  campusId?: string | null;
  competitionId?: string | null;
  perf?: boolean;
}): Promise<CompetitionSignupDashboardData | null> {
  const perf = startPerf(Boolean(filters?.perf));
  const baseData = await getCompetitionSignupBaseData({ perf });
  if (!baseData) return null;

  const {
    campusAccess,
    charges,
    activeEnrollments,
    allocationTotals,
    competitionOptions,
    productBucketIds,
  } = baseData;

  const selectedCampusId =
    filters?.campusId && campusAccess.campusIds.includes(filters.campusId)
      ? filters.campusId
      : (campusAccess.defaultCampusId ?? campusAccess.campuses[0]?.id ?? "");

  if (!selectedCampusId) return null;

  const emptyDashboard: CompetitionSignupDashboardData = {
    campuses: campusAccess.campuses.map((campus) => ({ id: campus.id, name: campus.name })),
    selectedCampusId,
    competitionOptions,
    campusBoards: campusAccess.campuses.map((campus) => ({
      campusId: campus.id,
      campusName: campus.name,
      competitions: buildEmptyCompetitions(competitionOptions),
    })),
    loadError: null,
    perf: perf.enabled
      ? {
          totalMs: Date.now() - perf.startedAt,
          steps: perf.steps,
        }
      : undefined,
  };

  try {
    const chargesByCampusStartedAt = Date.now();
    const chargesByCampus = new Map<string, ChargeRow[]>();
    for (const charge of charges) {
      const campusId = charge.enrollments?.campus_id;
      if (!campusId) continue;
      const current = chargesByCampus.get(campusId) ?? [];
      current.push(charge);
      chargesByCampus.set(campusId, current);
    }
    recordPerfStep(perf, "group charges by campus", chargesByCampusStartedAt);

    const activeEnrollmentsByCampusStartedAt = Date.now();
    const activeEnrollmentsByCampus = new Map<string, ActiveEnrollmentRow[]>();
    for (const enrollment of activeEnrollments) {
      const current = activeEnrollmentsByCampus.get(enrollment.campus_id) ?? [];
      current.push(enrollment);
      activeEnrollmentsByCampus.set(enrollment.campus_id, current);
    }
    recordPerfStep(perf, "group active enrollments by campus", activeEnrollmentsByCampusStartedAt);

    const campusBoardsStartedAt = Date.now();
    const campusBoards = campusAccess.campuses.map((campus) =>
      buildCampusBoard(
        campus.id,
        campus.name,
        chargesByCampus.get(campus.id) ?? [],
        activeEnrollmentsByCampus.get(campus.id) ?? [],
        allocationTotals,
        competitionOptions,
        productBucketIds,
      ),
    );
    recordPerfStep(perf, "build campus boards", campusBoardsStartedAt);

    return {
      ...emptyDashboard,
      competitionOptions,
      campusBoards,
      perf: perf.enabled
        ? {
            totalMs: Date.now() - perf.startedAt,
            steps: perf.steps,
          }
        : undefined,
    };
  } catch (error) {
    console.error("sports-signups query failed", error);
    return {
      ...emptyDashboard,
      loadError: "No se pudieron cargar las inscripciones de torneos.",
      perf: perf.enabled
        ? {
            totalMs: Date.now() - perf.startedAt,
            steps: perf.steps,
          }
        : undefined,
    };
  }
}

export async function getCompetitionSignupCategoryDetailData(filters: {
  campusId?: string | null;
  competitionId?: string | null;
  birthYear?: string | null;
  perf?: boolean;
}): Promise<CompetitionSignupCategoryDetailData | null> {
  const baseData = await getCompetitionSignupDetailBaseData({
    campusId: filters.campusId,
    competitionId: filters.competitionId,
    perf: filters.perf,
  });
  if (!baseData) return null;

  const {
    admin,
    campusAccess,
    campusId,
    competitionId,
    competitionLabel,
    charges,
    activeEnrollments,
    allocationTotals,
    productBucketIds,
    perf,
  } = baseData;

  const birthYearValue = (filters.birthYear ?? "").trim();
  const birthYear =
    birthYearValue === "sin_categoria"
      ? null
      : /^\d{4}$/.test(birthYearValue)
        ? Number.parseInt(birthYearValue, 10)
        : null;
  const categoryLabel = birthYear === null ? "Sin categoria" : `CAT ${birthYear}`;

  const matchingCharges = charges.filter((charge) => {
    if (charge.enrollments?.campus_id !== campusId) return false;
    if ((allocationTotals.get(charge.id) ?? 0) + 0.009 < charge.amount) return false;
    return getCompetitionBucketId(charge, productBucketIds) === competitionId;
  });

  const confirmedChargeByEnrollment = new Map<string, ChargeRow>();
  for (const charge of matchingCharges) {
    if (!confirmedChargeByEnrollment.has(charge.enrollment_id)) {
      confirmedChargeByEnrollment.set(charge.enrollment_id, charge);
    }
  }

  const filteredEntries = [...confirmedChargeByEnrollment.values()].filter((charge) => {
    const rowBirthYear = getBirthYear(charge.enrollments?.players?.birth_date);
    return rowBirthYear === birthYear;
  });

  const categoryActiveEnrollments = activeEnrollments.filter((enrollment) => {
    if (enrollment.campus_id !== campusId) return false;
    return getBirthYear(enrollment.players?.birth_date) === birthYear;
  });

  const levelResolutionStartedAt = Date.now();
  const enrollmentIds = Array.from(
    new Set([
      ...filteredEntries.map((charge) => charge.enrollment_id),
      ...categoryActiveEnrollments.map((enrollment) => enrollment.id),
    ]),
  );
  const teamByEnrollment = await loadPrimaryTeamAssignments(admin, enrollmentIds);
  recordPerfStep(perf, "load team assignments", levelResolutionStartedAt);

  const groupingStartedAt = Date.now();
  const paidLevelMap = new Map<string, CompetitionSignupDetailLevelGroup>();

  for (const charge of filteredEntries) {
    const enrollment = charge.enrollments;
    if (!enrollment) continue;

    const team = teamByEnrollment.get(enrollment.id) ?? null;
    const level = normalizeLevel(team?.level ?? enrollment.players?.level);
    const playerName = enrollment.players
      ? `${enrollment.players.first_name} ${enrollment.players.last_name}`.trim()
      : "Jugador";

    const group =
      paidLevelMap.get(level) ??
      {
        level,
        playerCount: 0,
        players: [],
      };

    group.playerCount += 1;
    group.players.push({
      enrollmentId: enrollment.id,
      playerId: enrollment.player_id,
      playerName,
      level,
      teamName: team?.name?.trim() || "-",
    });

    paidLevelMap.set(level, group);
  }

  const paidEnrollmentIds = new Set(filteredEntries.map((charge) => charge.enrollment_id));
  const unpaidLevelMap = new Map<string, CompetitionSignupDetailLevelGroup>();

  for (const enrollment of categoryActiveEnrollments) {
    if (paidEnrollmentIds.has(enrollment.id)) continue;

    const team = teamByEnrollment.get(enrollment.id) ?? null;
    const level = normalizeLevel(team?.level ?? enrollment.players?.level);
    const playerName = enrollment.players
      ? `${enrollment.players.first_name} ${enrollment.players.last_name}`.trim()
      : "Jugador";

    const group =
      unpaidLevelMap.get(level) ??
      {
        level,
        playerCount: 0,
        players: [],
      };

    group.playerCount += 1;
    group.players.push({
      enrollmentId: enrollment.id,
      playerId: enrollment.player_id,
      playerName,
      level,
      teamName: team?.name?.trim() || "-",
    });

    unpaidLevelMap.set(level, group);
  }
  const campusName =
    campusAccess.campuses.find((campus) => campus.id === campusId)?.name ?? "Campus";
  recordPerfStep(perf, "build level groups", groupingStartedAt);

  return {
    competitionId,
    competitionLabel,
    campusId,
    campusName,
    birthYear,
    categoryLabel,
    totalConfirmed: filteredEntries.length,
    totalUnpaid: categoryActiveEnrollments.length - filteredEntries.length,
    paidLevelGroups: sortLevelGroups(
      Array.from(paidLevelMap.values()).map((group) => ({
        ...group,
        players: sortPlayerRows(group.players),
      })),
    ),
    unpaidLevelGroups: sortLevelGroups(
      Array.from(unpaidLevelMap.values()).map((group) => ({
        ...group,
        players: sortPlayerRows(group.players),
      })),
    ),
    perf: perf.enabled
      ? {
          totalMs: Date.now() - perf.startedAt,
          steps: perf.steps,
        }
      : undefined,
  };
}

export async function getCompetitionSignupExportData(filters?: {
  campusId?: string | null;
  competitionId?: string | null;
}): Promise<CompetitionSignupExportData | null> {
  const baseData = await getCompetitionSignupDetailBaseData({
    campusId: filters?.campusId,
    competitionId: filters?.competitionId,
  });
  if (!baseData) return null;

  const { admin, campusAccess, campusId, competitionId, competitionLabel, charges, allocationTotals, productBucketIds } = baseData;
  const campusName =
    campusAccess.campuses.find((campus) => campus.id === campusId)?.name ?? "Campus";

  const matchingCharges = charges.filter((charge) => {
    if (charge.enrollments?.campus_id !== campusId) return false;
    if ((allocationTotals.get(charge.id) ?? 0) + 0.009 < charge.amount) return false;
    return getCompetitionBucketId(charge, productBucketIds) === competitionId;
  });

  const confirmedChargeByEnrollment = new Map<string, ChargeRow>();
  for (const charge of matchingCharges) {
    if (!confirmedChargeByEnrollment.has(charge.enrollment_id)) {
      confirmedChargeByEnrollment.set(charge.enrollment_id, charge);
    }
  }

  const enrollmentIds = [...confirmedChargeByEnrollment.keys()];
  const teamByEnrollment = await loadPrimaryTeamAssignments(admin, enrollmentIds);

  const rows = [...confirmedChargeByEnrollment.values()]
    .map((charge) => {
      const enrollment = charge.enrollments;
      const team = enrollment ? (teamByEnrollment.get(enrollment.id) ?? null) : null;
      const playerName = enrollment?.players
        ? `${enrollment.players.first_name} ${enrollment.players.last_name}`.trim()
        : "Jugador";

      return {
        playerName,
        birthYear: getBirthYear(enrollment?.players?.birth_date),
        campusName,
        level: normalizeLevel(team?.level ?? enrollment?.players?.level),
        teamName: team?.name?.trim() || "-",
      };
    })
    .sort((a, b) => {
      const yearA = a.birthYear ?? 0;
      const yearB = b.birthYear ?? 0;
      if (yearA !== yearB) return yearB - yearA;
      const levelDiff = compareLevels(a.level, b.level);
      if (levelDiff !== 0) return levelDiff;
      return a.playerName.localeCompare(b.playerName, "es-MX");
    });

  return {
    competitionId,
    competitionLabel,
    campusId,
    campusName,
    rows,
  };
}
