"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { assertDebugWritesAllowed, isDebugWriteBlocked } from "@/lib/auth/debug-view";
import { requireSportsDirectorContext } from "@/lib/auth/permissions";
import { writeAuditLog } from "@/lib/audit";
import { generateTeamName } from "@/lib/queries/teams";
import { createAdminClient } from "@/lib/supabase/admin";
import { BASE_TEAM_LEVELS, TEAM_GENDER_OPTIONS } from "@/lib/teams/shared";

// ── Guards ────────────────────────────────────────────────────────────────────

async function requireSportsStaff() {
  try {
    const context = await requireSportsDirectorContext("/unauthorized");
    return {
      supabase: createAdminClient(),
      user: context.user,
      campusIds: context.campusAccess?.campusIds ?? [],
      isSportsStaff: true,
    } as const;
  } catch {
    return {
      supabase: createAdminClient(),
      user: null,
      campusIds: [] as string[],
      isSportsStaff: false,
    } as const;
  }
}

// ── Create team ───────────────────────────────────────────────────────────────

export async function createTeamAction(formData: FormData): Promise<void> {
  await assertDebugWritesAllowed("/teams/new");
  const { supabase, user, campusIds, isSportsStaff } = await requireSportsStaff();
  if (!user || !isSportsStaff) redirect("/teams?err=unauthorized");

  const campusId    = formData.get("campusId")?.toString().trim();
  const birthYearRaw = formData.get("birthYear")?.toString().trim();
  const gender      = formData.get("gender")?.toString().trim() || null;
  const level       = formData.get("level")?.toString().trim();
  const type        = formData.get("type")?.toString().trim() ?? "competition";
  const coachId     = formData.get("coachId")?.toString().trim() || null;
  const seasonLabel = formData.get("seasonLabel")?.toString().trim() || null;

  if (!campusId || !level || !campusIds.includes(campusId)) redirect("/teams/new?err=invalid_form");
  if (!BASE_TEAM_LEVELS.includes(level as (typeof BASE_TEAM_LEVELS)[number])) redirect("/teams/new?err=invalid_form");
  if (gender && !TEAM_GENDER_OPTIONS.includes(gender as (typeof TEAM_GENDER_OPTIONS)[number])) redirect("/teams/new?err=invalid_form");

  const birthYear = birthYearRaw ? parseInt(birthYearRaw, 10) : null;
  if (type === "competition" && !birthYear) redirect("/teams/new?err=invalid_form");

  // Get campus code for name generation
  const { data: campus } = await supabase
    .from("campuses")
    .select("code")
    .eq("id", campusId)
    .maybeSingle();

  const campusCode = campus?.code ?? "";
  const name = generateTeamName(campusCode, birthYear, gender, level, type);

  const { data: team, error } = await supabase
    .from("teams")
    .insert({
      campus_id: campusId,
      name,
      birth_year: birthYear,
      gender,
      level,
      type,
      coach_id: coachId,
      season_label: seasonLabel,
      is_active: true,
    })
    .select("id")
    .maybeSingle();

  if (error || !team) redirect("/teams/new?err=insert_failed");

  await writeAuditLog(supabase, {
    actorUserId: user.id,
    actorEmail: user.email ?? null,
    action: "team.created",
    tableName: "teams",
    recordId: team.id,
    afterData: { name, campus_id: campusId, level, type },
  });

  revalidatePath("/teams");
  redirect(`/teams/${team.id}?ok=created`);
}

export async function createBaseTeamOnDemandAction(formData: FormData): Promise<{ ok: true; teamId: string } | { ok: false; error: string }> {
  if (await isDebugWriteBlocked()) return { ok: false, error: "debug_read_only" };
  const { supabase, user, campusIds, isSportsStaff } = await requireSportsStaff();
  if (!user || !isSportsStaff) return { ok: false, error: "unauthorized" };

  const campusId = String(formData.get("campusId") ?? "").trim();
  const birthYearRaw = String(formData.get("birthYear") ?? "").trim();
  const gender = String(formData.get("gender") ?? "").trim();
  const level = String(formData.get("level") ?? "").trim();

  if (!campusId || !campusIds.includes(campusId) || !birthYearRaw || !level) return { ok: false, error: "invalid_form" };
  if (!TEAM_GENDER_OPTIONS.includes(gender as (typeof TEAM_GENDER_OPTIONS)[number])) return { ok: false, error: "invalid_form" };
  if (!BASE_TEAM_LEVELS.includes(level as (typeof BASE_TEAM_LEVELS)[number])) return { ok: false, error: "invalid_form" };

  const birthYear = Number.parseInt(birthYearRaw, 10);
  if (!Number.isFinite(birthYear)) return { ok: false, error: "invalid_form" };

  const { data: campus } = await supabase.from("campuses").select("code").eq("id", campusId).maybeSingle<{ code: string | null } | null>();
  const name = generateTeamName(campus?.code ?? "", birthYear, gender, level, "competition");

  const { data: existing } = await supabase
    .from("teams")
    .select("id")
    .eq("campus_id", campusId)
    .eq("birth_year", birthYear)
    .eq("gender", gender)
    .eq("level", level)
    .eq("type", "competition")
    .eq("is_active", true)
    .maybeSingle<{ id: string } | null>();
  if (existing?.id) return { ok: true, teamId: existing.id };

  const { data: created, error } = await supabase
    .from("teams")
    .insert({
      campus_id: campusId,
      birth_year: birthYear,
      gender,
      level,
      type: "competition",
      is_active: true,
      name,
    })
    .select("id")
    .single<{ id: string }>();

  if (error || !created) return { ok: false, error: "create_failed" };

  await writeAuditLog(supabase, {
    actorUserId: user.id,
    actorEmail: user.email ?? null,
    action: "team.created",
    tableName: "teams",
    recordId: created.id,
    afterData: { campus_id: campusId, birth_year: birthYear, gender, level, type: "competition", name },
  });

  revalidatePath("/teams");
  return { ok: true, teamId: created.id };
}

