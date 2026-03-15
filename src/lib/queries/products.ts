import { createClient } from "@/lib/supabase/server";
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

// ── Catalog query (all products incl. inactive, grouped for admin view) ───────

export async function getProductCatalog(): Promise<ProductGroup[]> {
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
