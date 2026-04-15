"use server";

import { createAdminClient } from "@/lib/supabase/admin";

type ChargeRow = {
  id: string;
  product_id: string | null;
  amount: number;
  status: string;
  created_at: string;
};

type TournamentRow = {
  id: string;
  campus_id: string | null;
  product_id: string | null;
  is_active: boolean;
};

type AllocationRow = {
  charge_id: string;
  amount: number;
};

type EntryRow = {
  id: string;
  tournament_id: string;
  enrollment_id: string;
  charge_id: string | null;
  entry_status: "confirmed" | "interested";
};

type SquadTeamRow = {
  tournament_id: string;
  team_id: string;
};

export async function syncCompetitionSignupsForEnrollment(enrollmentId: string): Promise<string[]> {
  const admin = createAdminClient();
  const { data: enrollment } = await admin
    .from("enrollments")
    .select("id, campus_id")
    .eq("id", enrollmentId)
    .maybeSingle<{ id: string; campus_id: string } | null>();

  if (!enrollment?.campus_id) return [];

  const [{ data: tournaments }, { data: charges }, { data: existingEntries }] = await Promise.all([
    admin
      .from("tournaments")
      .select("id, campus_id, product_id, is_active")
      .eq("campus_id", enrollment.campus_id)
      .eq("is_active", true)
      .not("product_id", "is", null)
      .returns<TournamentRow[]>(),
    admin
      .from("charges")
      .select("id, product_id, amount, status, created_at")
      .eq("enrollment_id", enrollmentId)
      .neq("status", "void")
      .not("product_id", "is", null)
      .returns<ChargeRow[]>(),
    admin
      .from("tournament_player_entries")
      .select("id, tournament_id, enrollment_id, charge_id, entry_status")
      .eq("enrollment_id", enrollmentId)
      .returns<EntryRow[]>(),
  ]);

  const activeTournaments = (tournaments ?? []).filter((row): row is TournamentRow & { product_id: string } => Boolean(row.product_id));
  if (activeTournaments.length === 0) return [];
  const { data: squadTeams } = await admin
    .from("tournament_squads")
    .select("tournament_id, team_id")
    .in("tournament_id", activeTournaments.map((row) => row.id))
    .returns<SquadTeamRow[]>();

  const chargeIds = (charges ?? []).map((charge) => charge.id);
  const allocations =
    chargeIds.length > 0
      ? await admin
          .from("payment_allocations")
          .select("charge_id, amount")
          .in("charge_id", chargeIds)
          .returns<AllocationRow[]>()
      : { data: [] as AllocationRow[] };

  const allocationTotals = new Map<string, number>();
  for (const row of allocations.data ?? []) {
    allocationTotals.set(row.charge_id, Math.round(((allocationTotals.get(row.charge_id) ?? 0) + row.amount) * 100) / 100);
  }

  const fullyPaidChargeByTournament = new Map<string, ChargeRow>();
  for (const tournament of activeTournaments) {
    const paidCharges = (charges ?? [])
      .filter((charge) => charge.product_id === tournament.product_id)
      .filter((charge) => (allocationTotals.get(charge.id) ?? 0) + 0.009 >= charge.amount)
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
    if (paidCharges[0]) fullyPaidChargeByTournament.set(tournament.id, paidCharges[0]);
  }

  const existingByTournament = new Map((existingEntries ?? []).map((row) => [row.tournament_id, row]));
  const affectedTournamentIds = new Set<string>();

  for (const tournament of activeTournaments) {
    const paidCharge = fullyPaidChargeByTournament.get(tournament.id);
    const existingEntry = existingByTournament.get(tournament.id);

    if (paidCharge) {
      if (!existingEntry || existingEntry.charge_id !== paidCharge.id || existingEntry.entry_status !== "confirmed") {
        await admin.from("tournament_player_entries").upsert(
          {
            tournament_id: tournament.id,
            enrollment_id: enrollmentId,
            charge_id: paidCharge.id,
            entry_status: "confirmed",
            signed_up_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          { onConflict: "tournament_id,enrollment_id" },
        );
        affectedTournamentIds.add(tournament.id);
      }
      continue;
    }

    if (existingEntry?.entry_status === "confirmed") {
      await admin.from("tournament_player_entries").delete().eq("id", existingEntry.id);
      const teamIds = (squadTeams ?? [])
        .filter((row) => row.tournament_id === tournament.id)
        .map((row) => row.team_id);
      if (teamIds.length > 0) {
        await admin
          .from("team_assignments")
          .update({ end_date: new Date().toISOString().split("T")[0], updated_at: new Date().toISOString() })
          .eq("enrollment_id", enrollmentId)
          .in("team_id", teamIds)
          .eq("is_primary", false)
          .is("end_date", null);
      }
      affectedTournamentIds.add(tournament.id);
    }
  }

  return Array.from(affectedTournamentIds);
}
