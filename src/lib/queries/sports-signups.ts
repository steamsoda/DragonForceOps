import type { SupabaseClient } from "@supabase/supabase-js";
import { getOperationalCampusAccess } from "@/lib/auth/campuses";
import { getPermissionContext } from "@/lib/auth/permissions";
import {
  resolveEntitledProductIds,
  type ProductBundleEntitlementInput,
} from "@/lib/products/bundle-entitlements";
import type { ProductPricingRuleInput } from "@/lib/products/pricing-rules";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  formatTrainingGroupBirthYearRange,
  formatTrainingGroupDisplayName,
  TRAINING_GROUP_PROGRAM_LABELS,
} from "@/lib/training-groups/shared";

type SupabaseQueryClient = SupabaseClient;

type CompetitionProductRow = {
  id: string;
  name: string;
  is_active?: boolean;
  requires_pricing_rule_match?: boolean | null;
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
    requires_pricing_rule_match: boolean | null;
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
  } | null;
};

type TrainingGroupAssignmentRow = {
  enrollment_id: string;
  training_group_id: string;
  training_groups: {
    id: string;
    name: string | null;
    program: string | null;
    gender: string | null;
    birth_year_min: number | null;
    birth_year_max: number | null;
    status: string | null;
  } | null;
};

type ProductRestrictionRow = {
  product_id: string;
  training_group_id: string;
};

type ProductPricingRuleRow = {
  product_id: string;
  amount: number;
  starts_on: string;
  ends_on: string | null;
  campus_id: string | null;
  training_program: string | null;
  gender: string | null;
  birth_year_min: number | null;
  birth_year_max: number | null;
  required_paid_product_id: string | null;
  priority: number;
};

type TrainingGroupSummary = {
  id: string;
  name: string;
  label: string;
  subtitle: string;
  program: string | null;
  birthYearMin: number | null;
  birthYearMax: number | null;
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
  requiresPricingRuleMatch: boolean;
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
  registrationSource: "direct" | "bundle";
  trainingGroupId: string | null;
  trainingGroupLabel: string;
  trainingGroupSubtitle: string;
  trainingProgram: string | null;
};

export type CompetitionPaidCallupPlayer = CompetitionSignupPlayerRow;

export type CompetitionSignupCategoryGroup = {
  key: string;
  label: string;
  birthYear: number | null;
  confirmedCount: number;
  activeCount: number;
  players: CompetitionSignupPlayerRow[];
};

export type CompetitionSignupTrainingGroup = {
  key: string;
  trainingGroupId: string | null;
  label: string;
  subtitle: string;
  program: string | null;
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
  directConfirmedCount: number;
  bundleConfirmedCount: number;
  totalActive: number;
  availablePrograms: string[];
  eligibilityReviewPlayers: CompetitionSignupPlayerRow[];
  categories: CompetitionSignupCategoryGroup[];
  trainingGroups: CompetitionSignupTrainingGroup[];
};

export type CompetitionSignupCampusBoard = {
  campusId: string;
  campusName: string;
  competitions: CompetitionSignupCompetitionGroup[];
};

export type CompetitionSignupDashboardData = {
  campuses: Array<{ id: string; name: string }>;
  selectedCampusId: string;
  selectedProgram: string | null;
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
  trainingGroupId: string | null;
  trainingGroupLabel: string;
  trainingGroupSubtitle: string;
};

export type CompetitionSignupCategoryDetailData = {
  competitionId: string;
  competitionLabel: string;
  campusId: string;
  campusName: string;
  paidDateFilter: CompetitionSignupPaidDateFilter;
  viewMode: "category" | "group";
  birthYear: number | null;
  filterLabel: string;
  totalConfirmed: number;
  totalUnpaid: number;
  paidPlayers: CompetitionSignupDetailPlayerRow[];
  unpaidPlayers: CompetitionSignupDetailPlayerRow[];
  perf?: {
    totalMs: number;
    steps: Array<{ label: string; durationMs: number }>;
  };
};

export type CompetitionSignupExportRow = {
  playerName: string;
  birthYear: number | null;
  campusName: string;
  trainingGroupName: string;
  programLabel: string;
};

