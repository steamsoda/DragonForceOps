import { createClient } from "@/lib/supabase/server";
import { canAccessCampus, getOperationalCampusAccess } from "@/lib/auth/campuses";
import {
  getMonterreyDateParts,
  getMonterreyMonthBounds,
  getMonterreyMonthString,
} from "@/lib/time";

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: "Efectivo",
  transfer: "Transferencia",
  card: "Tarjeta",
  stripe_360player: "360Player",
  other: "Otro"
};

function toNumber(value: number | string | null | undefined) {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  return 0;
}

// Monterrey midnight = UTC 06:00, so a local day spans T06:00Z → T06:00Z next day.
// ── Types ─────────────────────────────────────────────────────────────────────

type PaymentWithPlayer = {
  id: string;
  folio: string | null;
  amount: number;
  method: string;
  paid_at: string;
  notes: string | null;
  enrollment_id: string;
  operator_campus_id: string;
  enrollments: {
    campus_id: string;
    campuses: { name: string | null } | null;
    players: { first_name: string | null; last_name: string | null; birth_date: string | null } | null;
  } | null;
};

type ChargeWithType = {
  amount: number;
  period_month: string | null;
  created_at: string;
  charge_types: { code: string | null; name: string | null } | null;
};

type PaymentForMonth = {
  amount: number;
  method: string;
};

type PaymentAllocationWithCharge = {
  payment_id: string;
  amount: number;
  charges:
    | {
        product_id: string | null;
        description: string | null;
        charge_types: { code: string | null; name: string | null } | null;
      }
    | null;
};

// ── Corte Diario ──────────────────────────────────────────────────────────────

