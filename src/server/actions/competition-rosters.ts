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

  const admin = createAdminClient();
  const [tournamentResult, groupResult] = await Promise.all([
    admin
      .from("tournaments")
      .select("id, campus_id, is_active")
      .eq("id", tournamentId)
      .maybeSingle<{ id: string; campus_id: string | null; is_active: boolean } | null>(),
    admin
      .from("training_groups")
      .select("id, campus_id, program, status")
      .eq("id", trainingGroupId)
      .maybeSingle<{ id: string; campus_id: string; program: string | null; status: string } | null>(),
  ]);

  if (
    tournamentResult.error ||
    groupResult.error ||
    !tournamentResult.data?.is_active ||
    tournamentResult.data.campus_id !== campusId ||
    groupResult.data?.campus_id !== campusId ||
    groupResult.data.program !== program ||
    groupResult.data.status !== "active"
  ) {
    redirect(organizerPath({ tournamentId, campusId, program, result: "err=invalid_squad_scope" }));
  }

  const result = await context.supabase.rpc("create_or_sync_default_competition_squad", {
    p_tournament_id: tournamentId,
    p_training_group_id: trainingGroupId,
    p_program: program,
  });

  if (result.error) {
    console.error("default competition squad sync failed", result.error);
    const code = result.error.message.includes("advanced_squad")
      ? "advanced_squad_requires_editor"
      : "squad_sync_failed";
    redirect(organizerPath({ tournamentId, campusId, program, result: `err=${code}` }));
  }

  revalidatePath("/sports-signups");
  revalidatePath("/sports-signups/squads");
  redirect(organizerPath({ tournamentId, campusId, program, result: "ok=squad_synced" }));
}
