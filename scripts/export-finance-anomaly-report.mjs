import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const SIMPLE_AUTO_REPAIR_CODES = new Set([
  "canonical_vs_operational_drift",
  "unapplied_credit",
  "payment_without_allocations",
  "payment_partial_allocation",
  "payment_reassign_delicate",
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

const ACTIONABLE_AUTO_REPAIR_CODES = new Set([
  "canonical_vs_operational_drift",
  "unapplied_credit",
  "payment_without_allocations",
  "payment_partial_allocation",
  "void_charge_with_allocations",
  "charge_status_mismatch",
]);

const FINANCE_ACTIVITY_ACTIONS = [
  "payment.created",
  "payment.created.historical_regularization_contry",
  "charge.created",
  "charge.created.caja",
  "charge.created.caja_advance_tuition",
  "charge.updated",
  "charge.updated.caja_advance_tuition",
  "charge.voided",
  "payment.voided",
  "payment.refunded",
  "payment.reassigned",
  "charge.corrective_created",
  "balance_adjustment.created",
  "payment_allocations.repaired",
  "finance.anomaly_detected",
  "finance.anomaly_resolved",
];

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
    envFile: ".env.local",
    outFile: "finance-anomaly-report.json",
    enrollmentIds: [],
    idsFile: null,
    auditLimit: 1000,
    pageSize: 1000,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    const next = argv[index + 1];

    if (value === "--env-file" && next) {
      result.envFile = next;
      index += 1;
      continue;
    }
    if (value === "--out" && next) {
      result.outFile = next;
      index += 1;
      continue;
    }
    if (value === "--ids-file" && next) {
      result.idsFile = next;
      index += 1;
      continue;
    }
    if (value === "--enrollment-id" && next) {
      result.enrollmentIds.push(next);
      index += 1;
      continue;
    }
    if (value === "--audit-limit" && next) {
      result.auditLimit = Number(next);
      index += 1;
      continue;
    }
    if (value === "--page-size" && next) {
      result.pageSize = Number(next);
      index += 1;
      continue;
    }
  }

  return result;
}

function parseEnvFile(filePath) {
  const absolutePath = path.resolve(filePath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`env_file_not_found:${absolutePath}`);
  }

  const env = {};
  const content = fs.readFileSync(absolutePath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#")) continue;
    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0) continue;
    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    env[key] = value;
  }
  return env;
}

function readEnrollmentIds(idsFile, explicitIds) {
  const ids = new Set(explicitIds.filter(Boolean));
  if (!idsFile) return [...ids];

  const absolutePath = path.resolve(idsFile);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`ids_file_not_found:${absolutePath}`);
  }

  const content = fs.readFileSync(absolutePath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const normalized = line.trim();
    if (!normalized || normalized.startsWith("#")) continue;
    ids.add(normalized);
  }

  return [...ids];
}

