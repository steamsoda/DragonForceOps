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
  if (message.includes("invalid_reason")) return "invalid_exception_reason";
  if (message.includes("confirmed_player_not_found")) return "confirmed_player_not_found";
  if (message.includes("exclusion_not_found")) return "exclusion_not_found";
  if (message.includes("manual_scope_not_found")) return "manual_scope_not_found";
  if (message.includes("member_already_paid")) return "member_already_paid";
  if (message.includes("manual_member_not_found")) return "manual_member_not_found";
  if (message.includes("member_is_excluded")) return "member_is_excluded";
  if (message.includes("pending_player_not_found")) return "pending_player_not_found";
  if (message.includes("player_already_assigned")) return "player_already_assigned";
  if (message.includes("split_destination") || message.includes("split_structure_invalid")) {
    return "split_destination_invalid";
  }
  if (message.includes("snapshot_pending_players")) return "snapshot_pending_players";
  if (message.includes("snapshot_empty")) return "snapshot_empty";
  if (message.includes("snapshot_invalid")) return "invalid_snapshot_settings";
  if (message.includes("snapshot_not_found") || message.includes("snapshot_program_empty")) return "snapshot_not_found";
  if (message.includes("callup_already_exists")) return "snapshot_callup_already_exists";
  if (message.includes("callup_invalid_settings")) return "invalid_snapshot_callup";
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

export type CompetitionRosterInlineActionResult = {
  ok: boolean;
  message: string;
};

function inlineErrorMessage(code: string) {
  const messages: Record<string, string> = {
    invalid_squad_settings: "Faltan datos para guardar el cambio.",
    invalid_exception_reason: "Escribe un motivo de 3 a 240 caracteres.",
    pending_player_not_found: "El jugador ya no esta pendiente o cambio de grupo. Actualiza la vista.",
    player_already_assigned: "El jugador ya pertenece a un equipo. Actualiza la vista.",
    split_destination_invalid: "El destino Azul/Blanco ya no esta disponible.",
    confirmed_player_not_found: "La inscripcion al torneo ya no esta confirmada.",
    exclusion_not_found: "La exclusion ya no existe. Actualiza la vista.",
    manual_scope_not_found: "El equipo o jugador ya no esta disponible.",
    member_already_paid: "El jugador ya pertenece al equipo por su inscripcion confirmada.",
    manual_member_not_found: "El refuerzo ya no pertenece a ese equipo.",
    member_is_excluded: "Reintegra al jugador antes de agregarlo a un equipo.",
    squad_permission_denied: "Tu usuario no tiene permiso para administrar estos equipos.",
    competition_squad_professor_required: "Selecciona por lo menos un profesor para este equipo.",
    competition_squad_primary_professor_required: "Selecciona cual sera el profesor principal.",
    competition_squad_professor_invalid: "Uno de los profesores ya no esta activo en este campus.",
    combined_squad_requires_manual_professor: "Los equipos combinados necesitan una asignacion manual de profesores.",
  };
  return messages[code] ?? "No se pudo guardar el cambio. Ningun otro dato fue modificado.";
}

