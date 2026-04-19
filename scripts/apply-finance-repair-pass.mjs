import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

function roundMoney(value) {
  return Math.round(value * 100) / 100;
}

function parseArgs(argv) {
  const result = {
    envFile: ".env.local",
    planFile: "finance-repair-plan.json",
    outFile: "finance-repair-apply-log.json",
    apply: false,
    enrollmentIds: [],
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    const next = argv[index + 1];

    if (value === "--env-file" && next) {
      result.envFile = next;
      index += 1;
      continue;
    }
    if (value === "--plan" && next) {
      result.planFile = next;
      index += 1;
      continue;
    }
    if (value === "--out" && next) {
      result.outFile = next;
      index += 1;
      continue;
    }
    if (value === "--enrollment-id" && next) {
      result.enrollmentIds.push(next);
      index += 1;
      continue;
    }
    if (value === "--apply") {
      result.apply = true;
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

function normalizeRows(rows) {
  return rows
    .map((row) => ({
      paymentId: row.paymentId,
      chargeId: row.chargeId,
      amount: roundMoney(Number(row.amount)),
    }))
    .sort((left, right) => {
      const paymentDiff = left.paymentId.localeCompare(right.paymentId);
      if (paymentDiff !== 0) return paymentDiff;
      const chargeDiff = left.chargeId.localeCompare(right.chargeId);
      if (chargeDiff !== 0) return chargeDiff;
      return left.amount - right.amount;
    });
}

function sameRows(left, right) {
  const a = normalizeRows(left);
  const b = normalizeRows(right);
  if (a.length !== b.length) return false;
  for (let index = 0; index < a.length; index += 1) {
    if (
      a[index].paymentId !== b[index].paymentId ||
      a[index].chargeId !== b[index].chargeId ||
      Math.abs(a[index].amount - b[index].amount) > 0.01
    ) {
      return false;
    }
  }
  return true;
}

function summarizeFailure(reason, extra = {}) {
  return { ok: false, reason, ...extra };
}

async function fetchRows(supabase, table, select, column, values) {
  if (values.length === 0) return [];
  const { data, error } = await supabase.from(table).select(select).in(column, values);
  if (error) throw error;
  return data ?? [];
}

async function verifyPlanState(supabase, plan) {
  const paymentRows = await fetchRows(
    supabase,
    "payments",
    "id,enrollment_id,amount,status",
    "id",
    plan.touchedPaymentIds,
  );
  const refundRows = await fetchRows(
    supabase,
    "payment_refunds",
    "payment_id,amount",
    "payment_id",
    plan.touchedPaymentIds,
  );
  const chargeRows = await fetchRows(
    supabase,
    "charges",
    "id,enrollment_id,amount,status",
    "id",
    plan.selectedChargeIds,
  );
  const currentTouchedAllocations = await fetchRows(
    supabase,
    "payment_allocations",
    "payment_id,charge_id,amount",
    "payment_id",
    plan.touchedPaymentIds,
  );
  const currentChargeAllocations = await fetchRows(
    supabase,
    "payment_allocations",
    "payment_id,charge_id,amount",
    "charge_id",
    plan.selectedChargeIds,
  );

  const normalizedCurrentTouched = currentTouchedAllocations.map((row) => ({
    paymentId: row.payment_id,
    chargeId: row.charge_id,
    amount: row.amount,
  }));

  if (!sameRows(normalizedCurrentTouched, plan.currentTouchedAllocations)) {
    return summarizeFailure("stale_current_state", {
      currentTouchedAllocations: normalizeRows(normalizedCurrentTouched),
      expectedTouchedAllocations: normalizeRows(plan.currentTouchedAllocations),
    });
  }

  const paymentById = new Map(paymentRows.map((row) => [row.id, row]));
  const refundsByPaymentId = new Map(refundRows.map((row) => [row.payment_id, row]));
  for (const paymentId of plan.touchedPaymentIds) {
    const payment = paymentById.get(paymentId);
    if (!payment || payment.enrollment_id !== plan.enrollmentId || payment.status !== "posted") {
      return summarizeFailure("invalid_payment_state", { paymentId, payment });
    }
    if (refundsByPaymentId.has(paymentId)) {
      return summarizeFailure("payment_is_refunded", { paymentId });
    }
  }

  const chargeById = new Map(chargeRows.map((row) => [row.id, row]));
  for (const chargeId of plan.selectedChargeIds) {
    const charge = chargeById.get(chargeId);
    if (!charge || charge.enrollment_id !== plan.enrollmentId || charge.status === "void" || Number(charge.amount) <= 0) {
      return summarizeFailure("invalid_charge_state", { chargeId, charge });
    }
  }

  const targetRows = normalizeRows(plan.allocationPlan);
  const targetTotalsByPayment = new Map();
  for (const row of targetRows) {
    targetTotalsByPayment.set(row.paymentId, roundMoney((targetTotalsByPayment.get(row.paymentId) ?? 0) + row.amount));
  }

  for (const paymentId of plan.touchedPaymentIds) {
    const payment = paymentById.get(paymentId);
    const targetTotal = targetTotalsByPayment.get(paymentId) ?? 0;
    if (Math.abs(roundMoney(Number(payment.amount)) - targetTotal) > 0.01) {
      return summarizeFailure("payment_total_mismatch", {
        paymentId,
        paymentAmount: Number(payment.amount),
        targetTotal,
      });
    }
  }

  const currentTotalsByCharge = new Map();
  const selectedCurrentTotalsByCharge = new Map();
  const incomingTotalsByCharge = new Map();

  for (const row of currentChargeAllocations) {
    currentTotalsByCharge.set(
      row.charge_id,
      roundMoney((currentTotalsByCharge.get(row.charge_id) ?? 0) + Number(row.amount)),
    );
    if (plan.touchedPaymentIds.includes(row.payment_id)) {
      selectedCurrentTotalsByCharge.set(
        row.charge_id,
        roundMoney((selectedCurrentTotalsByCharge.get(row.charge_id) ?? 0) + Number(row.amount)),
      );
    }
  }

  for (const row of targetRows) {
    incomingTotalsByCharge.set(
      row.chargeId,
      roundMoney((incomingTotalsByCharge.get(row.chargeId) ?? 0) + row.amount),
    );
  }

  for (const chargeId of plan.selectedChargeIds) {
    const charge = chargeById.get(chargeId);
    const finalApplied = roundMoney(
      (currentTotalsByCharge.get(chargeId) ?? 0) -
        (selectedCurrentTotalsByCharge.get(chargeId) ?? 0) +
        (incomingTotalsByCharge.get(chargeId) ?? 0),
    );
    if (finalApplied - Number(charge.amount) > 0.01) {
      return summarizeFailure("charge_overapplied", {
        chargeId,
        chargeAmount: Number(charge.amount),
        finalApplied,
      });
    }
  }

  return {
    ok: true,
    currentTouchedAllocations: normalizeRows(normalizedCurrentTouched),
    targetAllocations: targetRows,
  };
}

async function applyPlan(supabase, plan, verification) {
  const previousRows = verification.currentTouchedAllocations.map((row) => ({
    payment_id: row.paymentId,
    charge_id: row.chargeId,
    amount: row.amount,
  }));
  const targetRows = verification.targetAllocations.map((row) => ({
    payment_id: row.paymentId,
    charge_id: row.chargeId,
    amount: row.amount,
  }));

  const { error: deleteError } = await supabase
    .from("payment_allocations")
    .delete()
    .in("payment_id", plan.touchedPaymentIds);

  if (deleteError) {
    return summarizeFailure("delete_failed", { message: deleteError.message });
  }

  if (targetRows.length > 0) {
    const { error: insertError } = await supabase.from("payment_allocations").insert(targetRows);
    if (insertError) {
      if (previousRows.length > 0) {
        await supabase.from("payment_allocations").insert(previousRows);
      }
      return summarizeFailure("insert_failed", { message: insertError.message });
    }
  }

  const afterRows = await fetchRows(
    supabase,
    "payment_allocations",
    "payment_id,charge_id,amount",
    "payment_id",
    plan.touchedPaymentIds,
  );

  const normalizedAfterRows = afterRows.map((row) => ({
    paymentId: row.payment_id,
    chargeId: row.charge_id,
    amount: row.amount,
  }));

  if (!sameRows(normalizedAfterRows, verification.targetAllocations)) {
    return summarizeFailure("post_write_verification_failed", {
      expectedAllocations: verification.targetAllocations,
      actualAllocations: normalizeRows(normalizedAfterRows),
    });
  }

  return {
    ok: true,
    beforeAllocations: verification.currentTouchedAllocations,
    afterAllocations: verification.targetAllocations,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const env = parseEnvFile(args.envFile);
  const planPath = path.resolve(args.planFile);
  const outPath = path.resolve(args.outFile);

  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    throw new Error("missing_supabase_credentials");
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const planDocument = JSON.parse(fs.readFileSync(planPath, "utf8"));
  const sourcePlans = planDocument.plans.filter((plan) => plan.executionClass === "rpc_ready");
  const filteredPlans =
    args.enrollmentIds.length > 0
      ? sourcePlans.filter((plan) => args.enrollmentIds.includes(plan.enrollmentId))
      : sourcePlans;

  const results = [];

  for (const plan of filteredPlans) {
    const verification = await verifyPlanState(supabase, plan);
    if (!verification.ok) {
      results.push({
        enrollmentId: plan.enrollmentId,
        playerName: plan.playerName,
        campusName: plan.campusName,
        mode: args.apply ? "apply" : "dry_run",
        ...verification,
      });
      continue;
    }

    if (!args.apply) {
      results.push({
        enrollmentId: plan.enrollmentId,
        playerName: plan.playerName,
        campusName: plan.campusName,
        mode: "dry_run",
        ok: true,
        targetAllocations: verification.targetAllocations,
      });
      continue;
    }

    const applied = await applyPlan(supabase, plan, verification);
    results.push({
      enrollmentId: plan.enrollmentId,
      playerName: plan.playerName,
      campusName: plan.campusName,
      mode: "apply",
      ...applied,
    });
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    projectUrl: supabaseUrl,
    envFile: path.resolve(args.envFile),
    planFile: planPath,
    apply: args.apply,
    targetedEnrollmentIds: args.enrollmentIds,
    summary: {
      totalPlansConsidered: filteredPlans.length,
      okCount: results.filter((row) => row.ok).length,
      failedCount: results.filter((row) => !row.ok).length,
    },
    results,
  };

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2));

  console.log(`Wrote finance repair apply log to ${outPath}`);
  console.log(`Plans considered: ${payload.summary.totalPlansConsidered}`);
  console.log(`Ok: ${payload.summary.okCount}`);
  console.log(`Failed: ${payload.summary.failedCount}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
