import { getPermissionContext, type PermissionContext } from "@/lib/auth/permissions";
import { formatPeriodMonthLabel } from "@/lib/pricing/plans";
import { getEnrollmentLedger } from "@/lib/queries/billing";
import { getMonterreyMonthString } from "@/lib/time";

type RefundAmountRow = {
  payment_id: string;
  amount: number | string | null;
};

type CanonicalBalanceRow = {
  enrollment_id: string;
  balance: number | string | null;
};

type DiagnosticTone = "slate" | "amber" | "rose" | "emerald";
type DiagnosticSeverity = "warning" | "needs_correction";

export type EnrollmentFinanceDiagnosticHealth = "healthy" | "warning" | "needs_correction";

export type EnrollmentFinanceSummaryFlag = {
  key: string;
  tone: DiagnosticTone;
  label: string;
  detail: string;
};

export type EnrollmentFinancePaymentDiagnostic = {
  paymentId: string;
  severity: DiagnosticSeverity;
  title: string;
  detail: string;
  paidAt: string;
  method: string;
  amount: number;
  allocatedAmount: number;
  refundAmount: number;
  reassignBlockedReason: string | null;
};

export type EnrollmentFinanceChargeDiagnostic = {
  chargeId: string;
  severity: DiagnosticSeverity;
  title: string;
  detail: string;
  description: string;
  periodMonth: string | null;
  amount: number;
  allocatedAmount: number;
  pendingAmount: number;
  status: string;
};

export type EnrollmentFinanceMonthlyWarning = {
  key: string;
  severity: DiagnosticSeverity;
  title: string;
  detail: string;
  periodMonth: string;
  chargeIds: string[];
};

export type EnrollmentFinanceAllocationWarning = {
  key: string;
  severity: DiagnosticSeverity;
  title: string;
  detail: string;
};

export type EnrollmentFinanceDiagnostics = {
  health: EnrollmentFinanceDiagnosticHealth;
  canonicalBalance: number;
  ledgerTotals: {
    totalCharges: number;
    totalPayments: number;
    currentBalance: number;
    derivedOperationalBalance: number;
    derivedBalanceDrift: number;
    pendingChargeTotal: number;
    unappliedPostedAmount: number;
    refundedPaymentTotal: number;
    voidedChargeCount: number;
  };
  issueCount: number;
  summaryFlags: EnrollmentFinanceSummaryFlag[];
  paymentDiagnostics: EnrollmentFinancePaymentDiagnostic[];
  chargeDiagnostics: EnrollmentFinanceChargeDiagnostic[];
  monthlyTuitionWarnings: EnrollmentFinanceMonthlyWarning[];
  allocationWarnings: EnrollmentFinanceAllocationWarning[];
};