// ── Edit team ─────────────────────────────────────────────────────────────────

export async function editTeamAction(teamId: string, formData: FormData): Promise<void> {
  await assertDebugWritesAllowed(`/teams/${teamId}/edit`);
  const { supabase, user, isSportsStaff } = await requireSportsStaff();
  if (!user || !isSportsStaff) redirect(`/teams/${teamId}?err=unauthorized`);

  const coachId     = formData.get("coachId")?.toString().trim() || null;
  const seasonLabel = formData.get("seasonLabel")?.toString().trim() || null;
  const isActive    = formData.get("isActive") === "1";

  const { error } = await supabase
    .from("teams")
    .update({ coach_id: coachId, season_label: seasonLabel, is_active: isActive, updated_at: new Date().toISOString() })
    .eq("id", teamId);

  if (error) redirect(`/teams/${teamId}/edit?err=update_failed`);

  revalidatePath(`/teams/${teamId}`);
  revalidatePath("/teams");
  redirect(`/teams/${teamId}?ok=updated`);
}

// ── Assign player to team (primary) ──────────────────────────────────────────
// Used when manually assigning a player who has no team, or from enrollment flow.

export async function assignPlayerToTeamAction(
  enrollmentId: string,
  playerId: string,
  teamId: string,
  isNewArrival = false
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (await isDebugWriteBlocked()) return { ok: false, error: "debug_read_only" };
  const { supabase, user, isSportsStaff } = await requireSportsStaff();
  if (!user || !isSportsStaff) return { ok: false, error: "unauthorized" };

  // Close any existing primary assignment
  await supabase
    .from("team_assignments")
    .update({ end_date: new Date().toISOString().split("T")[0], updated_at: new Date().toISOString() })
    .eq("enrollment_id", enrollmentId)
    .eq("is_primary", true)
    .is("end_date", null);

  // Get team level to sync players.level
  const { data: team } = await supabase
    .from("teams")
    .select("id, name, level, campus_id")
    .eq("id", teamId)
    .maybeSingle();

  const { error: assignError } = await supabase
    .from("team_assignments")
    .insert({
      enrollment_id: enrollmentId,
      team_id: teamId,
      start_date: new Date().toISOString().split("T")[0],
      is_primary: true,
      role: "regular",
      is_new_arrival: isNewArrival,
    });

  if (assignError) return { ok: false, error: "assign_failed" };

  // Sync players.level
  if (team?.level) {
    await supabase
      .from("players")
      .update({ level: team.level })
      .eq("id", playerId);
  }

  await writeAuditLog(supabase, {
    actorUserId: user.id,
    actorEmail: user.email ?? null,
    action: "team_assignment.created",
    tableName: "team_assignments",
    recordId: enrollmentId,
    afterData: { team_id: teamId, team_name: team?.name, is_new_arrival: isNewArrival },
  });

  revalidatePath(`/players/${playerId}`);
  revalidatePath(`/teams/${teamId}`);
  return { ok: true };
}

