import { createClient } from "@/lib/supabase/server";

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: "Efectivo",
  transfer: "Transferencia",
  card: "Tarjeta",
  stripe_360player: "360Player/Stripe",
  other: "Otro"
};

function toNumber(value: number | string | null | undefined) {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  return 0;
}

function todayUtcString() {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function currentMonthString() {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

// ── Types ─────────────────────────────────────────────────────────────────────

type PaymentWithPlayer = {
  id: string;
  amount: number;
  method: string;
  paid_at: string;
  notes: string | null;
  enrollment_id: string;
  enrollments: {
    campus_id: string;
    players: { first_name: string | null; last_name: string | null } | null;
  } | null;
};

type ChargeWithType = {
  amount: number;
  charge_types: { code: string | null; name: string | null } | null;
};

type PaymentForMonth = {
  amount: number;
  method: string;
};

// ── Corte Diario ──────────────────────────────────────────────────────────────

export type CortePaymentRow = {
  id: string;
  enrollmentId: string;
  playerName: string;
  amount: number;
  method: string;
  methodLabel: string;
  paidAt: string;
  notes: string | null;
};

export type CorteByMethod = {
  method: string;
  methodLabel: string;
  count: number;
  total: number;
};

export type CorteByChargeType = {
  typeCode: string;
  typeName: string;
  total: number;
};

export type CorteDiarioData = {
  date: string;
  totalCobrado: number;
  byMethod: CorteByMethod[];
  byChargeType: CorteByChargeType[];
  payments: CortePaymentRow[];
};

export async function getCorteDiarioData(filters: {
  date?: string; // YYYY-MM-DD
  campusId?: string;
}): Promise<CorteDiarioData> {
  const supabase = await createClient();

  const dateStr = /^\d{4}-\d{2}-\d{2}$/.test(filters.date ?? "") ? (filters.date as string) : todayUtcString();

  const dateStart = `${dateStr}T00:00:00.000Z`;
  const dateEnd = new Date(new Date(dateStart).getTime() + 86_400_000).toISOString();

  let query = supabase
    .from("payments")
    .select("id, amount, method, paid_at, notes, enrollment_id, enrollments!inner(campus_id, players(first_name, last_name))")
    .eq("status", "posted")
    .gte("paid_at", dateStart)
    .lt("paid_at", dateEnd)
    .order("paid_at", { ascending: false });

  if (filters.campusId) {
    query = query.eq("enrollments.campus_id", filters.campusId);
  }

  const { data } = await query.returns<PaymentWithPlayer[]>();
  const payments = data ?? [];

  const byMethodMap = new Map<string, { count: number; total: number }>();
  payments.forEach((p) => {
    const prev = byMethodMap.get(p.method) ?? { count: 0, total: 0 };
    byMethodMap.set(p.method, { count: prev.count + 1, total: prev.total + p.amount });
  });

  const byMethod: CorteByMethod[] = Array.from(byMethodMap.entries())
    .map(([method, { count, total }]) => ({
      method,
      methodLabel: PAYMENT_METHOD_LABELS[method] ?? method,
      count,
      total
    }))
    .sort((a, b) => b.total - a.total);

  // Charge-type breakdown via payment_allocations
  const paymentIds = payments.map((p) => p.id);
  let byChargeType: CorteByChargeType[] = [];
  if (paymentIds.length > 0) {
    const { data: allocData } = await supabase
      .from("payment_allocations")
      .select("amount, charges(charge_types(code, name))")
      .in("payment_id", paymentIds)
      .returns<{ amount: number; charges: { charge_types: { code: string | null; name: string | null } | null } | null }[]>();

    const byChargeTypeMap = new Map<string, { typeName: string; total: number }>();
    (allocData ?? []).forEach((alloc) => {
      const code = alloc.charges?.charge_types?.code ?? "other";
      const name = alloc.charges?.charge_types?.name ?? "Otro";
      const prev = byChargeTypeMap.get(code) ?? { typeName: name, total: 0 };
      byChargeTypeMap.set(code, { typeName: name, total: prev.total + alloc.amount });
    });

    byChargeType = Array.from(byChargeTypeMap.entries())
      .map(([typeCode, { typeName, total }]) => ({ typeCode, typeName, total }))
      .sort((a, b) => b.total - a.total);
  }

  return {
    date: dateStr,
    totalCobrado: payments.reduce((sum, p) => sum + p.amount, 0),
    byMethod,
    byChargeType,
    payments: payments.map((p) => ({
      id: p.id,
      enrollmentId: p.enrollment_id,
      playerName: `${p.enrollments?.players?.first_name ?? ""} ${p.enrollments?.players?.last_name ?? ""}`.trim() || "-",
      amount: p.amount,
      method: p.method,
      methodLabel: PAYMENT_METHOD_LABELS[p.method] ?? p.method,
      paidAt: p.paid_at,
      notes: p.notes
    }))
  };
}

// ── Resumen Mensual ───────────────────────────────────────────────────────────

export type ChargesByType = {
  typeCode: string;
  typeName: string;
  count: number;
  total: number;
};

export type PaymentsByMethod = {
  method: string;
  methodLabel: string;
  count: number;
  total: number;
};

export type ResumenMensualData = {
  month: string;
  activeEnrollments: number;
  totalCargosEmitidos: number;
  totalCobrado: number;
  pendingBalance: number;
  chargesByType: ChargesByType[];
  paymentsByMethod: PaymentsByMethod[];
};

export async function getResumenMensualData(filters: {
  month?: string; // YYYY-MM
  campusId?: string;
}): Promise<ResumenMensualData> {
  const supabase = await createClient();

  const month = /^\d{4}-\d{2}$/.test(filters.month ?? "") ? (filters.month as string) : currentMonthString();
  const [yearRaw, monthRaw] = month.split("-");
  const year = Number(yearRaw);
  const monthIndex = Number(monthRaw) - 1;
  const monthStart = new Date(year, monthIndex, 1).toISOString();
  const nextMonthStart = new Date(year, monthIndex + 1, 1).toISOString();

  let activeEnrollmentIdsQuery = supabase.from("enrollments").select("id").eq("status", "active");
  if (filters.campusId) {
    activeEnrollmentIdsQuery = activeEnrollmentIdsQuery.eq("campus_id", filters.campusId);
  }

  let chargesQuery = supabase
    .from("charges")
    .select("amount, charge_types(code, name), enrollments!inner(campus_id)")
    .neq("status", "void")
    .gte("created_at", monthStart)
    .lt("created_at", nextMonthStart);
  if (filters.campusId) {
    chargesQuery = chargesQuery.eq("enrollments.campus_id", filters.campusId);
  }

  let paymentsQuery = supabase
    .from("payments")
    .select("amount, method, enrollments!inner(campus_id)")
    .eq("status", "posted")
    .gte("paid_at", monthStart)
    .lt("paid_at", nextMonthStart);
  if (filters.campusId) {
    paymentsQuery = paymentsQuery.eq("enrollments.campus_id", filters.campusId);
  }

  const [activeResult, chargesResult, paymentsResult] = await Promise.all([
    activeEnrollmentIdsQuery.returns<{ id: string }[]>(),
    chargesQuery.returns<ChargeWithType[]>(),
    paymentsQuery.returns<PaymentForMonth[]>()
  ]);

  const activeEnrollmentIds = (activeResult.data ?? []).map((e) => e.id);
  const charges = chargesResult.data ?? [];
  const payments = paymentsResult.data ?? [];

  let pendingBalance = 0;
  if (activeEnrollmentIds.length > 0) {
    const { data: balances } = await supabase
      .from("v_enrollment_balances")
      .select("balance")
      .gt("balance", 0)
      .in("enrollment_id", activeEnrollmentIds)
      .returns<{ balance: number | string | null }[]>();

    pendingBalance = (balances ?? []).reduce((sum, row) => sum + toNumber(row.balance), 0);
  }

  const chargesByTypeMap = new Map<string, { typeName: string; count: number; total: number }>();
  charges.forEach((c) => {
    const code = c.charge_types?.code ?? "other";
    const name = c.charge_types?.name ?? "Otro";
    const prev = chargesByTypeMap.get(code) ?? { typeName: name, count: 0, total: 0 };
    chargesByTypeMap.set(code, { typeName: name, count: prev.count + 1, total: prev.total + c.amount });
  });

  const paymentsByMethodMap = new Map<string, { count: number; total: number }>();
  payments.forEach((p) => {
    const prev = paymentsByMethodMap.get(p.method) ?? { count: 0, total: 0 };
    paymentsByMethodMap.set(p.method, { count: prev.count + 1, total: prev.total + p.amount });
  });

  return {
    month,
    activeEnrollments: activeEnrollmentIds.length,
    totalCargosEmitidos: charges.reduce((sum, c) => sum + c.amount, 0),
    totalCobrado: payments.reduce((sum, p) => sum + p.amount, 0),
    pendingBalance,
    chargesByType: Array.from(chargesByTypeMap.entries())
      .map(([typeCode, { typeName, count, total }]) => ({ typeCode, typeName, count, total }))
      .sort((a, b) => b.total - a.total),
    paymentsByMethod: Array.from(paymentsByMethodMap.entries())
      .map(([method, { count, total }]) => ({
        method,
        methodLabel: PAYMENT_METHOD_LABELS[method] ?? method,
        count,
        total
      }))
      .sort((a, b) => b.total - a.total)
  };
}
