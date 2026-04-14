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
  gender: string | null;
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
  label?: string;
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

async function ensureDefaultTournamentSquad(
  admin: ReturnType<typeof createAdminClient>,
  tournament: TournamentRow,
  sourceLink: { id: string; source_team_id: string; default_squad_id: string | null },
  sourceTeam: TeamRow,
) {
  if (sourceLink.default_squad_id) {
    const existingDefault = await admin
      .from("tournament_squads")
      .select("id, tournament_id, source_team_id, team_id, refuerzo_limit, label")
      .eq("id", sourceLink.default_squad_id)
      .maybeSingle<SquadRow | null>();
    if (existingDefault.data) return existingDefault.data;
  }

  const existingByLabel = await admin
    .from("tournament_squads")
    .select("id, tournament_id, source_team_id, team_id, refuerzo_limit, label")
    .eq("tournament_id", tournament.id)
    .eq("source_team_id", sourceTeam.id)
    .eq("label", "Roster final")
    .maybeSingle<SquadRow | null>();
  if (existingByLabel.data) return existingByLabel.data;

  const createdTeam = await admin
    .from("teams")
    .insert({
      campus_id: tournament.campus_id,
      name: `${sourceTeam.name} · Roster final`,
      birth_year: sourceTeam.birth_year,
      gender: sourceTeam.gender,
      level: sourceTeam.level,
      coach_id: sourceTeam.coach_id,
      type: "competition",
      season_label: tournament.name,
      is_active: true,
    })
    .select("id")
    .single<{ id: string }>();

  if (createdTeam.error || !createdTeam.data) return null;

  const createdSquad = await admin
    .from("tournament_squads")
    .insert({
      tournament_id: tournament.id,
      source_team_id: sourceTeam.id,
      team_id: createdTeam.data.id,
      label: "Roster final",
      min_target_players: 0,
      max_target_players: 30,
      refuerzo_limit: 99,
    })
    .select("id, tournament_id, source_team_id, team_id, refuerzo_limit, label")
    .single<SquadRow>();

  if (createdSquad.error || !createdSquad.data) return null;
  return createdSquad.data;
}

