import { canAccessEnrollmentRecord, getPermissionContext, type PermissionContext } from "@/lib/auth/permissions";
import type {
  EnrollmentFinanceAnomaly,
  EnrollmentFinanceAnomalyCode,
  EnrollmentFinanceAnomalySnapshot,
} from "@/lib/finance/enrollment-anomalies";
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
  enrollment: {
    enrollmentId: string;
    playerId: string | null;
    playerName: string;
    birthYear: number | null;
    campusId: string;
    campusName: string;
  };
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
  anomalies: EnrollmentFinanceAnomaly[];
  anomalySnapshot: EnrollmentFinanceAnomalySnapshot;
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
    payment_not_fully_allocated: "El pago solo esta aplicado parcialmente.",
    source_charge_shared: "El cargo origen tambien tiene otros pagos aplicados.",
    source_charge_not_exclusive: "El cargo origen no esta cubierto de forma exclusiva por este pago.",
  };
  return code ? messages[code] ?? null : null;
}

function createAnomaly(args: {
  key: string;
  code: EnrollmentFinanceAnomalyCode;
  severity: DiagnosticSeverity;
  title: string;
  detail: string;
  chargeIds?: string[];
  paymentIds?: string[];
}): EnrollmentFinanceAnomaly {
  return {
    key: args.key,
    code: args.code,
    severity: args.severity,
    title: args.title,
    detail: args.detail,
    chargeIds: args.chargeIds ?? [],
    paymentIds: args.paymentIds ?? [],
  };
}

