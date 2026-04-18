import { createClient } from "@/lib/supabase/server";
import { getPermissionContext } from "@/lib/auth/permissions";
import { PRODUCT_GROUPS } from "@/lib/product-groups";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ProductListItem = {
  id: string;
  name: string;
  defaultAmount: number | null;
  currency: string;
  hasSizes: boolean;
  isActive: boolean;
  sortOrder: number;
  chargeTypeCode: string;
  chargeTypeName: string;
};

export type ProductGroup = {
  key: string;
  label: string;
  codes: readonly string[];
  products: ProductListItem[];
};

export type ProductKpis = {
  unitsSold: number;
  totalRevenue: number;
  unitsThisMonth: number;
  revenueThisMonth: number;
  currency: string;
};

export const PRODUCT_METRIC_KEYS = [
  "charges_registered",
  "charges_this_month",
  "players_with_charge",
  "players_fully_paid",
  "charges_unpaid",
  "reconciliation_gap",
] as const;

export type ProductMetricKey = (typeof PRODUCT_METRIC_KEYS)[number];

export type ProductReconciliationIssue = {
  reason: "not_fully_paid" | "duplicate_fully_paid_charge_same_enrollment";
  enrollmentId: string;
  playerName: string;
  birthYear: number | null;
  campusName: string;
  chargeId: string;
  description: string;
  amount: number;
  allocatedAmount: number;
  missingAmount: number;
  createdAt: string;
};

export type ProductReconciliation = {
  chargeRows: number;
  uniqueEnrollmentsWithCharge: number;
  fullyPaidChargeRows: number;
  uniqueEnrollmentsFullyPaid: number;
  notFullyPaidChargeRows: number;
  duplicateFullyPaidChargeRows: number;
  rawVsDashboardGap: number;
  issues: ProductReconciliationIssue[];
};

export type ProductSizeStat = {
  size: string | null;
  isGoalkeeper: boolean | null;
  units: number;
  revenue: number;
};

export type ProductSale = {
  chargeId: string;
  description: string;
  amount: number;
  size: string | null;
  isGoalkeeper: boolean | null;
  createdAt: string;
  playerName: string;
  enrollmentId: string;
  currency: string;
};

export type ProductPagedSales = {
  rows: ProductSale[];
  page: number;
  pageSize: number;
  totalCount: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
};

export type ProductMetricChargeRow = {
  chargeId: string;
  enrollmentId: string;
  playerName: string;
  campusName: string;
  description: string;
  amount: number;
  currency: string;
  createdAt: string;
};

export type ProductMetricPlayerRow = {
  enrollmentId: string;
  playerName: string;
  campusName: string;
  chargeCount: number;
  latestChargeAt: string;
};

export type ProductMetricIssueRow = ProductReconciliationIssue;

export type ProductMetricPageData =
  | {
      metric: "charges_registered" | "charges_this_month";
      rows: ProductMetricChargeRow[];
      totalCount: number;
      page: number;
      pageSize: number;
      hasPreviousPage: boolean;
      hasNextPage: boolean;
    }
  | {
      metric: "players_with_charge" | "players_fully_paid";
      rows: ProductMetricPlayerRow[];
      totalCount: number;
      page: number;
      pageSize: number;
      hasPreviousPage: boolean;
      hasNextPage: boolean;
    }
  | {
      metric: "charges_unpaid" | "reconciliation_gap";
      rows: ProductMetricIssueRow[];
      totalCount: number;
      page: number;
      pageSize: number;
      hasPreviousPage: boolean;
      hasNextPage: boolean;
    };

const PRODUCT_PAGE_SIZE = 25;

function getBirthYear(value: string | null | undefined) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.getUTCFullYear();
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function getCurrentMonthStartIso() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

function normalizePage(page: number | string | null | undefined) {
  const parsed = Number(page);
  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  return Math.floor(parsed);
}

function buildPageMeta(totalCount: number, page: number, pageSize = PRODUCT_PAGE_SIZE) {
  const safePage = normalizePage(page);
  const offset = (safePage - 1) * pageSize;
  return {
    safePage,
    pageSize,
    offset,
    from: offset,
    to: offset + pageSize - 1,
    hasPreviousPage: safePage > 1,
    hasNextPage: offset + pageSize < totalCount,
  };
}

