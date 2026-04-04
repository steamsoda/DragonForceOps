import { createClient } from "@/lib/supabase/server";
import { canAccessCampus, getOperationalCampusAccess } from "@/lib/auth/campuses";

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: "Efectivo",
  transfer: "Transferencia",
  card: "Tarjeta",
  stripe_360player: "360Player",
  other: "Otro",
};

function toNumber(value: number | string | null | undefined) {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  return 0;
}

function parseJsonArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? (parsed as T[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}

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

  const { data } = await supabase
    .from("payments")
    .select(
      "id, folio, amount, method, paid_at, notes, enrollment_id, operator_campus_id, enrollments!inner(campus_id, campuses(name), players(first_name, last_name, birth_date))"
    )
    .eq("status", "posted")
    .gte("paid_at", queryStart)
    .lt("paid_at", queryEnd)
    .eq("operator_campus_id", selectedCampusId)
    .order("paid_at", { ascending: false })
    .returns<PaymentWithPlayer[]>();

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
  countedPayments.forEach((payment) => {
    const previous = byMethodMap.get(payment.method) ?? { count: 0, total: 0 };
    byMethodMap.set(payment.method, {
      count: previous.count + 1,
      total: previous.total + payment.amount,
    });
  });

  const byMethod: CorteByMethod[] = Array.from(byMethodMap.entries())
    .map(([method, values]) => ({
      method,
      methodLabel: PAYMENT_METHOD_LABELS[method] ?? method,
      count: values.count,
      total: values.total,
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

  let byChargeType: CorteByChargeType[] = [];
  let productDetails: CorteProductDetail[] = [];
  if (countedPaymentIds.length > 0) {
    const byChargeTypeMap = new Map<string, { typeName: string; total: number }>();
    const productDetailsMap = new Map<string, number>();

    (allocationData ?? [])
      .filter((allocation) => countedPaymentIds.includes(allocation.payment_id))
      .forEach((allocation) => {
        const code = allocation.charges?.charge_types?.code ?? "other";
        const name = allocation.charges?.charge_types?.name ?? "Otro";
        const previous = byChargeTypeMap.get(code) ?? { typeName: name, total: 0 };
        byChargeTypeMap.set(code, { typeName: name, total: previous.total + allocation.amount });

        if (allocation.charges?.product_id) {
          const productName =
            allocation.charges.description?.trim() || allocation.charges.charge_types?.name?.trim() || "Producto";
          productDetailsMap.set(productName, (productDetailsMap.get(productName) ?? 0) + allocation.amount);
        }
      });

    byChargeType = Array.from(byChargeTypeMap.entries())
      .map(([typeCode, values]) => ({
        typeCode,
        typeName: values.typeName,
        total: values.total,
      }))
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
    totalCobrado: countedPayments.reduce((sum, payment) => sum + payment.amount, 0),
    countedPaymentsCount: countedPayments.length,
    excludedPaymentsCount: payments.length - countedPayments.length,
    excludedPaymentsTotal,
    byMethod,
    byChargeType,
    productDetails,
    payments: payments.map((payment) => ({
      id: payment.id,
      enrollmentId: payment.enrollment_id,
      folio: payment.folio,
      playerName:
        `${payment.enrollments?.players?.first_name ?? ""} ${payment.enrollments?.players?.last_name ?? ""}`.trim() || "-",
      birthYear: payment.enrollments?.players?.birth_date
        ? parseInt(payment.enrollments.players.birth_date.slice(0, 4), 10)
        : null,
      playerCampusName: payment.enrollments?.campuses?.name ?? "-",
      operatorCampusName: operatorCampusById.get(payment.operator_campus_id) ?? "-",
      isCrossCampus: payment.operator_campus_id !== payment.enrollments?.campus_id,
      amount: payment.amount,
      method: payment.method,
      methodLabel: PAYMENT_METHOD_LABELS[payment.method] ?? payment.method,
      paidAt: payment.paid_at,
      notes: payment.notes,
      concepts: conceptsByPaymentId.get(payment.id) ?? [],
      excludedFromCorte: payment.method === "stripe_360player",
    })),
  };
}

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
  paymentCount: number;
  player360Amount: number;
  player360Count: number;
  historicalCatchupAmount: number;
  historicalCatchupCount: number;
  chargesByType: ChargesByType[];
  paymentsByMethod: PaymentsByMethod[];
};

type ResumenMensualRpcRow = {
  month: string;
  active_enrollments: number | string | null;
  total_cargos_emitidos: number | string | null;
  total_cobrado: number | string | null;
  pending_balance: number | string | null;
  payment_count: number | string | null;
  charges_by_type: unknown;
  payments_by_method: unknown;
  player_360_amount: number | string | null;
  player_360_count: number | string | null;
  historical_catchup_amount: number | string | null;
  historical_catchup_count: number | string | null;
};

export async function getResumenMensualData(filters: {
  month?: string;
  campusId?: string;
}): Promise<ResumenMensualData> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("get_resumen_mensual_summary", {
      p_month: filters.month ?? null,
      p_campus_id: filters.campusId ?? null,
    })
    .maybeSingle<ResumenMensualRpcRow>();

  if (error || !data) {
    return {
      month: filters.month ?? "",
      activeEnrollments: 0,
      totalCargosEmitidos: 0,
      totalCobrado: 0,
      pendingBalance: 0,
      paymentCount: 0,
      player360Amount: 0,
      player360Count: 0,
      historicalCatchupAmount: 0,
      historicalCatchupCount: 0,
      chargesByType: [],
      paymentsByMethod: [],
    };
  }

  const chargesByType = parseJsonArray<{
    typeCode: string;
    typeName: string;
    count: number | string;
    total: number | string;
  }>(data.charges_by_type).map((row) => ({
    typeCode: row.typeCode,
    typeName: row.typeName,
    count: Number(row.count ?? 0),
    total: toNumber(row.total),
  }));

  const paymentsByMethod = parseJsonArray<{
    method: string;
    methodLabel: string;
    count: number | string;
    total: number | string;
  }>(data.payments_by_method).map((row) => ({
    method: row.method,
    methodLabel: row.methodLabel ?? PAYMENT_METHOD_LABELS[row.method] ?? row.method,
    count: Number(row.count ?? 0),
    total: toNumber(row.total),
  }));

  return {
    month: data.month,
    activeEnrollments: Number(data.active_enrollments ?? 0),
    totalCargosEmitidos: toNumber(data.total_cargos_emitidos),
    totalCobrado: toNumber(data.total_cobrado),
    pendingBalance: toNumber(data.pending_balance),
    paymentCount: Number(data.payment_count ?? 0),
    player360Amount: toNumber(data.player_360_amount),
    player360Count: Number(data.player_360_count ?? 0),
    historicalCatchupAmount: toNumber(data.historical_catchup_amount),
    historicalCatchupCount: Number(data.historical_catchup_count ?? 0),
    chargesByType,
    paymentsByMethod,
  };
}

export type WeekByMethod = {
  method: string;
  methodLabel: string;
  total: number;
};

export type WeekSummary = {
  weekNum: number;
  label: string;
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
  paymentCount: number;
  player360Amount: number;
  player360Count: number;
  historicalCatchupAmount: number;
  historicalCatchupCount: number;
  weeks: WeekSummary[];
};

type CorteSemanalRpcRow = {
  month: string;
  month_label: string;
  total_cobrado: number | string | null;
  payment_count: number | string | null;
  player_360_amount: number | string | null;
  player_360_count: number | string | null;
  historical_catchup_amount: number | string | null;
  historical_catchup_count: number | string | null;
  weeks: unknown;
};

export async function getCorteSemanallData(filters: {
  month?: string;
  campusId?: string;
}): Promise<CorteSemanalData> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("get_corte_semanal_summary", {
      p_month: filters.month ?? null,
      p_campus_id: filters.campusId ?? null,
    })
    .maybeSingle<CorteSemanalRpcRow>();

  if (error || !data) {
    return {
      month: filters.month ?? "",
      monthLabel: "",
      totalCobrado: 0,
      paymentCount: 0,
      player360Amount: 0,
      player360Count: 0,
      historicalCatchupAmount: 0,
      historicalCatchupCount: 0,
      weeks: [],
    };
  }

  const weeks = parseJsonArray<{
    weekNum: number | string;
    label: string;
    startDay: number | string;
    endDay: number | string;
    totalCobrado: number | string;
    paymentCount: number | string;
    byMethod: unknown;
  }>(data.weeks).map((week) => ({
    weekNum: Number(week.weekNum ?? 0),
    label: week.label,
    startDay: Number(week.startDay ?? 0),
    endDay: Number(week.endDay ?? 0),
    totalCobrado: toNumber(week.totalCobrado),
    paymentCount: Number(week.paymentCount ?? 0),
    byMethod: parseJsonArray<{
      method: string;
      methodLabel: string;
      total: number | string;
    }>(week.byMethod).map((method) => ({
      method: method.method,
      methodLabel: method.methodLabel ?? PAYMENT_METHOD_LABELS[method.method] ?? method.method,
      total: toNumber(method.total),
    })),
  }));

  return {
    month: data.month,
    monthLabel: data.month_label,
    totalCobrado: toNumber(data.total_cobrado),
    paymentCount: Number(data.payment_count ?? 0),
    player360Amount: toNumber(data.player_360_amount),
    player360Count: Number(data.player_360_count ?? 0),
    historicalCatchupAmount: toNumber(data.historical_catchup_amount),
    historicalCatchupCount: Number(data.historical_catchup_count ?? 0),
    weeks,
  };
}
