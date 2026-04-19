import fs from "node:fs";
import path from "node:path";

const ACTIONABLE_AUTO_REPAIR_CODES = new Set([
  "canonical_vs_operational_drift",
  "unapplied_credit",
  "payment_without_allocations",
  "payment_partial_allocation",
  "void_charge_with_allocations",
  "charge_status_mismatch",
]);

const MANUAL_REVIEW_CODES = new Set([
  "refunded_payment_with_allocations",
  "refund_amount_mismatch",
  "charge_overapplied",
  "non_cash_adjustment_with_allocations",
  "duplicate_monthly_tuition",
  "repricing_unsafe_monthly_tuition",
]);

function roundMoney(value) {
  return Math.round(value * 100) / 100;
}

function toNumber(value) {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  return 0;
}

function parseArgs(argv) {
  const result = {
    reportFile: "finance-anomaly-report.json",
    outFile: "finance-repair-plan.json",
    recommendedAction: "auto_repair_candidate",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    const next = argv[index + 1];

    if (value === "--report" && next) {
      result.reportFile = next;
      index += 1;
      continue;
    }

    if (value === "--out" && next) {
      result.outFile = next;
      index += 1;
      continue;
    }

    if (value === "--recommended-action" && next) {
      result.recommendedAction = next;
      index += 1;
      continue;
    }
  }

  return result;
}

function unique(values) {
  return [...new Set(values)];
}

function classifyRepairShape(account) {
  const hasVoidCleanup = account.suggestedNormalization.invalidVoidAllocations.length > 0;
  const hasReallocation = account.suggestedNormalization.proposedAllocations.length > 0;

  if (hasVoidCleanup && hasReallocation) {
    return "remove_void_allocations_and_reallocate";
  }
  if (hasVoidCleanup) {
    return "remove_void_allocations_only";
  }
  if (hasReallocation) {
    return "reallocate_remaining_credit";
  }
  return "no_change";
}

function buildCurrentAllocationRows(account) {
  return account.payments.flatMap((payment) =>
    payment.sourceCharges.map((charge) => ({
      paymentId: payment.id,
      chargeId: charge.chargeId,
      amount: roundMoney(toNumber(charge.allocatedAmount)),
    })),
  );
}

function mergeAllocations(rows) {
  const merged = new Map();

  for (const row of rows) {
    const key = `${row.paymentId}:${row.chargeId}`;
    merged.set(key, roundMoney((merged.get(key) ?? 0) + roundMoney(toNumber(row.amount))));
  }

  return [...merged.entries()]
    .map(([key, amount]) => {
      const separator = key.indexOf(":");
      return {
        paymentId: key.slice(0, separator),
        chargeId: key.slice(separator + 1),
        amount,
      };
    })
    .filter((row) => row.amount > 0.01);
}

function buildFinalAllocationRows(account) {
  const chargesById = new Map(account.charges.map((charge) => [charge.id, charge]));
  const currentAllocations = buildCurrentAllocationRows(account);
  const invalidKeys = new Set(
    account.suggestedNormalization.invalidVoidAllocations.map(
      (row) => `${row.paymentId}:${row.chargeId}`,
    ),
  );

  const survivingRows = currentAllocations.filter((row) => {
    if (invalidKeys.has(`${row.paymentId}:${row.chargeId}`)) return false;
    const charge = chargesById.get(row.chargeId);
    return charge && charge.status !== "void";
  });

  const proposedRows = account.suggestedNormalization.proposedAllocations.map((row) => ({
    paymentId: row.paymentId,
    chargeId: row.chargeId,
    amount: roundMoney(toNumber(row.amount)),
  }));

  return mergeAllocations([...survivingRows, ...proposedRows]);
}