export type CortePaymentRow = {
  id: string;
  enrollmentId: string;
  folio: string | null;
  playerName: string;
  birthYear: number | null;
  playerCampusName: string;
  operatorCampusName: string;
  isCrossCampus: boolean;
  amount: number;
  method: string;
  methodLabel: string;
  paidAt: string;
  notes: string | null;
  concepts: string[];
  excludedFromCorte: boolean;
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

export type CorteProductDetail = {
  description: string;
  total: number;
};

export type CorteDiarioData = {
  campusId: string;
  campusName: string;
  openedAt: string;
  closedAt: string | null;
  isCurrentOpen: boolean;
  totalCobrado: number;
  countedPaymentsCount: number;
  excludedPaymentsCount: number;
  excludedPaymentsTotal: number;
  byMethod: CorteByMethod[];
  byChargeType: CorteByChargeType[];
  productDetails: CorteProductDetail[];
  payments: CortePaymentRow[];
};

export async function getCorteDiarioData(filters: {
  campusId?: string;
  openedAt?: string;
  closedAt?: string | null;
}): Promise<CorteDiarioData> {
  const supabase = await createClient();
  const campusAccess = await getOperationalCampusAccess();
  if (!campusAccess || campusAccess.campusIds.length === 0) {
    return {
      campusId: "",
      campusName: "-",
      openedAt: filters.openedAt ?? new Date().toISOString(),
      closedAt: filters.closedAt ?? null,
      isCurrentOpen: !filters.closedAt,
      totalCobrado: 0,
      countedPaymentsCount: 0,
      excludedPaymentsCount: 0,
      excludedPaymentsTotal: 0,
      byMethod: [],
      byChargeType: [],
      productDetails: [],
      payments: [],
    };
  }

  const selectedCampusId = filters.campusId ?? campusAccess.defaultCampusId ?? campusAccess.campusIds[0];
  if (!selectedCampusId || !canAccessCampus(campusAccess, selectedCampusId)) {
    return {
      campusId: selectedCampusId ?? "",
      campusName: "-",
      openedAt: filters.openedAt ?? new Date().toISOString(),
      closedAt: filters.closedAt ?? null,
      isCurrentOpen: !filters.closedAt,
      totalCobrado: 0,
      countedPaymentsCount: 0,
      excludedPaymentsCount: 0,
      excludedPaymentsTotal: 0,
      byMethod: [],
      byChargeType: [],
      productDetails: [],
      payments: [],
    };
  }

  const campusName = campusAccess.campuses.find((campus) => campus.id === selectedCampusId)?.name ?? "-";
  const queryStart = filters.openedAt ?? new Date().toISOString();
  const queryEnd = filters.closedAt ?? new Date().toISOString();

  let query = supabase
    .from("payments")
    .select("id, folio, amount, method, paid_at, notes, enrollment_id, operator_campus_id, enrollments!inner(campus_id, campuses(name), players(first_name, last_name, birth_date))")
    .eq("status", "posted")
    .gte("paid_at", queryStart)
    .lt("paid_at", queryEnd)
    .eq("operator_campus_id", selectedCampusId)
    .order("paid_at", { ascending: false });

  const { data } = await query.returns<PaymentWithPlayer[]>();
  const payments = data ?? [];
  const operatorCampusIds = [...new Set(payments.map((payment) => payment.operator_campus_id).filter(Boolean))];
  const { data: operatorCampusRows } = operatorCampusIds.length
    ? await supabase
        .from("campuses")
        .select("id, name")
        .in("id", operatorCampusIds)
        .returns<Array<{ id: string; name: string }>>()
    : { data: [] };
  const operatorCampusById = new Map((operatorCampusRows ?? []).map((campus) => [campus.id, campus.name]));
  const countedPayments = payments.filter((payment) => payment.method !== "stripe_360player");
  const countedPaymentIds = countedPayments.map((payment) => payment.id);
  const excludedPaymentsTotal = payments
    .filter((payment) => payment.method === "stripe_360player")
    .reduce((sum, payment) => sum + payment.amount, 0);
  const paymentIds = payments.map((payment) => payment.id);

  const byMethodMap = new Map<string, { count: number; total: number }>();
  countedPayments.forEach((p) => {
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

  const { data: allocationData } = paymentIds.length
    ? await supabase
        .from("payment_allocations")
        .select("payment_id, amount, charges(product_id, description, charge_types(code, name))")
        .in("payment_id", paymentIds)
        .returns<PaymentAllocationWithCharge[]>()
    : { data: [] };

  const conceptsByPaymentId = new Map<string, string[]>();
  for (const allocation of allocationData ?? []) {
    const concept = allocation.charges?.description?.trim() || allocation.charges?.charge_types?.name?.trim() || "Cargo";
    const current = conceptsByPaymentId.get(allocation.payment_id) ?? [];
    if (!current.includes(concept)) {
      current.push(concept);
      conceptsByPaymentId.set(allocation.payment_id, current);
    }
  }

  // Charge-type breakdown via payment_allocations
  let byChargeType: CorteByChargeType[] = [];
  let productDetails: CorteProductDetail[] = [];
  if (countedPaymentIds.length > 0) {
    const byChargeTypeMap = new Map<string, { typeName: string; total: number }>();
    const productDetailsMap = new Map<string, number>();
    (allocationData ?? [])
      .filter((allocation) => countedPaymentIds.includes(allocation.payment_id))
      .forEach((alloc) => {
        const code = alloc.charges?.charge_types?.code ?? "other";
        const name = alloc.charges?.charge_types?.name ?? "Otro";
        const prev = byChargeTypeMap.get(code) ?? { typeName: name, total: 0 };
        byChargeTypeMap.set(code, { typeName: name, total: prev.total + alloc.amount });

        if (alloc.charges?.product_id) {
          const productName = alloc.charges.description?.trim() || alloc.charges.charge_types?.name?.trim() || "Producto";
          productDetailsMap.set(productName, (productDetailsMap.get(productName) ?? 0) + alloc.amount);
        }
      });

    byChargeType = Array.from(byChargeTypeMap.entries())
      .map(([typeCode, { typeName, total }]) => ({ typeCode, typeName, total }))
      .sort((a, b) => b.total - a.total);

    productDetails = Array.from(productDetailsMap.entries())
      .map(([description, total]) => ({ description, total }))
      .sort((a, b) => b.total - a.total || a.description.localeCompare(b.description, "es-MX"));
  }

  return {
    campusId: selectedCampusId,
    campusName,
    openedAt: queryStart,
    closedAt: filters.closedAt ?? null,
    isCurrentOpen: !filters.closedAt,
    totalCobrado: countedPayments.reduce((sum, p) => sum + p.amount, 0),
    countedPaymentsCount: countedPayments.length,
    excludedPaymentsCount: payments.length - countedPayments.length,
    excludedPaymentsTotal,
    byMethod,
    byChargeType,
    productDetails,
    payments: payments.map((p) => ({
      id: p.id,
      enrollmentId: p.enrollment_id,
      folio: p.folio,
      playerName: `${p.enrollments?.players?.first_name ?? ""} ${p.enrollments?.players?.last_name ?? ""}`.trim() || "-",
      birthYear: p.enrollments?.players?.birth_date ? parseInt(p.enrollments.players.birth_date.slice(0, 4), 10) : null,
      playerCampusName: p.enrollments?.campuses?.name ?? "-",
      operatorCampusName: operatorCampusById.get(p.operator_campus_id) ?? "-",
      isCrossCampus: p.operator_campus_id !== p.enrollments?.campus_id,
      amount: p.amount,
      method: p.method,
      methodLabel: PAYMENT_METHOD_LABELS[p.method] ?? p.method,
      paidAt: p.paid_at,
      notes: p.notes,
      concepts: conceptsByPaymentId.get(p.id) ?? [],
      excludedFromCorte: p.method === "stripe_360player"
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

  const month = /^\d{4}-\d{2}$/.test(filters.month ?? "") ? (filters.month as string) : getMonterreyMonthString();
  const { start: monthStart, end: nextMonthStart, periodMonth } = getMonterreyMonthBounds(month);

  let activeEnrollmentIdsQuery = supabase.from("enrollments").select("id").eq("status", "active");
  if (filters.campusId) {
    activeEnrollmentIdsQuery = activeEnrollmentIdsQuery.eq("campus_id", filters.campusId);
  }

  let chargesQuery = supabase
    .from("charges")
    .select("amount, period_month, created_at, charge_types(code, name), enrollments!inner(campus_id)")
    .neq("status", "void")
    .or(`period_month.eq.${periodMonth},and(period_month.is.null,created_at.gte.${monthStart},created_at.lt.${nextMonthStart})`);
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

// ── Corte Semanal ─────────────────────────────────────────────────────────────

type WeekPaymentRow = {
  amount: number;
  method: string;
  paid_at: string;
};

export type WeekByMethod = {
  method: string;
  methodLabel: string;
  total: number;
};

export type WeekSummary = {
  weekNum: number;
  label: string; // e.g. "1–7 Mar"
  startDay: number;
  endDay: number;
  totalCobrado: number;
  paymentCount: number;
  byMethod: WeekByMethod[];
};

export type CorteSemanalData = {
  month: string;
  monthLabel: string;
  totalCobrado: number;
  weeks: WeekSummary[];
};

const MONTH_NAMES_SHORT = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];

function daysInMonth(year: number, monthIndex: number) {
  return new Date(year, monthIndex + 1, 0).getUTCDate();
}

export async function getCorteSemanallData(filters: {
  month?: string; // YYYY-MM
  campusId?: string;
}): Promise<CorteSemanalData> {
  const supabase = await createClient();

  const month = /^\d{4}-\d{2}$/.test(filters.month ?? "") ? (filters.month as string) : getMonterreyMonthString();
  const [yearRaw, monthRaw] = month.split("-");
  const year = Number(yearRaw);
  const monthIndex = Number(monthRaw) - 1;
  const { start: monthStart, end: nextMonthStart } = getMonterreyMonthBounds(month);

  let query = supabase
    .from("payments")
    .select("amount, method, paid_at, enrollments!inner(campus_id)")
    .eq("status", "posted")
    .gte("paid_at", monthStart)
    .lt("paid_at", nextMonthStart);

  if (filters.campusId) {
    query = query.eq("enrollments.campus_id", filters.campusId);
  }

  const { data } = await query.returns<WeekPaymentRow[]>();
  const payments = data ?? [];

  const totalDays = daysInMonth(year, monthIndex);
  const numWeeks = Math.ceil(totalDays / 7);
  const monthShort = MONTH_NAMES_SHORT[monthIndex];

  // Build week buckets
  const weekBuckets: Map<number, WeekPaymentRow[]> = new Map();
  for (let w = 1; w <= numWeeks; w++) weekBuckets.set(w, []);

  payments.forEach((p) => {
    const day = Number(getMonterreyDateParts(p.paid_at).day);
    const weekNum = Math.ceil(day / 7);
    weekBuckets.get(weekNum)?.push(p);
  });

  const weeks: WeekSummary[] = Array.from(weekBuckets.entries()).map(([weekNum, rows]) => {
    const startDay = (weekNum - 1) * 7 + 1;
    const endDay = Math.min(weekNum * 7, totalDays);

    const methodMap = new Map<string, number>();
    rows.forEach((r) => {
      methodMap.set(r.method, (methodMap.get(r.method) ?? 0) + r.amount);
    });

    const byMethod: WeekByMethod[] = Array.from(methodMap.entries())
      .map(([method, total]) => ({ method, methodLabel: PAYMENT_METHOD_LABELS[method] ?? method, total }))
      .sort((a, b) => b.total - a.total);

    return {
      weekNum,
      label: `${startDay}–${endDay} ${monthShort}`,
      startDay,
      endDay,
      totalCobrado: rows.reduce((sum, r) => sum + r.amount, 0),
      paymentCount: rows.length,
      byMethod
    };
  });

  return {
    month,
    monthLabel: `${monthShort} ${year}`,
    totalCobrado: payments.reduce((sum, p) => sum + p.amount, 0),
    weeks
  };
}