async function validateTournamentAccess(admin: ReturnType<typeof createAdminClient>, tournamentId: string, campusIds: string[]) {
  const { data } = await admin
    .from("tournaments")
    .select("id, name, campus_id, product_id, gender, eligible_birth_year_min, eligible_birth_year_max")
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
  const gender = String(formData.get("gender") ?? "").trim();
  const startDate = normalizeDateInput(String(formData.get("startDate") ?? "").trim());
  const endDate = normalizeDateInput(String(formData.get("endDate") ?? "").trim());
  const signupDeadline = normalizeDateInput(String(formData.get("signupDeadline") ?? "").trim());
  const birthYearMin = normalizeIntegerInput(String(formData.get("eligibleBirthYearMin") ?? "").trim());
  const birthYearMax = normalizeIntegerInput(String(formData.get("eligibleBirthYearMax") ?? "").trim());

  if (!name || !campusId || !productId || !campusIds.includes(campusId) || !["male", "female", "mixed"].includes(gender)) {
    redirect(`${basePath}?err=invalid_form`);
  }
  if (birthYearMin !== null && birthYearMax !== null && birthYearMin > birthYearMax) redirect(`${basePath}?err=invalid_birth_range`);

  const product = await validateCompetitionProduct(admin, productId);
  if (!product) redirect(`${basePath}?err=invalid_product`);

  const { data: created, error } = await admin
    .from("tournaments")
    .insert({
      name,
      campus_id: campusId,
      product_id: product.id,
      gender,
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
      gender,
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
  const gender = String(formData.get("gender") ?? "").trim();
  const startDate = normalizeDateInput(String(formData.get("startDate") ?? "").trim());
  const endDate = normalizeDateInput(String(formData.get("endDate") ?? "").trim());
  const signupDeadline = normalizeDateInput(String(formData.get("signupDeadline") ?? "").trim());
  const birthYearMin = normalizeIntegerInput(String(formData.get("eligibleBirthYearMin") ?? "").trim());
  const birthYearMax = normalizeIntegerInput(String(formData.get("eligibleBirthYearMax") ?? "").trim());
  const isActive = formData.get("isActive") === "1";

  if (!name || !campusId || !productId || !campusIds.includes(campusId) || !["male", "female", "mixed"].includes(gender)) {
    redirect(`${basePath}?err=invalid_form`);
  }
  if (birthYearMin !== null && birthYearMax !== null && birthYearMin > birthYearMax) redirect(`${basePath}?err=invalid_birth_range`);

  const product = await validateCompetitionProduct(admin, productId);
  if (!product) redirect(`${basePath}?err=invalid_product`);

  const { error } = await admin
    .from("tournaments")
    .update({
      name,
      campus_id: campusId,
      product_id: product.id,
      gender,
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
      gender,
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
    .select("id, name, campus_id, gender")
    .eq("id", sourceTeamId)
    .maybeSingle<{ id: string; name: string; campus_id: string; gender: string | null } | null>();

  if (!team || team.campus_id !== tournament.campus_id) redirect(`${basePath}?err=invalid_source_team`);
  if (tournament.gender !== "mixed" && team.gender !== tournament.gender) redirect(`${basePath}?err=invalid_source_team`);

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
      .select("id, entry_status")
      .eq("tournament_id", tournamentId)
      .eq("enrollment_id", enrollmentId)
      .maybeSingle<{ id: string; entry_status: "confirmed" | "interested" } | null>(),
    admin
      .from("enrollments")
      .select("id, player_id, players(birth_date)")
      .eq("id", enrollmentId)
      .maybeSingle<{ id: string; player_id: string; players: { birth_date: string } | null } | null>(),
    admin.from("tournament_squads").select("team_id").eq("tournament_id", tournamentId).returns<Array<{ team_id: string }>>(),
  ]);

  if (!squad || !entry || entry.entry_status !== "confirmed" || !enrollment) redirect(`${basePath}?err=assignment_not_allowed`);

  const { data: primaryAssignment } = await admin
    .from("team_assignments")
    .select("id, team_id")
    .eq("enrollment_id", enrollmentId)
    .eq("is_primary", true)
    .is("end_date", null)
    .maybeSingle<{ id: string; team_id: string } | null>();

  const eligibleRegular = primaryAssignment?.team_id === squad.source_team_id;

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

export async function updateTournamentSourceTeamSettingsAction(
  tournamentId: string,
  sourceLinkId: string,
  formData: FormData,
) {
  const basePath = normalizeRedirectTarget(String(formData.get("returnTo") ?? "").trim(), `/tournaments/${tournamentId}`);
  await assertDebugWritesAllowed(basePath);
  const { admin, campusIds, user } = await getSportsActionContext("/unauthorized");
  const tournament = await validateTournamentAccess(admin, tournamentId, campusIds);
  if (!tournament) redirect("/unauthorized");

  const participationMode =
    String(formData.get("participationMode") ?? "").trim() === "invited" ? "invited" : "competitive";

  const { data: sourceLink } = await admin
    .from("tournament_source_teams")
    .select("id, source_team_id, participation_mode")
    .eq("id", sourceLinkId)
    .eq("tournament_id", tournamentId)
    .maybeSingle<{ id: string; source_team_id: string; participation_mode: string } | null>();
  if (!sourceLink) redirect(`${basePath}?err=source_not_found`);

  const { error } = await admin
    .from("tournament_source_teams")
    .update({ participation_mode: participationMode })
    .eq("id", sourceLinkId);
  if (error) redirect(`${basePath}?err=source_settings_failed`);

  await writeAuditLog(admin, {
    actorUserId: user.id,
    actorEmail: user.email ?? null,
    action: "tournament.source_team_settings_updated",
    tableName: "tournament_source_teams",
    recordId: sourceLinkId,
    afterData: {
      tournament_id: tournamentId,
      source_team_id: sourceLink.source_team_id,
      participation_mode: participationMode,
    },
  });

  revalidateSportsSurfaces(tournamentId);
  redirect(`${basePath}?ok=source_settings_updated`);
}

export async function setTournamentInterestAction(
  tournamentId: string,
  sourceTeamId: string,
  enrollmentId: string,
  interested: boolean,
  formData: FormData,
) {
  const basePath = normalizeRedirectTarget(String(formData.get("returnTo") ?? "").trim(), `/tournaments/${tournamentId}`);
  await assertDebugWritesAllowed(basePath);
  const { admin, campusIds, user } = await getSportsActionContext("/unauthorized");
  const tournament = await validateTournamentAccess(admin, tournamentId, campusIds);
  if (!tournament) redirect("/unauthorized");

  const [{ data: sourceLink }, { data: primaryAssignment }, { data: existingEntry }] = await Promise.all([
    admin
      .from("tournament_source_teams")
      .select("id")
      .eq("tournament_id", tournamentId)
      .eq("source_team_id", sourceTeamId)
      .maybeSingle<{ id: string } | null>(),
    admin
      .from("team_assignments")
      .select("id")
      .eq("enrollment_id", enrollmentId)
      .eq("team_id", sourceTeamId)
      .eq("is_primary", true)
      .is("end_date", null)
      .maybeSingle<{ id: string } | null>(),
    admin
      .from("tournament_player_entries")
      .select("id, entry_status")
      .eq("tournament_id", tournamentId)
      .eq("enrollment_id", enrollmentId)
      .maybeSingle<{ id: string; entry_status: "confirmed" | "interested" } | null>(),
  ]);

  if (!sourceLink || !primaryAssignment) redirect(`${basePath}?err=interest_not_allowed`);

  if (interested) {
    if (!existingEntry || existingEntry.entry_status === "interested") {
      const { error } = await admin.from("tournament_player_entries").upsert(
        {
          tournament_id: tournamentId,
          enrollment_id: enrollmentId,
          charge_id: null,
          entry_status: "interested",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "tournament_id,enrollment_id" },
      );
      if (error) redirect(`${basePath}?err=interest_failed`);
    }
  } else if (existingEntry?.entry_status === "interested") {
    const { error } = await admin.from("tournament_player_entries").delete().eq("id", existingEntry.id);
    if (error) redirect(`${basePath}?err=interest_failed`);
  }

  await writeAuditLog(admin, {
    actorUserId: user.id,
    actorEmail: user.email ?? null,
    action: interested ? "tournament.player_interest_marked" : "tournament.player_interest_cleared",
    tableName: "tournament_player_entries",
    recordId: existingEntry?.id ?? enrollmentId,
    afterData: {
      tournament_id: tournamentId,
      source_team_id: sourceTeamId,
      enrollment_id: enrollmentId,
      interested,
    },
  });

  revalidateSportsSurfaces(tournamentId);
  redirect(`${basePath}?ok=interest_updated`);
}

export async function approveTournamentSourceRosterAction(
  tournamentId: string,
  sourceLinkId: string,
  formData: FormData,
) {
  const basePath = normalizeRedirectTarget(String(formData.get("returnTo") ?? "").trim(), `/tournaments/${tournamentId}`);
  await assertDebugWritesAllowed(basePath);
  const { admin, campusIds, user } = await getSportsActionContext("/unauthorized");
  const tournament = await validateTournamentAccess(admin, tournamentId, campusIds);
  if (!tournament?.campus_id) redirect("/unauthorized");

  const { data: sourceLink } = await admin
    .from("tournament_source_teams")
    .select("id, source_team_id, default_squad_id")
    .eq("id", sourceLinkId)
    .eq("tournament_id", tournamentId)
    .maybeSingle<{ id: string; source_team_id: string; default_squad_id: string | null } | null>();
  if (!sourceLink) redirect(`${basePath}?err=source_not_found`);

  const sourceTeam = (
    await admin
      .from("teams")
      .select("id, name, campus_id, birth_year, gender, level, coach_id, type")
      .eq("id", sourceLink.source_team_id)
      .maybeSingle<TeamRow | null>()
  ).data;
  if (!sourceTeam) redirect(`${basePath}?err=invalid_source_team`);

  const defaultSquad = await ensureDefaultTournamentSquad(admin, tournament, sourceLink, sourceTeam);
  if (!defaultSquad) redirect(`${basePath}?err=roster_approval_failed`);

  const [{ data: sourceRoster }, { data: confirmedEntries }, { data: squadRows }] = await Promise.all([
    admin
      .from("team_assignments")
      .select("enrollment_id")
      .eq("team_id", sourceTeam.id)
      .eq("is_primary", true)
      .is("end_date", null)
      .returns<Array<{ enrollment_id: string }>>(),
    admin
      .from("tournament_player_entries")
      .select("enrollment_id")
      .eq("tournament_id", tournamentId)
      .eq("entry_status", "confirmed")
      .returns<Array<{ enrollment_id: string }>>(),
    admin
      .from("tournament_squads")
      .select("team_id")
      .eq("tournament_id", tournamentId)
      .eq("source_team_id", sourceTeam.id)
      .returns<Array<{ team_id: string }>>(),
  ]);

  const sourceEnrollmentIds = new Set((sourceRoster ?? []).map((row) => row.enrollment_id));
  const confirmedEnrollmentIds = (confirmedEntries ?? [])
    .map((row) => row.enrollment_id)
    .filter((enrollmentId) => sourceEnrollmentIds.has(enrollmentId));
  const squadTeamIds = Array.from(new Set((squadRows ?? []).map((row) => row.team_id)));
  const today = new Date().toISOString().split("T")[0];
  const now = new Date().toISOString();

  if (squadTeamIds.length > 0) {
    await admin
      .from("team_assignments")
      .update({ end_date: today, updated_at: now })
      .in("team_id", squadTeamIds)
      .eq("is_primary", false)
      .is("end_date", null);
  }

  if (confirmedEnrollmentIds.length > 0) {
    const rows = confirmedEnrollmentIds.map((enrollmentId) => ({
      enrollment_id: enrollmentId,
      team_id: defaultSquad.team_id,
      start_date: today,
      is_primary: false,
      role: "regular",
      is_new_arrival: false,
    }));
    const { error: insertError } = await admin.from("team_assignments").insert(rows);
    if (insertError) redirect(`${basePath}?err=roster_approval_failed`);
  }

  const { error: updateError } = await admin
    .from("tournament_source_teams")
    .update({
      roster_status: "approved",
      approved_at: now,
      approved_by: user.id,
      default_squad_id: defaultSquad.id,
    })
    .eq("id", sourceLinkId);
  if (updateError) redirect(`${basePath}?err=roster_approval_failed`);

  await writeAuditLog(admin, {
    actorUserId: user.id,
    actorEmail: user.email ?? null,
    action: "tournament.roster_approved",
    tableName: "tournament_source_teams",
    recordId: sourceLinkId,
    afterData: {
      tournament_id: tournamentId,
      source_team_id: sourceTeam.id,
      default_squad_id: defaultSquad.id,
      confirmed_count: confirmedEnrollmentIds.length,
    },
  });

  revalidateSportsSurfaces(tournamentId);
  redirect(`${basePath}?ok=roster_approved`);
}
