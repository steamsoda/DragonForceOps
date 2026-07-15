import {
  resolveEntitledProductIds,
  type ProductBundleEntitlementInput,
} from "@/lib/products/bundle-entitlements";
import { createAdminClient } from "@/lib/supabase/admin";

type TournamentRow = {
  id: string;
  campus_id: string | null;
  product_id: string | null;
  is_active: boolean;
};

type ChargeRow = {
  id: string;
  enrollment_id: string;
  product_id: string | null;
  amount: number;
  created_at: string;
  enrollments: {
    campus_id: string;
    players: { gender: string | null } | null;
  } | null;
};

type AllocationRow = {
  charge_id: string;
  amount: number;
};

type EntitlementRow = {
  source_product_id: string;
  target_product_id: string;
  gender: string | null;
  is_active: boolean;
};

export async function backfillCompetitionSignupsForTournament(
  admin: ReturnType<typeof createAdminClient>,
  tournamentId: string,
) {
  const { data: tournament, error: tournamentError } = await admin
    .from("tournaments")
    .select("id, campus_id, product_id, is_active")
    .eq("id", tournamentId)
    .maybeSingle<TournamentRow | null>();

  if (tournamentError) throw tournamentError;
  if (!tournament?.is_active || !tournament.campus_id || !tournament.product_id) return 0;

  const { data: entitlementRows, error: entitlementError } = await admin
    .from("product_bundle_entitlements")
    .select("source_product_id, target_product_id, gender, is_active")
    .eq("target_product_id", tournament.product_id)
    .eq("is_active", true)
    .returns<EntitlementRow[]>();

  if (entitlementError) throw entitlementError;

  const bundleEntitlements = (entitlementRows ?? []).map<ProductBundleEntitlementInput>((row) => ({
    sourceProductId: row.source_product_id,
    targetProductId: row.target_product_id,
    gender: row.gender,
    isActive: row.is_active,
  }));
  const sourceProductIds = Array.from(
    new Set([tournament.product_id, ...bundleEntitlements.map((row) => row.sourceProductId)]),
  );

  const pageSize = 1000;
  const charges: ChargeRow[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await admin
      .from("charges")
      .select("id, enrollment_id, product_id, amount, created_at, enrollments!inner(campus_id, players(gender))")
      .neq("status", "void")
      .gt("amount", 0)
      .eq("enrollments.campus_id", tournament.campus_id)
      .in("product_id", sourceProductIds)
      .order("created_at", { ascending: true })
      .range(from, from + pageSize - 1)
      .returns<ChargeRow[]>();

    if (error) throw error;
    const batch = data ?? [];
    charges.push(...batch);
    if (batch.length < pageSize) break;
  }

  if (charges.length === 0) return 0;

  const allocationTotals = new Map<string, number>();
  const chunkSize = 500;
  for (let index = 0; index < charges.length; index += chunkSize) {
    const chargeIds = charges.slice(index, index + chunkSize).map((charge) => charge.id);
    const { data, error } = await admin
      .from("payment_allocations")
      .select("charge_id, amount")
      .in("charge_id", chargeIds)
      .returns<AllocationRow[]>();

    if (error) throw error;
    for (const row of data ?? []) {
      allocationTotals.set(
        row.charge_id,
        Math.round(((allocationTotals.get(row.charge_id) ?? 0) + Number(row.amount)) * 100) / 100,
      );
    }
  }

  const paidChargeByEnrollment = new Map<string, ChargeRow>();
  for (const charge of charges) {
    if (!charge.product_id || !charge.enrollments) continue;
    if ((allocationTotals.get(charge.id) ?? 0) + 0.009 < Number(charge.amount)) continue;

    const entitledProductIds = resolveEntitledProductIds({
      sourceProductId: charge.product_id,
      gender: charge.enrollments.players?.gender ?? null,
      entitlements: bundleEntitlements,
    });
    if (!entitledProductIds.includes(tournament.product_id)) continue;

    if (!paidChargeByEnrollment.has(charge.enrollment_id)) {
      paidChargeByEnrollment.set(charge.enrollment_id, charge);
    }
  }

  const rows = [...paidChargeByEnrollment.values()].map((charge) => ({
    tournament_id: tournament.id,
    enrollment_id: charge.enrollment_id,
    charge_id: charge.id,
    entry_status: "confirmed" as const,
    signed_up_at: charge.created_at,
    updated_at: new Date().toISOString(),
  }));

  for (let index = 0; index < rows.length; index += chunkSize) {
    const { error } = await admin
      .from("tournament_player_entries")
      .upsert(rows.slice(index, index + chunkSize), { onConflict: "tournament_id,enrollment_id" });
    if (error) throw error;
  }

  return rows.length;
}