export async function setCompetitionRosterSquadProfessorsInlineAction(input: {
  tournamentId: string;
  campusId: string;
  program: string;
  squadId: string;
  coachIds: string[];
  primaryCoachId: string | null;
  useInherited: boolean;
}): Promise<CompetitionRosterInlineActionResult> {
  const tournamentId = clean(input.tournamentId);
  const campusId = clean(input.campusId);
  const program = clean(input.program);
  const squadId = clean(input.squadId);
  const coachIds = [...new Set(input.coachIds.map((coachId) => clean(coachId)).filter(isUuid))];
  const primaryCoachId = input.primaryCoachId ? clean(input.primaryCoachId) : null;
  if (
    ![tournamentId, campusId, squadId].every(isUuid)
    || !PROGRAMS.has(program)
    || (!input.useInherited && (coachIds.length === 0 || !primaryCoachId || !isUuid(primaryCoachId)))
  ) {
    return {
      ok: false,
      message: inlineErrorMessage(coachIds.length === 0
        ? "competition_squad_professor_required"
        : "competition_squad_primary_professor_required"),
    };
  }

  const context = await inlineManagerContext({ tournamentId, campusId, program });
  if (!context) return { ok: false, message: inlineErrorMessage("squad_permission_denied") };

  const result = await context.supabase.rpc("set_competition_roster_squad_coaches", {
    p_squad_id: squadId,
    p_coach_ids: coachIds,
    p_primary_coach_id: input.useInherited ? null : primaryCoachId,
    p_use_inherited: input.useInherited,
  });
  if (result.error) {
    const message = result.error.message.toLowerCase();
    const code = message.includes("combined_squad_requires_manual_professor")
      ? "combined_squad_requires_manual_professor"
      : message.includes("primary_professor")
        ? "competition_squad_primary_professor_required"
        : message.includes("professor_invalid")
          ? "competition_squad_professor_invalid"
          : message.includes("professor_required")
            ? "competition_squad_professor_required"
            : message.includes("manager_required") || message.includes("row-level security")
              ? "squad_permission_denied"
              : "squad_sync_failed";
    console.error("competition squad professor update failed", {
      code: result.error.code,
      message: result.error.message,
      tournamentId,
      squadId,
    });
    return { ok: false, message: inlineErrorMessage(code) };
  }

  revalidateCompetitionRosterPaths();
  revalidatePath("/convocatorias");
  revalidatePath("/mis-horarios");
  return {
    ok: true,
    message: input.useInherited
      ? "El equipo vuelve a usar los profesores de su grupo de entrenamiento."
      : "Profesores del equipo actualizados.",
  };
}

function revalidateCompetitionRosterPaths() {
  revalidatePath("/sports-signups");
  revalidatePath("/sports-signups/squads");
}

async function inlineManagerContext(params: {
  tournamentId: string;
  campusId: string;
  program: string;
}) {
  await assertDebugWritesAllowed("/sports-signups");
  const context = await getPermissionContext();
  if (!context?.isSportsDirector || !canAccessCampus(context.campusAccess, params.campusId)) {
    return null;
  }
  return context;
}

export async function assignPendingCompetitionRosterSplitMemberAction(input: {
  tournamentId: string;
  campusId: string;
  program: string;
  enrollmentId: string;
  squadId: string;
}): Promise<CompetitionRosterInlineActionResult> {
  const tournamentId = clean(input.tournamentId);
  const campusId = clean(input.campusId);
  const program = clean(input.program);
  const enrollmentId = clean(input.enrollmentId);
  const squadId = clean(input.squadId);
  if (
    ![tournamentId, campusId, enrollmentId, squadId].every(isUuid)
    || !PROGRAMS.has(program)
  ) {
    return { ok: false, message: inlineErrorMessage("invalid_squad_settings") };
  }

  const context = await inlineManagerContext({ tournamentId, campusId, program });
  if (!context) return { ok: false, message: inlineErrorMessage("squad_permission_denied") };

  const result = await context.supabase.rpc("assign_pending_competition_roster_split_member", {
    p_tournament_id: tournamentId,
    p_enrollment_id: enrollmentId,
    p_squad_id: squadId,
  });
  if (result.error) {
    const code = squadSyncErrorCode(result.error);
    console.error("pending split member assignment failed", {
      code: result.error.code,
      message: result.error.message,
      tournamentId,
      enrollmentId,
      squadId,
    });
    return { ok: false, message: inlineErrorMessage(code) };
  }

  revalidateCompetitionRosterPaths();
  return { ok: true, message: "Jugador asignado al equipo." };
}