function paginateRows<T>(rows: T[], page: number, pageSize = PRODUCT_PAGE_SIZE) {
  const safePage = normalizePage(page);
  const offset = (safePage - 1) * pageSize;
  const pagedRows = rows.slice(offset, offset + pageSize);

  return {
    rows: pagedRows,
    page: safePage,
    pageSize,
    totalCount: rows.length,
    hasPreviousPage: safePage > 1,
    hasNextPage: offset + pageSize < rows.length,
  };
}

function getProductMetricLabel(metric: ProductMetricKey) {
  switch (metric) {
    case "charges_registered":
      return "Cargos registrados";
    case "charges_this_month":
      return "Cargos este mes";
    case "players_with_charge":
      return "Jugadores con cargo";
    case "players_fully_paid":
      return "Jugadores totalmente pagados";
    case "charges_unpaid":
      return "Cargos sin pagar";
    case "reconciliation_gap":
      return "Brecha vs pagados";
  }
}

export function isProductMetricKey(value: string | null | undefined): value is ProductMetricKey {
  return PRODUCT_METRIC_KEYS.includes((value ?? "") as ProductMetricKey);
}

export { getProductMetricLabel };

// ── Catalog query (all products incl. inactive, grouped for admin view) ───────

export async function getProductCatalog(): Promise<ProductGroup[]> {
  const permissionContext = await getPermissionContext();
  if (!permissionContext?.isDirector) return [];
  const supabase = await createClient();

  type Row = {
    id: string;
    name: string;
    default_amount: number | null;
    currency: string;
    has_sizes: boolean;
    is_active: boolean;
    sort_order: number;
    charge_types: { code: string; name: string } | null;
  };

  const { data, error } = await supabase
    .from("products")
    .select("id, name, default_amount, currency, has_sizes, is_active, sort_order, charge_types(code, name)")
    .order("sort_order")
    .returns<Row[]>();

  if (error || !data) return [];

  const items: ProductListItem[] = data.map((p) => ({
    id: p.id,
    name: p.name,
    defaultAmount: p.default_amount,
    currency: p.currency,
    hasSizes: p.has_sizes,
    isActive: p.is_active,
    sortOrder: p.sort_order,
    chargeTypeCode: p.charge_types?.code ?? "",
    chargeTypeName: p.charge_types?.name ?? "",
  }));

  // Always return all groups (even empty ones) so staff can create new products in any group.
  return PRODUCT_GROUPS.map((group) => ({
    key: group.key,
    label: group.label,
    codes: group.codes,
    products: items.filter((p) =>
      (group.codes as readonly string[]).includes(p.chargeTypeCode)
    ),
  }));
}

// ── Product detail query ──────────────────────────────────────────────────────

export type ProductDetail = {
  id: string;
  name: string;
  defaultAmount: number | null;
  currency: string;
  hasSizes: boolean;
  isActive: boolean;
  chargeTypeCode: string;
  chargeTypeName: string;
};

export async function getProductDetail(productId: string): Promise<ProductDetail | null> {
  const permissionContext = await getPermissionContext();
  if (!permissionContext?.isDirector) return null;
  const supabase = await createClient();

  type Row = {
    id: string;
    name: string;
    default_amount: number | null;
    currency: string;
    has_sizes: boolean;
    is_active: boolean;
    charge_types: { code: string; name: string } | null;
  };

  const { data, error } = await supabase
    .from("products")
    .select("id, name, default_amount, currency, has_sizes, is_active, charge_types(code, name)")
    .eq("id", productId)
    .maybeSingle()
    .returns<Row | null>();

  if (error || !data) return null;

  return {
    id: data.id,
    name: data.name,
    defaultAmount: data.default_amount,
    currency: data.currency,
    hasSizes: data.has_sizes,
    isActive: data.is_active,
    chargeTypeCode: data.charge_types?.code ?? "",
    chargeTypeName: data.charge_types?.name ?? "",
  };
}

// ── KPIs ──────────────────────────────────────────────────────────────────────