function getReassignBlockedReason(payment, allocationsByChargeId, allocatedByChargeId, chargesById) {
  if (payment.status !== "posted") return "payment_not_posted";
  if (payment.refundStatus === "refunded") return "payment_already_refunded";

  const paymentAllocations = payment.sourceCharges;
  if (paymentAllocations.length === 0) return "payment_has_no_allocations";

  const allocatedAmount = paymentAllocations.reduce((sum, charge) => sum + charge.allocatedAmount, 0);
  if (Math.abs(allocatedAmount - payment.amount) > 0.01) return "payment_not_fully_allocated";

  if (
    paymentAllocations.some((allocation) =>
      (allocationsByChargeId.get(allocation.chargeId) ?? []).some(
        (otherAllocation) => otherAllocation.paymentId !== payment.id,
      ),
    )
  ) {
    return "source_charge_shared";
  }

  if (
    paymentAllocations.some((allocation) => {
      const charge = chargesById.get(allocation.chargeId);
      const totalAllocated = allocatedByChargeId.get(allocation.chargeId) ?? 0;
      return !charge || charge.status === "void" || Math.abs(charge.amount - totalAllocated) > 0.01;
    })
  ) {
    return "source_charge_not_exclusive";
  }

  return null;
}

function simulateAccount(account, finalAllocationRows) {
  const chargesById = new Map(account.charges.map((charge) => [charge.id, charge]));
  const allocationsByChargeId = new Map();
  const allocationsByPaymentId = new Map();
  const allocatedByChargeId = new Map();
  const allocatedByPaymentId = new Map();

  for (const row of finalAllocationRows) {
    allocationsByChargeId.set(row.chargeId, [...(allocationsByChargeId.get(row.chargeId) ?? []), row]);
    allocationsByPaymentId.set(row.paymentId, [...(allocationsByPaymentId.get(row.paymentId) ?? []), row]);
    allocatedByChargeId.set(row.chargeId, roundMoney((allocatedByChargeId.get(row.chargeId) ?? 0) + row.amount));
    allocatedByPaymentId.set(row.paymentId, roundMoney((allocatedByPaymentId.get(row.paymentId) ?? 0) + row.amount));
  }

  const simulatedCharges = account.charges.map((charge) => {
    const allocatedAmount = allocatedByChargeId.get(charge.id) ?? 0;
    return {
      ...charge,
      allocatedAmount,
      pendingAmount: roundMoney(Math.max(charge.amount - allocatedAmount, 0)),
    };
  });

  const simulatedPayments = account.payments.map((payment) => {
    const paymentAllocations = allocationsByPaymentId.get(payment.id) ?? [];
    const sourceCharges = paymentAllocations.map((allocation) => {
      const charge = chargesById.get(allocation.chargeId);
      return {
        chargeId: allocation.chargeId,
        description: charge?.description ?? "Cargo",
        allocatedAmount: allocation.amount,
        amount: charge?.amount ?? allocation.amount,
      };
    });

    return {
      ...payment,
      allocatedAmount: allocatedByPaymentId.get(payment.id) ?? 0,
      sourceCharges,
    };
  });

  const simulatedChargeMap = new Map(simulatedCharges.map((charge) => [charge.id, charge]));
  const anomalyCodes = [];

  for (const payment of simulatedPayments) {
    if (payment.refundStatus === "refunded") {
      if (payment.allocatedAmount > 0.01) {
        anomalyCodes.push("refunded_payment_with_allocations");
      } else if (Math.abs(payment.refundAmount - payment.amount) > 0.01) {
        anomalyCodes.push("refund_amount_mismatch");
      }
      continue;
    }

    if (payment.status === "posted" && payment.allocatedAmount < 0.01) {
      anomalyCodes.push("payment_without_allocations");
      continue;
    }

    if (payment.status === "posted" && payment.allocatedAmount + 0.01 < payment.amount) {
      anomalyCodes.push("payment_partial_allocation");
      continue;
    }

    const reassignBlockedReason = getReassignBlockedReason(
      payment,
      allocationsByChargeId,
      allocatedByChargeId,
      simulatedChargeMap,
    );
    if (payment.status === "posted" && reassignBlockedReason) {
      anomalyCodes.push("payment_reassign_delicate");
    }
  }

  for (const charge of simulatedCharges) {
    if (charge.status === "void" && charge.allocatedAmount > 0.01) {
      anomalyCodes.push("void_charge_with_allocations");
      continue;
    }

    if (charge.status !== "void" && charge.amount > 0.01 && charge.allocatedAmount - charge.amount > 0.01) {
      anomalyCodes.push("charge_overapplied");
      continue;
    }

    if (charge.status !== "void" && charge.amount < -0.01 && charge.allocatedAmount > 0.01) {
      anomalyCodes.push("non_cash_adjustment_with_allocations");
      continue;
    }

    if (charge.status === "paid" && charge.pendingAmount > 0.01) {
      anomalyCodes.push("charge_status_mismatch");
    }
  }

  const monthlyTuitionByPeriod = new Map();
  for (const charge of simulatedCharges) {
    if (charge.typeCode !== "monthly_tuition" || charge.status === "void" || !charge.periodMonth) continue;
    monthlyTuitionByPeriod.set(charge.periodMonth, [
      ...(monthlyTuitionByPeriod.get(charge.periodMonth) ?? []),
      charge,
    ]);
  }

  const currentPeriodMonth = "2026-04-01";
  for (const [periodMonth, monthlyCharges] of monthlyTuitionByPeriod.entries()) {
    if (monthlyCharges.length > 1) {
      anomalyCodes.push("duplicate_monthly_tuition");
    }

    const partiallyAllocatedFutureCharge = monthlyCharges.find(
      (charge) =>
        charge.periodMonth >= currentPeriodMonth &&
        charge.allocatedAmount > 0.01 &&
        charge.pendingAmount > 0.01,
    );

    if (partiallyAllocatedFutureCharge) {
      anomalyCodes.push("repricing_unsafe_monthly_tuition");
    }
  }

  const unappliedPostedAmount = roundMoney(
    simulatedPayments
      .filter((payment) => payment.status === "posted" && payment.refundStatus !== "refunded")
      .reduce((sum, payment) => sum + Math.max(payment.amount - payment.allocatedAmount, 0), 0),
  );

  const derivedOperationalBalance = roundMoney(
    simulatedCharges
      .filter((charge) => charge.status !== "void")
      .reduce((sum, charge) => sum + (charge.amount - charge.allocatedAmount), 0) - unappliedPostedAmount,
  );

  const derivedBalanceDrift = roundMoney(account.canonicalBalance - derivedOperationalBalance);

  if (Math.abs(derivedBalanceDrift) > 0.01) {
    anomalyCodes.push("canonical_vs_operational_drift");
  }
  if (unappliedPostedAmount > 0.01) {
    anomalyCodes.push("unapplied_credit");
  }

  return {
    anomalyCodes: unique(anomalyCodes).sort(),
    derivedOperationalBalance,
    derivedBalanceDrift,
    unappliedPostedAmount,
  };
}

