"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { writeAuditLog } from "@/lib/audit";
import { assertDebugWritesAllowed, isDebugWriteBlocked } from "@/lib/auth/debug-view";
import { requireSportsDirectorContext } from "@/lib/auth/permissions";
import { createAdminClient } from "@/lib/supabase/admin";

type TournamentRow = {
  id: string;
  name: string;
  campus_id: string | null;
  product_id: string | null;
  eligible_birth_year_min: number | null;
  eligible_birth_year_max: number | null;
};

type TeamRow = {
  id: string;
  name: string;
  campus_id: string;
  birth_year: number | null;
  gender: string | null;
  level: string | null;
  coach_id: string | null;
  type: string;
};

type SquadRow = {
  id: string;
  tournament_id: string;
  source_team_id: string;
  team_id: string;
  refuerzo_limit: number;
};

type AssignmentRow = {
  id: string;
  team_id: string;
  role: string;
};

function normalizeDateInput(raw: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
}

function normalizeIntegerInput(raw: string) {
  if (!raw) return null;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function getBirthYear(birthDate: string | null | undefined) {
  if (!birthDate) return null;
  const parsed = new Date(birthDate);
  return Number.isNaN(parsed.getTime()) ? null : parsed.getUTCFullYear();
}

function withinBirthWindow(
  birthYear: number | null,
  min: number | null,
  max: number | null,
) {
  if (!birthYear) return false;
  if (min !== null && birthYear < min) return false;
  if (max !== null && birthYear > max) return false;
  return true;
}

function normalizeRedirectTarget(target: string | null | undefined, fallback: string) {
  if (!target?.startsWith("/")) return fallback;
  return target;
}

async function getSportsActionContext(redirectTo: string) {
  const context = await requireSportsDirectorContext(redirectTo);
  return {
    admin: createAdminClient(),
    context,
    user: context.user,
    campusIds: context.campusAccess?.campusIds ?? [],
  };
}

function revalidateSportsSurfaces(tournamentId?: string) {
  revalidatePath("/director-deportivo");
  revalidatePath("/tournaments");
  if (tournamentId) revalidatePath(`/tournaments/${tournamentId}`);
  revalidatePath("/teams");
}

async function validateTournamentAccess(admin: ReturnType<typeof createAdminClient>, tournamentId: string, campusIds: string[]) {
  const { data } = await admin
    .from("tournaments")
    .select("id, name, campus_id, product_id, eligible_birth_year_min, eligible_birth_year_max")
    .eq("id", tournamentId)
    .maybeSingle<TournamentRow | null>();
  if (!data?.campus_id || !campusIds.includes(data.campus_id)) return null;
  return data;
}

async function validateCompetitionProduct(admin: ReturnType<typeof createAdminClient>, productId: string) {
  const { data } = await admin
    .from("products")
    .select("id, name, charge_types(code)")
    .eq("id", productId)
    .eq("is_active", true)
    .maybeSingle<{ id: string; name: string; charge_types: { code: string | null } | null } | null>();

  if (!data) return null;
  if (data.charge_types?.code !== "tournament" && data.charge_types?.code !== "cup") return null;
  return data;
}

export async function createTournamentAction(formData: FormData) {
  const basePath = "/tournaments";
  await assertDebugWritesAllowed(basePath);
  const { admin, campusIds, user } = await getSportsActionContext("/unauthorized");

  const name = String(formData.get("name") ?? "").trim();
  const campusId = String(formData.get("campusId") ?? "").trim();
  const productId = String(formData.get("productId") ?? "").trim();
  const startDate = normalizeDateInput(String(formData.get("startDate") ?? "").trim());
  const endDate = normalizeDateInput(String(formData.get("endDate") ?? "").trim());
  const signupDeadline = normalizeDateInput(String(formData.get("signupDeadline") ?? "").trim());
  const birthYearMin = normalizeIntegerInput(String(formData.get("eligibleBirthYearMin") ?? "").trim());
  const birthYearMax = normalizeIntegerInput(String(formData.get("eligibleBirthYearMax") ?? "").trim());

  if (!name || !campusId || !productId || !campusIds.includes(campusId)) redirect(`${basePath}?err=invalid_form`);
  if (birthYearMin !== null && birthYearMax !== null && birthYearMin > birthYearMax) redirect(`${basePath}?err=invalid_birth_range`);

  const product = await validateCompetitionProduct(admin, productId);
  if (!product) redirect(`${basePath}?err=invalid_product`);

  const { data: created, error } = await admin
    .from("tournaments")
    .insert({
      name,
      campus_id: campusId,
      product_id: product.id,
      start_date: startDate,
      end_date: endDate,
      signup_deadline: signupDeadline,
      eligible_birth_year_min: birthYearMin,
      eligible_birth_year_max: birthYearMax,
      is_active: true,
      is_mandatory: false,
      created_by: user.id,
    })
    .select("id")
    .single<{ id: string }>();

  if (error || !created) redirect(`${basePath}?err=create_failed`);

  await writeAuditLog(admin, {
    actorUserId: user.id,
    actorEmail: user.email ?? null,
    action: "tournament.created",
    tableName: "tournaments",
    recordId: created.id,
    afterData: {
      campus_id: campusId,
      product_id: product.id,
      name,
      signup_deadline: signupDeadline,
      eligible_birth_year_min: birthYearMin,
      eligible_birth_year_max: birthYearMax,
    },
  });

  revalidateSportsSurfaces(created.id);
  redirect(`/tournaments/${created.id}?ok=created`);
}

export async function updateTournamentAction(tournamentId: string, formData: FormData) {
  const basePath = `/tournaments/${tournamentId}`;
  await assertDebugWritesAllowed(basePath);
  const { admin, campusIds, user } = await getSportsActionContext("/unauthorized");
  const existing = await validateTournamentAccess(admin, tournamentId, campusIds);
  if (!existing) redirect("/unauthorized");

  const name = String(formData.get("name") ?? "").trim();
  const campusId = String(formData.get("campusId") ?? "").trim();
  const productId = String(formData.get("productId") ?? "").trim();
  const startDate = normalizeDateInput(String(formData.get("startDate") ?? "").trim());
  const endDate = normalizeDateInput(String(formData.get("endDate") ?? "").trim());
  const signupDeadline = normalizeDateInput(String(formData.get("signupDeadline") ?? "").trim());
  const birthYearMin = normalizeIntegerInput(String(formData.get("eligibleBirthYearMin") ?? "").trim());
  const birthYearMax = normalizeIntegerInput(String(formData.get("eligibleBirthYearMax") ?? "").trim());
  const isActive = formData.get("isActive") === "1";

  if (!name || !campusId || !productId || !campusIds.includes(campusId)) redirect(`${basePath}?err=invalid_form`);
  if (birthYearMin !== null && birthYearMax !== null && birthYearMin > birthYearMax) redirect(`${basePath}?err=invalid_birth_range`);

  const product = await validateCompetitionProduct(admin, productId);
  if (!product) redirect(`${basePath}?err=invalid_product`);

  const { error } = await admin
    .from("tournaments")
    .update({
      name,
      campus_id: campusId,
      product_id: product.id,
      start_date: startDate,
      end_date: endDate,
      signup_deadline: signupDeadline,
      eligible_birth_year_min: birthYearMin,
      eligible_birth_year_max: birthYearMax,
      is_active: isActive,
      updated_at: new Date().toISOString(),
    })
    .eq("id", tournamentId);

  if (error) redirect(`${basePath}?err=update_failed`);

  await writeAuditLog(admin, {
    actorUserId: user.id,
    actorEmail: user.email ?? null,
    action: "tournament.updated",
    tableName: "tournaments",
    recordId: tournamentId,
    afterData: {
      campus_id: campusId,
      product_id: product.id,
      name,
      signup_deadline: signupDeadline,
      eligible_birth_year_min: birthYearMin,
      eligible_birth_year_max: birthYearMax,
      is_active: isActive,
    },
  });

  revalidateSportsSurfaces(tournamentId);
  redirect(`${basePath}?ok=updated`);
}

export async function attachTournamentSourceTeamAction(tournamentId: string, formData: FormData) {
  const basePath = `/tournaments/${tournamentId}`;
  await assertDebugWritesAllowed(basePath);
  const { admin, campusIds, user } = await getSportsActionContext("/unauthorized");
  const tournament = await validateTournamentAccess(admin, tournamentId, campusIds);
  if (!tournament?.campus_id) redirect("/unauthorized");

  const sourceTeamId = String(formData.get("sourceTeamId") ?? "").trim();
  if (!sourceTeamId) redirect(`${basePath}?err=invalid_form`);

  const { data: team } = await admin
    .from("teams")
    .select("id, name, campus_id")
    .eq("id", sourceTeamId)
    .maybeSingle<{ id: string; name: string; campus_id: string } | null>();

  if (!team || team.campus_id !== tournament.campus_id) redirect(`${basePath}?err=invalid_source_team`);

  const { error } = await admin
    .from("tournament_source_teams")
    .insert({ tournament_id: tournamentId, source_team_id: sourceTeamId });

  if (error && error.code !== "23505") redirect(`${basePath}?err=attach_failed`);

  await writeAuditLog(admin, {
    actorUserId: user.id,
    actorEmail: user.email ?? null,
    action: "tournament.source_team_attached",
    tableName: "tournament_source_teams",
    recordId: tournamentId,
    afterData: { source_team_id: sourceTeamId, source_team_name: team.name },
  });

  revalidateSportsSurfaces(tournamentId);
  redirect(`${basePath}?ok=source_attached`);
}

export async function detachTournamentSourceTeamAction(tournamentId: string, sourceLinkId: string) {
  const basePath = `/tournaments/${tournamentId}`;
  await assertDebugWritesAllowed(basePath);
  const { admin, campusIds, user } = await getSportsActionContext("/unauthorized");
  const tournament = await validateTournamentAccess(admin, tournamentId, campusIds);
  if (!tournament) redirect("/unauthorized");

  const { data: link } = await admin
    .from("tournament_source_teams")
    .select("id, source_team_id")
    .eq("id", sourceLinkId)
    .eq("tournament_id", tournamentId)
    .maybeSingle<{ id: string; source_team_id: string } | null>();
  if (!link) redirect(`${basePath}?err=source_not_found`);

  const { data: squads } = await admin
    .from("tournament_squads")
    .select("id")
    .eq("tournament_id", tournamentId)
    .eq("source_team_id", link.source_team_id)
    .limit(1)
    .returns<Array<{ id: string }>>();
  if ((squads ?? []).length > 0) redirect(`${basePath}?err=source_has_squads`);

  await admin.from("tournament_source_teams").delete().eq("id", sourceLinkId);

  await writeAuditLog(admin, {
    actorUserId: user.id,
    actorEmail: user.email ?? null,
    action: "tournament.source_team_detached",
    tableName: "tournament_source_teams",
    recordId: sourceLinkId,
    afterData: { tournament_id: tournamentId, source_team_id: link.source_team_id },
  });

  revalidateSportsSurfaces(tournamentId);
  redirect(`${basePath}?ok=source_detached`);
}

export async function createTournamentSquadAction(tournamentId: string, formData: FormData) {
  const basePath = `/tournaments/${tournamentId}`;
  await assertDebugWritesAllowed(basePath);
  const { admin, campusIds, user } = await getSportsActionContext("/unauthorized");
  const tournament = await validateTournamentAccess(admin, tournamentId, campusIds);
  if (!tournament?.campus_id) redirect("/unauthorized");

  const sourceTeamId = String(formData.get("sourceTeamId") ?? "").trim();
  const label = String(formData.get("label") ?? "").trim();
  const minTargetPlayers = normalizeIntegerInput(String(formData.get("minTargetPlayers") ?? "").trim()) ?? 0;
  const maxTargetPlayers = normalizeIntegerInput(String(formData.get("maxTargetPlayers") ?? "").trim()) ?? 14;
  const refuerzoLimit = normalizeIntegerInput(String(formData.get("refuerzoLimit") ?? "").trim()) ?? 0;
  if (!sourceTeamId || !label || maxTargetPlayers < minTargetPlayers || refuerzoLimit < 0) {
    redirect(`${basePath}?err=invalid_squad_form`);
  }

  const { data: link } = await admin
    .from("tournament_source_teams")
    .select("id")
    .eq("tournament_id", tournamentId)
    .eq("source_team_id", sourceTeamId)
    .maybeSingle<{ id: string } | null>();
  if (!link) redirect(`${basePath}?err=source_not_attached`);

  const { data: sourceTeam } = await admin
    .from("teams")
    .select("id, name, campus_id, birth_year, gender, level, coach_id, type")
    .eq("id", sourceTeamId)
    .maybeSingle<TeamRow | null>();
  if (!sourceTeam || sourceTeam.campus_id !== tournament.campus_id) redirect(`${basePath}?err=invalid_source_team`);

  const seasonLabel = tournament.name;
  const teamName = `${sourceTeam.name} · ${label}`;
  const { data: createdTeam, error: teamError } = await admin
    .from("teams")
    .insert({
      campus_id: tournament.campus_id,
      name: teamName,
      birth_year: sourceTeam.birth_year,
      gender: sourceTeam.gender,
      level: sourceTeam.level,
      coach_id: sourceTeam.coach_id,
      type: "competition",
      season_label: seasonLabel,
      is_active: true,
    })
    .select("id")
    .single<{ id: string }>();
  if (teamError || !createdTeam) redirect(`${basePath}?err=squad_team_failed`);

  const { data: squad, error: squadError } = await admin
    .from("tournament_squads")
    .insert({
      tournament_id: tournamentId,
      source_team_id: sourceTeamId,
      team_id: createdTeam.id,
      label,
      min_target_players: minTargetPlayers,
      max_target_players: maxTargetPlayers,
      refuerzo_limit: refuerzoLimit,
    })
    .select("id")
    .single<{ id: string }>();
  if (squadError || !squad) redirect(`${basePath}?err=squad_failed`);

  await writeAuditLog(admin, {
    actorUserId: user.id,
    actorEmail: user.email ?? null,
    action: "tournament.squad_created",
    tableName: "tournament_squads",
    recordId: squad.id,
    afterData: {
      tournament_id: tournamentId,
      source_team_id: sourceTeamId,
      team_id: createdTeam.id,
      label,
      min_target_players: minTargetPlayers,
      max_target_players: maxTargetPlayers,
      refuerzo_limit: refuerzoLimit,
    },
  });

  revalidateSportsSurfaces(tournamentId);
  redirect(`${basePath}?ok=squad_created`);
}

export async function assignTournamentSquadPlayerAction(tournamentId: string, formData: FormData) {
  const basePath = normalizeRedirectTarget(String(formData.get("returnTo") ?? "").trim(), `/tournaments/${tournamentId}`);
  if (await isDebugWriteBlocked()) redirect(`${basePath}?err=debug_read_only`);
  await assertDebugWritesAllowed(basePath);
  const { admin, campusIds, user } = await getSportsActionContext("/unauthorized");
  const tournament = await validateTournamentAccess(admin, tournamentId, campusIds);
  if (!tournament) redirect("/unauthorized");

  const squadId = String(formData.get("squadId") ?? "").trim();
  const enrollmentId = String(formData.get("enrollmentId") ?? "").trim();
  const mode = String(formData.get("mode") ?? "regular").trim() === "refuerzo" ? "refuerzo" : "regular";
  if (!squadId || !enrollmentId) redirect(`${basePath}?err=invalid_assignment`);

  const [{ data: squad }, { data: entry }, { data: enrollment }, { data: squadTeams }] = await Promise.all([
    admin
      .from("tournament_squads")
      .select("id, tournament_id, source_team_id, team_id, refuerzo_limit")
      .eq("id", squadId)
      .eq("tournament_id", tournamentId)
      .maybeSingle<SquadRow | null>(),
    admin
      .from("tournament_player_entries")
      .select("id")
      .eq("tournament_id", tournamentId)
      .eq("enrollment_id", enrollmentId)
      .maybeSingle<{ id: string } | null>(),
    admin
      .from("enrollments")
      .select("id, player_id, players(birth_date)")
      .eq("id", enrollmentId)
      .maybeSingle<{ id: string; player_id: string; players: { birth_date: string } | null } | null>(),
    admin.from("tournament_squads").select("team_id").eq("tournament_id", tournamentId).returns<Array<{ team_id: string }>>(),
  ]);

  if (!squad || !entry || !enrollment) redirect(`${basePath}?err=assignment_not_allowed`);

  const birthYear = getBirthYear(enrollment.players?.birth_date);
  const { data: primaryAssignment } = await admin
    .from("team_assignments")
    .select("id, team_id")
    .eq("enrollment_id", enrollmentId)
    .eq("is_primary", true)
    .is("end_date", null)
    .maybeSingle<{ id: string; team_id: string } | null>();

  const eligibleRegular =
    primaryAssignment?.team_id === squad.source_team_id &&
    withinBirthWindow(birthYear, tournament.eligible_birth_year_min, tournament.eligible_birth_year_max);

  if (mode === "regular" && !eligibleRegular) redirect(`${basePath}?err=assignment_not_allowed`);

  if (mode === "refuerzo") {
    const { data: refuerzos } = await admin
      .from("team_assignments")
      .select("id")
      .eq("team_id", squad.team_id)
      .eq("role", "refuerzo")
      .is("end_date", null)
      .returns<Array<{ id: string }>>();
    if ((refuerzos ?? []).length >= squad.refuerzo_limit) redirect(`${basePath}?err=refuerzo_limit`);
  }

  const tournamentSquadTeamIds = (squadTeams ?? []).map((row) => row.team_id);
  if (tournamentSquadTeamIds.length > 0) {
    await admin
      .from("team_assignments")
      .update({ end_date: new Date().toISOString().split("T")[0], updated_at: new Date().toISOString() })
      .eq("enrollment_id", enrollmentId)
      .in("team_id", tournamentSquadTeamIds)
      .eq("is_primary", false)
      .is("end_date", null);
  }

  await admin.from("team_assignments").insert({
    enrollment_id: enrollmentId,
    team_id: squad.team_id,
    start_date: new Date().toISOString().split("T")[0],
    is_primary: false,
    role: mode,
    is_new_arrival: false,
  });

  await writeAuditLog(admin, {
    actorUserId: user.id,
    actorEmail: user.email ?? null,
    action: "tournament.player_assigned",
    tableName: "team_assignments",
    recordId: enrollmentId,
    afterData: {
      tournament_id: tournamentId,
      squad_id: squadId,
      team_id: squad.team_id,
      enrollment_id: enrollmentId,
      role: mode,
    },
  });

  revalidateSportsSurfaces(tournamentId);
  redirect(`${basePath}?ok=player_assigned`);
}

export async function removeTournamentSquadPlayerAction(tournamentId: string, assignmentId: string, returnTo?: string) {
  const basePath = normalizeRedirectTarget(returnTo, `/tournaments/${tournamentId}`);
  await assertDebugWritesAllowed(basePath);
  const { admin, campusIds, user } = await getSportsActionContext("/unauthorized");
  const tournament = await validateTournamentAccess(admin, tournamentId, campusIds);
  if (!tournament) redirect("/unauthorized");

  const { data: squadTeams } = await admin
    .from("tournament_squads")
    .select("team_id")
    .eq("tournament_id", tournamentId)
    .returns<Array<{ team_id: string }>>();
  const teamIds = (squadTeams ?? []).map((row) => row.team_id);
  if (teamIds.length === 0) redirect(`${basePath}?err=assignment_not_found`);

  const { data: assignment } = await admin
    .from("team_assignments")
    .select("id, team_id, role")
    .eq("id", assignmentId)
    .in("team_id", teamIds)
    .maybeSingle<AssignmentRow | null>();
  if (!assignment) redirect(`${basePath}?err=assignment_not_found`);

  await admin
    .from("team_assignments")
    .update({ end_date: new Date().toISOString().split("T")[0], updated_at: new Date().toISOString() })
    .eq("id", assignmentId)
    .is("end_date", null);

  await writeAuditLog(admin, {
    actorUserId: user.id,
    actorEmail: user.email ?? null,
    action: "tournament.player_unassigned",
    tableName: "team_assignments",
    recordId: assignmentId,
    afterData: {
      tournament_id: tournamentId,
      team_id: assignment.team_id,
      role: assignment.role,
    },
  });

  revalidateSportsSurfaces(tournamentId);
  redirect(`${basePath}?ok=player_unassigned`);
}