export type CompetitionSignupExportData = {
  competitionId: string;
  competitionLabel: string;
  campusId: string;
  campusName: string;
  selectedProgram: string | null;
  selectedProgramLabel: string;
  paidDateFilter: CompetitionSignupPaidDateFilter;
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

function getTrainingGroupSummary(row: TrainingGroupAssignmentRow["training_groups"]): TrainingGroupSummary | null {
  if (!row?.id || !row.name) return null;
  const birthYearLabel = formatTrainingGroupBirthYearRange(row.birth_year_min, row.birth_year_max);
  const programLabel = TRAINING_GROUP_PROGRAM_LABELS[row.program ?? ""] ?? "Programa sin definir";
  return {
    id: row.id,
    name: row.name,
    label: formatTrainingGroupDisplayName({ name: row.name, program: row.program }),
    subtitle: `${programLabel} | ${birthYearLabel}`,
    program: row.program,
    birthYearMin: row.birth_year_min,
    birthYearMax: row.birth_year_max,
  };
}

function getPlayerTrainingGroup(
  trainingGroupByEnrollment: Map<string, TrainingGroupSummary>,
  enrollmentId: string,
) {
  const group = trainingGroupByEnrollment.get(enrollmentId) ?? null;
  return {
    trainingGroupId: group?.id ?? null,
    trainingGroupLabel: group?.label ?? "Sin grupo",
    trainingGroupSubtitle: group?.subtitle ?? "Sin asignacion activa",
    trainingProgram: group?.program ?? null,
  };
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
      .select("id, name, is_active, requires_pricing_rule_match, charge_types(code)")
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
    .select("id, name, campus_id, product_id, start_date, end_date, signup_deadline, is_active, products(id, name, is_active, requires_pricing_rule_match, charge_types(code))")
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
        "id, enrollment_id, product_id, description, amount, created_at, products(id, name, charge_types(code)), enrollments!inner(id, player_id, campus_id, players(first_name, last_name, birth_date, gender))"
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
          "id, enrollment_id, product_id, description, amount, created_at, products(id, name, charge_types(code)), enrollments!inner(id, player_id, campus_id, players(first_name, last_name, birth_date, gender))"
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
            "id, enrollment_id, product_id, description, amount, created_at, products(id, name, charge_types(code)), enrollments!inner(id, player_id, campus_id, players(first_name, last_name, birth_date, gender))"
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
        "id, enrollment_id, product_id, description, amount, created_at, products(id, name, charge_types(code)), enrollments!inner(id, player_id, campus_id, players(first_name, last_name, birth_date, gender))"
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

async function loadActiveEnrollmentsForCampus(admin: SupabaseQueryClient, campusId: string) {
  const pageSize = 1000;
  const rows: ActiveEnrollmentRow[] = [];

  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1;
    const { data, error } = await admin
      .from("enrollments")
      .select("id, player_id, campus_id, players!inner(first_name, last_name, birth_date, gender)")
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

async function loadActiveTrainingGroupAssignments(admin: SupabaseQueryClient, enrollmentIds: string[]) {
  if (enrollmentIds.length === 0) return new Map<string, TrainingGroupSummary>();

  const chunkSize = 300;
  const groupByEnrollment = new Map<string, TrainingGroupSummary>();

  for (let index = 0; index < enrollmentIds.length; index += chunkSize) {
    const chunk = enrollmentIds.slice(index, index + chunkSize);
    const { data, error } = await admin
      .from("training_group_assignments")
      .select("enrollment_id, training_group_id, training_groups(id, name, program, gender, birth_year_min, birth_year_max, status)")
      .in("enrollment_id", chunk)
      .is("end_date", null)
      .returns<TrainingGroupAssignmentRow[]>();

    if (error) throw error;

    for (const row of data ?? []) {
      const group = getTrainingGroupSummary(row.training_groups);
      if (!group) continue;

      const existing = groupByEnrollment.get(row.enrollment_id);
      if (!existing || group.label.localeCompare(existing.label, "es-MX") < 0) {
        groupByEnrollment.set(row.enrollment_id, group);
      }
    }
  }

  return groupByEnrollment;
}

function buildCompetitionBuckets(
  products: CompetitionProductRow[],
  tournaments: SignupTournamentRow[],
): CompetitionSignupBucket[] {
  const buckets = new Map<string, CompetitionSignupBucket>();
  const productNameById = new Map(products.map((product) => [product.id, product.name]));
  const productById = new Map(products.map((product) => [product.id, product]));

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
      requiresPricingRuleMatch:
        productById.get(tournament.product_id)?.requires_pricing_rule_match === true ||
        tournament.products?.requires_pricing_rule_match === true,
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
    directConfirmedCount: 0,
    bundleConfirmedCount: 0,
    totalActive: 0,
    availablePrograms: [],
    eligibilityReviewPlayers: [],
    categories: [],
    trainingGroups: [],
  }));
}