export async function batchAssignBaseTeamAction(formData: FormData): Promise<{ ok: true } | { ok: false; error: string }> {
  if (await isDebugWriteBlocked()) return { ok: false, error: "debug_read_only" };
  const { supabase, user, campusIds, isSportsStaff } = await requireSportsStaff();
  if (!user || !isSportsStaff) return { ok: false, error: "unauthorized" };

  const teamId = String(formData.get("teamId") ?? "").trim();
  const enrollmentIds = formData
    .getAll("enrollmentIds")
    .map((value) => String(value).trim())
    .filter(Boolean);

  if (!teamId || enrollmentIds.length === 0) return { ok: false, error: "invalid_form" };

  const [{ data: team }, { data: enrollmentRows }] = await Promise.all([
    supabase
      .from("teams")
      .select("id, name, level, campus_id, birth_year, gender, type")
      .eq("id", teamId)
      .maybeSingle<{
        id: string;
        name: string;
        level: string | null;
        campus_id: string;
        birth_year: number | null;
        gender: string | null;
        type: string;
      } | null>(),
    supabase
      .from("enrollments")
      .select("id, player_id, campus_id, players(birth_date, gender)")
      .in("id", enrollmentIds)
      .eq("status", "active")
      .returns<Array<{
        id: string;
        player_id: string;
        campus_id: string;
        players: { birth_date: string | null; gender: string | null } | null;
      }>>(),
  ]);

  if (!team || !campusIds.includes(team.campus_id) || team.type !== "competition") return { ok: false, error: "invalid_team" };
  if (!BASE_TEAM_LEVELS.includes((team.level ?? "") as (typeof BASE_TEAM_LEVELS)[number])) return { ok: false, error: "invalid_team" };

  const today = new Date().toISOString().split("T")[0];
  const validRows = (enrollmentRows ?? []).filter((row) => {
    if (row.campus_id !== team.campus_id) return false;
    const birthYear = row.players?.birth_date ? new Date(row.players.birth_date).getUTCFullYear() : null;
    if (team.birth_year !== null && birthYear !== team.birth_year) return false;
    if (team.gender && team.gender !== "mixed" && row.players?.gender && row.players.gender !== team.gender) return false;
    return true;
  });
  if (validRows.length === 0) return { ok: false, error: "no_valid_players" };

  const targetEnrollmentIds = validRows.map((row) => row.id);
  const { data: existingAssignments } = await supabase
    .from("team_assignments")
    .select("enrollment_id, team_id")
    .in("enrollment_id", targetEnrollmentIds)
    .eq("is_primary", true)
    .is("end_date", null)
    .returns<Array<{ enrollment_id: string; team_id: string }>>();
  const existingTeamByEnrollment = new Map((existingAssignments ?? []).map((row) => [row.enrollment_id, row.team_id]));

  const rowsToMove = validRows.filter((row) => existingTeamByEnrollment.get(row.id) !== teamId);
  if (rowsToMove.length === 0) return { ok: true };

  await supabase
    .from("team_assignments")
    .update({ end_date: today, updated_at: new Date().toISOString() })
    .in("enrollment_id", rowsToMove.map((row) => row.id))
    .eq("is_primary", true)
    .is("end_date", null);

  const rowsToInsert = rowsToMove
    .map((row) => ({
      enrollment_id: row.id,
      team_id: teamId,
      start_date: today,
      is_primary: true,
      role: "regular",
      is_new_arrival: false,
    }));

  if (rowsToInsert.length > 0) {
    const { error: insertError } = await supabase.from("team_assignments").insert(rowsToInsert);
    if (insertError) return { ok: false, error: "assign_failed" };
  }

  if (team.level) {
    await supabase
      .from("players")
      .update({ level: team.level })
      .in("id", rowsToMove.map((row) => row.player_id));
  }

  await writeAuditLog(supabase, {
    actorUserId: user.id,
    actorEmail: user.email ?? null,
    action: "team_assignment.batch_assigned",
    tableName: "team_assignments",
    recordId: teamId,
    afterData: {
      team_id: teamId,
      team_name: team.name,
      enrollment_ids: rowsToMove.map((row) => row.id),
      count: rowsToMove.length,
    },
  });

  revalidatePath("/teams");
  revalidatePath("/director-deportivo");
  for (const row of rowsToMove) {
    revalidatePath(`/players/${row.player_id}`);
  }
  revalidatePath(`/teams/${teamId}`);

  return { ok: true };
}

// ── Transfer player to different team ────────────────────────────────────────

