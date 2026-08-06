"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { writeAuditLog } from "@/lib/audit";
import { assertDebugWritesAllowed } from "@/lib/auth/debug-view";
import { getPermissionContext } from "@/lib/auth/permissions";
import { getCompetitionPaidCallupPlayers } from "@/lib/queries/sports-signups";
import type { WeeklyCallupProgram } from "@/lib/queries/weekly-callups";
import { createAdminClient } from "@/lib/supabase/admin";

type TournamentRow = {
  id: string;
  campus_id: string;
  product_id: string;
  name: string;
  is_active: boolean;
};

type AssignmentRow = {
  enrollment_id: string;
  player_id: string;
  training_group_id: string;
  training_groups: {
    id: string;
    campus_id: string;
    name: string;
    program: string;
    birth_year_min: number | null;
    birth_year_max: number | null;
    status: string;
  } | null;
};

function textValue(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function isMondayIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.getUTCDay() === 1;
}

function isProgram(value: string): value is WeeklyCallupProgram {
  return value === "selectivo" || value === "futbol_para_todos";
}

function categoryLabel(group: NonNullable<AssignmentRow["training_groups"]>) {
  if (group.birth_year_min && group.birth_year_max) {
    return group.birth_year_min === group.birth_year_max
      ? String(group.birth_year_min)
      : `${group.birth_year_min}/${group.birth_year_max}`;
  }
  return group.name;
}

function redirectResult(code: string): never {
  redirect(`/convocatorias?${code.includes("=") ? code : `err=${code}`}`);
}