function toNumber(value: number | string | null | undefined) {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  return 0;
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function getReassignBlockedReasonDetail(code: string | null) {
  const messages: Record<string, string> = {
    payment_has_no_allocations: "El pago ya no tiene cargos aplicados.",
    payment_not_fully_allocated: "El pago solo est\u00e1 aplicado parcialmente.",
    source_charge_shared: "El cargo origen tambi\u00e9n tiene otros pagos aplicados.",
    source_charge_not_exclusive: "El cargo origen no est\u00e1 cubierto de forma exclusiva por este pago.",
  };
  return code ? messages[code] ?? null : null;
}

export async function getEnrollmentFinanceDiagnostics(
  enrollmentId: string,
  permissionContext?: PermissionContext | null,
): Promise<EnrollmentFinanceDiagnostics | null> {
  const context = permissionContext ?? (await getPermissionContext());
  if (!context?.isSuperAdmin) return null;

  const ledger = await getEnrollmentLedger(enrollmentId);
  if (!ledger) return null;

  const paymentIds = ledger.payments.map((row) => row.id);
  const supabase = context.supabase;
  const [{ data: canonicalRow }, { data: refundRows }] = await Promise.all([
    supabase
      .from("v_enrollment_balances")
      .select("enrollment_id, balance")
      .eq("enrollment_id", enrollmentId)
      .maybeSingle()
      .returns<CanonicalBalanceRow | null>(),
    paymentIds.length > 0
      ? supabase
          .from("payment_refunds")
          .select("payment_id, amount")
          .in("payment_id", paymentIds)
          .returns<RefundAmountRow[]>()
      : Promise.resolve({ data: [] as RefundAmountRow[] }),
  ]);

  const refundAmountByPaymentId = new Map((refundRows ?? []).map((row) => [row.payment_id, toNumber(row.amount)]));
  const canonicalBalance = roundMoney(toNumber(canonicalRow?.balance ?? ledger.totals.balance));

  const activePostedPayments = ledger.payments.filter(
    (payment) => payment.status === "posted" && payment.refundStatus !== "refunded",
  );
  const unappliedPostedAmount = roundMoney(
    activePostedPayments.reduce((sum, payment) => sum + Math.max(payment.amount - payment.allocatedAmount, 0), 0),
  );
  const refundedPaymentTotal = roundMoney(
    ledger.payments.reduce((sum, payment) => sum + (refundAmountByPaymentId.get(payment.id) ?? 0), 0),
  );
  const voidedChargeCount = ledger.charges.filter((charge) => charge.status === "void").length;
  const pendingChargeTotal = roundMoney(
    ledger.charges
      .filter((charge) => charge.status !== "void")
      .reduce((sum, charge) => sum + charge.pendingAmount, 0),
  );
  const derivedOperationalBalance = roundMoney(pendingChargeTotal - unappliedPostedAmount);
  const derivedBalanceDrift = roundMoney(canonicalBalance - derivedOperationalBalance);

  const paymentDiagnostics: EnrollmentFinancePaymentDiagnostic[] = [];
  for (const payment of ledger.payments) {
    const refundAmount = refundAmountByPaymentId.get(payment.id) ?? 0;

    if (payment.refundStatus === "refunded") {
      if (payment.allocatedAmount > 0.01) {
        paymentDiagnostics.push({
          paymentId: payment.id,
          severity: "needs_correction",
          title: "Pago reembolsado con asignaciones activas",
          detail: "El reembolso deber\u00eda haber liberado todas las asignaciones de este pago.",
          paidAt: payment.paidAt,
          method: payment.method,
          amount: payment.amount,
          allocatedAmount: payment.allocatedAmount,
          refundAmount,
          reassignBlockedReason: payment.reassignBlockedReason,
        });
        continue;
      }

      if (Math.abs(refundAmount - payment.amount) > 0.01) {
        paymentDiagnostics.push({
          paymentId: payment.id,
          severity: "warning",
          title: "Reembolso con monto at\u00edpico",
          detail: "El monto del reembolso no coincide con el monto total del pago original.",
          paidAt: payment.paidAt,
          method: payment.method,
          amount: payment.amount,
          allocatedAmount: payment.allocatedAmount,
          refundAmount,
          reassignBlockedReason: payment.reassignBlockedReason,
        });
      }
      continue;
    }

    if (payment.status === "posted" && payment.allocatedAmount < 0.01) {
      paymentDiagnostics.push({
        paymentId: payment.id,
        severity: "warning",
        title: "Pago registrado sin asignaciones",
        detail: "El pago sigue vigente, pero no est\u00e1 aplicado a ning\u00fan cargo.",
        paidAt: payment.paidAt,
        method: payment.method,
        amount: payment.amount,
        allocatedAmount: payment.allocatedAmount,
        refundAmount,
        reassignBlockedReason: payment.reassignBlockedReason,
      });
      continue;
    }

    if (payment.status === "posted" && payment.allocatedAmount + 0.01 < payment.amount) {
      paymentDiagnostics.push({
        paymentId: payment.id,
        severity: "warning",
        title: "Pago parcialmente asignado",
        detail: "Hay una parte del pago que sigue como cr\u00e9dito no aplicado.",
        paidAt: payment.paidAt,
        method: payment.method,
        amount: payment.amount,
        allocatedAmount: payment.allocatedAmount,
        refundAmount,
        reassignBlockedReason: payment.reassignBlockedReason,
      });
      continue;
    }

    const reassignDetail = getReassignBlockedReasonDetail(payment.reassignBlockedReason);
    if (payment.status === "posted" && reassignDetail) {
      paymentDiagnostics.push({
        paymentId: payment.id,
        severity: "warning",
        title: "Pago con estructura de asignaci\u00f3n delicada",
        detail: reassignDetail,
        paidAt: payment.paidAt,
        method: payment.method,
        amount: payment.amount,
        allocatedAmount: payment.allocatedAmount,
        refundAmount,
        reassignBlockedReason: payment.reassignBlockedReason,
      });
    }
  }

  const chargeDiagnostics: EnrollmentFinanceChargeDiagnostic[] = [];
  for (const charge of ledger.charges) {
    if (charge.status === "void" && charge.allocatedAmount > 0.01) {
      chargeDiagnostics.push({
        chargeId: charge.id,
        severity: "needs_correction",
        title: "Cargo anulado con pagos aplicados",
        detail: "Un cargo anulado no deber\u00eda conservar asignaciones activas.",
        description: charge.description,
        periodMonth: charge.periodMonth,
        amount: charge.amount,
        allocatedAmount: charge.allocatedAmount,
        pendingAmount: charge.pendingAmount,
        status: charge.status,
      });
      continue;
    }

    if (charge.status !== "void" && charge.allocatedAmount - charge.amount > 0.01) {
      chargeDiagnostics.push({
        chargeId: charge.id,
        severity: "needs_correction",
        title: "Cargo sobreaplicado",
        detail: "El monto aplicado supera el monto total del cargo.",
        description: charge.description,
        periodMonth: charge.periodMonth,
        amount: charge.amount,
        allocatedAmount: charge.allocatedAmount,
        pendingAmount: charge.pendingAmount,
        status: charge.status,
      });
      continue;
    }

    if (charge.status === "paid" && charge.pendingAmount > 0.01) {
      chargeDiagnostics.push({
        chargeId: charge.id,
        severity: "warning",
        title: "Cargo marcado como pagado con saldo pendiente",
        detail: "El estatus del cargo no coincide con el saldo pendiente visible.",
        description: charge.description,
        periodMonth: charge.periodMonth,
        amount: charge.amount,
        allocatedAmount: charge.allocatedAmount,
        pendingAmount: charge.pendingAmount,
        status: charge.status,
      });
    }
  }

  const monthlyTuitionWarnings: EnrollmentFinanceMonthlyWarning[] = [];
  const currentPeriodMonth = `${getMonterreyMonthString()}-01`;
  const monthlyGroups = new Map<string, typeof ledger.charges>();
  for (const charge of ledger.charges) {
    if (charge.typeCode !== "monthly_tuition" || charge.status === "void" || !charge.periodMonth) continue;
    monthlyGroups.set(charge.periodMonth, [...(monthlyGroups.get(charge.periodMonth) ?? []), charge]);
  }

  for (const [periodMonth, charges] of monthlyGroups.entries()) {
    if (charges.length > 1) {
      monthlyTuitionWarnings.push({
        key: `duplicate-${periodMonth}`,
        severity: "needs_correction",
        title: `Mensualidades duplicadas en ${formatPeriodMonthLabel(periodMonth)}`,
        detail: `Existen ${charges.length} mensualidades activas para el mismo periodo.`,
        periodMonth,
        chargeIds: charges.map((charge) => charge.id),
      });
    }

    const partiallyAllocatedCharge = charges.find(
      (charge) =>
        !!charge.periodMonth &&
        charge.periodMonth >= currentPeriodMonth &&
        charge.allocatedAmount > 0.01 &&
        charge.pendingAmount > 0.01,
    );
    if (partiallyAllocatedCharge) {
      monthlyTuitionWarnings.push({
        key: `allocated-${partiallyAllocatedCharge.id}`,
        severity: "warning",
        title: `Mensualidad con repricio inseguro en ${formatPeriodMonthLabel(periodMonth)}`,
        detail: "La mensualidad ya tiene pagos aplicados parcialmente; cualquier cambio de monto requiere correcci\u00f3n manual.",
        periodMonth,
        chargeIds: [partiallyAllocatedCharge.id],
      });
    }
  }

  const allocationWarnings: EnrollmentFinanceAllocationWarning[] = [];
  if (Math.abs(derivedBalanceDrift) > 0.01) {
    allocationWarnings.push({
      key: "derived-balance-drift",
      severity: "needs_correction",
      title: "Saldo can\u00f3nico distinto del saldo operativo derivado",
      detail: "La suma de cargos pendientes y cr\u00e9ditos no aplicados no coincide con el saldo can\u00f3nico de la inscripci\u00f3n.",
    });
  }

  if (unappliedPostedAmount > 0.01) {
    allocationWarnings.push({
      key: "unapplied-credit",
      severity: "warning",
      title: "Cr\u00e9dito no aplicado",
      detail: "Hay pagos vigentes con saldo todav\u00eda libre, lo que puede explicar diferencias operativas en la cuenta.",
    });
  }

  const issueCount =
    paymentDiagnostics.length +
    chargeDiagnostics.length +
    monthlyTuitionWarnings.length +
    allocationWarnings.length;

  const health: EnrollmentFinanceDiagnosticHealth =
    paymentDiagnostics.some((row) => row.severity === "needs_correction") ||
    chargeDiagnostics.some((row) => row.severity === "needs_correction") ||
    monthlyTuitionWarnings.some((row) => row.severity === "needs_correction") ||
    allocationWarnings.some((row) => row.severity === "needs_correction")
      ? "needs_correction"
      : issueCount > 0
        ? "warning"
        : "healthy";

  const summaryFlags: EnrollmentFinanceSummaryFlag[] = [];
  summaryFlags.push({
    key: "canonical-balance",
    tone: canonicalBalance > 0.01 ? "amber" : canonicalBalance < -0.01 ? "emerald" : "slate",
    label: "Saldo can\u00f3nico",
    detail: canonicalBalance > 0.01
      ? "La inscripci\u00f3n sigue con saldo vivo."
      : canonicalBalance < -0.01
        ? "La cuenta carga cr\u00e9dito neto."
        : "La cuenta est\u00e1 en cero.",
  });

  if (Math.abs(derivedBalanceDrift) > 0.01) {
    summaryFlags.push({
      key: "drift",
      tone: "rose",
      label: "Drift operativo",
      detail: "El saldo can\u00f3nico no coincide con el saldo sugerido por cargos pendientes y cr\u00e9ditos visibles.",
    });
  }

  if (unappliedPostedAmount > 0.01) {
    summaryFlags.push({
      key: "credit",
      tone: "amber",
      label: "Cr\u00e9dito libre",
      detail: "Hay pagos registrados sin aplicar por completo.",
    });
  }

  if (refundedPaymentTotal > 0.01) {
    summaryFlags.push({
      key: "refunds",
      tone: "slate",
      label: "Reembolsos",
      detail: "La cuenta ya tiene movimientos de reembolso registrados.",
    });
  }

  if (voidedChargeCount > 0) {
    summaryFlags.push({
      key: "voided-charges",
      tone: "slate",
      label: "Cargos anulados",
      detail: "Existen cargos anulados en el historial de la cuenta.",
    });
  }

  if (issueCount === 0) {
    summaryFlags.push({
      key: "healthy",
      tone: "emerald",
      label: "Sin alertas",
      detail: "No se detectaron anomal\u00edas financieras en esta cuenta.",
    });
  }

  return {
    health,
    canonicalBalance,
    ledgerTotals: {
      totalCharges: ledger.totals.totalCharges,
      totalPayments: ledger.totals.totalPayments,
      currentBalance: ledger.totals.balance,
      derivedOperationalBalance,
      derivedBalanceDrift,
      pendingChargeTotal,
      unappliedPostedAmount,
      refundedPaymentTotal,
      voidedChargeCount,
    },
    issueCount,
    summaryFlags,
    paymentDiagnostics,
    chargeDiagnostics,
    monthlyTuitionWarnings,
    allocationWarnings,
  };
}
