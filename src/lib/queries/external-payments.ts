import { createClient } from "@/lib/supabase/server";
import {
  calculateExternalNetAmount,
  formatPeriodMonthLabel,
  normalizeExternalName,
  parseInvoiceTuitionPeriodMonth,
  tokenizeExternalName,
} from "@/lib/external-payments";
import { getMonterreyMonthBounds, getMonterreyMonthString } from "@/lib/time";

type ExternalPaymentEventRow = {
  id: string;
  source_kind: string;
  provider: string;
  external_ref: string;
  gross_amount: number;
  currency: string;
  paid_at: string;
  reconciliation_status: "unmatched" | "matched" | "ignored" | "refunded";
  payer_name: string | null;
  payer_email: string | null;
  assigned_player_name: string | null;
  provider_group_label: string | null;
  invoice_description: string | null;
  invoice_number: string | null;
  provider_invoice_id: string | null;
  stripe_charge_id: string | null;
  stripe_payment_intent_id: string | null;
  stripe_invoice_id: string | null;
  stripe_fee_amount: number | null;
  stripe_fee_tax_amount: number | null;
  platform_fee_amount: number | null;
  matched_enrollment_id: string | null;
  matched_charge_id: string | null;
  matched_payment_id: string | null;
  ignored_reason: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type ActiveEnrollmentRow = {
  id: string;
  player_id: string;
  campuses: { name: string | null } | null;
  players: {
    first_name: string | null;
    last_name: string | null;
    birth_date: string | null;
  } | null;
};

type PendingChargeRow = {
  id: string;
  enrollment_id: string;
  period_month: string | null;
  description: string;
  amount: number;
};

type AllocationRow = {
  charge_id: string;
  amount: number;
};

type PaymentLinkRow = {
  id: string;
  folio: string | null;
};

type EnrollmentLinkRow = {
  id: string;
  campuses: { name: string | null } | null;
  players: {
    first_name: string | null;
    last_name: string | null;
    birth_date: string | null;
  } | null;
};

type ChargeLinkRow = {
  id: string;
  description: string;
  amount: number;
  period_month: string | null;
};

export type ExternalPaymentMatchOption = {
  chargeId: string;
  enrollmentId: string;
  playerName: string;
  campusName: string;
  birthYear: number | null;
  periodMonth: string | null;
  periodLabel: string;
  amount: number;
  pendingAmount: number;
  label: string;
  score: number;
};

export type ExternalPaymentQueueRow = {
  id: string;
  externalRef: string;
  provider: string;
  sourceKind: string;
  grossAmount: number;
  currency: string;
  paidAt: string;
  payerName: string | null;
  payerEmail: string | null;
  assignedPlayerName: string | null;
  providerGroupLabel: string | null;
  invoiceDescription: string | null;
  invoiceNumber: string | null;
  providerInvoiceId: string | null;
  stripeChargeId: string | null;
  stripePaymentIntentId: string | null;
  stripeInvoiceId: string | null;
  stripeFeeAmount: number | null;
  stripeFeeTaxAmount: number | null;
  platformFeeAmount: number | null;
  netAmount: number;
  notes: string | null;
  ignoredReason: string | null;
  parsedPeriodMonth: string | null;
  parsedPeriodLabel: string | null;
  matchOptions: ExternalPaymentMatchOption[];
  suggestedChargeId: string | null;
};

export type ExternalPaymentHistoryRow = {
  id: string;
  externalRef: string;
  grossAmount: number;
  currency: string;
  paidAt: string;
  payerName: string | null;
  assignedPlayerName: string | null;
  invoiceDescription: string | null;
  invoiceNumber: string | null;
  stripeFeeAmount: number | null;
  stripeFeeTaxAmount: number | null;
  platformFeeAmount: number | null;
  netAmount: number;
  matchedPlayerName: string | null;
  matchedCampusName: string | null;
  matchedChargeDescription: string | null;
  matchedChargePeriodLabel: string | null;
  matchedPaymentFolio: string | null;
  ignoredReason: string | null;
};

export type ExternalPaymentsDashboard = {
  month: string;
  summary: {
    grossAmount: number;
    stripeFeeAmount: number;
    stripeFeeTaxAmount: number;
    platformFeeAmount: number;
    netAmount: number;
    matchedCount: number;
    unmatchedCount: number;
    ignoredCount: number;
    refundedCount: number;
  };
  unmatched: ExternalPaymentQueueRow[];
  matched: ExternalPaymentHistoryRow[];
  ignored: ExternalPaymentHistoryRow[];
};

type EnrollmentCandidate = {
  enrollmentId: string;
  playerName: string;
  campusName: string;
  birthYear: number | null;
  normalizedName: string;
};

function scoreEnrollmentCandidate(query: string, candidate: EnrollmentCandidate) {
  const normalizedQuery = normalizeExternalName(query);
  if (!normalizedQuery) return 0;

  if (candidate.normalizedName === normalizedQuery) return 1000;
  if (candidate.normalizedName.includes(normalizedQuery) || normalizedQuery.includes(candidate.normalizedName)) {
    return 850;
  }

  const queryTokens = tokenizeExternalName(query);
  if (queryTokens.length === 0) return 0;

  const candidateTokens = new Set(candidate.normalizedName.split(" ").filter(Boolean));
  let overlap = 0;
  queryTokens.forEach((token) => {
    if (candidateTokens.has(token)) overlap += 1;
  });

  if (overlap === 0) return 0;

  const firstTokenBonus = candidate.normalizedName.startsWith(queryTokens[0]) ? 50 : 0;
  return overlap * 100 + firstTokenBonus;
}

function buildEnrollmentCandidates(rows: ActiveEnrollmentRow[]): EnrollmentCandidate[] {
  return rows.map((row) => {
    const playerName = `${row.players?.first_name ?? ""} ${row.players?.last_name ?? ""}`.trim();
    const birthYear = row.players?.birth_date ? Number(row.players.birth_date.slice(0, 4)) : null;

    return {
      enrollmentId: row.id,
      playerName,
      campusName: row.campuses?.name ?? "-",
      birthYear,
      normalizedName: normalizeExternalName(playerName),
    };
  });
}

function buildChargeOption(
  candidate: EnrollmentCandidate,
  charge: PendingChargeRow & { pendingAmount: number },
  score: number
): ExternalPaymentMatchOption {
  return {
    chargeId: charge.id,
    enrollmentId: charge.enrollment_id,
    playerName: candidate.playerName,
    campusName: candidate.campusName,
    birthYear: candidate.birthYear,
    periodMonth: charge.period_month,
    periodLabel: formatPeriodMonthLabel(charge.period_month),
    amount: charge.amount,
    pendingAmount: charge.pendingAmount,
    label: `${candidate.playerName} · ${candidate.campusName} · ${formatPeriodMonthLabel(charge.period_month)} · $${charge.pendingAmount.toFixed(2)}`,
    score,
  };
}

export async function getExternalPaymentsDashboard(filters: {
  month?: string;
}): Promise<ExternalPaymentsDashboard> {
  const supabase = await createClient();
  const month = /^\d{4}-\d{2}$/.test(filters.month ?? "") ? (filters.month as string) : getMonterreyMonthString();
  const { start, end } = getMonterreyMonthBounds(month);

  const { data: eventRows } = await supabase
    .from("external_payment_events")
    .select(
      [
        "id",
        "source_kind",
        "provider",
        "external_ref",
        "gross_amount",
        "currency",
        "paid_at",
        "reconciliation_status",
        "payer_name",
        "payer_email",
        "assigned_player_name",
        "provider_group_label",
        "invoice_description",
        "invoice_number",
        "provider_invoice_id",
        "stripe_charge_id",
        "stripe_payment_intent_id",
        "stripe_invoice_id",
        "stripe_fee_amount",
        "stripe_fee_tax_amount",
        "platform_fee_amount",
        "matched_enrollment_id",
        "matched_charge_id",
        "matched_payment_id",
        "ignored_reason",
        "notes",
        "created_at",
        "updated_at",
      ].join(", ")
    )
    .gte("paid_at", start)
    .lt("paid_at", end)
    .order("paid_at", { ascending: false })
    .returns<ExternalPaymentEventRow[]>();

  const events = eventRows ?? [];

  const summary = events.reduce(
    (acc, row) => {
      acc.grossAmount += row.gross_amount;
      acc.stripeFeeAmount += row.stripe_fee_amount ?? 0;
      acc.stripeFeeTaxAmount += row.stripe_fee_tax_amount ?? 0;
      acc.platformFeeAmount += row.platform_fee_amount ?? 0;
      acc.netAmount += calculateExternalNetAmount({
        grossAmount: row.gross_amount,
        stripeFeeAmount: row.stripe_fee_amount,
        platformFeeAmount: row.platform_fee_amount,
      });
      acc[`${row.reconciliation_status}Count` as "matchedCount"] += 1;
      return acc;
    },
    {
      grossAmount: 0,
      stripeFeeAmount: 0,
      stripeFeeTaxAmount: 0,
      platformFeeAmount: 0,
      netAmount: 0,
      matchedCount: 0,
      unmatchedCount: 0,
      ignoredCount: 0,
      refundedCount: 0,
    }
  );

  const matchedPaymentIds = events.map((row) => row.matched_payment_id).filter(Boolean) as string[];
  const matchedEnrollmentIds = events.map((row) => row.matched_enrollment_id).filter(Boolean) as string[];
  const matchedChargeIds = events.map((row) => row.matched_charge_id).filter(Boolean) as string[];

  const [paymentLinksResult, enrollmentLinksResult, chargeLinksResult, activeEnrollmentsResult, pendingChargesResult] =
    await Promise.all([
      matchedPaymentIds.length > 0
        ? supabase
            .from("payments")
            .select("id, folio")
            .in("id", matchedPaymentIds)
            .returns<PaymentLinkRow[]>()
        : Promise.resolve({ data: [] as PaymentLinkRow[] }),
      matchedEnrollmentIds.length > 0
        ? supabase
            .from("enrollments")
            .select("id, campuses(name), players(first_name, last_name, birth_date)")
            .in("id", matchedEnrollmentIds)
            .returns<EnrollmentLinkRow[]>()
        : Promise.resolve({ data: [] as EnrollmentLinkRow[] }),
      matchedChargeIds.length > 0
        ? supabase
            .from("charges")
            .select("id, description, amount, period_month")
            .in("id", matchedChargeIds)
            .returns<ChargeLinkRow[]>()
        : Promise.resolve({ data: [] as ChargeLinkRow[] }),
      supabase
        .from("enrollments")
        .select("id, player_id, campuses(name), players(first_name, last_name, birth_date)")
        .eq("status", "active")
        .returns<ActiveEnrollmentRow[]>(),
      supabase
        .from("charges")
        .select("id, enrollment_id, period_month, description, amount, charge_types!inner(code), enrollments!inner(status)")
        .eq("status", "pending")
        .eq("charge_types.code", "monthly_tuition")
        .eq("enrollments.status", "active")
        .order("period_month", { ascending: true })
        .returns<
          Array<
            PendingChargeRow & {
              charge_types: { code: string | null } | null;
              enrollments: { status: string | null } | null;
            }
          >
        >(),
    ]);

  const paymentLinks = new Map((paymentLinksResult.data ?? []).map((row) => [row.id, row]));
  const enrollmentLinks = new Map((enrollmentLinksResult.data ?? []).map((row) => [row.id, row]));
  const chargeLinks = new Map((chargeLinksResult.data ?? []).map((row) => [row.id, row]));

  const activeEnrollments = buildEnrollmentCandidates(activeEnrollmentsResult.data ?? []);
  const pendingChargeRows = (pendingChargesResult.data ?? []).map((row) => ({
    id: row.id,
    enrollment_id: row.enrollment_id,
    period_month: row.period_month,
    description: row.description,
    amount: row.amount,
  }));

  const pendingChargeIds = pendingChargeRows.map((row) => row.id);
  let allocationRows: AllocationRow[] = [];
  if (pendingChargeIds.length > 0) {
    const { data } = await supabase
      .from("payment_allocations")
      .select("charge_id, amount")
      .in("charge_id", pendingChargeIds)
      .returns<AllocationRow[]>();
    allocationRows = data ?? [];
  }

  const allocatedByCharge = new Map<string, number>();
  allocationRows.forEach((row) => {
    allocatedByCharge.set(row.charge_id, (allocatedByCharge.get(row.charge_id) ?? 0) + row.amount);
  });

  const pendingChargesByEnrollment = new Map<string, Array<PendingChargeRow & { pendingAmount: number }>>();
  pendingChargeRows.forEach((row) => {
    const pendingAmount = Math.max(row.amount - (allocatedByCharge.get(row.id) ?? 0), 0);
    if (pendingAmount <= 0) return;

    const list = pendingChargesByEnrollment.get(row.enrollment_id) ?? [];
    list.push({ ...row, pendingAmount });
    pendingChargesByEnrollment.set(row.enrollment_id, list);
  });

  const unmatched: ExternalPaymentQueueRow[] = events
    .filter((row) => row.reconciliation_status === "unmatched")
    .map((row) => {
      const parsedPeriodMonth = parseInvoiceTuitionPeriodMonth(row.invoice_description);
      const parsedPeriodLabel = parsedPeriodMonth ? formatPeriodMonthLabel(parsedPeriodMonth) : null;
      const searchSeed = row.assigned_player_name || row.payer_name || "";

      const candidateEnrollments = activeEnrollments
        .map((candidate) => ({
          ...candidate,
          score: scoreEnrollmentCandidate(searchSeed, candidate),
        }))
        .filter((candidate) => candidate.score > 0)
        .sort((a, b) => b.score - a.score || a.playerName.localeCompare(b.playerName, "es-MX"))
        .slice(0, 6);

      let matchOptions = candidateEnrollments.flatMap((candidate) => {
        const charges = pendingChargesByEnrollment.get(candidate.enrollmentId) ?? [];
        const filteredCharges =
          parsedPeriodMonth
            ? charges.filter((charge) => charge.period_month === parsedPeriodMonth)
            : charges;

        return filteredCharges.map((charge) => buildChargeOption(candidate, charge, candidate.score));
      });

      if (matchOptions.length === 0 && parsedPeriodMonth) {
        matchOptions = candidateEnrollments.flatMap((candidate) => {
          const charges = pendingChargesByEnrollment.get(candidate.enrollmentId) ?? [];
          return charges.map((charge) => buildChargeOption(candidate, charge, candidate.score));
        });
      }

      matchOptions = matchOptions
        .sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score;
          if (a.periodMonth && b.periodMonth && a.periodMonth !== b.periodMonth) {
            return a.periodMonth.localeCompare(b.periodMonth);
          }
          return a.playerName.localeCompare(b.playerName, "es-MX");
        })
        .slice(0, 12);

      const suggestedChargeId = matchOptions.find((option) => {
        if (parsedPeriodMonth) return option.periodMonth === parsedPeriodMonth;
        return true;
      })?.chargeId ?? null;

      return {
        id: row.id,
        externalRef: row.external_ref,
        provider: row.provider,
        sourceKind: row.source_kind,
        grossAmount: row.gross_amount,
        currency: row.currency,
        paidAt: row.paid_at,
        payerName: row.payer_name,
        payerEmail: row.payer_email,
        assignedPlayerName: row.assigned_player_name,
        providerGroupLabel: row.provider_group_label,
        invoiceDescription: row.invoice_description,
        invoiceNumber: row.invoice_number,
        providerInvoiceId: row.provider_invoice_id,
        stripeChargeId: row.stripe_charge_id,
        stripePaymentIntentId: row.stripe_payment_intent_id,
        stripeInvoiceId: row.stripe_invoice_id,
        stripeFeeAmount: row.stripe_fee_amount,
        stripeFeeTaxAmount: row.stripe_fee_tax_amount,
        platformFeeAmount: row.platform_fee_amount,
        netAmount: calculateExternalNetAmount({
          grossAmount: row.gross_amount,
          stripeFeeAmount: row.stripe_fee_amount,
          platformFeeAmount: row.platform_fee_amount,
        }),
        notes: row.notes,
        ignoredReason: row.ignored_reason,
        parsedPeriodMonth,
        parsedPeriodLabel,
        matchOptions,
        suggestedChargeId,
      };
    });

  const mapHistoryRow = (row: ExternalPaymentEventRow): ExternalPaymentHistoryRow => {
    const matchedPayment = row.matched_payment_id ? paymentLinks.get(row.matched_payment_id) : null;
    const matchedEnrollment = row.matched_enrollment_id ? enrollmentLinks.get(row.matched_enrollment_id) : null;
    const matchedCharge = row.matched_charge_id ? chargeLinks.get(row.matched_charge_id) : null;
    const matchedPlayerName = matchedEnrollment
      ? `${matchedEnrollment.players?.first_name ?? ""} ${matchedEnrollment.players?.last_name ?? ""}`.trim() || null
      : null;

    return {
      id: row.id,
      externalRef: row.external_ref,
      grossAmount: row.gross_amount,
      currency: row.currency,
      paidAt: row.paid_at,
      payerName: row.payer_name,
      assignedPlayerName: row.assigned_player_name,
      invoiceDescription: row.invoice_description,
      invoiceNumber: row.invoice_number,
      stripeFeeAmount: row.stripe_fee_amount,
      stripeFeeTaxAmount: row.stripe_fee_tax_amount,
      platformFeeAmount: row.platform_fee_amount,
      netAmount: calculateExternalNetAmount({
        grossAmount: row.gross_amount,
        stripeFeeAmount: row.stripe_fee_amount,
        platformFeeAmount: row.platform_fee_amount,
      }),
      matchedPlayerName,
      matchedCampusName: matchedEnrollment?.campuses?.name ?? null,
      matchedChargeDescription: matchedCharge?.description ?? null,
      matchedChargePeriodLabel: matchedCharge?.period_month ? formatPeriodMonthLabel(matchedCharge.period_month) : null,
      matchedPaymentFolio: matchedPayment?.folio ?? null,
      ignoredReason: row.ignored_reason,
    };
  };

  return {
    month,
    summary,
    unmatched,
    matched: events.filter((row) => row.reconciliation_status === "matched").map(mapHistoryRow),
    ignored: events.filter((row) => row.reconciliation_status === "ignored").map(mapHistoryRow),
  };
}