export async function transferPlayerAction(
  formData: FormData
): Promise<void> {
  await assertDebugWritesAllowed("/teams");
  const enrollmentId = formData.get("enrollmentId")?.toString().trim();
  const playerId     = formData.get("playerId")?.toString().trim();
  const newTeamId    = formData.get("newTeamId")?.toString().trim();
  const fromTeamId   = formData.get("fromTeamId")?.toString().trim();

  if (!enrollmentId || !playerId || !newTeamId) return;

  const { supabase, user, isSportsStaff } = await requireSportsStaff();
  if (!user || !isSportsStaff) return;

  const today = new Date().toISOString().split("T")[0];

  // Close current primary assignment
  await supabase
    .from("team_assignments")
    .update({ end_date: today, updated_at: new Date().toISOString() })
    .eq("enrollment_id", enrollmentId)
    .eq("is_primary", true)
    .is("end_date", null);

  // Get new team level
  const { data: newTeam } = await supabase
    .from("teams")
    .select("id, name, level")
    .eq("id", newTeamId)
    .maybeSingle();

  // Create new primary assignment
  await supabase.from("team_assignments").insert({
    enrollment_id: enrollmentId,
    team_id: newTeamId,
    start_date: today,
    is_primary: true,
    role: "regular",
    is_new_arrival: false,
  });

  // Sync players.level
  if (newTeam?.level) {
    await supabase.from("players").update({ level: newTeam.level }).eq("id", playerId);
  }

  await writeAuditLog(supabase, {
    actorUserId: user.id,
    actorEmail: user.email ?? null,
    action: "team_assignment.transferred",
    tableName: "team_assignments",
    recordId: enrollmentId,
    afterData: { new_team_id: newTeamId, new_team_name: newTeam?.name },
  });

  revalidatePath(`/players/${playerId}`);
  if (fromTeamId) revalidatePath(`/teams/${fromTeamId}`);
  revalidatePath(`/teams/${newTeamId}`);
  revalidatePath("/teams");
  redirect(`/teams/${fromTeamId ?? newTeamId}?ok=transferred`);
}

// ── Add refuerzo ──────────────────────────────────────────────────────────────

export async function addRefuerzoAction(
  formData: FormData
): Promise<void> {
  await assertDebugWritesAllowed("/teams");
  const enrollmentId = formData.get("enrollmentId")?.toString().trim();
  const playerId     = formData.get("playerId")?.toString().trim();
  const teamId       = formData.get("teamId")?.toString().trim();
  const fromTeamId   = formData.get("fromTeamId")?.toString().trim();

  if (!enrollmentId || !playerId || !teamId) return;

  const { supabase, user, isSportsStaff } = await requireSportsStaff();
  if (!user || !isSportsStaff) return;

  // Check not already a refuerzo on this team
  const { data: existing } = await supabase
    .from("team_assignments")
    .select("id")
    .eq("enrollment_id", enrollmentId)
    .eq("team_id", teamId)
    .is("end_date", null)
    .maybeSingle();

  if (existing) {
    redirect(`/teams/${fromTeamId}?err=already_assigned`);
  }

  const { data: team } = await supabase
    .from("teams")
    .select("name")
    .eq("id", teamId)
    .maybeSingle();

  await supabase.from("team_assignments").insert({
    enrollment_id: enrollmentId,
    team_id: teamId,
    start_date: new Date().toISOString().split("T")[0],
    is_primary: false,
    role: "refuerzo",
    is_new_arrival: false,
  });

  await writeAuditLog(supabase, {
    actorUserId: user.id,
    actorEmail: user.email ?? null,
    action: "team_assignment.refuerzo_added",
    tableName: "team_assignments",
    recordId: enrollmentId,
    afterData: { team_id: teamId, team_name: team?.name },
  });

  revalidatePath(`/players/${playerId}`);
  if (fromTeamId) revalidatePath(`/teams/${fromTeamId}`);
  revalidatePath(`/teams/${teamId}`);
  redirect(`/teams/${fromTeamId ?? teamId}?ok=refuerzo_added`);
}

// ── Remove refuerzo ───────────────────────────────────────────────────────────

export async function removeRefuerzoAction(
  assignmentId: string,
  playerId: string,
  teamId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (await isDebugWriteBlocked()) return { ok: false, error: "debug_read_only" };
  const { supabase, user, isSportsStaff } = await requireSportsStaff();
  if (!user || !isSportsStaff) return { ok: false, error: "unauthorized" };

  const today = new Date().toISOString().split("T")[0];
  const { error } = await supabase
    .from("team_assignments")
    .update({ end_date: today, updated_at: new Date().toISOString() })
    .eq("id", assignmentId);

  if (error) return { ok: false, error: "remove_failed" };

  revalidatePath(`/players/${playerId}`);
  revalidatePath(`/teams/${teamId}`);
  return { ok: true };
}

// ── Clear new arrival flag ────────────────────────────────────────────────────

export async function clearNewArrivalAction(
  assignmentId: string,
  playerId: string,
  teamId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (await isDebugWriteBlocked()) return { ok: false, error: "debug_read_only" };
  const { supabase, user, isSportsStaff } = await requireSportsStaff();
  if (!user || !isSportsStaff) return { ok: false, error: "unauthorized" };

  const { error } = await supabase
    .from("team_assignments")
    .update({ is_new_arrival: false, updated_at: new Date().toISOString() })
    .eq("id", assignmentId);

  if (error) return { ok: false, error: "update_failed" };

  revalidatePath(`/teams/${teamId}`);
  revalidatePath(`/players/${playerId}`);
  return { ok: true };
}
