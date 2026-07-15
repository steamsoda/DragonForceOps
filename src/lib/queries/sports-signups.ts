import type { SupabaseClient } from "@supabase/supabase-js";
import { getOperationalCampusAccess } from "@/lib/auth/campuses";
import { getPermissionContext } from "@/lib/auth/permissions";
import {
  resolveEntitledProductIds,
  type ProductBundleEntitlementInput,
} from "@/lib/products/bundle-entitlements";
import { createAdminClient } from "@/lib/supabase/admin";
import { BASE_TEAM_LEVELS } from "@/lib/teams/shared";

type SupabaseQueryClient = SupabaseClient;

type CompetitionProductRow = {
  id: string;
  name: string;
  is_active?: boolean;
  charge_types: {
    code: string | null;
  } | null;
};

type ProductBundleEntitlementRow = {
  source_product_id: string;
  target_product_id: string;
  gender: string | null;
  is_active: boolean;
};

type SignupTournamentRow = {
  id: string;
  name: string;
  campus_id: string;
  product_id: string;
  start_date: string | null;
  end_date: string | null;
  signup_deadline: string | null;
  is_active: boolean;
  products: {
    id: string;
    name: string | null;
    is_active: boolean | null;
    charge_types: {
      code: string | null;
    } | null;
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
  created_at: string;
  payments: {
    paid_at: string | null;
    created_at: string | null;
  } | null;
};

type AllocationSummary = {
  total: number;
  paidAt: string | null;
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
  tournamentId: string | null;
  campusId: string | null;
  startDate: string | null;
  endDate: string | null;
  signupDeadline: string | null;
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
  tournamentId: string | null;
  productId: string | null;
  startDate: string | null;
  endDate: string | null;
  signupDeadline: string | null;
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
  paidDateFilter: CompetitionSignupPaidDateFilter;
  competitionOptions: CompetitionSignupBucket[];
  configurableProducts: Array<{ id: string; name: string }>;
  activeTournamentSettings: Array<{
    id: string;
    campusId: string;
    productId: string;
    name: string;
    startDate: string | null;
    endDate: string | null;
    signupDeadline: string | null;
  }>;
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
  paidDateFilter: CompetitionSignupPaidDateFilter;
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

export type CompetitionSignupPaidDateFilter = {
  from: string | null;
  to: string | null;
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

function getMonterreyDateString() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  return year && month && day ? `${year}-${month}-${day}` : new Date().toISOString().slice(0, 10);
}

function isDateOnly(value: string | null | undefined) {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function normalizePaidDateFilter(filters?: {
  paidFrom?: string | null;
  paidTo?: string | null;
}): CompetitionSignupPaidDateFilter {
  const from = isDateOnly(filters?.paidFrom) ? filters?.paidFrom ?? null : null;
  const to = isDateOnly(filters?.paidTo) ? filters?.paidTo ?? null : null;

  if (from && to && from > to) {
    return { from: to, to: from };
  }

  return { from, to };
}

function hasPaidDateFilter(filter: CompetitionSignupPaidDateFilter) {
  return Boolean(filter.from || filter.to);
}

function getMonterreyDateKey(value: string | null | undefined) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(parsed);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  return year && month && day ? `${year}-${month}-${day}` : null;
}

function isPaidDateInFilter(paidAt: string | null, filter: CompetitionSignupPaidDateFilter) {
  if (!hasPaidDateFilter(filter)) return true;
  const paidDate = getMonterreyDateKey(paidAt);
  if (!paidDate) return false;
  if (filter.from && paidDate < filter.from) return false;
  if (filter.to && paidDate > filter.to) return false;
  return true;
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

function getCompetitionBucketIds(
  charge: Pick<ChargeRow, "product_id" | "products" | "description" | "enrollments">,
  productBucketIds: Set<string>,
  bundleEntitlements: ProductBundleEntitlementInput[],
) {
  if (charge.product_id) {
    const productIds = resolveEntitledProductIds({
      sourceProductId: charge.product_id,
      gender: charge.enrollments?.players?.gender ?? null,
      entitlements: bundleEntitlements,
    }).filter((productId) => productBucketIds.has(productId));

    if (productIds.length > 0) {
      return productIds.map((productId) => `product:${productId}`);
    }
  }

  const legacyBucket = detectLegacyBucket(charge.products?.name ?? null, charge.description);
  return legacyBucket ? [`legacy:${legacyBucket.key}`] : [];
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

async function loadCompetitionProducts(admin: SupabaseQueryClient) {
  const pageSize = 1000;
  const rows: CompetitionProductRow[] = [];

  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1;
    const { data, error } = await admin
      .from("products")
      .select("id, name, is_active, charge_types(code)")
      .eq("is_active", true)
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

async function loadProductBundleEntitlements(admin: SupabaseQueryClient) {
  const { data, error } = await admin
    .from("product_bundle_entitlements")
    .select("source_product_id, target_product_id, gender, is_active")
    .eq("is_active", true)
    .returns<ProductBundleEntitlementRow[]>();

  if (error) throw error;
  return (data ?? []).map<ProductBundleEntitlementInput>((row) => ({
    sourceProductId: row.source_product_id,
    targetProductId: row.target_product_id,
    gender: row.gender,
    isActive: row.is_active,
  }));
}

async function loadSignupTournaments(admin: SupabaseQueryClient, campusIds: string[]) {
  if (campusIds.length === 0) return [];
  const today = getMonterreyDateString();

  const { data, error } = await admin
    .from("tournaments")
    .select("id, name, campus_id, product_id, start_date, end_date, signup_deadline, is_active, products(id, name, is_active, charge_types(code))")
    .in("campus_id", campusIds)
    .eq("is_active", true)
    .not("product_id", "is", null)
    .order("start_date", { ascending: true, nullsFirst: false })
    .order("name", { ascending: true })
    .returns<SignupTournamentRow[]>();

  if (error) throw error;

  return (data ?? []).filter(
    (row) =>
      row.campus_id &&
      row.product_id &&
      (row.end_date === null || row.end_date >= today) &&
      row.products?.is_active === true &&
      isCompetitionProduct(row.products),
  );
}

async function loadChargeRows(admin: SupabaseQueryClient, campusIds: string[]) {
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
  admin: SupabaseQueryClient,
  campusIds: string[],
  relevantProductIds: string[],
) {
  const pageSize = 1000;
  const rowsById = new Map<string, ChargeRow>();

  if (relevantProductIds.length > 0) {
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
        .in("product_id", relevantProductIds)
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
  admin: SupabaseQueryClient,
  campusId: string,
  filter?: ParsedCompetitionBucket | null,
  relatedSourceProductIds: string[] = [],
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
      const productIds = Array.from(new Set([filter.productId, ...relatedSourceProductIds]));
      query = query.in("product_id", productIds);
    }

    const { data, error } = await query.returns<ChargeRow[]>();
    if (error) throw error;

    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < pageSize) break;
  }

  return rows;
}

async function loadActiveEnrollments(admin: SupabaseQueryClient, campusIds: string[]) {
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

async function loadActiveEnrollmentsForCampus(admin: SupabaseQueryClient, campusId: string) {
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

async function loadAllocationSummaries(admin: SupabaseQueryClient, chargeIds: string[]) {
  const chunkSize = 500;
  const allocationSummaries = new Map<string, AllocationSummary>();

  for (let index = 0; index < chargeIds.length; index += chunkSize) {
    const chunk = chargeIds.slice(index, index + chunkSize);
    const { data, error } = await admin
      .from("payment_allocations")
      .select("charge_id, amount, created_at, payments(paid_at, created_at)")
      .in("charge_id", chunk)
      .returns<AllocationRow[]>();

    if (error) throw error;

    for (const allocation of data ?? []) {
      const current = allocationSummaries.get(allocation.charge_id) ?? { total: 0, paidAt: null };
      const paidAt = allocation.payments?.paid_at ?? allocation.payments?.created_at ?? allocation.created_at;
      allocationSummaries.set(allocation.charge_id, {
        total: roundMoney(current.total + allocation.amount),
        paidAt: !current.paidAt || paidAt > current.paidAt ? paidAt : current.paidAt,
      });
    }
  }

  return allocationSummaries;
}

async function loadPrimaryTeamAssignments(admin: SupabaseQueryClient, enrollmentIds: string[]) {
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
  tournaments: SignupTournamentRow[],
): CompetitionSignupBucket[] {
  const buckets = new Map<string, CompetitionSignupBucket>();
  const productNameById = new Map(products.map((product) => [product.id, product.name]));

  for (const tournament of tournaments) {
    const productName = productNameById.get(tournament.product_id) ?? tournament.products?.name ?? tournament.name;
    buckets.set(`${tournament.campus_id}:product:${tournament.product_id}`, {
      id: `product:${tournament.product_id}`,
      label: tournament.name || productName,
      productId: tournament.product_id,
      legacyKey: null,
      tournamentId: tournament.id,
      campusId: tournament.campus_id,
      startDate: tournament.start_date,
      endDate: tournament.end_date,
      signupDeadline: tournament.signup_deadline,
    });
  }

  return [...buckets.values()].sort((a, b) => {
    if (a.startDate && b.startDate && a.startDate !== b.startDate) return a.startDate.localeCompare(b.startDate);
    if (a.startDate && !b.startDate) return -1;
    if (!a.startDate && b.startDate) return 1;
    return a.label.localeCompare(b.label, "es-MX");
  });
}

function buildEmptyCompetitions(buckets: CompetitionSignupBucket[]): CompetitionSignupCompetitionGroup[] {
  return buckets.map((bucket) => ({
    id: bucket.id,
    label: bucket.label,
    tournamentId: bucket.tournamentId,
    productId: bucket.productId,
    startDate: bucket.startDate,
    endDate: bucket.endDate,
    signupDeadline: bucket.signupDeadline,
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
  allocationSummaries: Map<string, AllocationSummary>,
  paidDateFilter: CompetitionSignupPaidDateFilter,
  buckets: CompetitionSignupBucket[],
  productBucketIds: Set<string>,
  bundleEntitlements: ProductBundleEntitlementInput[],
): CompetitionSignupCampusBoard {
  const competitions = buckets
    .filter((bucket) => !bucket.campusId || bucket.campusId === campusId)
    .map<CompetitionSignupCompetitionGroup>((bucket) => {
    const confirmedPlayers = new Map<string, CompetitionSignupPlayerRow>();

    for (const charge of campusCharges) {
      const allocation = allocationSummaries.get(charge.id);
      if (!allocation || allocation.total + 0.009 < charge.amount) continue;
      if (!isPaidDateInFilter(allocation.paidAt, paidDateFilter)) continue;

      const bucketIds = getCompetitionBucketIds(charge, productBucketIds, bundleEntitlements);
      if (!bucketIds.includes(bucket.id)) continue;

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
      tournamentId: bucket.tournamentId,
      productId: bucket.productId,
      startDate: bucket.startDate,
      endDate: bucket.endDate,
      signupDeadline: bucket.signupDeadline,
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

  const admin = createAdminClient();
  const campusIds = campusAccess.campusIds;
  const productsStartedAt = Date.now();
  const [products, tournaments, bundleEntitlements] = await Promise.all([
    loadCompetitionProducts(admin),
    loadSignupTournaments(admin, campusIds),
    loadProductBundleEntitlements(admin),
  ]);
  if (perf) {
    recordPerfStep(perf, "load products and tournaments", productsStartedAt);
  }

  const competitionProductIds = Array.from(new Set(tournaments.map((tournament) => tournament.product_id)));
  const competitionProductIdSet = new Set(competitionProductIds);
  const allBundleSourceProductIds = Array.from(new Set(bundleEntitlements.map((row) => row.sourceProductId)));
  const bundleSourceProductIds = bundleEntitlements
    .filter((row) => competitionProductIdSet.has(row.targetProductId))
    .map((row) => row.sourceProductId);
  const relevantProductIds = Array.from(new Set([...competitionProductIds, ...bundleSourceProductIds]));
  const chargesStartedAt = Date.now();
  const chargesPromise = loadBoardCompetitionChargeRows(admin, campusIds, relevantProductIds);
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
  const allocationSummaries = await loadAllocationSummaries(
    admin,
    charges.map((charge) => charge.id),
  );
  if (perf) {
    recordPerfStep(perf, "load allocation summaries", allocationsStartedAt);
  }

  const competitionOptions = buildCompetitionBuckets(products, tournaments);
  const productBucketIds = new Set(
    competitionOptions.flatMap((option) => (option.productId ? [option.productId] : [])),
  );

  return {
    admin,
    campusAccess,
    charges,
    activeEnrollments,
    allocationSummaries,
    competitionOptions,
    productBucketIds,
    bundleEntitlements,
    configurableProducts: products
      .filter((product) => !allBundleSourceProductIds.includes(product.id))
      .map((product) => ({ id: product.id, name: product.name })),
    activeTournamentSettings: tournaments.map((tournament) => ({
      id: tournament.id,
      campusId: tournament.campus_id,
      productId: tournament.product_id,
      name: tournament.name,
      startDate: tournament.start_date,
      endDate: tournament.end_date,
      signupDeadline: tournament.signup_deadline,
    })),
  };
}

async function loadCompetitionProductById(admin: SupabaseQueryClient, productId: string) {
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
  paidFrom?: string | null;
  paidTo?: string | null;
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

  const admin = createAdminClient();
  let competitionLabel = "Competencia";
  const productBucketIds = new Set<string>();
  let bundleEntitlements: ProductBundleEntitlementInput[] = [];
  let relatedSourceProductIds: string[] = [];

  if (parsedBucket.type === "product") {
    const productStartedAt = Date.now();
    const [product, entitlementRows] = await Promise.all([
      loadCompetitionProductById(admin, parsedBucket.productId),
      loadProductBundleEntitlements(admin),
    ]);
    recordPerfStep(perf, "load product", productStartedAt);
    if (!product || !isCompetitionProduct(product)) return null;
    competitionLabel = product.name;
    productBucketIds.add(product.id);
    bundleEntitlements = entitlementRows;
    relatedSourceProductIds = entitlementRows
      .filter((row) => row.targetProductId === product.id)
      .map((row) => row.sourceProductId);
  } else {
    const legacyBucket = getLegacyBucketByKey(parsedBucket.legacyKey);
    if (!legacyBucket) return null;
    competitionLabel = legacyBucket.label;
  }

  const chargesStartedAt = Date.now();
  const chargesPromise = loadChargeRowsForCampus(admin, campusId, parsedBucket, relatedSourceProductIds);
  const enrollmentsStartedAt = Date.now();
  const enrollmentsPromise = loadActiveEnrollmentsForCampus(admin, campusId);
  const [charges, activeEnrollments] = await Promise.all([
    chargesPromise,
    enrollmentsPromise,
  ]);
  recordPerfStep(perf, "load charges", chargesStartedAt);
  recordPerfStep(perf, "load active enrollments", enrollmentsStartedAt);

  const allocationsStartedAt = Date.now();
  const allocationSummaries = await loadAllocationSummaries(
    admin,
    charges.map((charge) => charge.id),
  );
  recordPerfStep(perf, "load allocation summaries", allocationsStartedAt);

  return {
    admin,
    campusAccess,
    campusId,
    competitionId: (filters.competitionId ?? "").trim(),
    competitionLabel,
    parsedBucket,
    charges,
    activeEnrollments,
    allocationSummaries,
    paidDateFilter: normalizePaidDateFilter(filters),
    productBucketIds,
    bundleEntitlements,
    perf,
  };
}

export async function getCompetitionSignupDashboardData(filters?: {
  campusId?: string | null;
  competitionId?: string | null;
  paidFrom?: string | null;
  paidTo?: string | null;
  perf?: boolean;
}): Promise<CompetitionSignupDashboardData | null> {
  const perf = startPerf(Boolean(filters?.perf));
  const paidDateFilter = normalizePaidDateFilter(filters);
  const baseData = await getCompetitionSignupBaseData({ perf });
  if (!baseData) return null;

  const {
    campusAccess,
    charges,
    activeEnrollments,
    allocationSummaries,
    competitionOptions,
    productBucketIds,
    bundleEntitlements,
    configurableProducts,
    activeTournamentSettings,
  } = baseData;

  const selectedCampusId =
    filters?.campusId && campusAccess.campusIds.includes(filters.campusId)
      ? filters.campusId
      : (campusAccess.defaultCampusId ?? campusAccess.campuses[0]?.id ?? "");

  if (!selectedCampusId) return null;

  const emptyDashboard: CompetitionSignupDashboardData = {
    campuses: campusAccess.campuses.map((campus) => ({ id: campus.id, name: campus.name })),
    selectedCampusId,
    paidDateFilter,
    competitionOptions,
    configurableProducts,
    activeTournamentSettings,
    campusBoards: campusAccess.campuses.map((campus) => ({
      campusId: campus.id,
      campusName: campus.name,
      competitions: buildEmptyCompetitions(competitionOptions.filter((bucket) => !bucket.campusId || bucket.campusId === campus.id)),
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
        allocationSummaries,
        paidDateFilter,
        competitionOptions,
        productBucketIds,
        bundleEntitlements,
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
  paidFrom?: string | null;
  paidTo?: string | null;
  perf?: boolean;
}): Promise<CompetitionSignupCategoryDetailData | null> {
  const baseData = await getCompetitionSignupDetailBaseData({
    campusId: filters.campusId,
    competitionId: filters.competitionId,
    paidFrom: filters.paidFrom,
    paidTo: filters.paidTo,
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
    allocationSummaries,
    paidDateFilter,
    productBucketIds,
    bundleEntitlements,
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

  const matchingChargesAllDates = charges.filter((charge) => {
    if (charge.enrollments?.campus_id !== campusId) return false;
    const allocation = allocationSummaries.get(charge.id);
    if (!allocation || allocation.total + 0.009 < charge.amount) return false;
    return getCompetitionBucketIds(charge, productBucketIds, bundleEntitlements).includes(competitionId);
  });
  const matchingCharges = matchingChargesAllDates.filter((charge) =>
    isPaidDateInFilter(allocationSummaries.get(charge.id)?.paidAt ?? null, paidDateFilter),
  );

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

  const paidEnrollmentIdsAllDates = new Set(
    matchingChargesAllDates
      .filter((charge) => getBirthYear(charge.enrollments?.players?.birth_date) === birthYear)
      .map((charge) => charge.enrollment_id),
  );
  const unpaidLevelMap = new Map<string, CompetitionSignupDetailLevelGroup>();

  for (const enrollment of categoryActiveEnrollments) {
    if (paidEnrollmentIdsAllDates.has(enrollment.id)) continue;

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
    paidDateFilter,
    birthYear,
    categoryLabel,
    totalConfirmed: filteredEntries.length,
    totalUnpaid: categoryActiveEnrollments.length - paidEnrollmentIdsAllDates.size,
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
  paidFrom?: string | null;
  paidTo?: string | null;
}): Promise<CompetitionSignupExportData | null> {
  const baseData = await getCompetitionSignupDetailBaseData({
    campusId: filters?.campusId,
    competitionId: filters?.competitionId,
    paidFrom: filters?.paidFrom,
    paidTo: filters?.paidTo,
  });
  if (!baseData) return null;

  const {
    admin,
    campusAccess,
    campusId,
    competitionId,
    competitionLabel,
    charges,
    allocationSummaries,
    paidDateFilter,
    productBucketIds,
    bundleEntitlements,
  } = baseData;
  const campusName =
    campusAccess.campuses.find((campus) => campus.id === campusId)?.name ?? "Campus";

  const matchingCharges = charges.filter((charge) => {
    if (charge.enrollments?.campus_id !== campusId) return false;
    const allocation = allocationSummaries.get(charge.id);
    if (!allocation || allocation.total + 0.009 < charge.amount) return false;
    if (!isPaidDateInFilter(allocation.paidAt, paidDateFilter)) return false;
    return getCompetitionBucketIds(charge, productBucketIds, bundleEntitlements).includes(competitionId);
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