const SPORTS_SIGNUP_PROGRAMS = new Set(["futbol_para_todos", "selectivo", "little_dragons"]);

function normalizeProgramFilter(value: string | null | undefined) {
  const normalized = (value ?? "").trim();
  return SPORTS_SIGNUP_PROGRAMS.has(normalized) ? normalized : null;
}

function normalizeEligibilityGender(value: string | null | undefined) {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === "femenino") return "female";
  if (normalized === "varonil" || normalized === "masculino") return "male";
  return normalized;
}

function pricingRuleDefinesEligibility(
  rule: ProductPricingRuleInput,
  enrollment: ActiveEnrollmentRow,
  trainingGroup: TrainingGroupSummary | null,
) {
  if (rule.campusId && rule.campusId !== enrollment.campus_id) return false;
  if (rule.trainingProgram && rule.trainingProgram !== trainingGroup?.program) return false;
  const ruleGender = normalizeEligibilityGender(rule.gender);
  const playerGender = normalizeEligibilityGender(enrollment.players?.gender);
  if (ruleGender && ruleGender !== playerGender) return false;
  const birthYear = getBirthYear(enrollment.players?.birth_date);
  if (rule.birthYearMin !== null && (birthYear === null || birthYear < rule.birthYearMin)) return false;
  if (rule.birthYearMax !== null && (birthYear === null || birthYear > rule.birthYearMax)) return false;
  return true;
}

function isEnrollmentEligibleForBucket({
  enrollment,
  bucket,
  trainingGroup,
  restrictionsByProduct,
  pricingRulesByProduct,
}: {
  enrollment: ActiveEnrollmentRow;
  bucket: CompetitionSignupBucket;
  trainingGroup: TrainingGroupSummary | null;
  restrictionsByProduct: Map<string, Set<string>>;
  pricingRulesByProduct: Map<string, ProductPricingRuleInput[]>;
}) {
  if (!bucket.productId) return true;

  const restrictedGroupIds = restrictionsByProduct.get(bucket.productId);
  if (restrictedGroupIds && restrictedGroupIds.size > 0) {
    return Boolean(trainingGroup?.id && restrictedGroupIds.has(trainingGroup.id));
  }

  if (!bucket.requiresPricingRuleMatch) return true;

  return (pricingRulesByProduct.get(bucket.productId) ?? []).some((rule) =>
    pricingRuleDefinesEligibility(rule, enrollment, trainingGroup),
  );
}

async function loadProductRestrictions(admin: SupabaseQueryClient, productIds: string[]) {
  if (productIds.length === 0) return [] as ProductRestrictionRow[];

  const { data, error } = await admin
    .from("product_training_group_restrictions")
    .select("product_id, training_group_id")
    .in("product_id", productIds)
    .returns<ProductRestrictionRow[]>();

  if (error) throw error;
  return data ?? [];
}

async function loadProductPricingRules(admin: SupabaseQueryClient, productIds: string[]) {
  if (productIds.length === 0) return [] as ProductPricingRuleRow[];

  const { data, error } = await admin
    .from("product_pricing_rules")
    .select("product_id, amount, starts_on, ends_on, campus_id, training_program, gender, birth_year_min, birth_year_max, required_paid_product_id, priority")
    .in("product_id", productIds)
    .returns<ProductPricingRuleRow[]>();

  if (error) throw error;
  return data ?? [];
}

function groupProductRestrictions(rows: ProductRestrictionRow[]) {
  const restrictionsByProduct = new Map<string, Set<string>>();
  for (const row of rows) {
    const groupIds = restrictionsByProduct.get(row.product_id) ?? new Set<string>();
    groupIds.add(row.training_group_id);
    restrictionsByProduct.set(row.product_id, groupIds);
  }
  return restrictionsByProduct;
}