export async function getProductKpis(productId: string, currency: string): Promise<ProductKpis> {
  const permissionContext = await getPermissionContext();
  if (!permissionContext?.isDirector) {
    return { unitsSold: 0, totalRevenue: 0, unitsThisMonth: 0, revenueThisMonth: 0, currency };
  }
  const supabase = await createClient();

  const monthStart = getCurrentMonthStartIso();

  type ChargeRow = { amount: number; created_at: string };

  const { data } = await supabase
    .from("charges")
    .select("amount, created_at")
    .eq("product_id", productId)
    .neq("status", "void")
    .returns<ChargeRow[]>();

  if (!data || data.length === 0) {
    return { unitsSold: 0, totalRevenue: 0, unitsThisMonth: 0, revenueThisMonth: 0, currency };
  }

  let unitsSold = 0, totalRevenue = 0, unitsThisMonth = 0, revenueThisMonth = 0;

  for (const row of data) {
    unitsSold++;
    totalRevenue += row.amount;
    if (row.created_at >= monthStart) {
      unitsThisMonth++;
      revenueThisMonth += row.amount;
    }
  }

  return {
    unitsSold,
    totalRevenue: Math.round(totalRevenue * 100) / 100,
    unitsThisMonth,
    revenueThisMonth: Math.round(revenueThisMonth * 100) / 100,
    currency
  };
}

// ── Size breakdown ────────────────────────────────────────────────────────────

export async function getProductSizeStats(productId: string): Promise<ProductSizeStat[]> {
  const permissionContext = await getPermissionContext();
  if (!permissionContext?.isDirector) return [];
  const supabase = await createClient();

  type Row = { size: string | null; is_goalkeeper: boolean | null; amount: number };

  const { data } = await supabase
    .from("charges")
    .select("size, is_goalkeeper, amount")
    .eq("product_id", productId)
    .neq("status", "void")
    .returns<Row[]>();

  if (!data || data.length === 0) return [];

  const map = new Map<string, ProductSizeStat>();
  for (const row of data) {
    const key = `${row.size ?? ""}|${row.is_goalkeeper ?? ""}`;
    const existing = map.get(key);
    if (existing) {
      existing.units++;
      existing.revenue = Math.round((existing.revenue + row.amount) * 100) / 100;
    } else {
      map.set(key, { size: row.size, isGoalkeeper: row.is_goalkeeper, units: 1, revenue: row.amount });
    }
  }

  return Array.from(map.values()).sort((a, b) => {
    if (!a.size && b.size) return 1;
    if (a.size && !b.size) return -1;
    return (a.size ?? "").localeCompare(b.size ?? "");
  });
}

// ── Recent sales ──────────────────────────────────────────────────────────────

export async function getProductRecentSalesPage(productId: string, page = 1): Promise<ProductPagedSales> {
  const permissionContext = await getPermissionContext();
  if (!permissionContext?.isDirector) {
    return {
      rows: [],
      page: 1,
      pageSize: PRODUCT_PAGE_SIZE,
      totalCount: 0,
      hasPreviousPage: false,
      hasNextPage: false,
    };
  }
  const supabase = await createClient();

  type Row = {
    id: string;
    description: string;
    amount: number;
    size: string | null;
    is_goalkeeper: boolean | null;
    created_at: string;
    currency: string;
    enrollments: {
      id: string;
      players: { first_name: string; last_name: string } | null;
    } | null;
  };

  const safePage = normalizePage(page);

  const { data, count } = await supabase
    .from("charges")
    .select("id, description, amount, size, is_goalkeeper, created_at, currency, enrollments(id, players(first_name, last_name))", {
      count: "exact",
    })
    .eq("product_id", productId)
    .neq("status", "void")
    .order("created_at", { ascending: false })
    .range((safePage - 1) * PRODUCT_PAGE_SIZE, safePage * PRODUCT_PAGE_SIZE - 1)
    .returns<Row[]>();

  const rows = (data ?? []).map((row) => ({
    chargeId: row.id,
    description: row.description,
    amount: row.amount,
    size: row.size,
    isGoalkeeper: row.is_goalkeeper,
    createdAt: row.created_at,
    playerName: row.enrollments?.players
      ? `${row.enrollments.players.first_name} ${row.enrollments.players.last_name}`
      : "—",
    enrollmentId: row.enrollments?.id ?? "",
    currency: row.currency
  }));

  const pageMeta = buildPageMeta(count ?? 0, safePage, PRODUCT_PAGE_SIZE);

  return {
    rows,
    page: pageMeta.safePage,
    pageSize: pageMeta.pageSize,
    totalCount: count ?? 0,
    hasPreviousPage: pageMeta.hasPreviousPage,
    hasNextPage: pageMeta.hasNextPage,
  };
}

