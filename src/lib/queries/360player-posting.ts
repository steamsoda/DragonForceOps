import { canAccessCampus, getOperationalCampusAccess } from "@/lib/auth/campuses";
import { applyScholarshipToAmount, type ScholarshipStatus } from "@/lib/enrollments/scholarships";
import { formatPeriodMonthLabel, fetchPricingPlanVersionsByCode, quoteTuitionForDayFromVersions } from "@/lib/pricing/plans";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMonterreyMonthString } from "@/lib/time";

export type PostingMode = "early" | "late";

export type Player360PostingRow = {
  chargeId: string;
  enrollmentId: string;
  playerId: string;
  playerName: string;
  publicPlayerId: string | null;
  birthYear: number | null;
  campusId: string;
  campusName: string;
  chargeDescription: string;
  chargeAmount: number;
  pendingAmount: number;
  allocatedAmount: number;
  priorMonthlyPendingAmount: number;
  currency: string;
  periodMonth: string;
  earlyAmount: number | null;
  lateAmount: number | null;
  selectedAmount: number | null;
  actionLabel: string;
  status: "eligible" | "blocked";
  reason: string | null;
};

export type Player360PostingData = {
  campuses: Array<{ id: string; name: string; code: string }>;
  selectedCampusId: string | null;
  selectedMonth: string;
  periodMonth: string;
  mode: PostingMode;
  search: string;
  birthYear: number | null;
  birthYears: number[];
  rows: Player360PostingRow[];
  totals: {
    rows: number;
    eligible: number;
    blocked: number;
    selectedTotal: number;
    repriceCount: number;
  };
};

type ChargeRow = {
  id: string;
  enrollment_id: string;
  description: string;
  amount: number;
  currency: string;
  status: string;
  period_month: string | null;
  pricing_rule_id: string | null;
  enrollments: {
    id: string;
    status: string;
    scholarship_status: ScholarshipStatus;
    campus_id: string;
    campuses: { id: string; name: string | null; code: string | null } | null;
    pricing_plans: { plan_code: string | null; currency: string | null } | null;
    players: { id: string; public_player_id: string | null; first_name: string | null; last_name: string | null; birth_date: string | null } | null;
  } | null;
};

type AllocationRow = {
  charge_id: string;
  amount: number;
  payments: { id: string; method: string | null; status: string | null } | null;
};

type PriorMonthlyChargeRow = {
  id: string;
  enrollment_id: string;
  amount: number;
  payment_allocations: Array<{ amount: number | null }> | null;
};

type PlayerRow = NonNullable<NonNullable<ChargeRow["enrollments"]>["players"]>;

function normalizeMonth(value: string | null | undefined) {
  return value && /^\d{4}-\d{2}$/.test(value) ? value : getMonterreyMonthString();
}

function periodFromMonth(month: string) {
  return `${month}-01`;
}

function normalizeMode(value: string | null | undefined): PostingMode {
  return value === "late" ? "late" : "early";
}

function birthYear(value: string | null | undefined) {
  return value ? Number(value.slice(0, 4)) : null;
}

