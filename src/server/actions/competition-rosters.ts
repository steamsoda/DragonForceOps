"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { assertDebugWritesAllowed } from "@/lib/auth/debug-view";
import { canAccessCampus } from "@/lib/auth/campuses";
import { getPermissionContext } from "@/lib/auth/permissions";
import { createAdminClient } from "@/lib/supabase/admin";

const PROGRAMS = new Set(["futbol_para_todos", "selectivo", "little_dragons"]);

function clean(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function organizerPath(params: {
  tournamentId: string;
  campusId: string;
  program: string;
  result?: string;
}) {
  const query = new URLSearchParams({
    tournament: params.tournamentId,
    campus: params.campusId,
    program: params.program,
  });
  if (params.result) {
    const [key, value] = params.result.split("=");
    query.set(key, value);
  }
  return `/sports-signups/squads?${query.toString()}`;
}

function squadSyncErrorCode(error: { code?: string; message: string }) {
  const message = error.message.toLowerCase();
  if (message.includes("advanced_squad")) return "advanced_squad_requires_editor";
  if (message.includes("split_needs_two_players")) return "split_needs_two_players";
  if (message.includes("split_requires_both_teams")) return "split_requires_both_teams";
  if (message.includes("split_invalid_player")) return "split_invalid_player";
  if (message.includes("combined_needs_two_groups")) return "combined_needs_two_groups";
  if (message.includes("combined_invalid_name")) return "combined_invalid_name";
  if (message.includes("combined_invalid_group")) return "combined_invalid_group";
  if (message.includes("combined_target_not_found")) return "combined_target_not_found";
  if (message.includes("combined_no_players")) return "combined_no_players";
  if (message.includes("combined_name_conflict")) return "combined_name_conflict";
  if (message.includes("combined_player_conflict")) return "combined_player_conflict";
  if (message.includes("manager_required") || message.includes("auth_required") || message.includes("row-level security")) {
    return "squad_permission_denied";
  }
  if (message.includes("not_found") || message.includes("mismatch") || message.includes("invalid_program")) {
    return "invalid_squad_scope";
  }
  if (error.code === "23505") return "combined_name_conflict";
  if (error.code === "42702" || message.includes("column reference") && message.includes("ambiguous")) {
    return "squad_database_conflict";
  }
  return "squad_sync_failed";
}

async function validateCombinedOrganizerScope(params: {
  tournamentId: string;
  campusId: string;
  trainingGroupIds: string[];
  program: string;
}) {
  const admin = createAdminClient();
  const [tournamentResult, groupsResult] = await Promise.all([
    admin
      .from("tournaments")
      .select("id, campus_id, is_active")
      .eq("id", params.tournamentId)
      .maybeSingle<{ id: string; campus_id: string | null; is_active: boolean } | null>(),
    admin
      .from("training_groups")
      .select("id, campus_id, program, status")
      .in("id", params.trainingGroupIds)
      .returns<Array<{ id: string; campus_id: string; program: string | null; status: string }>>(),
  ]);

  return !tournamentResult.error
    && !groupsResult.error
    && Boolean(tournamentResult.data?.is_active)
    && tournamentResult.data?.campus_id === params.campusId
    && (groupsResult.data?.length ?? 0) === params.trainingGroupIds.length
    && (groupsResult.data ?? []).every((group) =>
      group.campus_id === params.campusId
      && group.program === params.program
      && group.status === "active",
    );
}

async function validateOrganizerScope(params: {
  tournamentId: string;
  campusId: string;
  trainingGroupId: string;
  program: string;
}) {
  const admin = createAdminClient();
  const [tournamentResult, groupResult] = await Promise.all([
    admin
      .from("tournaments")
      .select("id, campus_id, is_active")
      .eq("id", params.tournamentId)
      .maybeSingle<{ id: string; campus_id: string | null; is_active: boolean } | null>(),
    admin
      .from("training_groups")
      .select("id, campus_id, program, status")
      .eq("id", params.trainingGroupId)
      .maybeSingle<{ id: string; campus_id: string; program: string | null; status: string } | null>(),
  ]);

  return !tournamentResult.error
    && !groupResult.error
    && Boolean(tournamentResult.data?.is_active)
    && tournamentResult.data?.campus_id === params.campusId
    && groupResult.data?.campus_id === params.campusId
    && groupResult.data.program === params.program
    && groupResult.data.status === "active";
}

export async function createOrSyncDefaultCompetitionSquadAction(formData: FormData) {
  const tournamentId = clean(formData.get("tournamentId"));
  const campusId = clean(formData.get("campusId"));
  const trainingGroupId = clean(formData.get("trainingGroupId"));
  const program = clean(formData.get("program"));
  const fallbackPath = organizerPath({ tournamentId, campusId, program });

  await assertDebugWritesAllowed(fallbackPath);
  const context = await getPermissionContext();
  if (!context?.isSportsDirector || !canAccessCampus(context.campusAccess, campusId)) {
    redirect("/unauthorized");
  }

  if (![tournamentId, campusId, trainingGroupId].every(isUuid) || !PROGRAMS.has(program)) {
    redirect(organizerPath({ tournamentId, campusId, program, result: "err=invalid_squad_settings" }));
  }

  if (!await validateOrganizerScope({ tournamentId, campusId, trainingGroupId, program })) {
    redirect(organizerPath({ tournamentId, campusId, program, result: "err=invalid_squad_scope" }));
  }

  const result = await context.supabase.rpc("create_or_sync_default_competition_squad", {
    p_tournament_id: tournamentId,
    p_training_group_id: trainingGroupId,
    p_program: program,
  });

  if (result.error) {
    console.error("default competition squad sync failed", {
      code: result.error.code,
      message: result.error.message,
      details: result.error.details,
      hint: result.error.hint,
      tournamentId,
      trainingGroupId,
      program,
    });
    const code = squadSyncErrorCode(result.error);
    redirect(organizerPath({ tournamentId, campusId, program, result: `err=${code}` }));
  }

  revalidatePath("/sports-signups");
  revalidatePath("/sports-signups/squads");
  redirect(organizerPath({ tournamentId, campusId, program, result: "ok=squad_synced" }));
}

export async function createOrSyncSplitCompetitionSquadsAction(formData: FormData) {
  const tournamentId = clean(formData.get("tournamentId"));
  const campusId = clean(formData.get("campusId"));
  const trainingGroupId = clean(formData.get("trainingGroupId"));
  const program = clean(formData.get("program"));
  const blancoEnrollmentIds = [...new Set(formData.getAll("blancoEnrollmentId").map(clean).filter(Boolean))];
  const fallbackPath = organizerPath({ tournamentId, campusId, program });

  await assertDebugWritesAllowed(fallbackPath);
  const context = await getPermissionContext();
  if (!context?.isSportsDirector || !canAccessCampus(context.campusAccess, campusId)) {
    redirect("/unauthorized");
  }

  if (
    ![tournamentId, campusId, trainingGroupId].every(isUuid)
    || !PROGRAMS.has(program)
    || blancoEnrollmentIds.some((id) => !isUuid(id))
  ) {
    redirect(organizerPath({ tournamentId, campusId, program, result: "err=invalid_split_settings" }));
  }

  if (!await validateOrganizerScope({ tournamentId, campusId, trainingGroupId, program })) {
    redirect(organizerPath({ tournamentId, campusId, program, result: "err=invalid_squad_scope" }));
  }

  const result = await context.supabase.rpc("create_or_sync_split_competition_squads", {
    p_tournament_id: tournamentId,
    p_training_group_id: trainingGroupId,
    p_program: program,
    p_blanco_enrollment_ids: blancoEnrollmentIds,
  });

  if (result.error) {
    console.error("competition squad split sync failed", {
      code: result.error.code,
      message: result.error.message,
      details: result.error.details,
      hint: result.error.hint,
      tournamentId,
      trainingGroupId,
      program,
      blancoCount: blancoEnrollmentIds.length,
    });
    const code = squadSyncErrorCode(result.error);
    redirect(organizerPath({ tournamentId, campusId, program, result: `err=${code}` }));
  }

  revalidatePath("/sports-signups");
  revalidatePath("/sports-signups/squads");
  redirect(organizerPath({ tournamentId, campusId, program, result: "ok=split_synced" }));
}

export async function createOrSyncCombinedCompetitionSquadAction(formData: FormData) {
  const tournamentId = clean(formData.get("tournamentId"));
  const campusId = clean(formData.get("campusId"));
  const program = clean(formData.get("program"));
  const squadId = clean(formData.get("squadId"));
  const squadName = clean(formData.get("squadName"));
  const trainingGroupIds = [...new Set(formData.getAll("trainingGroupId").map(clean).filter(Boolean))];
  const fallbackPath = organizerPath({ tournamentId, campusId, program });

  await assertDebugWritesAllowed(fallbackPath);
  const context = await getPermissionContext();
  if (!context?.isSportsDirector || !canAccessCampus(context.campusAccess, campusId)) {
    redirect("/unauthorized");
  }

  if (
    ![tournamentId, campusId].every(isUuid)
    || (squadId && !isUuid(squadId))
    || !PROGRAMS.has(program)
    || trainingGroupIds.length < 2
    || trainingGroupIds.some((id) => !isUuid(id))
    || squadName.length < 3
    || squadName.length > 80
  ) {
    redirect(organizerPath({ tournamentId, campusId, program, result: "err=invalid_combined_settings" }));
  }

  if (!await validateCombinedOrganizerScope({ tournamentId, campusId, trainingGroupIds, program })) {
    redirect(organizerPath({ tournamentId, campusId, program, result: "err=invalid_squad_scope" }));
  }

  const result = await context.supabase.rpc("create_or_sync_combined_competition_squad", {
    p_tournament_id: tournamentId,
    p_squad_id: squadId || null,
    p_training_group_ids: trainingGroupIds,
    p_program: program,
    p_name: squadName,
  });

  if (result.error) {
    console.error("combined competition squad sync failed", {
      code: result.error.code,
      message: result.error.message,
      details: result.error.details,
      hint: result.error.hint,
      tournamentId,
      program,
      squadId: squadId || null,
      trainingGroupCount: trainingGroupIds.length,
    });
    const code = squadSyncErrorCode(result.error);
    redirect(organizerPath({ tournamentId, campusId, program, result: `err=${code}` }));
  }

  revalidatePath("/sports-signups");
  revalidatePath("/sports-signups/squads");
  redirect(organizerPath({ tournamentId, campusId, program, result: "ok=combined_synced" }));
}