export async function getEnrollmentFinanceDiagnostics(
  enrollmentId: string,
  permissionContext?: PermissionContext | null,
): Promise<EnrollmentFinanceDiagnostics | null> {
  const context = permissionContext ?? (await getPermissionContext());
  if (!context?.hasOperationalAccess) return null;
  if (!(await canAccessEnrollmentRecord(enrollmentId, context))) return null;

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
  const anomalies: EnrollmentFinanceAnomaly[] = [];

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
  const netChargeExposureTotal = roundMoney(
    ledger.charges
      .filter((charge) => charge.status !== "void")
      .reduce((sum, charge) => sum + (charge.amount - charge.allocatedAmount), 0),
  );
  const derivedOperationalBalance = roundMoney(netChargeExposureTotal - unappliedPostedAmount);
  const derivedBalanceDrift = roundMoney(canonicalBalance - derivedOperationalBalance);

  const paymentDiagnostics: EnrollmentFinancePaymentDiagnostic[] = [];
  for (const payment of ledger.payments) {
    const refundAmount = refundAmountByPaymentId.get(payment.id) ?? 0;

    if (payment.refundStatus === "refunded") {
      if (payment.allocatedAmount > 0.01) {
        const title = "Pago reembolsado con asignaciones activas";
        const detail = "El reembolso deberia haber liberado todas las asignaciones de este pago.";
        paymentDiagnostics.push({
          paymentId: payment.id,
          severity: "needs_correction",
          title,
          detail,
          paidAt: payment.paidAt,
          method: payment.method,
          amount: payment.amount,
          allocatedAmount: payment.allocatedAmount,
          refundAmount,
          reassignBlockedReason: payment.reassignBlockedReason,
        });
        anomalies.push(
          createAnomaly({
            key: `refunded-payment-active-allocations:${payment.id}`,
            code: "refunded_payment_with_allocations",
            severity: "needs_correction",
            title,
            detail,
            paymentIds: [payment.id],
            chargeIds: payment.sourceCharges.map((charge) => charge.chargeId),
          }),
        );
        continue;
      }

      if (Math.abs(refundAmount - payment.amount) > 0.01) {
        const title = "Reembolso con monto atipico";
        const detail = "El monto del reembolso no coincide con el monto total del pago original.";
        paymentDiagnostics.push({
          paymentId: payment.id,
          severity: "warning",
          title,
          detail,
          paidAt: payment.paidAt,
          method: payment.method,
          amount: payment.amount,
          allocatedAmount: payment.allocatedAmount,
          refundAmount,
          reassignBlockedReason: payment.reassignBlockedReason,
        });
        anomalies.push(
          createAnomaly({
            key: `refund-amount-mismatch:${payment.id}`,
            code: "refund_amount_mismatch",
            severity: "warning",
            title,
            detail,
            paymentIds: [payment.id],
          }),
        );
      }
      continue;
    }

    if (payment.status === "posted" && payment.allocatedAmount < 0.01) {
      const title = "Pago registrado sin asignaciones";
      const detail = "El pago sigue vigente, pero no esta aplicado a ningun cargo.";
      paymentDiagnostics.push({
        paymentId: payment.id,
        severity: "warning",
        title,
        detail,
        paidAt: payment.paidAt,
        method: payment.method,
        amount: payment.amount,
        allocatedAmount: payment.allocatedAmount,
        refundAmount,
        reassignBlockedReason: payment.reassignBlockedReason,
      });
      anomalies.push(
        createAnomaly({
          key: `payment-without-allocations:${payment.id}`,
          code: "payment_without_allocations",
          severity: "warning",
          title,
          detail,
          paymentIds: [payment.id],
        }),
      );
      continue;
    }

    if (payment.status === "posted" && payment.allocatedAmount + 0.01 < payment.amount) {
      const title = "Pago parcialmente asignado";
      const detail = "Hay una parte del pago que sigue como credito no aplicado.";
      paymentDiagnostics.push({
        paymentId: payment.id,
        severity: "warning",
        title,
        detail,
        paidAt: payment.paidAt,
        method: payment.method,
        amount: payment.amount,
        allocatedAmount: payment.allocatedAmount,
        refundAmount,
        reassignBlockedReason: payment.reassignBlockedReason,
      });
      anomalies.push(
        createAnomaly({
          key: `payment-partial-allocation:${payment.id}`,
          code: "payment_partial_allocation",
          severity: "warning",
          title,
          detail,
          paymentIds: [payment.id],
        }),
      );
      continue;
    }

    const reassignDetail = getReassignBlockedReasonDetail(payment.reassignBlockedReason);
    if (payment.status === "posted" && reassignDetail) {
      const title = "Pago con estructura de asignacion delicada";
      paymentDiagnostics.push({
        paymentId: payment.id,
        severity: "warning",
        title,
        detail: reassignDetail,
        paidAt: payment.paidAt,
        method: payment.method,
        amount: payment.amount,
        allocatedAmount: payment.allocatedAmount,
        refundAmount,
        reassignBlockedReason: payment.reassignBlockedReason,
      });
      anomalies.push(
        createAnomaly({
          key: `payment-reassign-delicate:${payment.id}`,
          code: "payment_reassign_delicate",
          severity: "warning",
          title,
          detail: reassignDetail,
          paymentIds: [payment.id],
          chargeIds: payment.sourceCharges.map((charge) => charge.chargeId),
        }),
      );
    }
  }

  const chargeDiagnostics: EnrollmentFinanceChargeDiagnostic[] = [];
  for (const charge of ledger.charges) {
    if (charge.status === "void" && charge.allocatedAmount > 0.01) {
      const title = "Cargo anulado con pagos aplicados";
      const detail = "Un cargo anulado no deberia conservar asignaciones activas.";
      chargeDiagnostics.push({
        chargeId: charge.id,
        severity: "needs_correction",
        title,
        detail,
        description: charge.description,
        periodMonth: charge.periodMonth,
        amount: charge.amount,
        allocatedAmount: charge.allocatedAmount,
        pendingAmount: charge.pendingAmount,
        status: charge.status,
      });
      anomalies.push(
        createAnomaly({
          key: `void-charge-with-allocations:${charge.id}`,
          code: "void_charge_with_allocations",
          severity: "needs_correction",
          title,
          detail,
          chargeIds: [charge.id],
        }),
      );
      continue;
    }

    if (charge.status !== "void" && charge.amount > 0.01 && charge.allocatedAmount - charge.amount > 0.01) {
      const title = "Cargo sobreaplicado";
      const detail = "El monto aplicado supera el monto total del cargo.";
      chargeDiagnostics.push({
        chargeId: charge.id,
        severity: "needs_correction",
        title,
        detail,
        description: charge.description,
        periodMonth: charge.periodMonth,
        amount: charge.amount,
        allocatedAmount: charge.allocatedAmount,
        pendingAmount: charge.pendingAmount,
        status: charge.status,
      });
      anomalies.push(
        createAnomaly({
          key: `charge-overapplied:${charge.id}`,
          code: "charge_overapplied",
          severity: "needs_correction",
          title,
          detail,
          chargeIds: [charge.id],
        }),
      );
      continue;
    }

    if (charge.status !== "void" && charge.amount < -0.01 && charge.allocatedAmount > 0.01) {
      const title = "Ajuste no caja con asignaciones";
      const detail = "Un ajuste negativo no deberia recibir pagos aplicados.";
      chargeDiagnostics.push({
        chargeId: charge.id,
        severity: "needs_correction",
        title,
        detail,
        description: charge.description,
        periodMonth: charge.periodMonth,
        amount: charge.amount,
        allocatedAmount: charge.allocatedAmount,
        pendingAmount: charge.pendingAmount,
        status: charge.status,
      });
      anomalies.push(
        createAnomaly({
          key: `non-cash-adjustment-with-allocations:${charge.id}`,
          code: "non_cash_adjustment_with_allocations",
          severity: "needs_correction",
          title,
          detail,
          chargeIds: [charge.id],
        }),
      );
      continue;
    }

    if (charge.status === "paid" && charge.pendingAmount > 0.01) {
      const title = "Cargo marcado como pagado con saldo pendiente";
      const detail = "El estatus del cargo no coincide con el saldo pendiente visible.";
      chargeDiagnostics.push({
        chargeId: charge.id,
        severity: "warning",
        title,
        detail,
        description: charge.description,
        periodMonth: charge.periodMonth,
        amount: charge.amount,
        allocatedAmount: charge.allocatedAmount,
        pendingAmount: charge.pendingAmount,
        status: charge.status,
      });
      anomalies.push(
        createAnomaly({
          key: `charge-status-mismatch:${charge.id}`,
          code: "charge_status_mismatch",
          severity: "warning",
          title,
          detail,
          chargeIds: [charge.id],
        }),
      );
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
      const title = `Mensualidades duplicadas en ${formatPeriodMonthLabel(periodMonth)}`;
      const detail = `Existen ${charges.length} mensualidades activas para el mismo periodo.`;
      monthlyTuitionWarnings.push({
        key: `duplicate-${periodMonth}`,
        severity: "needs_correction",
        title,
        detail,
        periodMonth,
        chargeIds: charges.map((charge) => charge.id),
      });
      anomalies.push(
        createAnomaly({
          key: `duplicate-monthly-tuition:${periodMonth}`,
          code: "duplicate_monthly_tuition",
          severity: "needs_correction",
          title,
          detail,
          chargeIds: charges.map((charge) => charge.id),
        }),
      );
    }

    const partiallyAllocatedCharge = charges.find(
      (charge) =>
        !!charge.periodMonth &&
        charge.periodMonth >= currentPeriodMonth &&
        charge.allocatedAmount > 0.01 &&
        charge.pendingAmount > 0.01,
    );
    if (partiallyAllocatedCharge) {
      const title = `Mensualidad con repricio inseguro en ${formatPeriodMonthLabel(periodMonth)}`;
      const detail =
        "La mensualidad ya tiene pagos aplicados parcialmente; cualquier cambio de monto requiere correccion manual.";
      monthlyTuitionWarnings.push({
        key: `allocated-${partiallyAllocatedCharge.id}`,
        severity: "warning",
        title,
        detail,
        periodMonth,
        chargeIds: [partiallyAllocatedCharge.id],
      });
      anomalies.push(
        createAnomaly({
          key: `repricing-unsafe-monthly-tuition:${partiallyAllocatedCharge.id}`,
          code: "repricing_unsafe_monthly_tuition",
          severity: "warning",
          title,
          detail,
          chargeIds: [partiallyAllocatedCharge.id],
        }),
      );
    }
  }

  const allocationWarnings: EnrollmentFinanceAllocationWarning[] = [];
  if (Math.abs(derivedBalanceDrift) > 0.01) {
    const title = "Saldo canonico distinto del saldo operativo derivado";
    const detail =
      "La suma neta de cargos visibles, ajustes y credito no aplicado no coincide con el saldo canonico de la inscripcion.";
    allocationWarnings.push({
      key: "derived-balance-drift",
      severity: "needs_correction",
      title,
      detail,
    });
    anomalies.push(
      createAnomaly({
        key: "canonical-vs-operational-drift",
        code: "canonical_vs_operational_drift",
        severity: "needs_correction",
        title,
        detail,
      }),
    );
  }

  if (unappliedPostedAmount > 0.01) {
    const title = "Credito no aplicado";
    const detail =
      "Hay pagos vigentes con saldo todavia libre, lo que puede explicar diferencias operativas en la cuenta.";
    allocationWarnings.push({
      key: "unapplied-credit",
      severity: "warning",
      title,
      detail,
    });
    anomalies.push(
      createAnomaly({
        key: "unapplied-credit",
        code: "unapplied_credit",
        severity: "warning",
        title,
        detail,
      }),
    );
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
    label: "Saldo canonico",
    detail:
      canonicalBalance > 0.01
        ? "La inscripcion sigue con saldo vivo."
        : canonicalBalance < -0.01
          ? "La cuenta carga credito neto."
          : "La cuenta esta en cero.",
  });

  if (Math.abs(derivedBalanceDrift) > 0.01) {
    summaryFlags.push({
      key: "drift",
      tone: "rose",
      label: "Drift operativo",
      detail:
        "El saldo canonico no coincide con el saldo operativo neto sugerido por cargos, ajustes visibles y credito no aplicado.",
    });
  }

  if (unappliedPostedAmount > 0.01) {
    summaryFlags.push({
      key: "credit",
      tone: "amber",
      label: "Credito libre",
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
      detail: "No se detectaron anomalias financieras en esta cuenta.",
    });
  }

  const anomalySnapshot: EnrollmentFinanceAnomalySnapshot = {
    enrollmentId: ledger.enrollment.id,
    playerId: ledger.enrollment.playerId,
    playerName: ledger.enrollment.playerName,
    birthYear: ledger.enrollment.birthYear,
    campusId: ledger.enrollment.campusId,
    campusName: ledger.enrollment.campusName,
    canonicalBalance,
    derivedBalance: derivedOperationalBalance,
    anomalies,
  };

  return {
    enrollment: {
      enrollmentId: ledger.enrollment.id,
      playerId: ledger.enrollment.playerId,
      playerName: ledger.enrollment.playerName,
      birthYear: ledger.enrollment.birthYear,
      campusId: ledger.enrollment.campusId,
      campusName: ledger.enrollment.campusName,
    },
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
    anomalies,
    anomalySnapshot,
  };
}