export async function setCompetitionRosterExclusionInlineAction(input: {
  tournamentId: string;
  campusId: string;
  program: string;
  enrollmentId: string;
  reason: string;
  excluded: boolean;
}): Promise<CompetitionRosterInlineActionResult> {
  const tournamentId = clean(input.tournamentId);
  const campusId = clean(input.campusId);
  const program = clean(input.program);
  const enrollmentId = clean(input.enrollmentId);
  const reason = clean(input.reason);
  if (
    ![tournamentId, campusId, enrollmentId].every(isUuid)
    || !PROGRAMS.has(program)
    || reason.length < 3
    || reason.length > 240
  ) {
    return { ok: false, message: inlineErrorMessage("invalid_exception_reason") };
  }

  const context = await inlineManagerContext({ tournamentId, campusId, program });
  if (!context) return { ok: false, message: inlineErrorMessage("squad_permission_denied") };

  const result = await context.supabase.rpc("set_competition_roster_exclusion", {
    p_tournament_id: tournamentId,
    p_enrollment_id: enrollmentId,
    p_reason: reason,
    p_excluded: input.excluded,
  });
  if (result.error) {
    const code = squadSyncErrorCode(result.error);
    console.error("inline competition roster exclusion update failed", {
      code: result.error.code,
      message: result.error.message,
      tournamentId,
      enrollmentId,
      excluded: input.excluded,
    });
    return { ok: false, message: inlineErrorMessage(code) };
  }

  revalidateCompetitionRosterPaths();
  return {
    ok: true,
    message: input.excluded ? "Jugador excluido del equipo." : "Jugador reintegrado como pendiente.",
  };
}

