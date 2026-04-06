import { createClient } from "@/lib/supabase/server";
import { canAccessCampus, getOperationalCampusAccess } from "@/lib/auth/campuses";

type EnrollmentRow = {
  id: string;
  status: string;
  start_date: string;
  end_date: string | null;
  campus_id: string;
  campuses: {
    id: string | null;
    name: string | null;
    code: string | null;
  } | null;
  players: {
    id: string | null;
    first_name: string | null;
    last_name: string | null;
    birth_date: string | null;
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
  operator_campus_id: string;
};

type AllocationRow = {
  id?: string;
  payment_id: string;
  charge_id: string;
  amount: number;
};

type PaymentRefundRow = {
  payment_id: string;
  refunded_at: string;
  refund_method: string;
  reason: string;
  notes: string | null;
  amount: number;
};

type ChargeTypeRow = {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
};

type EnrollmentIncidentRow = {
  id: string;
  incident_type: string;
  note: string | null;
  omit_period_month: string | null;
  starts_on: string | null;
  ends_on: string | null;
  created_at: string;
  cancelled_at: string | null;
  consumed_at: string | null;
};

export type EnrollmentLedger = {
  enrollment: {
    id: string;
    status: string;
    startDate: string;
    endDate: string | null;
    playerId: string | null;
    campusId: string;
    campusName: string;
    campusCode: string;
    playerName: string;
    birthYear: number | null;
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
    operatorCampusId: string;
    operatorCampusName: string;
    isCrossCampus: boolean;
    refundStatus: "not_refunded" | "refunded";
    refundedAt: string | null;
    refundMethod: string | null;
    refundReason: string | null;
    refundNotes: string | null;
    canReassign: boolean;
    reassignBlockedReason: string | null;
    sourceCharges: Array<{
      chargeId: string;
      description: string;
      typeCode: string;
      typeName: string;
      amount: number;
      allocatedAmount: number;
    }>;
  }>;
  incidents: Array<{
    id: string;
    typeCode: string;
    typeName: string;
    note: string | null;
    omitPeriodMonth: string | null;
    startsOn: string | null;
    endsOn: string | null;
    status: "record_only" | "omission_active" | "used" | "cancelled";
    createdAt: string;
    cancelledAt: string | null;
    consumedAt: string | null;
  }>;
};

const INCIDENT_LABELS: Record<string, string> = {
  absence: "Ausencia",
  injury: "Lesión",
  other: "Otro",
};

function getIncidentStatus(
  row: EnrollmentIncidentRow
): "record_only" | "omission_active" | "used" | "cancelled" {
  if (row.cancelled_at) return "cancelled";
  if (row.omit_period_month && row.consumed_at) return "used";
  if (row.omit_period_month) return "omission_active";
  return "record_only";
}

export async function getEnrollmentLedger(enrollmentId: string): Promise<EnrollmentLedger | null> {
  const supabase = await createClient();
  const campusAccess = await getOperationalCampusAccess();
  if (!campusAccess) return null;

  const [{ data: enrollment }, { data: balance }, { data: charges }, { data: payments }, { data: incidents }] = await Promise.all([
    supabase
      .from("enrollments")
      .select("id, status, start_date, end_date, campus_id, campuses(id, name, code), players(id, first_name, last_name, birth_date), pricing_plans(name, currency)")
      .eq("id", enrollmentId)
      .maybeSingle()
      .returns<EnrollmentRow | null>(),
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
      .select("id, paid_at, method, amount, currency, status, notes, created_at, operator_campus_id")
      .eq("enrollment_id", enrollmentId)
      .order("paid_at", { ascending: false })
      .returns<PaymentRow[]>(),
    supabase
      .from("enrollment_incidents")
      .select("id, incident_type, note, omit_period_month, starts_on, ends_on, created_at, cancelled_at, consumed_at")
      .eq("enrollment_id", enrollmentId)
      .order("created_at", { ascending: false })
      .returns<EnrollmentIncidentRow[]>()
  ]);

  if (!enrollment) return null;
  if (!canAccessCampus(campusAccess, enrollment.campus_id)) return null;

  const operatorCampusIds = [...new Set((payments ?? []).map((row) => row.operator_campus_id).filter(Boolean))];
  const campusIdsToLoad = [...new Set([enrollment.campus_id, ...operatorCampusIds])];
  const { data: campusRows } = campusIdsToLoad.length
    ? await supabase
        .from("campuses")
        .select("id, name, code")
        .in("id", campusIdsToLoad)
        .returns<Array<{ id: string; name: string; code: string }>>()
    : { data: [] };
  const campusById = new Map((campusRows ?? []).map((campus) => [campus.id, campus]));

  const chargeIds = (charges ?? []).map((row) => row.id);
  const paymentIds = (payments ?? []).map((row) => row.id);

  let allocations: AllocationRow[] = [];
  if (chargeIds.length > 0) {
    let allocationQuery = supabase
      .from("payment_allocations")
      .select("payment_id, charge_id, amount");

    allocationQuery = allocationQuery.in("charge_id", chargeIds);

    const { data: allocationRows } = await allocationQuery.returns<AllocationRow[]>();
    allocations = allocationRows ?? [];
  }

  const { data: refundRows } = paymentIds.length
    ? await supabase
        .from("payment_refunds")
        .select("payment_id, refunded_at, refund_method, reason, notes, amount")
        .in("payment_id", paymentIds)
        .returns<PaymentRefundRow[]>()
    : { data: [] as PaymentRefundRow[] };

  const allocatedByCharge = new Map<string, number>();
  const allocatedByPayment = new Map<string, number>();
  const allocationsByPayment = new Map<string, AllocationRow[]>();
  const allocationsByCharge = new Map<string, AllocationRow[]>();
  const chargeById = new Map(
    (charges ?? []).map((charge) => [
      charge.id,
      {
        id: charge.id,
        description: charge.description,
        amount: charge.amount,
        typeCode: charge.charge_types?.code ?? "-",
        typeName: charge.charge_types?.name ?? "-",
        status: charge.status,
      },
    ]),
  );
  const refundByPaymentId = new Map((refundRows ?? []).map((row) => [row.payment_id, row]));

  allocations.forEach((row) => {
    allocatedByCharge.set(row.charge_id, (allocatedByCharge.get(row.charge_id) ?? 0) + row.amount);
    allocatedByPayment.set(row.payment_id, (allocatedByPayment.get(row.payment_id) ?? 0) + row.amount);
    allocationsByPayment.set(row.payment_id, [...(allocationsByPayment.get(row.payment_id) ?? []), row]);
    allocationsByCharge.set(row.charge_id, [...(allocationsByCharge.get(row.charge_id) ?? []), row]);
  });

  return {
    enrollment: {
      id: enrollment.id,
      status: enrollment.status,
      startDate: enrollment.start_date,
      endDate: enrollment.end_date,
      playerId: enrollment.players?.id ?? null,
      campusId: enrollment.campus_id,
      campusName: enrollment.campuses?.name ?? "-",
      campusCode: enrollment.campuses?.code ?? "-",
      playerName: `${enrollment.players?.first_name ?? ""} ${enrollment.players?.last_name ?? ""}`.trim(),
      birthYear: enrollment.players?.birth_date
        ? new Date(enrollment.players.birth_date).getUTCFullYear()
        : null,
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
    payments: (payments ?? []).map((row) => {
      const paymentAllocations = allocationsByPayment.get(row.id) ?? [];
      const refund = refundByPaymentId.get(row.id) ?? null;
      const sourceCharges = paymentAllocations.map((allocation) => {
        const charge = chargeById.get(allocation.charge_id);
        return {
          chargeId: allocation.charge_id,
          description: charge?.description ?? "Cargo",
          typeCode: charge?.typeCode ?? "-",
          typeName: charge?.typeName ?? "-",
          amount: charge?.amount ?? allocation.amount,
          allocatedAmount: allocation.amount,
        };
      });

      let reassignBlockedReason: string | null = null;
      if (row.status !== "posted") {
        reassignBlockedReason = "payment_not_posted";
      } else if (refund) {
        reassignBlockedReason = "payment_already_refunded";
      } else if (paymentAllocations.length === 0) {
        reassignBlockedReason = "payment_has_no_allocations";
      } else if (Math.abs((allocatedByPayment.get(row.id) ?? 0) - row.amount) > 0.01) {
        reassignBlockedReason = "payment_not_fully_allocated";
      } else if (
        paymentAllocations.some((allocation) => {
          const chargeAllocations = allocationsByCharge.get(allocation.charge_id) ?? [];
          return chargeAllocations.some((chargeAllocation) => chargeAllocation.payment_id !== row.id);
        })
      ) {
        reassignBlockedReason = "source_charge_shared";
      } else if (
        paymentAllocations.some((allocation) => {
          const charge = chargeById.get(allocation.charge_id);
          const totalAllocated = allocatedByCharge.get(allocation.charge_id) ?? 0;
          return !charge || Math.abs(charge.amount - totalAllocated) > 0.01 || charge.status === "void";
        })
      ) {
        reassignBlockedReason = "source_charge_not_exclusive";
      }

      return {
        id: row.id,
        paidAt: row.paid_at,
        method: row.method,
        amount: row.amount,
        currency: row.currency,
        status: row.status,
        notes: row.notes,
        createdAt: row.created_at,
        allocatedAmount: allocatedByPayment.get(row.id) ?? 0,
        operatorCampusId: row.operator_campus_id,
        operatorCampusName: campusById.get(row.operator_campus_id)?.name ?? "-",
        isCrossCampus: row.operator_campus_id !== enrollment.campus_id,
        refundStatus: refund ? "refunded" : "not_refunded",
        refundedAt: refund?.refunded_at ?? null,
        refundMethod: refund?.refund_method ?? null,
        refundReason: refund?.reason ?? null,
        refundNotes: refund?.notes ?? null,
        canReassign: reassignBlockedReason === null,
        reassignBlockedReason,
        sourceCharges,
      };
    }),
    incidents: (incidents ?? []).map((row) => ({
      id: row.id,
      typeCode: row.incident_type,
      typeName: INCIDENT_LABELS[row.incident_type] ?? row.incident_type,
      note: row.note,
      omitPeriodMonth: row.omit_period_month,
      startsOn: row.starts_on,
      endsOn: row.ends_on,
      status: getIncidentStatus(row),
      createdAt: row.created_at,
      cancelledAt: row.cancelled_at,
      consumedAt: row.consumed_at,
    })),
  };
}

export async function getEnrollmentChargeFormContext(enrollmentId: string) {
  const supabase = await createClient();
  const campusAccess = await getOperationalCampusAccess();
  if (!campusAccess) return null;

  const [{ data: enrollment }, { data: chargeTypes }] = await Promise.all([
    supabase
      .from("enrollments")
      .select("id, status, campus_id, campuses(name, code), players(first_name, last_name), pricing_plans(currency)")
      .eq("id", enrollmentId)
      .maybeSingle()
      .returns<
        | {
            id: string;
            status: string;
            campus_id: string;
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
  if (!canAccessCampus(campusAccess, enrollment.campus_id)) return null;

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