export async function getProductReconciliation(productId: string): Promise<ProductReconciliation> {
  const permissionContext = await getPermissionContext();
  if (!permissionContext?.isDirector) {
    return {
      chargeRows: 0,
      uniqueEnrollmentsWithCharge: 0,
      fullyPaidChargeRows: 0,
      uniqueEnrollmentsFullyPaid: 0,
      notFullyPaidChargeRows: 0,
      duplicateFullyPaidChargeRows: 0,
      rawVsDashboardGap: 0,
      issues: [],
    };
  }

  const supabase = await createClient();

  type ChargeRow = {
    id: string;
    enrollment_id: string;
    description: string;
    amount: number;
    created_at: string;
    enrollments: {
      id: string;
      campuses: { name: string | null } | null;
      players: { first_name: string | null; last_name: string | null; birth_date: string | null } | null;
    } | null;
  };

  type AllocationRow = {
    charge_id: string;
    amount: number;
  };

  const { data: charges } = await supabase
    .from("charges")
    .select("id, enrollment_id, description, amount, created_at, enrollments(id, campuses(name), players(first_name, last_name, birth_date))")
    .eq("product_id", productId)
    .neq("status", "void")
    .gt("amount", 0)
    .order("created_at", { ascending: true })
    .returns<ChargeRow[]>();

  const chargeRows = charges ?? [];
  if (chargeRows.length === 0) {
    return {
      chargeRows: 0,
      uniqueEnrollmentsWithCharge: 0,
      fullyPaidChargeRows: 0,
      uniqueEnrollmentsFullyPaid: 0,
      notFullyPaidChargeRows: 0,
      duplicateFullyPaidChargeRows: 0,
      rawVsDashboardGap: 0,
      issues: [],
    };
  }

  const chargeIds = chargeRows.map((charge) => charge.id);
  const allocationTotals = new Map<string, number>();
  for (let index = 0; index < chargeIds.length; index += 500) {
    const chunk = chargeIds.slice(index, index + 500);
    const { data: allocations } = await supabase
      .from("payment_allocations")
      .select("charge_id, amount")
      .in("charge_id", chunk)
      .returns<AllocationRow[]>();

    for (const allocation of allocations ?? []) {
      allocationTotals.set(
        allocation.charge_id,
        roundMoney((allocationTotals.get(allocation.charge_id) ?? 0) + allocation.amount),
      );
    }
  }

  const uniqueEnrollmentsWithCharge = new Set<string>();
  const fullyPaidEnrollmentIds = new Set<string>();
  const fullyPaidChargeRows: Array<ChargeRow & { allocatedAmount: number }> = [];
  const issues: ProductReconciliationIssue[] = [];
  const fullyPaidPerEnrollment = new Map<string, number>();

  for (const charge of chargeRows) {
    uniqueEnrollmentsWithCharge.add(charge.enrollment_id);
    const allocatedAmount = allocationTotals.get(charge.id) ?? 0;
    const fullyPaid = allocatedAmount + 0.009 >= charge.amount;
    const playerName = charge.enrollments?.players
      ? `${charge.enrollments.players.first_name ?? ""} ${charge.enrollments.players.last_name ?? ""}`.trim() || "Jugador"
      : "Jugador";
    const campusName = charge.enrollments?.campuses?.name ?? "Campus";

    if (fullyPaid) {
      fullyPaidChargeRows.push({ ...charge, allocatedAmount });
      fullyPaidEnrollmentIds.add(charge.enrollment_id);
      fullyPaidPerEnrollment.set(charge.enrollment_id, (fullyPaidPerEnrollment.get(charge.enrollment_id) ?? 0) + 1);
      continue;
    }

    issues.push({
      reason: "not_fully_paid",
      enrollmentId: charge.enrollment_id,
      playerName,
      birthYear: getBirthYear(charge.enrollments?.players?.birth_date),
      campusName,
      chargeId: charge.id,
      description: charge.description,
      amount: charge.amount,
      allocatedAmount,
      missingAmount: roundMoney(charge.amount - allocatedAmount),
      createdAt: charge.created_at,
    });
  }

  for (const charge of fullyPaidChargeRows) {
    if ((fullyPaidPerEnrollment.get(charge.enrollment_id) ?? 0) <= 1) continue;
    const playerName = charge.enrollments?.players
      ? `${charge.enrollments.players.first_name ?? ""} ${charge.enrollments.players.last_name ?? ""}`.trim() || "Jugador"
      : "Jugador";
    const campusName = charge.enrollments?.campuses?.name ?? "Campus";

    issues.push({
      reason: "duplicate_fully_paid_charge_same_enrollment",
      enrollmentId: charge.enrollment_id,
      playerName,
      birthYear: getBirthYear(charge.enrollments?.players?.birth_date),
      campusName,
      chargeId: charge.id,
      description: charge.description,
      amount: charge.amount,
      allocatedAmount: charge.allocatedAmount,
      missingAmount: 0,
      createdAt: charge.created_at,
    });
  }

  issues.sort((a, b) => {
    const reasonRank =
      (a.reason === "duplicate_fully_paid_charge_same_enrollment" ? 0 : 1) -
      (b.reason === "duplicate_fully_paid_charge_same_enrollment" ? 0 : 1);
    if (reasonRank !== 0) return reasonRank;
    const campusRank = a.campusName.localeCompare(b.campusName, "es-MX");
    if (campusRank !== 0) return campusRank;
    const playerRank = a.playerName.localeCompare(b.playerName, "es-MX");
    if (playerRank !== 0) return playerRank;
    return a.createdAt.localeCompare(b.createdAt);
  });

  const duplicateFullyPaidChargeRows = issues.filter(
    (issue) => issue.reason === "duplicate_fully_paid_charge_same_enrollment",
  ).length;
  const notFullyPaidChargeRows = issues.filter((issue) => issue.reason === "not_fully_paid").length;

  return {
    chargeRows: chargeRows.length,
    uniqueEnrollmentsWithCharge: uniqueEnrollmentsWithCharge.size,
    fullyPaidChargeRows: fullyPaidChargeRows.length,
    uniqueEnrollmentsFullyPaid: fullyPaidEnrollmentIds.size,
    notFullyPaidChargeRows,
    duplicateFullyPaidChargeRows,
    rawVsDashboardGap: chargeRows.length - fullyPaidEnrollmentIds.size,
    issues,
  };
}