async function fetchAllPages(pageSize, buildPage) {
  const rows = [];
  let from = 0;

  while (true) {
    const to = from + pageSize - 1;
    const { data, error } = await buildPage(from, to);
    if (error) throw error;
    const pageRows = data ?? [];
    rows.push(...pageRows);
    if (pageRows.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

function formatDateTime(value) {
  if (!value) return null;
  return value;
}

function getReassignBlockedReason(code) {
  const messages = {
    payment_has_no_allocations: "El pago ya no tiene cargos aplicados.",
    payment_not_fully_allocated: "El pago solo esta aplicado parcialmente.",
    source_charge_shared: "El cargo origen tambien tiene otros pagos aplicados.",
    source_charge_not_exclusive: "El cargo origen no esta cubierto de forma exclusiva por este pago.",
  };
  return code ? messages[code] ?? null : null;
}

function allocateChargesWithPriority(budget, charges, priorityIds) {
  const prioritySet = new Set(priorityIds);
  const orderedCharges =
    prioritySet.size > 0
      ? [
          ...charges.filter((charge) => prioritySet.has(charge.id)),
          ...charges.filter((charge) => !prioritySet.has(charge.id)),
        ]
      : charges;

  const allocations = [];
  let remaining = roundMoney(budget);

  for (const charge of orderedCharges) {
    if (remaining <= 0.01) break;
    if (charge.pendingAmount <= 0.01) continue;

    const allocated = roundMoney(Math.min(remaining, charge.pendingAmount));
    if (allocated <= 0.01) continue;

    allocations.push({ chargeId: charge.id, amount: allocated });
    remaining = roundMoney(remaining - allocated);
  }

  return { allocations, remaining };
}

function buildSuggestedNormalization(chargeRows, paymentRows, allocationsByCharge, allocatedByCharge, allocatedByPayment) {
  const invalidVoidAllocations = [];
  const adjustedAllocatedByCharge = new Map(allocatedByCharge);
  const adjustedAllocatedByPayment = new Map(allocatedByPayment);

  for (const charge of chargeRows) {
    if (charge.status !== "void") continue;
    const chargeAllocations = allocationsByCharge.get(charge.id) ?? [];
    for (const allocation of chargeAllocations) {
      invalidVoidAllocations.push({
        paymentId: allocation.payment_id,
        chargeId: allocation.charge_id,
        amount: roundMoney(toNumber(allocation.amount)),
      });

      adjustedAllocatedByCharge.set(
        allocation.charge_id,
        roundMoney((adjustedAllocatedByCharge.get(allocation.charge_id) ?? 0) - toNumber(allocation.amount)),
      );
      adjustedAllocatedByPayment.set(
        allocation.payment_id,
        roundMoney((adjustedAllocatedByPayment.get(allocation.payment_id) ?? 0) - toNumber(allocation.amount)),
      );
    }
  }

  const effectivePending = new Map(
    chargeRows
      .filter((charge) => charge.status !== "void" && charge.amount > 0.01)
      .map((charge) => [
        charge.id,
        roundMoney(Math.max(charge.amount - (adjustedAllocatedByCharge.get(charge.id) ?? 0), 0)),
      ]),
  );

  const normalizedChargePool = chargeRows
    .filter((charge) => charge.status !== "void" && charge.amount > 0.01)
    .sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime());

  const proposedAllocations = [];

  for (const payment of paymentRows) {
    if (payment.status !== "posted" || payment.refundStatus === "refunded") continue;

    const availableCredit = roundMoney(payment.amount - (adjustedAllocatedByPayment.get(payment.id) ?? 0));
    if (availableCredit <= 0.01) continue;

    const chargePool = normalizedChargePool.map((charge) => ({
      id: charge.id,
      pendingAmount: effectivePending.get(charge.id) ?? 0,
    }));

    const priorityChargeIds = payment.sourceCharges
      .map((charge) => charge.chargeId)
      .filter((chargeId) => (effectivePending.get(chargeId) ?? 0) > 0.01);

    const { allocations } = allocateChargesWithPriority(availableCredit, chargePool, priorityChargeIds);
    for (const allocation of allocations) {
      proposedAllocations.push({
        paymentId: payment.id,
        chargeId: allocation.chargeId,
        amount: allocation.amount,
      });

      effectivePending.set(
        allocation.chargeId,
        roundMoney((effectivePending.get(allocation.chargeId) ?? 0) - allocation.amount),
      );
    }
  }

  return {
    invalidVoidAllocations,
    invalidVoidAllocationAmount: roundMoney(
      invalidVoidAllocations.reduce((sum, row) => sum + row.amount, 0),
    ),
    proposedAllocations,
    proposedAllocationAmount: roundMoney(
      proposedAllocations.reduce((sum, row) => sum + row.amount, 0),
    ),
  };
}

function classifyAccount(anomalyCodes) {
  if (anomalyCodes.some((code) => MANUAL_REVIEW_CODES.has(code))) {
    return "manual_review";
  }
  if (!anomalyCodes.some((code) => ACTIONABLE_AUTO_REPAIR_CODES.has(code))) {
    return "warning_only";
  }
  if (anomalyCodes.every((code) => SIMPLE_AUTO_REPAIR_CODES.has(code))) {
    return "auto_repair_candidate";
  }
  return "mixed_review";
}

function unique(values) {
  return [...new Set(values)];
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const env = parseEnvFile(args.envFile);

  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("missing_supabase_credentials");
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const explicitEnrollmentIds = readEnrollmentIds(args.idsFile, args.enrollmentIds);

  const candidateEnrollmentIds =
    explicitEnrollmentIds.length > 0
      ? explicitEnrollmentIds
      : unique(
          (
            await fetchAllPages(args.pageSize, (from, to) =>
              supabase
                .from("audit_logs")
                .select("id,event_at,action,before_data,after_data")
                .in("action", FINANCE_ACTIVITY_ACTIONS)
                .order("event_at", { ascending: false })
                .range(from, Math.min(to, args.auditLimit - 1)),
            )
          )
            .slice(0, args.auditLimit)
            .map((row) => {
              const afterEnrollmentId =
                typeof row.after_data?.enrollment_id === "string" ? row.after_data.enrollment_id : null;
              if (afterEnrollmentId) return afterEnrollmentId;
              return typeof row.before_data?.enrollment_id === "string" ? row.before_data.enrollment_id : null;
            })
            .filter(Boolean),
        );

  const scanAll = explicitEnrollmentIds.length === 0;

  const enrollmentRows = scanAll
    ? await fetchAllPages(args.pageSize, (from, to) =>
        supabase
          .from("enrollments")
          .select("id,status,campus_id,player_id,campuses(name),players(first_name,last_name,birth_date)")
          .order("id", { ascending: true })
          .range(from, to),
      )
    : await fetchAllPages(args.pageSize, (from, to) =>
        supabase
          .from("enrollments")
          .select("id,status,campus_id,player_id,campuses(name),players(first_name,last_name,birth_date)")
          .in("id", candidateEnrollmentIds.slice(from, to + 1)),
      );

  const enrollmentIds = enrollmentRows.map((row) => row.id);
  if (enrollmentIds.length === 0) {
    throw new Error("no_enrollments_found");
  }

  const balanceRows = scanAll
    ? await fetchAllPages(args.pageSize, (from, to) =>
        supabase
          .from("v_enrollment_balances")
          .select("enrollment_id,balance,total_charges,total_payments")
          .order("enrollment_id", { ascending: true })
          .range(from, to),
      )
    : await fetchAllPages(args.pageSize, (from, to) =>
        supabase
          .from("v_enrollment_balances")
          .select("enrollment_id,balance,total_charges,total_payments")
          .in("enrollment_id", enrollmentIds.slice(from, to + 1)),
      );

  const charges = scanAll
    ? await fetchAllPages(args.pageSize, (from, to) =>
        supabase
          .from("charges")
          .select("id,enrollment_id,description,amount,currency,status,due_date,period_month,created_at,charge_types(code,name)")
          .order("id", { ascending: true })
          .range(from, to),
      )
    : await fetchAllPages(args.pageSize, (from, to) =>
        supabase
          .from("charges")
          .select("id,enrollment_id,description,amount,currency,status,due_date,period_month,created_at,charge_types(code,name)")
          .in("enrollment_id", enrollmentIds.slice(from, to + 1)),
      );

  const payments = scanAll
    ? await fetchAllPages(args.pageSize, (from, to) =>
        supabase
          .from("payments")
          .select("id,enrollment_id,paid_at,method,amount,currency,status,notes,created_at,operator_campus_id")
          .order("id", { ascending: true })
          .range(from, to),
      )
    : await fetchAllPages(args.pageSize, (from, to) =>
        supabase
          .from("payments")
          .select("id,enrollment_id,paid_at,method,amount,currency,status,notes,created_at,operator_campus_id")
          .in("enrollment_id", enrollmentIds.slice(from, to + 1)),
      );

  const chargeIds = charges.map((row) => row.id);
  const paymentIds = payments.map((row) => row.id);

  const paymentAllocations = chargeIds.length === 0
    ? []
    : scanAll
      ? await fetchAllPages(args.pageSize, (from, to) =>
          supabase
            .from("payment_allocations")
            .select("id,payment_id,charge_id,amount")
            .order("id", { ascending: true })
            .range(from, to),
        )
      : await fetchAllPages(args.pageSize, (from, to) =>
          supabase
            .from("payment_allocations")
            .select("payment_id,charge_id,amount")
            .in("charge_id", chargeIds.slice(from, to + 1)),
        );

  const paymentRefunds = paymentIds.length === 0
    ? []
    : scanAll
      ? await fetchAllPages(args.pageSize, (from, to) =>
          supabase
            .from("payment_refunds")
            .select("payment_id,amount,refunded_at,refund_method,reason,notes")
            .order("payment_id", { ascending: true })
            .range(from, to),
        )
      : await fetchAllPages(args.pageSize, (from, to) =>
          supabase
            .from("payment_refunds")
            .select("payment_id,amount,refunded_at,refund_method,reason,notes")
            .in("payment_id", paymentIds.slice(from, to + 1)),
        );

  const recentAuditRows = await fetchAllPages(args.pageSize, (from, to) =>
    supabase
      .from("audit_logs")
      .select("id,event_at,action,record_id,before_data,after_data")
      .in("action", FINANCE_ACTIVITY_ACTIONS)
      .order("event_at", { ascending: false })
      .range(from, Math.min(to, args.auditLimit - 1)),
  );

  const balanceByEnrollmentId = new Map(balanceRows.map((row) => [row.enrollment_id, row]));
  const chargesByEnrollmentId = new Map();
  const paymentsByEnrollmentId = new Map();
  const allocationsByChargeId = new Map();
  const allocationsByPaymentId = new Map();
  const allocatedByChargeId = new Map();
  const allocatedByPaymentId = new Map();
  const refundByPaymentId = new Map(paymentRefunds.map((row) => [row.payment_id, row]));
  const auditByEnrollmentId = new Map();

  for (const row of charges) {
    chargesByEnrollmentId.set(row.enrollment_id, [...(chargesByEnrollmentId.get(row.enrollment_id) ?? []), row]);
  }
  for (const row of payments) {
    paymentsByEnrollmentId.set(row.enrollment_id, [...(paymentsByEnrollmentId.get(row.enrollment_id) ?? []), row]);
  }
  for (const row of paymentAllocations) {
    const amount = roundMoney(toNumber(row.amount));
    allocationsByChargeId.set(row.charge_id, [...(allocationsByChargeId.get(row.charge_id) ?? []), row]);
    allocationsByPaymentId.set(row.payment_id, [...(allocationsByPaymentId.get(row.payment_id) ?? []), row]);
    allocatedByChargeId.set(row.charge_id, roundMoney((allocatedByChargeId.get(row.charge_id) ?? 0) + amount));
    allocatedByPaymentId.set(row.payment_id, roundMoney((allocatedByPaymentId.get(row.payment_id) ?? 0) + amount));
  }
  for (const row of recentAuditRows.slice(0, args.auditLimit)) {
    const enrollmentId =
      typeof row.after_data?.enrollment_id === "string"
        ? row.after_data.enrollment_id
        : typeof row.before_data?.enrollment_id === "string"
          ? row.before_data.enrollment_id
          : null;
    if (!enrollmentId) continue;
    auditByEnrollmentId.set(enrollmentId, [...(auditByEnrollmentId.get(enrollmentId) ?? []), row]);
  }

  const anomalyCounts = new Map();
  const recommendedActionCounts = new Map();
  const currentPeriodMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}-01`;
  const accounts = [];

  for (const enrollment of enrollmentRows) {
    const rawCharges = chargesByEnrollmentId.get(enrollment.id) ?? [];
    const chargeRows = rawCharges.map((row) => ({
      id: row.id,
      typeCode: row.charge_types?.code ?? "-",
      typeName: row.charge_types?.name ?? "-",
      description: row.description,
      amount: roundMoney(toNumber(row.amount)),
      currency: row.currency,
      status: row.status,
      dueDate: row.due_date,
      periodMonth: row.period_month,
      createdAt: row.created_at,
      allocatedAmount: allocatedByChargeId.get(row.id) ?? 0,
    })).map((row) => ({
      ...row,
      pendingAmount: roundMoney(Math.max(row.amount - row.allocatedAmount, 0)),
    }));

    const chargeById = new Map(chargeRows.map((row) => [row.id, row]));
    const rawPayments = paymentsByEnrollmentId.get(enrollment.id) ?? [];
    const paymentRows = rawPayments.map((row) => {
      const paymentAllocRows = allocationsByPaymentId.get(row.id) ?? [];
      const refund = refundByPaymentId.get(row.id) ?? null;
      const sourceCharges = paymentAllocRows.map((allocation) => {
        const charge = chargeById.get(allocation.charge_id);
        return {
          chargeId: allocation.charge_id,
          description: charge?.description ?? "Cargo",
          allocatedAmount: roundMoney(toNumber(allocation.amount)),
          amount: charge?.amount ?? roundMoney(toNumber(allocation.amount)),
        };
      });

      let reassignBlockedReason = null;
      if (row.status !== "posted") {
        reassignBlockedReason = "payment_not_posted";
      } else if (refund) {
        reassignBlockedReason = "payment_already_refunded";
      } else if (paymentAllocRows.length === 0) {
        reassignBlockedReason = "payment_has_no_allocations";
      } else if (Math.abs((allocatedByPaymentId.get(row.id) ?? 0) - toNumber(row.amount)) > 0.01) {
        reassignBlockedReason = "payment_not_fully_allocated";
      } else if (
        paymentAllocRows.some((allocation) =>
          (allocationsByChargeId.get(allocation.charge_id) ?? []).some(
            (otherAllocation) => otherAllocation.payment_id !== row.id,
          ),
        )
      ) {
        reassignBlockedReason = "source_charge_shared";
      } else if (
        paymentAllocRows.some((allocation) => {
          const charge = chargeById.get(allocation.charge_id);
          const totalAllocated = allocatedByChargeId.get(allocation.charge_id) ?? 0;
          return !charge || Math.abs(charge.amount - totalAllocated) > 0.01 || charge.status === "void";
        })
      ) {
        reassignBlockedReason = "source_charge_not_exclusive";
      }

      return {
        id: row.id,
        paidAt: row.paid_at,
        method: row.method,
        amount: roundMoney(toNumber(row.amount)),
        currency: row.currency,
        status: row.status,
        notes: row.notes,
        createdAt: row.created_at,
        operatorCampusId: row.operator_campus_id,
        allocatedAmount: allocatedByPaymentId.get(row.id) ?? 0,
        refundStatus: refund ? "refunded" : "not_refunded",
        refundAmount: refund ? roundMoney(toNumber(refund.amount)) : 0,
        refundedAt: refund?.refunded_at ?? null,
        refundMethod: refund?.refund_method ?? null,
        refundReason: refund?.reason ?? null,
        reassignBlockedReason,
        reassignBlockedDetail: getReassignBlockedReason(reassignBlockedReason),
        sourceCharges,
      };
    });

    const canonicalBalance = roundMoney(toNumber(balanceByEnrollmentId.get(enrollment.id)?.balance));
    const activePostedPayments = paymentRows.filter(
      (payment) => payment.status === "posted" && payment.refundStatus !== "refunded",
    );
    const unappliedPostedAmount = roundMoney(
      activePostedPayments.reduce((sum, payment) => sum + Math.max(payment.amount - payment.allocatedAmount, 0), 0),
    );
    const netChargeExposureTotal = roundMoney(
      chargeRows
        .filter((charge) => charge.status !== "void")
        .reduce((sum, charge) => sum + (charge.amount - charge.allocatedAmount), 0),
    );
    const derivedOperationalBalance = roundMoney(netChargeExposureTotal - unappliedPostedAmount);
    const derivedBalanceDrift = roundMoney(canonicalBalance - derivedOperationalBalance);
    const anomalyCodes = [];

    for (const payment of paymentRows) {
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

      if (payment.status === "posted" && payment.reassignBlockedDetail) {
        anomalyCodes.push("payment_reassign_delicate");
      }
    }

    for (const charge of chargeRows) {
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
    for (const charge of chargeRows) {
      if (charge.typeCode !== "monthly_tuition" || charge.status === "void" || !charge.periodMonth) continue;
      monthlyTuitionByPeriod.set(charge.periodMonth, [
        ...(monthlyTuitionByPeriod.get(charge.periodMonth) ?? []),
        charge,
      ]);
    }

    for (const [periodMonth, monthlyCharges] of monthlyTuitionByPeriod.entries()) {
      if (monthlyCharges.length > 1) {
        anomalyCodes.push("duplicate_monthly_tuition");
      }

      const partiallyAllocatedFutureCharge = monthlyCharges.find(
        (charge) => charge.periodMonth >= currentPeriodMonth && charge.allocatedAmount > 0.01 && charge.pendingAmount > 0.01,
      );
      if (partiallyAllocatedFutureCharge) {
        anomalyCodes.push("repricing_unsafe_monthly_tuition");
      }
    }

    if (Math.abs(derivedBalanceDrift) > 0.01) {
      anomalyCodes.push("canonical_vs_operational_drift");
    }
    if (unappliedPostedAmount > 0.01) {
      anomalyCodes.push("unapplied_credit");
    }

    const normalizedAnomalyCodes = unique(anomalyCodes);
    if (normalizedAnomalyCodes.length === 0) continue;

    const suggestedNormalization = buildSuggestedNormalization(
      chargeRows,
      paymentRows,
      allocationsByChargeId,
      allocatedByChargeId,
      allocatedByPaymentId,
    );

    const recommendedAction = classifyAccount(normalizedAnomalyCodes);

    for (const code of normalizedAnomalyCodes) {
      anomalyCounts.set(code, (anomalyCounts.get(code) ?? 0) + 1);
    }
    recommendedActionCounts.set(
      recommendedAction,
      (recommendedActionCounts.get(recommendedAction) ?? 0) + 1,
    );

    accounts.push({
      enrollmentId: enrollment.id,
      enrollmentStatus: enrollment.status,
      playerId: enrollment.player_id,
      playerName: `${enrollment.players?.first_name ?? ""} ${enrollment.players?.last_name ?? ""}`.replace(/\s+/g, " ").trim(),
      birthYear: enrollment.players?.birth_date
        ? new Date(enrollment.players.birth_date).getUTCFullYear()
        : null,
      campusName: enrollment.campuses?.name ?? "-",
      canonicalBalance,
      derivedOperationalBalance,
      derivedBalanceDrift,
      unappliedPostedAmount,
      recommendedAction,
      anomalyCodes: normalizedAnomalyCodes,
      suggestedNormalization,
      recentAudit: (auditByEnrollmentId.get(enrollment.id) ?? []).slice(0, 12).map((row) => ({
        eventAt: formatDateTime(row.event_at),
        action: row.action,
        recordId: row.record_id ?? null,
        afterData: row.after_data ?? null,
      })),
      charges: chargeRows,
      payments: paymentRows,
    });
  }

  accounts.sort((left, right) => {
    const actionRank = { auto_repair_candidate: 0, mixed_review: 1, manual_review: 2 };
    const actionDifference = actionRank[left.recommendedAction] - actionRank[right.recommendedAction];
    if (actionDifference !== 0) return actionDifference;
    if (right.anomalyCodes.length !== left.anomalyCodes.length) {
      return right.anomalyCodes.length - left.anomalyCodes.length;
    }
    return left.playerName.localeCompare(right.playerName, "es-MX");
  });

  const report = {
    generatedAt: new Date().toISOString(),
    projectUrl: supabaseUrl,
    scope: {
      scanMode: scanAll ? "all_enrollments" : "targeted_enrollment_ids",
      envFile: path.resolve(args.envFile),
      outputFile: path.resolve(args.outFile),
      scannedEnrollments: enrollmentIds.length,
      anomalousAccounts: accounts.length,
      targetedEnrollmentIds: explicitEnrollmentIds,
    },
    summary: {
      byRecommendedAction: Object.fromEntries([...recommendedActionCounts.entries()].sort()),
      byAnomalyCode: Object.fromEntries([...anomalyCounts.entries()].sort()),
    },
    accounts,
  };

  const outputPath = path.resolve(args.outFile);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));

  console.log(`Wrote finance anomaly report to ${outputPath}`);
  console.log(`Scanned enrollments: ${report.scope.scannedEnrollments}`);
  console.log(`Anomalous accounts: ${report.scope.anomalousAccounts}`);
  console.log(`Recommended actions: ${JSON.stringify(report.summary.byRecommendedAction)}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