function buildPlan(account) {
  const finalAllocationRows = buildFinalAllocationRows(account);
  const touchedPaymentIds = unique([
    ...account.suggestedNormalization.invalidVoidAllocations.map((row) => row.paymentId),
    ...account.suggestedNormalization.proposedAllocations.map((row) => row.paymentId),
  ]).sort();

  const paymentById = new Map(account.payments.map((payment) => [payment.id, payment]));
  const touchedAllocations = finalAllocationRows.filter((row) => touchedPaymentIds.includes(row.paymentId));
  const selectedChargeIds = unique(touchedAllocations.map((row) => row.chargeId)).sort();

  const paymentResiduals = touchedPaymentIds.map((paymentId) => {
    const payment = paymentById.get(paymentId);
    const finalAllocatedAmount = roundMoney(
      touchedAllocations
        .filter((row) => row.paymentId === paymentId)
        .reduce((sum, row) => sum + row.amount, 0),
    );

    return {
      paymentId,
      paymentAmount: payment ? roundMoney(toNumber(payment.amount)) : 0,
      finalAllocatedAmount,
      residualAmount: payment ? roundMoney(toNumber(payment.amount) - finalAllocatedAmount) : 0,
    };
  });

  const simulation = simulateAccount(account, finalAllocationRows);
  const residualCreditAmount = roundMoney(
    paymentResiduals.reduce((sum, row) => sum + Math.max(row.residualAmount, 0), 0),
  );
  const hasRemainingActionableAutoRepairCode = simulation.anomalyCodes.some((code) =>
    ACTIONABLE_AUTO_REPAIR_CODES.has(code),
  );
  const hasManualReviewCode = simulation.anomalyCodes.some((code) => MANUAL_REVIEW_CODES.has(code));

  const executionClass =
    residualCreditAmount <= 0.01 &&
    !hasRemainingActionableAutoRepairCode &&
    !hasManualReviewCode &&
    touchedPaymentIds.length > 0
      ? "rpc_ready"
      : "manual_followup";

  const notes = [];
  if (executionClass === "rpc_ready") {
    notes.push("Eligible for repair_payment_allocations with exact payment-closing payload.");
  } else {
    if (residualCreditAmount > 0.01) {
      notes.push(
        "Allocation rewrite still leaves posted credit unmatched; keep this out of the bulk RPC pass.",
      );
    }
    if (hasRemainingActionableAutoRepairCode || hasManualReviewCode) {
      notes.push("Post-plan simulation still leaves material anomalies that need manual toolkit review.");
    }
  }

  return {
    enrollmentId: account.enrollmentId,
    playerName: account.playerName,
    campusName: account.campusName,
    repairShape: classifyRepairShape(account),
    executionClass,
    before: {
      canonicalBalance: account.canonicalBalance,
      derivedOperationalBalance: account.derivedOperationalBalance,
      derivedBalanceDrift: account.derivedBalanceDrift,
      unappliedPostedAmount: account.unappliedPostedAmount,
      anomalyCodes: account.anomalyCodes,
    },
    touchedPaymentIds,
    selectedChargeIds,
    paymentResiduals,
    invalidVoidAllocations: account.suggestedNormalization.invalidVoidAllocations,
    allocationPlan: touchedAllocations,
    simulation,
    toolkitPayload:
      executionClass === "rpc_ready"
        ? {
            selectedPaymentIds: touchedPaymentIds,
            selectedChargeIds,
            allocationPlan: touchedAllocations,
          }
        : null,
    notes,
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const reportPath = path.resolve(args.reportFile);
  const outputPath = path.resolve(args.outFile);
  const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));

  const sourceAccounts = report.accounts.filter(
    (account) => account.recommendedAction === args.recommendedAction,
  );

  const plans = sourceAccounts.map(buildPlan).sort((left, right) => {
    if (left.executionClass !== right.executionClass) {
      return left.executionClass.localeCompare(right.executionClass);
    }
    return left.playerName.localeCompare(right.playerName, "es-MX");
  });

  const summary = {
    sourceRecommendedAction: args.recommendedAction,
    sourceAccountCount: sourceAccounts.length,
    rpcReadyCount: plans.filter((plan) => plan.executionClass === "rpc_ready").length,
    manualFollowupCount: plans.filter((plan) => plan.executionClass === "manual_followup").length,
    rpcReadyEnrollmentIds: plans
      .filter((plan) => plan.executionClass === "rpc_ready")
      .map((plan) => plan.enrollmentId),
    manualFollowupEnrollmentIds: plans
      .filter((plan) => plan.executionClass === "manual_followup")
      .map((plan) => plan.enrollmentId),
  };

  const payload = {
    generatedAt: new Date().toISOString(),
    reportFile: reportPath,
    outputFile: outputPath,
    reportSummary: report.summary,
    summary,
    plans,
  };

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2));

  console.log(`Wrote finance repair plan to ${outputPath}`);
  console.log(`Source accounts: ${summary.sourceAccountCount}`);
  console.log(`RPC-ready accounts: ${summary.rpcReadyCount}`);
  console.log(`Manual-followup accounts: ${summary.manualFollowupCount}`);
}

main();
