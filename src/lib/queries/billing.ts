import { createClient } from "@/lib/supabase/server";

type EnrollmentRow = {
  id: string;
  status: string;
  start_date: string;
  end_date: string | null;
  campuses: {
    name: string | null;
    code: string | null;
  } | null;
  players: {
    first_name: string | null;
    last_name: string | null;
  } | null;
  pricing_plans: {
    name: string | null;
    currency: string | null;
  } | null;
};

type BalanceRow = {
  enrollment_id: string;
  total_charges: number;
  total_payments: number;
  balance: number;
};

type ChargeRow = {
  id: string;
  description: string;
  amount: number;
  currency: string;
  status: string;
  due_date: string | null;
  period_month: string | null;
  created_at: string;
  charge_types: {
    code: string | null;
    name: string | null;
  } | null;
};

type PaymentRow = {
  id: string;
  paid_at: string;
  method: string;
  amount: number;
  currency: string;
  status: string;
  notes: string | null;
  created_at: string;
};

type AllocationRow = {
  payment_id: string;
  charge_id: string;
  amount: number;
};

type ChargeTypeRow = {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
};

export type EnrollmentLedger = {
  enrollment: {
    id: string;
    status: string;
    startDate: string;
    endDate: string | null;
    campusName: string;
    campusCode: string;
    playerName: string;
    pricingPlanName: string;
    currency: string;
  };
  totals: {
    totalCharges: number;
    totalPayments: number;
    balance: number;
  };
  charges: Array<{
    id: string;
    typeCode: string;
    typeName: string;
    description: string;
    amount: number;
    currency: string;
    status: string;
    dueDate: string | null;
    periodMonth: string | null;
    createdAt: string;
    allocatedAmount: number;
    pendingAmount: number;
  }>;
  payments: Array<{
    id: string;
    paidAt: string;
    method: string;
    amount: number;
    currency: string;
    status: string;
    notes: string | null;
    createdAt: string;
    allocatedAmount: number;
  }>;
};

export async function getEnrollmentLedger(enrollmentId: string): Promise<EnrollmentLedger | null> {
  const supabase = await createClient();

  const { data: enrollment } = await supabase
    .from("enrollments")
    .select("id, status, start_date, end_date, campuses(name, code), players(first_name, last_name), pricing_plans(name, currency)")
    .eq("id", enrollmentId)
    .maybeSingle()
    .returns<EnrollmentRow | null>();

  if (!enrollment) return null;

  const [{ data: balance }, { data: charges }, { data: payments }] = await Promise.all([
    supabase
      .from("v_enrollment_balances")
      .select("enrollment_id, total_charges, total_payments, balance")
      .eq("enrollment_id", enrollmentId)
      .maybeSingle()
      .returns<BalanceRow | null>(),
    supabase
      .from("charges")
      .select("id, description, amount, currency, status, due_date, period_month, created_at, charge_types(code, name)")
      .eq("enrollment_id", enrollmentId)
      .order("created_at", { ascending: false })
      .returns<ChargeRow[]>(),
    supabase
      .from("payments")
      .select("id, paid_at, method, amount, currency, status, notes, created_at")
      .eq("enrollment_id", enrollmentId)
      .order("paid_at", { ascending: false })
      .returns<PaymentRow[]>()
  ]);

  const chargeIds = (charges ?? []).map((row) => row.id);
  const paymentIds = (payments ?? []).map((row) => row.id);

  let allocations: AllocationRow[] = [];
  if (chargeIds.length > 0 || paymentIds.length > 0) {
    let allocationQuery = supabase
      .from("payment_allocations")
      .select("payment_id, charge_id, amount");

    if (chargeIds.length > 0 && paymentIds.length > 0) {
      allocationQuery = allocationQuery.in("charge_id", chargeIds).in("payment_id", paymentIds);
    } else if (chargeIds.length > 0) {
      allocationQuery = allocationQuery.in("charge_id", chargeIds);
    } else if (paymentIds.length > 0) {
      allocationQuery = allocationQuery.in("payment_id", paymentIds);
    }

    const { data: allocationRows } = await allocationQuery.returns<AllocationRow[]>();
    allocations = allocationRows ?? [];
  }

  const allocatedByCharge = new Map<string, number>();
  const allocatedByPayment = new Map<string, number>();

  allocations.forEach((row) => {
    allocatedByCharge.set(row.charge_id, (allocatedByCharge.get(row.charge_id) ?? 0) + row.amount);
    allocatedByPayment.set(row.payment_id, (allocatedByPayment.get(row.payment_id) ?? 0) + row.amount);
  });

  return {
    enrollment: {
      id: enrollment.id,
      status: enrollment.status,
      startDate: enrollment.start_date,
      endDate: enrollment.end_date,
      campusName: enrollment.campuses?.name ?? "-",
      campusCode: enrollment.campuses?.code ?? "-",
      playerName: `${enrollment.players?.first_name ?? ""} ${enrollment.players?.last_name ?? ""}`.trim(),
      pricingPlanName: enrollment.pricing_plans?.name ?? "-",
      currency: enrollment.pricing_plans?.currency ?? "MXN"
    },
    totals: {
      totalCharges: balance?.total_charges ?? 0,
      totalPayments: balance?.total_payments ?? 0,
      balance: balance?.balance ?? 0
    },
    charges: (charges ?? []).map((row) => {
      const allocatedAmount = allocatedByCharge.get(row.id) ?? 0;
      return {
        id: row.id,
        typeCode: row.charge_types?.code ?? "-",
        typeName: row.charge_types?.name ?? "-",
        description: row.description,
        amount: row.amount,
        currency: row.currency,
        status: row.status,
        dueDate: row.due_date,
        periodMonth: row.period_month,
        createdAt: row.created_at,
        allocatedAmount,
        pendingAmount: Math.max(row.amount - allocatedAmount, 0)
      };
    }),
    payments: (payments ?? []).map((row) => ({
      id: row.id,
      paidAt: row.paid_at,
      method: row.method,
      amount: row.amount,
      currency: row.currency,
      status: row.status,
      notes: row.notes,
      createdAt: row.created_at,
      allocatedAmount: allocatedByPayment.get(row.id) ?? 0
    }))
  };
}

export async function getEnrollmentChargeFormContext(enrollmentId: string) {
  const supabase = await createClient();

  const [{ data: enrollment }, { data: chargeTypes }] = await Promise.all([
    supabase
      .from("enrollments")
      .select("id, status, campuses(name, code), players(first_name, last_name), pricing_plans(currency)")
      .eq("id", enrollmentId)
      .maybeSingle()
      .returns<
        | {
            id: string;
            status: string;
            campuses: { name: string | null; code: string | null } | null;
            players: { first_name: string | null; last_name: string | null } | null;
            pricing_plans: { currency: string | null } | null;
          }
        | null
      >(),
    supabase
      .from("charge_types")
      .select("id, code, name, is_active")
      .eq("is_active", true)
      .order("name", { ascending: true })
      .returns<ChargeTypeRow[]>()
  ]);

  if (!enrollment) return null;

  return {
    enrollment: {
      id: enrollment.id,
      status: enrollment.status,
      campusName: enrollment.campuses?.name ?? "-",
      campusCode: enrollment.campuses?.code ?? "-",
      playerName: `${enrollment.players?.first_name ?? ""} ${enrollment.players?.last_name ?? ""}`.trim(),
      currency: enrollment.pricing_plans?.currency ?? "MXN"
    },
    chargeTypes: (chargeTypes ?? []).map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name
    }))
  };
}