type ProductChargeDrilldownRow = {
  id: string;
  description: string;
  amount: number;
  currency: string;
  created_at: string;
  enrollment_id: string;
  enrollments: {
    campuses: { name: string | null } | null;
    players: { first_name: string | null; last_name: string | null } | null;
  } | null;
};

async function getProductChargeRowsForMetric(
  productId: string,
  filter: "all" | "this_month",
  page: number,
): Promise<ProductMetricPageData & { metric: "charges_registered" | "charges_this_month" }> {
  const supabase = await createClient();
  const safePage = normalizePage(page);
  const monthStart = getCurrentMonthStartIso();

  let query = supabase
    .from("charges")
    .select(
      "id, description, amount, currency, created_at, enrollment_id, enrollments(campuses(name), players(first_name, last_name))",
      { count: "exact" },
    )
    .eq("product_id", productId)
    .neq("status", "void")
    .order("created_at", { ascending: false });

  if (filter === "this_month") {
    query = query.gte("created_at", monthStart);
  }

  const { data, count } = await query
    .range((safePage - 1) * PRODUCT_PAGE_SIZE, safePage * PRODUCT_PAGE_SIZE - 1)
    .returns<ProductChargeDrilldownRow[]>();
  const pageMeta = buildPageMeta(count ?? 0, safePage, PRODUCT_PAGE_SIZE);

  return {
    metric: filter === "this_month" ? "charges_this_month" : "charges_registered",
    rows: (data ?? []).map((row) => ({
      chargeId: row.id,
      enrollmentId: row.enrollment_id,
      playerName: row.enrollments?.players
        ? `${row.enrollments.players.first_name ?? ""} ${row.enrollments.players.last_name ?? ""}`.trim() || "Jugador"
        : "Jugador",
      campusName: row.enrollments?.campuses?.name ?? "Campus",
      description: row.description,
      amount: row.amount,
      currency: row.currency,
      createdAt: row.created_at,
    })),
    totalCount: count ?? 0,
    page: pageMeta.safePage,
    pageSize: pageMeta.pageSize,
    hasPreviousPage: pageMeta.hasPreviousPage,
    hasNextPage: pageMeta.hasNextPage,
  };
}

