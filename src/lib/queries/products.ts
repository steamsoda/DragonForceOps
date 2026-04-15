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

function getBirthYear(value: string | null | undefined) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.getUTCFullYear();
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

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

  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();

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

export async function getProductRecentSales(productId: string): Promise<ProductSale[]> {
  const permissionContext = await getPermissionContext();
  if (!permissionContext?.isDirector) return [];
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

  const { data } = await supabase
    .from("charges")
    .select("id, description, amount, size, is_goalkeeper, created_at, currency, enrollments(id, players(first_name, last_name))")
    .eq("product_id", productId)
    .neq("status", "void")
    .order("created_at", { ascending: false })
    .limit(25)
    .returns<Row[]>();

  if (!data) return [];

  return data.map((row) => ({
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