function playerName(player: PlayerRow | null | undefined) {
  if (!player) return "Jugador";
  return `${player.first_name ?? ""} ${player.last_name ?? ""}`.replace(/\s+/g, " ").trim() || "Jugador";
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function explainBlocked(reason: string) {
  const messages: Record<string, string> = {
    enrollment_inactive: "Inscripcion no activa",
    missing_plan: "Sin plan de precios",
    missing_quote: "No se pudo calcular precio",
    partial_allocation: "El cargo ya tiene pago parcial",
    fully_paid: "El cargo ya esta pagado",
    amount_mismatch: "Monto actual no coincide con precio temprano/tardio",
    selected_amount_missing: "Sin monto para publicar",
    duplicate_360player: "Ya tiene pago 360Player aplicado",
    duplicate_monthly_charge: "Tiene mas de un cargo de mensualidad para este mes",
    full_scholarship: "Beca completa",
    prior_month_arrears: "Tiene mensualidades anteriores pendientes",
  };
  return messages[reason] ?? reason;
}

export async function get360PlayerPostingData(filters: {
  campusId?: string;
  month?: string;
  birthYear?: number;
  search?: string;
  mode?: string;
}): Promise<Player360PostingData> {
  const access = await getOperationalCampusAccess();
  const selectedMonth = normalizeMonth(filters.month);
  const periodMonth = periodFromMonth(selectedMonth);
  const mode = normalizeMode(filters.mode);
  const search = (filters.search ?? "").trim();
  const selectedCampusId =
    filters.campusId && canAccessCampus(access, filters.campusId)
      ? filters.campusId
      : access?.defaultCampusId ?? access?.campusIds[0] ?? null;

  if (!access || !selectedCampusId || !canAccessCampus(access, selectedCampusId)) {
    return {
      campuses: access?.campuses ?? [],
      selectedCampusId: null,
      selectedMonth,
      periodMonth,
      mode,
      search,
      birthYear: filters.birthYear ?? null,
      birthYears: [],
      rows: [],
      totals: { rows: 0, eligible: 0, blocked: 0, selectedTotal: 0, repriceCount: 0 },
    };
  }

  const admin = createAdminClient();
  const { data: chargeType } = await admin
    .from("charge_types")
    .select("id")
    .eq("code", "monthly_tuition")
    .eq("is_active", true)
    .maybeSingle<{ id: string } | null>();

  if (!chargeType?.id) {
    return {
      campuses: access.campuses,
      selectedCampusId,
      selectedMonth,
      periodMonth,
      mode,
      search,
      birthYear: filters.birthYear ?? null,
      birthYears: [],
      rows: [],
      totals: { rows: 0, eligible: 0, blocked: 0, selectedTotal: 0, repriceCount: 0 },
    };
  }

  const { data: chargeRows } = await admin
    .from("charges")
    .select("id, enrollment_id, description, amount, currency, status, period_month, pricing_rule_id, enrollments!inner(id, status, scholarship_status, campus_id, campuses(id, name, code), pricing_plans(plan_code, currency), players(id, public_player_id, first_name, last_name, birth_date))")
    .eq("charge_type_id", chargeType.id)
    .eq("period_month", periodMonth)
    .neq("status", "void")
    .eq("enrollments.campus_id", selectedCampusId)
    .order("description", { ascending: true })
    .returns<ChargeRow[]>();

  const candidateRows = (chargeRows ?? [])
    .filter((row) => row.enrollments?.players)
    .filter((row) => {
      const by = birthYear(row.enrollments?.players?.birth_date);
      if (filters.birthYear && by !== filters.birthYear) return false;
      if (!search) return true;
      const haystack = [
        playerName(row.enrollments?.players),
        row.enrollments?.players?.public_player_id ?? "",
        row.description,
      ].join(" ").toLowerCase();
      return haystack.includes(search.toLowerCase());
    });

  const monthlyChargeCountByEnrollment = new Map<string, number>();
  for (const row of chargeRows ?? []) {
    monthlyChargeCountByEnrollment.set(
      row.enrollment_id,
      (monthlyChargeCountByEnrollment.get(row.enrollment_id) ?? 0) + 1
    );
  }

  const chargeIds = candidateRows.map((row) => row.id);
  const enrollmentIds = [...new Set(candidateRows.map((row) => row.enrollment_id))];
  const { data: allocations } = chargeIds.length === 0
    ? { data: [] as AllocationRow[] }
    : await admin
        .from("payment_allocations")
        .select("charge_id, amount, payments(id, method, status)")
        .in("charge_id", chargeIds)
        .returns<AllocationRow[]>();

  const { data: priorMonthlyCharges } = enrollmentIds.length === 0
    ? { data: [] as PriorMonthlyChargeRow[] }
    : await admin
        .from("charges")
        .select("id, enrollment_id, amount, charge_types!inner(code), payment_allocations(amount)")
        .in("enrollment_id", enrollmentIds)
        .lt("period_month", periodMonth)
        .neq("status", "void")
        .eq("charge_types.code", "monthly_tuition")
        .returns<PriorMonthlyChargeRow[]>();

  const priorPendingByEnrollment = new Map<string, number>();
  for (const charge of priorMonthlyCharges ?? []) {
    const allocated = (charge.payment_allocations ?? []).reduce(
      (sum, allocation) => sum + Number(allocation.amount ?? 0),
      0
    );
    const pending = roundMoney(Number(charge.amount ?? 0) - allocated);
    if (pending > 0.009) {
      priorPendingByEnrollment.set(
        charge.enrollment_id,
        roundMoney((priorPendingByEnrollment.get(charge.enrollment_id) ?? 0) + pending)
      );
    }
  }

  const allocationByCharge = new Map<string, number>();
  const has360ByCharge = new Set<string>();
  for (const allocation of allocations ?? []) {
    allocationByCharge.set(allocation.charge_id, roundMoney((allocationByCharge.get(allocation.charge_id) ?? 0) + allocation.amount));
    if (allocation.payments?.method === "stripe_360player" && allocation.payments.status === "posted") {
      has360ByCharge.add(allocation.charge_id);
    }
  }

  const planCodes = [...new Set(candidateRows.map((row) => row.enrollments?.pricing_plans?.plan_code).filter((code): code is string => Boolean(code)))];
  const quotesByPlan = new Map<string, { early: { amount: number; pricingRuleId: string | null } | null; late: { amount: number; pricingRuleId: string | null } | null }>();
  await Promise.all(planCodes.map(async (planCode) => {
    const versions = await fetchPricingPlanVersionsByCode(admin, planCode);
    quotesByPlan.set(planCode, {
      early: quoteTuitionForDayFromVersions(versions, periodMonth, 1),
      late: quoteTuitionForDayFromVersions(versions, periodMonth, 31),
    });
  }));

  const allBirthYears = Array.from(
    new Set((chargeRows ?? [])
      .map((row) => birthYear(row.enrollments?.players?.birth_date))
      .filter((value): value is number => Boolean(value)))
  ).sort((a, b) => b - a);

  const rows = candidateRows.map((row): Player360PostingRow => {
    const enrollment = row.enrollments;
    const planCode = enrollment?.pricing_plans?.plan_code ?? null;
    const quotes = planCode ? quotesByPlan.get(planCode) : null;
    const earlyAmount = quotes?.early ? applyScholarshipToAmount(quotes.early.amount, enrollment!.scholarship_status) : null;
    const lateAmount = quotes?.late ? applyScholarshipToAmount(quotes.late.amount, enrollment!.scholarship_status) : null;
    const selectedAmount = mode === "early" ? earlyAmount : lateAmount;
    const allocatedAmount = allocationByCharge.get(row.id) ?? 0;
    const pendingAmount = roundMoney(row.amount - allocatedAmount);
    const priorMonthlyPendingAmount = priorPendingByEnrollment.get(row.enrollment_id) ?? 0;
    const player = enrollment?.players ?? null;
    const reasons: string[] = [];

    if (enrollment?.status !== "active") reasons.push("enrollment_inactive");
    if (!planCode) reasons.push("missing_plan");
    if (enrollment?.scholarship_status === "full") reasons.push("full_scholarship");
    if (!earlyAmount || !lateAmount) reasons.push("missing_quote");
    if ((monthlyChargeCountByEnrollment.get(row.enrollment_id) ?? 0) > 1) reasons.push("duplicate_monthly_charge");
    if (priorMonthlyPendingAmount > 0.009) reasons.push("prior_month_arrears");
    if (has360ByCharge.has(row.id)) reasons.push("duplicate_360player");
    if (allocatedAmount > 0 && pendingAmount > 0.009) reasons.push("partial_allocation");
    if (pendingAmount <= 0.009) reasons.push("fully_paid");
    if (!selectedAmount) reasons.push("selected_amount_missing");
    if (selectedAmount && earlyAmount && lateAmount && ![earlyAmount, lateAmount, selectedAmount].some((amount) => Math.abs(roundMoney(row.amount) - amount) <= 0.009)) {
      reasons.push("amount_mismatch");
    }

    const isEligible = reasons.length === 0;
    const needsReprice = selectedAmount !== null && Math.abs(roundMoney(row.amount) - selectedAmount) > 0.009;

    return {
      chargeId: row.id,
      enrollmentId: row.enrollment_id,
      playerId: player?.id ?? "",
      playerName: playerName(player),
      publicPlayerId: player?.public_player_id ?? null,
      birthYear: birthYear(player?.birth_date),
      campusId: enrollment?.campus_id ?? selectedCampusId,
      campusName: enrollment?.campuses?.name ?? "Campus",
      chargeDescription: row.description,
      chargeAmount: row.amount,
      pendingAmount,
      allocatedAmount,
      priorMonthlyPendingAmount,
      currency: row.currency,
      periodMonth,
      earlyAmount,
      lateAmount,
      selectedAmount,
      actionLabel: selectedAmount
        ? needsReprice
          ? `Repreciar ${row.amount.toLocaleString("es-MX", { style: "currency", currency: row.currency })} -> ${selectedAmount.toLocaleString("es-MX", { style: "currency", currency: row.currency })} y registrar pago`
          : `Registrar pago por ${selectedAmount.toLocaleString("es-MX", { style: "currency", currency: row.currency })}`
        : "Sin monto calculado",
      status: isEligible ? "eligible" : "blocked",
      reason: reasons.length > 0 ? reasons.map(explainBlocked).join(" | ") : null,
    };
  }).sort((a, b) => {
    const yearDiff = (b.birthYear ?? 0) - (a.birthYear ?? 0);
    if (yearDiff !== 0) return yearDiff;
    return a.playerName.localeCompare(b.playerName, "es-MX");
  });

  return {
    campuses: access.campuses,
    selectedCampusId,
    selectedMonth,
    periodMonth,
    mode,
    search,
    birthYear: filters.birthYear ?? null,
    birthYears: allBirthYears,
    rows,
    totals: {
      rows: rows.length,
      eligible: rows.filter((row) => row.status === "eligible").length,
      blocked: rows.filter((row) => row.status === "blocked").length,
      selectedTotal: roundMoney(rows.filter((row) => row.status === "eligible").reduce((sum, row) => sum + (row.selectedAmount ?? 0), 0)),
      repriceCount: rows.filter((row) => row.status === "eligible" && row.selectedAmount !== null && Math.abs(row.chargeAmount - row.selectedAmount) > 0.009).length,
    },
  };
}

export function formatPostingMonth(periodMonth: string) {
  return formatPeriodMonthLabel(periodMonth);
}
