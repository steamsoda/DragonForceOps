import { createClient } from "@/lib/supabase/server";
import { canAccessCampus, getOperationalCampusAccess } from "@/lib/auth/campuses";
import {
  getMonterreyDateParts,
  getMonterreyDateString,
  getMonterreyDayBounds,
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

// ── Corte Diario ──────────────────────────────────────────────────────────────

export type CortePaymentRow = {
  id: string;
  enrollmentId: string;
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

export type CorteDiarioData = {
  date: string;
  sessionOpenedAt: string | null; // set when an open session's start time was used
  totalCobrado: number;
  countedPaymentsCount: number;
  excludedPaymentsCount: number;
  byMethod: CorteByMethod[];
  byChargeType: CorteByChargeType[];
  payments: CortePaymentRow[];
};

export async function getCorteDiarioData(filters: {
  date?: string;            // YYYY-MM-DD
  campusId?: string;
  sessionOpenedAt?: string; // ISO timestamp — session opened_at for this campus+date
  sessionClosedAt?: string; // ISO timestamp — session closed_at (null if still open)
}): Promise<CorteDiarioData> {
  const supabase = await createClient();
  const campusAccess = await getOperationalCampusAccess();
  if (!campusAccess || campusAccess.campusIds.length === 0) {
    return {
      date: /^\d{4}-\d{2}-\d{2}$/.test(filters.date ?? "") ? (filters.date as string) : getMonterreyDateString(),
      sessionOpenedAt: null,
      totalCobrado: 0,
      countedPaymentsCount: 0,
      excludedPaymentsCount: 0,
      byMethod: [],
      byChargeType: [],
      payments: [],
    };
  }

  const dateStr = /^\d{4}-\d{2}-\d{2}$/.test(filters.date ?? "") ? (filters.date as string) : getMonterreyDateString();
  const { start: dateStart, end: dateEnd } = getMonterreyDayBounds(dateStr);

  // Anchor start to when the session opened so payments before the calendar day
  // boundary are included (e.g. session opened late on day N-1).
  const queryStart = filters.sessionOpenedAt ?? dateStart;

  // Extend end boundary if the session closed after the calendar day ended
  // (e.g. session closed at 00:05 AM which is past midnight in UTC).
  const queryEnd = filters.sessionClosedAt
    ? new Date(Math.max(
        new Date(filters.sessionClosedAt).getTime(),
        new Date(dateEnd).getTime()
      )).toISOString()
    : dateEnd;

  const sessionOpenedAt = filters.sessionOpenedAt ?? null;

  let query = supabase
    .from("payments")
    .select("id, amount, method, paid_at, notes, enrollment_id, operator_campus_id, enrollments!inner(campus_id, campuses(name), players(first_name, last_name, birth_date))")
    .eq("status", "posted")
    .gte("paid_at", queryStart)
    .lt("paid_at", queryEnd)
    .in("operator_campus_id", campusAccess.campusIds)
    .order("paid_at", { ascending: false });

  if (filters.campusId) {
    if (!canAccessCampus(campusAccess, filters.campusId)) {
      return {
        date: dateStr,
        sessionOpenedAt,
        totalCobrado: 0,
        countedPaymentsCount: 0,
        excludedPaymentsCount: 0,
        byMethod: [],
        byChargeType: [],
        payments: [],
      };
    }
    query = query.eq("operator_campus_id", filters.campusId);
  }

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

  // Charge-type breakdown via payment_allocations
  let byChargeType: CorteByChargeType[] = [];
  if (countedPaymentIds.length > 0) {
    const { data: allocData } = await supabase
      .from("payment_allocations")
      .select("amount, charges(charge_types(code, name))")
      .in("payment_id", countedPaymentIds)
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
    sessionOpenedAt,
    totalCobrado: countedPayments.reduce((sum, p) => sum + p.amount, 0),
    countedPaymentsCount: countedPayments.length,
    excludedPaymentsCount: payments.length - countedPayments.length,
    byMethod,
    byChargeType,
    payments: payments.map((p) => ({
      id: p.id,
      enrollmentId: p.enrollment_id,
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