export async function setCompetitionRosterManualMemberInlineAction(input: {
  tournamentId: string;
  campusId: string;
  program: string;
  squadId: string;
  enrollmentId: string;
  reason: string;
  added: boolean;
}): Promise<CompetitionRosterInlineActionResult> {
  const tournamentId = clean(input.tournamentId);
  const campusId = clean(input.campusId);
  const program = clean(input.program);
  const squadId = clean(input.squadId);
  const enrollmentId = clean(input.enrollmentId);
  const reason = clean(input.reason);
  if (
    ![tournamentId, campusId, squadId, enrollmentId].every(isUuid)
    || !PROGRAMS.has(program)
    || reason.length < 3
    || reason.length > 240
  ) {
    return { ok: false, message: inlineErrorMessage("invalid_exception_reason") };
  }

  const context = await inlineManagerContext({ tournamentId, campusId, program });
  if (!context) return { ok: false, message: inlineErrorMessage("squad_permission_denied") };

  const result = await context.supabase.rpc("set_competition_roster_manual_member", {
    p_squad_id: squadId,
    p_enrollment_id: enrollmentId,
    p_reason: reason,
    p_added: input.added,
  });
  if (result.error) {
    const code = squadSyncErrorCode(result.error);
    console.error("inline competition roster helper update failed", {
      code: result.error.code,
      message: result.error.message,
      tournamentId,
      squadId,
      enrollmentId,
      added: input.added,
    });
    return { ok: false, message: inlineErrorMessage(code) };
  }

  revalidateCompetitionRosterPaths();
  return { ok: true, message: input.added ? "Refuerzo agregado." : "Refuerzo retirado." };
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

export async function setCompetitionRosterExclusionAction(formData: FormData) {
  const tournamentId = clean(formData.get("tournamentId"));
  const campusId = clean(formData.get("campusId"));
  const program = clean(formData.get("program"));
  const enrollmentId = clean(formData.get("enrollmentId"));
  const reason = clean(formData.get("reason"));
  const excluded = clean(formData.get("excluded")) === "true";
  const fallbackPath = organizerPath({ tournamentId, campusId, program });

  await assertDebugWritesAllowed(fallbackPath);
  const context = await getPermissionContext();
  if (!context?.isSportsDirector || !canAccessCampus(context.campusAccess, campusId)) {
    redirect("/unauthorized");
  }
  if (
    ![tournamentId, campusId, enrollmentId].every(isUuid)
    || !PROGRAMS.has(program)
    || reason.length < 3
    || reason.length > 240
  ) {
    redirect(organizerPath({ tournamentId, campusId, program, result: "err=invalid_exception_reason" }));
  }

  const result = await context.supabase.rpc("set_competition_roster_exclusion", {
    p_tournament_id: tournamentId,
    p_enrollment_id: enrollmentId,
    p_reason: reason,
    p_excluded: excluded,
  });
  if (result.error) {
    console.error("competition roster exclusion update failed", {
      code: result.error.code,
      message: result.error.message,
      tournamentId,
      enrollmentId,
      excluded,
    });
    redirect(organizerPath({
      tournamentId,
      campusId,
      program,
      result: `err=${squadSyncErrorCode(result.error)}`,
    }));
  }

  revalidatePath("/sports-signups");
  revalidatePath("/sports-signups/squads");
  redirect(organizerPath({
    tournamentId,
    campusId,
    program,
    result: excluded ? "ok=player_excluded" : "ok=player_reinstated",
  }));
}

export async function setCompetitionRosterManualMemberAction(formData: FormData) {
  const tournamentId = clean(formData.get("tournamentId"));
  const campusId = clean(formData.get("campusId"));
  const program = clean(formData.get("program"));
  const squadId = clean(formData.get("squadId"));
  const enrollmentId = clean(formData.get("enrollmentId"));
  const reason = clean(formData.get("reason"));
  const added = clean(formData.get("added")) === "true";
  const fallbackPath = organizerPath({ tournamentId, campusId, program });

  await assertDebugWritesAllowed(fallbackPath);
  const context = await getPermissionContext();
  if (!context?.isSportsDirector || !canAccessCampus(context.campusAccess, campusId)) {
    redirect("/unauthorized");
  }
  if (
    ![tournamentId, campusId, squadId, enrollmentId].every(isUuid)
    || !PROGRAMS.has(program)
    || reason.length < 3
    || reason.length > 240
  ) {
    redirect(organizerPath({ tournamentId, campusId, program, result: "err=invalid_exception_reason" }));
  }

  const result = await context.supabase.rpc("set_competition_roster_manual_member", {
    p_squad_id: squadId,
    p_enrollment_id: enrollmentId,
    p_reason: reason,
    p_added: added,
  });
  if (result.error) {
    console.error("competition roster manual member update failed", {
      code: result.error.code,
      message: result.error.message,
      tournamentId,
      squadId,
      enrollmentId,
      added,
    });
    redirect(organizerPath({
      tournamentId,
      campusId,
      program,
      result: `err=${squadSyncErrorCode(result.error)}`,
    }));
  }

  revalidatePath("/sports-signups");
  revalidatePath("/sports-signups/squads");
  redirect(organizerPath({
    tournamentId,
    campusId,
    program,
    result: added ? "ok=helper_added" : "ok=helper_removed",
  }));
}

export async function captureCompetitionRosterSnapshotAction(formData: FormData) {
  const tournamentId = clean(formData.get("tournamentId"));
  const campusId = clean(formData.get("campusId"));
  const program = clean(formData.get("program"));
  const label = clean(formData.get("label"));
  const notes = clean(formData.get("notes"));
  const fallbackPath = organizerPath({ tournamentId, campusId, program });

  await assertDebugWritesAllowed(fallbackPath);
  const context = await getPermissionContext();
  if (!context?.isSportsDirector || !canAccessCampus(context.campusAccess, campusId)) {
    redirect("/unauthorized");
  }
  if (
    ![tournamentId, campusId].every(isUuid)
    || !PROGRAMS.has(program)
    || label.length < 3
    || label.length > 100
    || notes.length > 500
  ) {
    redirect(organizerPath({ tournamentId, campusId, program, result: "err=invalid_snapshot_settings" }));
  }

  const result = await context.supabase.rpc("capture_competition_roster_snapshot", {
    p_tournament_id: tournamentId,
    p_program: program,
    p_label: label,
    p_notes: notes || null,
  });
  if (result.error) {
    console.error("competition roster snapshot capture failed", {
      code: result.error.code,
      message: result.error.message,
      tournamentId,
      program,
    });
    redirect(organizerPath({
      tournamentId,
      campusId,
      program,
      result: `err=${squadSyncErrorCode(result.error)}`,
    }));
  }

  revalidatePath("/sports-signups/squads");
  redirect(organizerPath({ tournamentId, campusId, program, result: "ok=snapshot_captured" }));
}

export async function createWeeklyCallupFromCompetitionSnapshotAction(formData: FormData) {
  const tournamentId = clean(formData.get("tournamentId"));
  const campusId = clean(formData.get("campusId"));
  const program = clean(formData.get("program"));
  const snapshotId = clean(formData.get("snapshotId"));
  const weekStart = clean(formData.get("weekStart"));
  const fallbackPath = organizerPath({ tournamentId, campusId, program });

  await assertDebugWritesAllowed(fallbackPath);
  const context = await getPermissionContext();
  if (!context?.isSportsDirector || !canAccessCampus(context.campusAccess, campusId)) {
    redirect("/unauthorized");
  }
  if (
    ![tournamentId, campusId, snapshotId].every(isUuid)
    || !PROGRAMS.has(program)
    || !/^\d{4}-\d{2}-\d{2}$/.test(weekStart)
  ) {
    redirect(organizerPath({ tournamentId, campusId, program, result: "err=invalid_snapshot_callup" }));
  }

  const result = await context.supabase.rpc("create_weekly_callup_from_competition_snapshot", {
    p_snapshot_id: snapshotId,
    p_program: program,
    p_week_start: weekStart,
  });
  if (result.error || typeof result.data !== "string") {
    console.error("competition roster snapshot callup handoff failed", {
      code: result.error?.code,
      message: result.error?.message,
      snapshotId,
      weekStart,
    });
    redirect(organizerPath({
      tournamentId,
      campusId,
      program,
      result: `err=${result.error ? squadSyncErrorCode(result.error) : "snapshot_callup_failed"}`,
    }));
  }

  revalidatePath("/convocatorias");
  redirect(`/convocatorias/${result.data}?ok=squad_snapshot_imported`);
}

export async function createWeeklyCallupFromLiveCompetitionRosterAction(formData: FormData) {
  const tournamentId = clean(formData.get("tournamentId"));
  const campusId = clean(formData.get("campusId"));
  const program = clean(formData.get("program"));
  const weekStart = clean(formData.get("weekStart"));
  const fallbackPath = organizerPath({ tournamentId, campusId, program });

  await assertDebugWritesAllowed(fallbackPath);
  const context = await getPermissionContext();
  if (!context?.isSportsDirector || !canAccessCampus(context.campusAccess, campusId)) {
    redirect("/unauthorized");
  }
  if (
    ![tournamentId, campusId].every(isUuid)
    || !PROGRAMS.has(program)
    || program === "little_dragons"
    || !/^\d{4}-\d{2}-\d{2}$/.test(weekStart)
  ) {
    redirect(organizerPath({ tournamentId, campusId, program, result: "err=invalid_snapshot_callup" }));
  }

  const result = await context.supabase.rpc("create_weekly_callup_from_live_competition_roster", {
    p_tournament_id: tournamentId,
    p_program: program,
    p_week_start: weekStart,
  });
  if (result.error || typeof result.data !== "string") {
    console.error("live competition roster callup handoff failed", {
      code: result.error?.code,
      message: result.error?.message,
      tournamentId,
      program,
      weekStart,
    });
    redirect(organizerPath({
      tournamentId,
      campusId,
      program,
      result: `err=${result.error ? squadSyncErrorCode(result.error) : "snapshot_callup_failed"}`,
    }));
  }

  revalidatePath("/convocatorias");
  revalidatePath("/sports-signups/squads");
  redirect(`/convocatorias/${result.data}?ok=squad_snapshot_imported`);
}