export async function createWeeklyCallupSnapshotAction(formData: FormData) {
  await assertDebugWritesAllowed("/convocatorias");

  const context = await getPermissionContext();
  if (!context || (!context.hasOperationalAccess && !context.hasSportsAccess)) {
    redirect("/unauthorized");
  }

  const campusId = textValue(formData, "campusId");
  const tournamentId = textValue(formData, "tournamentId");
  const programValue = textValue(formData, "program");
  const weekStart = textValue(formData, "weekStart");
  const campusIds = context.campusAccess?.campusIds ?? [];

  if (!campusIds.includes(campusId) || !tournamentId || !isProgram(programValue) || !isMondayIsoDate(weekStart)) {
    redirectResult("invalid_snapshot_settings");
  }

  const admin = createAdminClient();
  const tournamentResult = await admin
    .from("tournaments")
    .select("id, campus_id, product_id, name, is_active")
    .eq("id", tournamentId)
    .maybeSingle<TournamentRow | null>();

  if (tournamentResult.error) throw tournamentResult.error;
  const tournament = tournamentResult.data;
  if (!tournament?.is_active || tournament.campus_id !== campusId) {
    redirectResult("invalid_tournament");
  }

  const existing = await admin
    .from("weekly_callups")
    .select("id")
    .eq("campus_id", campusId)
    .eq("tournament_id", tournamentId)
    .eq("program", programValue)
    .eq("week_start", weekStart)
    .maybeSingle<{ id: string } | null>();
  if (existing.error) throw existing.error;
  if (existing.data) redirectResult("snapshot_already_exists");

  const paidPlayers = await getCompetitionPaidCallupPlayers({
    campusId,
    competitionId: `product:${tournament.product_id}`,
  });
  if (!paidPlayers) redirectResult("paid_roster_unavailable");

  const enrollmentIds = paidPlayers.map((player) => player.enrollmentId);
  const assignmentsResult = enrollmentIds.length
    ? await admin
        .from("training_group_assignments")
        .select(
          "enrollment_id, player_id, training_group_id, training_groups(id, campus_id, name, program, birth_year_min, birth_year_max, status)",
        )
        .in("enrollment_id", enrollmentIds)
        .is("end_date", null)
        .returns<AssignmentRow[]>()
    : { data: [] as AssignmentRow[], error: null };
  if (assignmentsResult.error) throw assignmentsResult.error;

  const playerByEnrollment = new Map(paidPlayers.map((player) => [player.enrollmentId, player]));
  const eligibleAssignments = (assignmentsResult.data ?? []).filter(
    (assignment) =>
      assignment.training_groups?.campus_id === campusId &&
      assignment.training_groups?.program === programValue &&
      assignment.training_groups?.status === "active" &&
      playerByEnrollment.has(assignment.enrollment_id),
  );
  if (eligibleAssignments.length === 0) redirectResult("no_matching_paid_players");
  const snapshotAt = new Date().toISOString();
  let callupId: string | null = null;

  try {
    const headerResult = await admin
      .from("weekly_callups")
      .insert({
        campus_id: campusId,
        tournament_id: tournamentId,
        program: programValue,
        week_start: weekStart,
        status: "draft",
        roster_snapshot_at: snapshotAt,
        created_by: context.user.id,
        updated_by: context.user.id,
      })
      .select("id")
      .single<{ id: string }>();
    if (headerResult.error || !headerResult.data) throw headerResult.error ?? new Error("snapshot_header_failed");
    callupId = headerResult.data.id;

    const assignmentsByGroup = new Map<string, AssignmentRow[]>();
    for (const assignment of eligibleAssignments) {
      const current = assignmentsByGroup.get(assignment.training_group_id) ?? [];
      current.push(assignment);
      assignmentsByGroup.set(assignment.training_group_id, current);
    }

    const groups = [...assignmentsByGroup.values()]
      .map((rows) => rows[0].training_groups)
      .filter((group): group is NonNullable<AssignmentRow["training_groups"]> => Boolean(group))
      .sort((a, b) => {
        const yearDiff = (b.birth_year_max ?? 0) - (a.birth_year_max ?? 0);
        return yearDiff || a.name.localeCompare(b.name, "es-MX");
      });

    for (const [sortOrder, group] of groups.entries()) {
      const categoryResult = await admin
        .from("weekly_callup_categories")
        .insert({
          weekly_callup_id: callupId,
          training_group_id: group.id,
          category_label: categoryLabel(group),
          birth_year_min: group.birth_year_min,
          birth_year_max: group.birth_year_max,
          training_group_name_snapshot: group.name,
          sort_order: sortOrder,
        })
        .select("id")
        .single<{ id: string }>();
      if (categoryResult.error || !categoryResult.data) {
        throw categoryResult.error ?? new Error("snapshot_category_failed");
      }

      const rows = assignmentsByGroup.get(group.id) ?? [];
      const playerPayload = rows
        .map((assignment) => {
          const player = playerByEnrollment.get(assignment.enrollment_id);
          if (!player) return null;
          return {
            weekly_callup_category_id: categoryResult.data.id,
            enrollment_id: player.enrollmentId,
            player_id: player.playerId,
            player_name_snapshot: player.playerName,
            birth_year: player.birthYear,
            training_group_id: group.id,
            training_group_name_snapshot: group.name,
            eligibility_source: player.registrationSource,
            roster_status: "included",
            source_snapshot_at: snapshotAt,
          };
        })
        .filter((row): row is NonNullable<typeof row> => Boolean(row));

      if (playerPayload.length > 0) {
        const playersResult = await admin.from("weekly_callup_players").insert(playerPayload);
        if (playersResult.error) throw playersResult.error;
      }
    }

    await writeAuditLog(admin, {
      actorUserId: context.user.id,
      actorEmail: context.user.email ?? null,
      action: "weekly_callups.snapshot_created",
      tableName: "weekly_callups",
      recordId: callupId,
      afterData: {
        campus_id: campusId,
        tournament_id: tournamentId,
        tournament_name: tournament.name,
        program: programValue,
        week_start: weekStart,
        paid_players: paidPlayers.length,
        included_players: eligibleAssignments.length,
        excluded_without_matching_group: paidPlayers.length - eligibleAssignments.length,
        roster_snapshot_at: snapshotAt,
      },
    });
  } catch (error) {
    if (callupId) await admin.from("weekly_callups").delete().eq("id", callupId);
    console.error("weekly callup snapshot failed", error);
    redirectResult("snapshot_create_failed");
  }

  revalidatePath("/convocatorias");
  redirectResult("ok=snapshot_created");
}
