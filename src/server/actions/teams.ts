"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireDirectorContext } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { writeAuditLog } from "@/lib/audit";
import { generateTeamName } from "@/lib/queries/teams";

// ── Guards ────────────────────────────────────────────────────────────────────

async function requireDirector() {
  try {
    const { supabase, user } = await requireDirectorContext("/unauthorized");
    return { supabase, user, isDirector: true } as const;
  } catch {
    const supabase = await createClient();
    return { supabase, user: null, isDirector: false } as const;
  }
}

// ── Create team ───────────────────────────────────────────────────────────────

export async function createTeamAction(formData: FormData): Promise<void> {
  const { supabase, user, isDirector } = await requireDirector();
  if (!user || !isDirector) redirect("/teams?err=unauthorized");

  const campusId    = formData.get("campusId")?.toString().trim();
  const birthYearRaw = formData.get("birthYear")?.toString().trim();
  const gender      = formData.get("gender")?.toString().trim() || null;
  const level       = formData.get("level")?.toString().trim();
  const type        = formData.get("type")?.toString().trim() ?? "competition";
  const coachId     = formData.get("coachId")?.toString().trim() || null;
  const seasonLabel = formData.get("seasonLabel")?.toString().trim() || null;

  if (!campusId || !level) redirect("/teams/new?err=invalid_form");

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

// ── Edit team ─────────────────────────────────────────────────────────────────

export async function editTeamAction(teamId: string, formData: FormData): Promise<void> {
  const { supabase, user, isDirector } = await requireDirector();
  if (!user || !isDirector) redirect(`/teams/${teamId}?err=unauthorized`);

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
  const { supabase, user, isDirector } = await requireDirector();
  if (!user || !isDirector) return { ok: false, error: "unauthorized" };

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

// ── Transfer player to different team ────────────────────────────────────────

export async function transferPlayerAction(
  formData: FormData
): Promise<void> {
  const enrollmentId = formData.get("enrollmentId")?.toString().trim();
  const playerId     = formData.get("playerId")?.toString().trim();
  const newTeamId    = formData.get("newTeamId")?.toString().trim();
  const fromTeamId   = formData.get("fromTeamId")?.toString().trim();

  if (!enrollmentId || !playerId || !newTeamId) return;

  const { supabase, user, isDirector } = await requireDirector();
  if (!user || !isDirector) return;

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
  const enrollmentId = formData.get("enrollmentId")?.toString().trim();
  const playerId     = formData.get("playerId")?.toString().trim();
  const teamId       = formData.get("teamId")?.toString().trim();
  const fromTeamId   = formData.get("fromTeamId")?.toString().trim();

  if (!enrollmentId || !playerId || !teamId) return;

  const { supabase, user, isDirector } = await requireDirector();
  if (!user || !isDirector) return;

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
  const { supabase, user, isDirector } = await requireDirector();
  if (!user || !isDirector) return { ok: false, error: "unauthorized" };

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
  const { supabase, user, isDirector } = await requireDirector();
  if (!user || !isDirector) return { ok: false, error: "unauthorized" };

  const { error } = await supabase
    .from("team_assignments")
    .update({ is_new_arrival: false, updated_at: new Date().toISOString() })
    .eq("id", assignmentId);

  if (error) return { ok: false, error: "update_failed" };

  revalidatePath(`/teams/${teamId}`);
  revalidatePath(`/players/${playerId}`);
  return { ok: true };
}