function groupProductPricingRules(rows: ProductPricingRuleRow[]) {
  const rulesByProduct = new Map<string, ProductPricingRuleInput[]>();
  for (const row of rows) {
    const rules = rulesByProduct.get(row.product_id) ?? [];
    rules.push({
      amount: Number(row.amount),
      startsOn: row.starts_on,
      endsOn: row.ends_on,
      campusId: row.campus_id,
      trainingProgram: row.training_program,
      gender: row.gender,
      birthYearMin: row.birth_year_min,
      birthYearMax: row.birth_year_max,
      requiredPaidProductId: row.required_paid_product_id,
      priority: row.priority,
    });
    rulesByProduct.set(row.product_id, rules);
  }
  return rulesByProduct;
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
  trainingGroupByEnrollment: Map<string, TrainingGroupSummary>,
  restrictionsByProduct: Map<string, Set<string>>,
  pricingRulesByProduct: Map<string, ProductPricingRuleInput[]>,
  selectedProgram: string | null,
): CompetitionSignupCampusBoard {
  const competitions = buckets
    .filter((bucket) => !bucket.campusId || bucket.campusId === campusId)
    .map<CompetitionSignupCompetitionGroup>((bucket) => {
    const confirmedPlayers = new Map<string, CompetitionSignupPlayerRow>();
    const eligibilityReviewPlayers = new Map<string, CompetitionSignupPlayerRow>();
    const eligibleActiveEnrollmentIds = new Set<string>();
    const availablePrograms = new Set<string>();

    for (const enrollment of campusActiveEnrollments) {
      const group = trainingGroupByEnrollment.get(enrollment.id) ?? null;
      if (!isEnrollmentEligibleForBucket({
        enrollment,
        bucket,
        trainingGroup: group,
        restrictionsByProduct,
        pricingRulesByProduct,
      })) continue;
      if (group?.program) availablePrograms.add(group.program);
      if (selectedProgram && group?.program !== selectedProgram) continue;
      eligibleActiveEnrollmentIds.add(enrollment.id);
    }

    for (const charge of campusCharges) {
      const allocation = allocationSummaries.get(charge.id);
      if (!allocation || allocation.total + 0.009 < charge.amount) continue;
      if (!isPaidDateInFilter(allocation.paidAt, paidDateFilter)) continue;

      const bucketIds = getCompetitionBucketIds(charge, productBucketIds, bundleEntitlements);
      if (!bucketIds.includes(bucket.id)) continue;

      const enrollment = charge.enrollments;
      if (!enrollment) continue;
      const registrationSource = charge.product_id === bucket.productId ? "direct" : "bundle";
      const playerName = enrollment.players
        ? `${enrollment.players.first_name} ${enrollment.players.last_name}`.trim()
        : "Jugador";
      const trainingGroup = trainingGroupByEnrollment.get(enrollment.id) ?? null;
      const playerRow: CompetitionSignupPlayerRow = {
        enrollmentId: enrollment.id,
        playerId: enrollment.player_id,
        playerName,
        birthYear: getBirthYear(enrollment.players?.birth_date),
        campusId: enrollment.campus_id,
        campusName,
        competitionId: bucket.id,
        competitionLabel: bucket.label,
        registrationSource,
        ...getPlayerTrainingGroup(trainingGroupByEnrollment, enrollment.id),
      };

      const isEligible = isEnrollmentEligibleForBucket({
        enrollment,
        bucket,
        trainingGroup,
        restrictionsByProduct,
        pricingRulesByProduct,
      });
      if (selectedProgram && trainingGroup?.program !== selectedProgram) continue;
      if (!isEligible) {
        eligibilityReviewPlayers.set(enrollment.id, playerRow);
        continue;
      }

      const existingPlayer = confirmedPlayers.get(enrollment.id);
      if (existingPlayer) {
        if (existingPlayer.registrationSource === "bundle" && registrationSource === "direct") {
          confirmedPlayers.set(enrollment.id, { ...existingPlayer, registrationSource: "direct" });
        }
        continue;
      }

      confirmedPlayers.set(enrollment.id, playerRow);
    }

    const categoryMap = new Map<string, CompetitionSignupCategoryGroup>();
    const trainingGroupMap = new Map<string, CompetitionSignupTrainingGroup>();

    for (const enrollment of campusActiveEnrollments) {
      if (!eligibleActiveEnrollmentIds.has(enrollment.id)) continue;
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

      const group = trainingGroupByEnrollment.get(enrollment.id) ?? null;
      const trainingGroupKey = group?.id ?? "sin_grupo";
      const trainingGroup = trainingGroupMap.get(trainingGroupKey) ?? {
        key: trainingGroupKey,
        trainingGroupId: group?.id ?? null,
        label: group?.label ?? "Sin grupo",
        subtitle: group?.subtitle ?? "Sin asignacion activa",
        program: group?.program ?? null,
        confirmedCount: 0,
        activeCount: 0,
        players: [],
      };
      trainingGroup.activeCount += 1;
      trainingGroupMap.set(trainingGroupKey, trainingGroup);
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

      const trainingGroupKey = player.trainingGroupId ?? "sin_grupo";
      const trainingGroup = trainingGroupMap.get(trainingGroupKey) ?? {
        key: trainingGroupKey,
        trainingGroupId: player.trainingGroupId,
        label: player.trainingGroupLabel,
        subtitle: player.trainingGroupSubtitle,
        program: player.trainingProgram,
        confirmedCount: 0,
        activeCount: 0,
        players: [],
      };
      trainingGroup.confirmedCount += 1;
      trainingGroup.players.push(player);
      trainingGroupMap.set(trainingGroupKey, trainingGroup);
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
      directConfirmedCount: [...confirmedPlayers.values()].filter((player) => player.registrationSource === "direct").length,
      bundleConfirmedCount: [...confirmedPlayers.values()].filter((player) => player.registrationSource === "bundle").length,
      totalActive: eligibleActiveEnrollmentIds.size,
      availablePrograms: [...availablePrograms].sort((a, b) => a.localeCompare(b, "es-MX")),
      eligibilityReviewPlayers: sortPlayerRows([...eligibilityReviewPlayers.values()]),
      categories: sortCategoryGroups(
        Array.from(categoryMap.values()).map((category) => ({
          ...category,
          players: sortPlayerRows(category.players),
        })),
      ),
      trainingGroups: Array.from(trainingGroupMap.values())
        .map((group) => ({ ...group, players: sortPlayerRows(group.players) }))
        .sort((a, b) => {
          if (a.trainingGroupId === null && b.trainingGroupId === null) return 0;
          if (a.trainingGroupId === null) return 1;
          if (b.trainingGroupId === null) return -1;
          return a.label.localeCompare(b.label, "es-MX");
        }),
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
  const eligibilityStartedAt = Date.now();
  const restrictionsPromise = loadProductRestrictions(admin, competitionProductIds);
  const pricingRulesPromise = loadProductPricingRules(admin, competitionProductIds);
  const [charges, activeEnrollments, restrictionRows, pricingRuleRows] = await Promise.all([
    chargesPromise,
    activeEnrollmentsPromise,
    restrictionsPromise,
    pricingRulesPromise,
  ]);
  if (perf) {
    recordPerfStep(perf, "load competition charges", chargesStartedAt);
    recordPerfStep(perf, "load active enrollments", enrollmentsStartedAt);
    recordPerfStep(perf, "load tournament eligibility", eligibilityStartedAt);
  }

  const trainingGroupsStartedAt = Date.now();
  const trainingGroupByEnrollment = await loadActiveTrainingGroupAssignments(
    admin,
    activeEnrollments.map((enrollment) => enrollment.id),
  );
  if (perf) {
    recordPerfStep(perf, "load training groups", trainingGroupsStartedAt);
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
    trainingGroupByEnrollment,
    allocationSummaries,
    competitionOptions,
    productBucketIds,
    bundleEntitlements,
    restrictionsByProduct: groupProductRestrictions(restrictionRows),
    pricingRulesByProduct: groupProductPricingRules(pricingRuleRows),
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
    .select("id, name, requires_pricing_rule_match, charge_types(code)")
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
  let eligibilityBucket: CompetitionSignupBucket = {
    id: (filters.competitionId ?? "").trim(),
    label: competitionLabel,
    productId: null,
    legacyKey: null,
    tournamentId: null,
    campusId,
    startDate: null,
    endDate: null,
    signupDeadline: null,
    requiresPricingRuleMatch: false,
  };

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
    eligibilityBucket = {
      ...eligibilityBucket,
      label: product.name,
      productId: product.id,
      requiresPricingRuleMatch: product.requires_pricing_rule_match === true,
    };
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

  const trainingGroupsStartedAt = Date.now();
  const trainingGroupByEnrollment = await loadActiveTrainingGroupAssignments(
    admin,
    Array.from(new Set([
      ...activeEnrollments.map((enrollment) => enrollment.id),
      ...charges.map((charge) => charge.enrollment_id),
    ])),
  );
  recordPerfStep(perf, "load training groups", trainingGroupsStartedAt);

  const allocationsStartedAt = Date.now();
  const allocationSummaries = await loadAllocationSummaries(
    admin,
    charges.map((charge) => charge.id),
  );
  recordPerfStep(perf, "load allocation summaries", allocationsStartedAt);

  const [restrictionRows, pricingRuleRows] = eligibilityBucket.productId
    ? await Promise.all([
        loadProductRestrictions(admin, [eligibilityBucket.productId]),
        loadProductPricingRules(admin, [eligibilityBucket.productId]),
      ])
    : [[], []];

  return {
    admin,
    campusAccess,
    campusId,
    competitionId: (filters.competitionId ?? "").trim(),
    competitionLabel,
    parsedBucket,
    charges,
    activeEnrollments,
    trainingGroupByEnrollment,
    allocationSummaries,
    paidDateFilter: normalizePaidDateFilter(filters),
    productBucketIds,
    bundleEntitlements,
    eligibilityBucket,
    restrictionsByProduct: groupProductRestrictions(restrictionRows),
    pricingRulesByProduct: groupProductPricingRules(pricingRuleRows),
    perf,
  };
}

export async function getCompetitionSignupDashboardData(filters?: {
  campusId?: string | null;
  competitionId?: string | null;
  program?: string | null;
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
    trainingGroupByEnrollment,
    allocationSummaries,
    competitionOptions,
    productBucketIds,
    bundleEntitlements,
    restrictionsByProduct,
    pricingRulesByProduct,
    configurableProducts,
    activeTournamentSettings,
  } = baseData;

  const selectedCampusId =
    filters?.campusId && campusAccess.campusIds.includes(filters.campusId)
      ? filters.campusId
      : (campusAccess.defaultCampusId ?? campusAccess.campuses[0]?.id ?? "");

  if (!selectedCampusId) return null;
  const selectedProgram = normalizeProgramFilter(filters?.program);

  const emptyDashboard: CompetitionSignupDashboardData = {
    campuses: campusAccess.campuses.map((campus) => ({ id: campus.id, name: campus.name })),
    selectedCampusId,
    selectedProgram,
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
        trainingGroupByEnrollment,
        restrictionsByProduct,
        pricingRulesByProduct,
        selectedProgram,
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
  trainingGroupId?: string | null;
  program?: string | null;
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
    campusAccess,
    campusId,
    competitionId,
    competitionLabel,
    charges,
    activeEnrollments,
    trainingGroupByEnrollment,
    allocationSummaries,
    paidDateFilter,
    productBucketIds,
    bundleEntitlements,
    eligibilityBucket,
    restrictionsByProduct,
    pricingRulesByProduct,
    perf,
  } = baseData;
  const selectedProgram = normalizeProgramFilter(filters.program);

  const birthYearValue = (filters.birthYear ?? "").trim();
  const birthYear =
    birthYearValue === "sin_categoria"
      ? null
      : /^\d{4}$/.test(birthYearValue)
        ? Number.parseInt(birthYearValue, 10)
        : null;
  const requestedTrainingGroupId = (filters.trainingGroupId ?? "").trim();
  const viewMode = requestedTrainingGroupId ? "group" : "category";
  const selectedTrainingGroup =
    requestedTrainingGroupId === "sin_grupo"
      ? null
      : [...trainingGroupByEnrollment.values()].find((group) => group.id === requestedTrainingGroupId) ?? null;
  if (viewMode === "group" && requestedTrainingGroupId !== "sin_grupo" && !selectedTrainingGroup) return null;
  const filterLabel =
    viewMode === "group"
      ? selectedTrainingGroup?.label ?? "Sin grupo"
      : birthYear === null
        ? "Sin categoria"
        : `CAT ${birthYear}`;

  const matchingChargesAllDates = charges.filter((charge) => {
    if (charge.enrollments?.campus_id !== campusId) return false;
    const allocation = allocationSummaries.get(charge.id);
    if (!allocation || allocation.total + 0.009 < charge.amount) return false;
    if (!getCompetitionBucketIds(charge, productBucketIds, bundleEntitlements).includes(competitionId)) return false;
    const enrollment = charge.enrollments;
    if (!enrollment) return false;
    const trainingGroup = trainingGroupByEnrollment.get(enrollment.id) ?? null;
    if (selectedProgram && trainingGroup?.program !== selectedProgram) return false;
    return isEnrollmentEligibleForBucket({
      enrollment,
      bucket: eligibilityBucket,
      trainingGroup,
      restrictionsByProduct,
      pricingRulesByProduct,
    });
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

  const matchesCurrentFilter = (enrollmentId: string, rowBirthYear: number | null) => {
    if (viewMode === "group") {
      const groupId = trainingGroupByEnrollment.get(enrollmentId)?.id ?? "sin_grupo";
      return groupId === requestedTrainingGroupId;
    }
    return rowBirthYear === birthYear;
  };

  const filteredEntries = [...confirmedChargeByEnrollment.values()].filter((charge) =>
    matchesCurrentFilter(
      charge.enrollment_id,
      getBirthYear(charge.enrollments?.players?.birth_date),
    ),
  );

  const filteredActiveEnrollments = activeEnrollments.filter((enrollment) => {
    if (enrollment.campus_id !== campusId) return false;
    const trainingGroup = trainingGroupByEnrollment.get(enrollment.id) ?? null;
    if (selectedProgram && trainingGroup?.program !== selectedProgram) return false;
    if (!isEnrollmentEligibleForBucket({
      enrollment,
      bucket: eligibilityBucket,
      trainingGroup,
      restrictionsByProduct,
      pricingRulesByProduct,
    })) return false;
    return matchesCurrentFilter(enrollment.id, getBirthYear(enrollment.players?.birth_date));
  });

  const groupingStartedAt = Date.now();
  const paidPlayers = filteredEntries.flatMap<CompetitionSignupDetailPlayerRow>((charge) => {
    const enrollment = charge.enrollments;
    if (!enrollment) return [];
    const playerName = enrollment.players
      ? `${enrollment.players.first_name} ${enrollment.players.last_name}`.trim()
      : "Jugador";
    return [{
      enrollmentId: enrollment.id,
      playerId: enrollment.player_id,
      playerName,
      ...getPlayerTrainingGroup(trainingGroupByEnrollment, enrollment.id),
    }];
  });

  const paidEnrollmentIdsAllDates = new Set(
    matchingChargesAllDates
      .filter((charge) =>
        matchesCurrentFilter(
          charge.enrollment_id,
          getBirthYear(charge.enrollments?.players?.birth_date),
        ),
      )
      .map((charge) => charge.enrollment_id),
  );
  const unpaidPlayers = filteredActiveEnrollments
    .filter((enrollment) => !paidEnrollmentIdsAllDates.has(enrollment.id))
    .map<CompetitionSignupDetailPlayerRow>((enrollment) => ({
      enrollmentId: enrollment.id,
      playerId: enrollment.player_id,
      playerName: enrollment.players
        ? `${enrollment.players.first_name} ${enrollment.players.last_name}`.trim()
        : "Jugador",
      ...getPlayerTrainingGroup(trainingGroupByEnrollment, enrollment.id),
    }));
  const campusName =
    campusAccess.campuses.find((campus) => campus.id === campusId)?.name ?? "Campus";
  recordPerfStep(perf, "build roster lists", groupingStartedAt);

  return {
    competitionId,
    competitionLabel,
    campusId,
    campusName,
    paidDateFilter,
    viewMode,
    birthYear,
    filterLabel,
    totalConfirmed: filteredEntries.length,
    totalUnpaid: unpaidPlayers.length,
    paidPlayers: sortPlayerRows(paidPlayers),
    unpaidPlayers: sortPlayerRows(unpaidPlayers),
    perf: perf.enabled
      ? {
          totalMs: Date.now() - perf.startedAt,
          steps: perf.steps,
        }
      : undefined,
  };
}

export async function getCompetitionPaidCallupPlayers(filters: {
  campusId: string;
  competitionId: string;
}): Promise<CompetitionPaidCallupPlayer[] | null> {
  const baseData = await getCompetitionSignupDetailBaseData({
    campusId: filters.campusId,
    competitionId: filters.competitionId,
  });
  if (!baseData) return null;

  const {
    campusAccess,
    campusId,
    competitionId,
    competitionLabel,
    charges,
    trainingGroupByEnrollment,
    allocationSummaries,
    productBucketIds,
    bundleEntitlements,
  } = baseData;
  const campusName =
    campusAccess.campuses.find((campus) => campus.id === campusId)?.name ?? "Campus";
  const confirmedPlayers = new Map<string, CompetitionPaidCallupPlayer>();

  for (const charge of charges) {
    if (charge.enrollments?.campus_id !== campusId) continue;
    const allocation = allocationSummaries.get(charge.id);
    if (!allocation || allocation.total + 0.009 < charge.amount) continue;
    if (!getCompetitionBucketIds(charge, productBucketIds, bundleEntitlements).includes(competitionId)) {
      continue;
    }

    const enrollment = charge.enrollments;
    if (!enrollment) continue;
    const resolvedSource =
      baseData.parsedBucket.type === "product" && charge.product_id === baseData.parsedBucket.productId
        ? "direct"
        : "bundle";
    const existing = confirmedPlayers.get(enrollment.id);
    if (existing?.registrationSource === "direct") continue;

    confirmedPlayers.set(enrollment.id, {
      enrollmentId: enrollment.id,
      playerId: enrollment.player_id,
      playerName: enrollment.players
        ? `${enrollment.players.first_name} ${enrollment.players.last_name}`.trim()
        : "Jugador",
      birthYear: getBirthYear(enrollment.players?.birth_date),
      campusId,
      campusName,
      competitionId,
      competitionLabel,
      registrationSource: resolvedSource,
      ...getPlayerTrainingGroup(trainingGroupByEnrollment, enrollment.id),
    });
  }

  return [...confirmedPlayers.values()].sort((a, b) =>
    a.playerName.localeCompare(b.playerName, "es-MX"),
  );
}

export async function getCompetitionSignupExportData(filters?: {
  campusId?: string | null;
  competitionId?: string | null;
  paidFrom?: string | null;
  paidTo?: string | null;
  program?: string | null;
}): Promise<CompetitionSignupExportData | null> {
  const baseData = await getCompetitionSignupDetailBaseData({
    campusId: filters?.campusId,
    competitionId: filters?.competitionId,
    paidFrom: filters?.paidFrom,
    paidTo: filters?.paidTo,
  });
  if (!baseData) return null;

  const {
    campusAccess,
    campusId,
    competitionId,
    competitionLabel,
    charges,
    trainingGroupByEnrollment,
    allocationSummaries,
    paidDateFilter,
    productBucketIds,
    bundleEntitlements,
    eligibilityBucket,
    restrictionsByProduct,
    pricingRulesByProduct,
  } = baseData;
  const selectedProgram = normalizeProgramFilter(filters?.program);
  const campusName =
    campusAccess.campuses.find((campus) => campus.id === campusId)?.name ?? "Campus";

  const matchingCharges = charges.filter((charge) => {
    if (charge.enrollments?.campus_id !== campusId) return false;
    const allocation = allocationSummaries.get(charge.id);
    if (!allocation || allocation.total + 0.009 < charge.amount) return false;
    if (!isPaidDateInFilter(allocation.paidAt, paidDateFilter)) return false;
    if (!getCompetitionBucketIds(charge, productBucketIds, bundleEntitlements).includes(competitionId)) return false;
    const enrollment = charge.enrollments;
    if (!enrollment) return false;
    const trainingGroup = trainingGroupByEnrollment.get(enrollment.id) ?? null;
    if (selectedProgram && trainingGroup?.program !== selectedProgram) return false;
    return isEnrollmentEligibleForBucket({
      enrollment,
      bucket: eligibilityBucket,
      trainingGroup,
      restrictionsByProduct,
      pricingRulesByProduct,
    });
  });

  const confirmedChargeByEnrollment = new Map<string, ChargeRow>();
  for (const charge of matchingCharges) {
    if (!confirmedChargeByEnrollment.has(charge.enrollment_id)) {
      confirmedChargeByEnrollment.set(charge.enrollment_id, charge);
    }
  }

  const rows = [...confirmedChargeByEnrollment.values()]
    .map((charge) => {
      const enrollment = charge.enrollments;
      const trainingGroup = enrollment ? (trainingGroupByEnrollment.get(enrollment.id) ?? null) : null;
      const playerName = enrollment?.players
        ? `${enrollment.players.first_name} ${enrollment.players.last_name}`.trim()
        : "Jugador";

      return {
        playerName,
        birthYear: getBirthYear(enrollment?.players?.birth_date),
        campusName,
        trainingGroupName: trainingGroup?.label ?? "Sin grupo",
        programLabel: TRAINING_GROUP_PROGRAM_LABELS[trainingGroup?.program ?? ""] ?? "Sin programa",
      };
    })
    .sort((a, b) => {
      const yearA = a.birthYear ?? 0;
      const yearB = b.birthYear ?? 0;
      if (yearA !== yearB) return yearB - yearA;
      const groupDiff = a.trainingGroupName.localeCompare(b.trainingGroupName, "es-MX");
      if (groupDiff !== 0) return groupDiff;
      return a.playerName.localeCompare(b.playerName, "es-MX");
    });

  return {
    competitionId,
    competitionLabel,
    campusId,
    campusName,
    selectedProgram,
    selectedProgramLabel:
      TRAINING_GROUP_PROGRAM_LABELS[selectedProgram ?? ""] ?? "Todos los programas",
    paidDateFilter,
    rows,
  };
}