async function getProductPlayerRowsForMetric(
  productId: string,
  filter: "all" | "fully_paid",
  page: number,
): Promise<ProductMetricPageData & { metric: "players_with_charge" | "players_fully_paid" }> {
  const supabase = await createClient();

  type ChargeRow = {
    id: string;
    amount: number;
    created_at: string;
    enrollment_id: string;
    enrollments: {
      campuses: { name: string | null } | null;
      players: { first_name: string | null; last_name: string | null } | null;
    } | null;
  };

  const { data: charges } = await supabase
    .from("charges")
    .select("id, amount, created_at, enrollment_id, enrollments(campuses(name), players(first_name, last_name))")
    .eq("product_id", productId)
    .neq("status", "void")
    .returns<ChargeRow[]>();

  const positiveCharges = (charges ?? []).filter((charge) => charge.amount > 0);
  const allocationTotals = new Map<string, number>();

  if (filter === "fully_paid" && positiveCharges.length > 0) {
    for (let index = 0; index < positiveCharges.length; index += 500) {
      const chargeIds = positiveCharges.slice(index, index + 500).map((charge) => charge.id);
      const { data: allocations } = await supabase
        .from("payment_allocations")
        .select("charge_id, amount")
        .in("charge_id", chargeIds)
        .returns<Array<{ charge_id: string; amount: number }>>();

      for (const allocation of allocations ?? []) {
        allocationTotals.set(
          allocation.charge_id,
          roundMoney((allocationTotals.get(allocation.charge_id) ?? 0) + allocation.amount),
        );
      }
    }
  }

  const enrollmentMap = new Map<string, ProductMetricPlayerRow>();
  for (const charge of charges ?? []) {
    if (filter === "fully_paid") {
      if (charge.amount <= 0) continue;
      const allocatedAmount = allocationTotals.get(charge.id) ?? 0;
      if (allocatedAmount + 0.009 < charge.amount) continue;
    }

    const existing = enrollmentMap.get(charge.enrollment_id);
    const playerName = charge.enrollments?.players
      ? `${charge.enrollments.players.first_name ?? ""} ${charge.enrollments.players.last_name ?? ""}`.trim() || "Jugador"
      : "Jugador";
    const campusName = charge.enrollments?.campuses?.name ?? "Campus";

    if (existing) {
      existing.chargeCount += 1;
      if (charge.created_at > existing.latestChargeAt) {
        existing.latestChargeAt = charge.created_at;
      }
      continue;
    }

    enrollmentMap.set(charge.enrollment_id, {
      enrollmentId: charge.enrollment_id,
      playerName,
      campusName,
      chargeCount: 1,
      latestChargeAt: charge.created_at,
    });
  }

  const rows = Array.from(enrollmentMap.values()).sort((left, right) => {
    if (left.latestChargeAt !== right.latestChargeAt) {
      return right.latestChargeAt.localeCompare(left.latestChargeAt);
    }
    return left.playerName.localeCompare(right.playerName, "es-MX");
  });

  const paged = paginateRows(rows, page, PRODUCT_PAGE_SIZE);
  return {
    metric: filter === "fully_paid" ? "players_fully_paid" : "players_with_charge",
    rows: paged.rows,
    totalCount: paged.totalCount,
    page: paged.page,
    pageSize: paged.pageSize,
    hasPreviousPage: paged.hasPreviousPage,
    hasNextPage: paged.hasNextPage,
  };
}

async function getProductIssueRowsForMetric(
  productId: string,
  filter: "unpaid" | "gap",
  page: number,
): Promise<ProductMetricPageData & { metric: "charges_unpaid" | "reconciliation_gap" }> {
  const reconciliation = await getProductReconciliation(productId);
  const filteredIssues =
    filter === "unpaid"
      ? reconciliation.issues.filter((issue) => issue.reason === "not_fully_paid")
      : reconciliation.issues;
  const paged = paginateRows(filteredIssues, page, PRODUCT_PAGE_SIZE);

  return {
    metric: filter === "unpaid" ? "charges_unpaid" : "reconciliation_gap",
    rows: paged.rows,
    totalCount: paged.totalCount,
    page: paged.page,
    pageSize: paged.pageSize,
    hasPreviousPage: paged.hasPreviousPage,
    hasNextPage: paged.hasNextPage,
  };
}

export async function getProductMetricPageData(
  productId: string,
  metric: ProductMetricKey,
  page = 1,
): Promise<ProductMetricPageData | null> {
  const permissionContext = await getPermissionContext();
  if (!permissionContext?.isDirector) return null;

  switch (metric) {
    case "charges_registered":
      return getProductChargeRowsForMetric(productId, "all", page);
    case "charges_this_month":
      return getProductChargeRowsForMetric(productId, "this_month", page);
    case "players_with_charge":
      return getProductPlayerRowsForMetric(productId, "all", page);
    case "players_fully_paid":
      return getProductPlayerRowsForMetric(productId, "fully_paid", page);
    case "charges_unpaid":
      return getProductIssueRowsForMetric(productId, "unpaid", page);
    case "reconciliation_gap":
      return getProductIssueRowsForMetric(productId, "gap", page);
  }
}
