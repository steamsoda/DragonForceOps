"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { writeAuditLog } from "@/lib/audit";
import { assertDebugWritesAllowed } from "@/lib/auth/debug-view";
import { getPermissionContext } from "@/lib/auth/permissions";
import { getCompetitionPaidCallupPlayers } from "@/lib/queries/sports-signups";
import type { WeeklyCallupProgram } from "@/lib/queries/weekly-callups";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getWeeklyCallupLivePaidRoster,
  weeklyCallupCategoryLabel,
} from "@/lib/weekly-callups/live-roster";

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

type CoachAssignmentRow = {
  training_group_id: string;
  is_primary: boolean;
  coaches: { first_name: string | null; last_name: string | null; is_active: boolean } | null;
};

type EditableCallupRow = {
  id: string;
  campus_id: string;
  tournament_id: string;
  program: WeeklyCallupProgram;
  week_start: string;
  status: "draft" | "ready" | "shared";
  roster_snapshot_at: string;
  tournaments: { product_id: string } | null;
};

type EditableCategoryRow = {
  id: string;
  weekly_callup_id: string;
  sort_order: number;
  is_rest: boolean;
};

type SnapshotPlayerRow = {
  id: string;
  weekly_callup_category_id: string;
  enrollment_id: string;
  player_id: string;
  training_group_id: string | null;
  eligibility_source: "direct" | "bundle" | "manual_unpaid";
  roster_status: "included" | "excluded";
};

type ManualEnrollmentRow = {
  id: string;
  player_id: string;
  campus_id: string;
  status: string;
  players: {
    id: string;
    first_name: string;
    last_name: string;
    birth_date: string | null;
    status: string;
  } | null;
};

export type WeeklyCallupComposerState = {
  ok: false;
  message: string;
  rowErrors?: Record<string, string>;
} | null;

function textValue(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

type ComposerGameInput = {
  sourceCoachGameId: string | null;
  matchDate: string;
  arrivalTime: string;
  venue: string;
  opponent: string;
};

function composerGamesValue(formData: FormData, key: string): ComposerGameInput[] | null {
  try {
    const parsed: unknown = JSON.parse(textValue(formData, key) || "[]");
    if (!Array.isArray(parsed) || parsed.length > 3) return null;
    return parsed.map((value) => {
      if (!value || typeof value !== "object") throw new Error("invalid_game");
      const game = value as Record<string, unknown>;
      return {
        sourceCoachGameId: game.sourceCoachGameId ? String(game.sourceCoachGameId).trim() : null,
        matchDate: String(game.matchDate ?? "").trim(),
        arrivalTime: String(game.arrivalTime ?? "").trim(),
        venue: String(game.venue ?? "").trim(),
        opponent: String(game.opponent ?? "").trim(),
      };
    });
  } catch {
    return null;
  }
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

function redirectEditor(callupId: string, code: string): never {
  redirect(`/convocatorias/${callupId}?${code.includes("=") ? code : `err=${code}`}`);
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return !Number.isNaN(new Date(`${value}T12:00:00Z`).getTime());
}

function dateWithinWeek(date: string, weekStart: string) {
  if (!isIsoDate(date)) return false;
  const start = new Date(`${weekStart}T12:00:00Z`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  const candidate = new Date(`${date}T12:00:00Z`);
  return candidate >= start && candidate <= end;
}

async function getEditorContext(returnPath: string) {
  await assertDebugWritesAllowed(returnPath);
  const context = await getPermissionContext();
  if (!context || (!context.hasOperationalAccess && !context.hasSportsAccess)) redirect("/unauthorized");
  return context;
}

async function loadEditableCallup(callupId: string, returnPath: string) {
  if (!isUuid(callupId)) redirectEditor(callupId, "invalid_callup");
  const context = await getEditorContext(returnPath);
  const admin = createAdminClient();
  const result = await admin
    .from("weekly_callups")
    .select("id, campus_id, tournament_id, program, week_start, status, roster_snapshot_at, tournaments(product_id)")
    .eq("id", callupId)
    .maybeSingle<EditableCallupRow | null>();
  if (result.error) throw result.error;
  if (!result.data || !(context.campusAccess?.campusIds ?? []).includes(result.data.campus_id)) {
    redirect("/unauthorized");
  }
  return { admin, context, callup: result.data };
}

function getBirthYear(value: string | null | undefined) {
  if (!value) return null;
  const year = Number(value.slice(0, 4));
  return Number.isInteger(year) ? year : null;
}

async function loadSnapshotPlayers(
  admin: ReturnType<typeof createAdminClient>,
  categoryIds: string[],
) {
  const rows: SnapshotPlayerRow[] = [];
  if (categoryIds.length === 0) return rows;
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const page = await admin
      .from("weekly_callup_players")
      .select("id, weekly_callup_category_id, enrollment_id, player_id, training_group_id, eligibility_source, roster_status")
      .in("weekly_callup_category_id", categoryIds)
      .range(offset, offset + pageSize - 1)
      .returns<SnapshotPlayerRow[]>();
    if (page.error) throw page.error;
    rows.push(...(page.data ?? []));
    if ((page.data?.length ?? 0) < pageSize) break;
  }
  return rows;
}

async function loadEditableCategory(callupId: string, categoryId: string, returnPath: string) {
  if (!isUuid(categoryId)) redirectEditor(callupId, "invalid_category");
  const editable = await loadEditableCallup(callupId, returnPath);
  const result = await editable.admin
    .from("weekly_callup_categories")
    .select("id, weekly_callup_id, sort_order, is_rest")
    .eq("id", categoryId)
    .eq("weekly_callup_id", callupId)
    .maybeSingle<EditableCategoryRow | null>();
  if (result.error) throw result.error;
  if (!result.data) redirectEditor(callupId, "invalid_category");
  return { ...editable, category: result.data };
}

async function loadCoachSnapshots(
  admin: ReturnType<typeof createAdminClient>,
  groupIds: string[],
) {
  const result = await admin
    .from("training_group_coaches")
    .select("training_group_id, is_primary, coaches(first_name, last_name, is_active)")
    .in("training_group_id", groupIds)
    .returns<CoachAssignmentRow[]>();
  if (result.error) throw result.error;

  const rowsByGroup = new Map<string, CoachAssignmentRow[]>();
  for (const row of result.data ?? []) {
    if (!row.coaches?.is_active) continue;
    const rows = rowsByGroup.get(row.training_group_id) ?? [];
    rows.push(row);
    rowsByGroup.set(row.training_group_id, rows);
  }

  return new Map(groupIds.map((groupId) => {
    const names = (rowsByGroup.get(groupId) ?? [])
      .sort((a, b) => Number(b.is_primary) - Number(a.is_primary))
      .map((row) => [row.coaches?.first_name, row.coaches?.last_name].filter(Boolean).join(" ").trim())
      .filter(Boolean);
    return [groupId, names.join(", ") || "Sin coach"];
  }));
}

async function keepCallupReady(
  admin: ReturnType<typeof createAdminClient>,
  callupId: string,
  userId: string,
) {
  const result = await admin
    .from("weekly_callups")
    .update({ status: "ready", updated_by: userId, updated_at: new Date().toISOString() })
    .eq("id", callupId);
  if (result.error) throw result.error;
}

function revalidateCallup(callupId: string) {
  revalidatePath("/convocatorias");
  revalidatePath(`/convocatorias/${callupId}`);
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
        status: "ready",
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
    const coachSnapshots = await loadCoachSnapshots(admin, groups.map((group) => group.id));

    for (const [sortOrder, group] of groups.entries()) {
      const categoryResult = await admin
        .from("weekly_callup_categories")
        .insert({
          weekly_callup_id: callupId,
          tournament_id: tournamentId,
          tournament_name_snapshot: tournament.name,
          training_group_id: group.id,
          category_label: categoryLabel(group),
          birth_year_min: group.birth_year_min,
          birth_year_max: group.birth_year_max,
          training_group_name_snapshot: group.name,
          coach_names_snapshot: coachSnapshots.get(group.id) ?? "Sin coach",
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

export async function createWeeklyCallupComposerAction(
  _previousState: WeeklyCallupComposerState,
  formData: FormData,
): Promise<WeeklyCallupComposerState> {
  await assertDebugWritesAllowed("/convocatorias");
  const context = await getPermissionContext();
  if (!context || (!context.hasOperationalAccess && !context.hasSportsAccess)) redirect("/unauthorized");

  const campusId = textValue(formData, "campusId");
  const programValue = textValue(formData, "program");
  const weekStart = textValue(formData, "weekStart");
  const submittedSquadIds = [...new Set(formData.getAll("squadId").map(String).filter(isUuid))];
  const campusIds = context.campusAccess?.campusIds ?? [];
  if (!campusIds.includes(campusId) || !isProgram(programValue) || !isMondayIsoDate(weekStart)) {
    return { ok: false, message: "El campus, programa o semana ya no es valido. Actualiza la pantalla e intenta nuevamente." };
  }

  const admin = createAdminClient();
  const existingResult = await admin
    .from("weekly_callups")
    .select("id")
    .eq("campus_id", campusId)
    .eq("program", programValue)
    .eq("week_start", weekStart)
    .limit(1);
  if (existingResult.error) return { ok: false, message: "No se pudo validar la semana. Intenta nuevamente." };
  if ((existingResult.data?.length ?? 0) > 0) {
    return { ok: false, message: "Ya existe una convocatoria para este campus, programa y semana." };
  }

  type LiveSquadRow = {
    id: string;
    tournament_id: string;
    name: string;
    program: WeeklyCallupProgram;
    category_label: string | null;
    sort_order: number;
    status: string;
  };
  type SquadGroupRow = { squad_id: string; training_group_id: string };
  type SourceGroupRow = {
    id: string;
    campus_id: string;
    name: string;
    program: WeeklyCallupProgram;
    birth_year_min: number | null;
    birth_year_max: number | null;
    status: string;
  };
  type ScheduleReportRow = {
    id: string;
    training_group_id: string;
    competition_roster_squad_id: string | null;
    tournament_id: string;
    is_rest: boolean;
    notes: string | null;
    coaches: { first_name: string | null; last_name: string | null } | null;
  };
  type ScheduleGameRow = {
    id: string;
    report_id: string;
    competition_roster_squad_id: string | null;
    match_date: string;
    arrival_time: string;
    venue: string;
    opponent: string;
    sort_order: number;
  };
  type ScheduleGamePlayerRow = {
    game_id: string;
    enrollment_id: string;
    player_id: string;
    player_name_snapshot: string;
    roster_status: "included" | "excluded";
  };
  type LiveMemberRow = { squad_id: string; enrollment_id: string; source: "paid" | "manual" };
  type EnrollmentRow = { id: string; player_id: string };
  type PlayerIdentityRow = { id: string; first_name: string; last_name: string; birth_date: string | null };
  type CurrentAssignmentRow = {
    enrollment_id: string;
    training_group_id: string;
    training_groups: { name: string } | null;
  };

  const tournamentsResult = await admin
    .from("tournaments")
    .select("id, campus_id, product_id, name, is_active")
    .eq("campus_id", campusId)
    .eq("is_active", true)
    .returns<TournamentRow[]>();
  if (tournamentsResult.error) return { ok: false, message: "No se pudieron validar los torneos activos." };
  const tournamentIds = (tournamentsResult.data ?? []).map((row) => row.id);
  const squadsResult = tournamentIds.length
    ? await admin
        .from("competition_roster_squads")
        .select("id, tournament_id, name, program, category_label, sort_order, status")
        .in("tournament_id", tournamentIds)
        .eq("program", programValue)
        .neq("status", "archived")
        .order("sort_order")
        .order("name")
        .returns<LiveSquadRow[]>()
    : { data: [] as LiveSquadRow[], error: null };
  if (squadsResult.error) return { ok: false, message: "No se pudieron validar los equipos activos." };

  const candidateSquadIds = (squadsResult.data ?? []).map((row) => row.id);
  const squadGroupsResult = candidateSquadIds.length
    ? await admin.from("competition_roster_squad_groups").select("squad_id, training_group_id").in("squad_id", candidateSquadIds).returns<SquadGroupRow[]>()
    : { data: [] as SquadGroupRow[], error: null };
  if (squadGroupsResult.error) return { ok: false, message: "No se pudieron validar los grupos origen de los equipos." };
  const sourceGroupIds = [...new Set((squadGroupsResult.data ?? []).map((row) => row.training_group_id))];
  const sourceGroupsResult = sourceGroupIds.length
    ? await admin
        .from("training_groups")
        .select("id, campus_id, name, program, birth_year_min, birth_year_max, status")
        .in("id", sourceGroupIds)
        .returns<SourceGroupRow[]>()
    : { data: [] as SourceGroupRow[], error: null };
  if (sourceGroupsResult.error) return { ok: false, message: "No se pudieron validar los grupos origen." };

  const sourceGroupById = new Map((sourceGroupsResult.data ?? []).map((row) => [row.id, row]));
  const sourceGroupIdsBySquad = new Map<string, string[]>();
  for (const link of squadGroupsResult.data ?? []) {
    const group = sourceGroupById.get(link.training_group_id);
    if (!group || group.status !== "active" || group.campus_id !== campusId || group.program !== programValue) continue;
    const current = sourceGroupIdsBySquad.get(link.squad_id) ?? [];
    current.push(link.training_group_id);
    sourceGroupIdsBySquad.set(link.squad_id, current);
  }
  const expectedSquads = (squadsResult.data ?? []).filter((squad) => (sourceGroupIdsBySquad.get(squad.id)?.length ?? 0) > 0);
  const expectedIds = new Set(expectedSquads.map((squad) => squad.id));
  if (expectedSquads.length === 0) return { ok: false, message: "No hay equipos activos para preparar esta convocatoria." };
  if (submittedSquadIds.length !== expectedIds.size || submittedSquadIds.some((id) => !expectedIds.has(id))) {
    return { ok: false, message: "La lista de equipos cambio. Actualiza la pantalla antes de preparar la convocatoria." };
  }

  const reportsResult = await admin
    .from("coach_weekly_schedule_reports")
    .select("id, training_group_id, competition_roster_squad_id, tournament_id, is_rest, notes, coaches(first_name, last_name)")
    .eq("week_start", weekStart)
    .in("competition_roster_squad_id", [...expectedIds])
    .returns<ScheduleReportRow[]>();
  if (reportsResult.error) return { ok: false, message: "No se pudieron leer los reportes de los profesores." };
  const reportsBySquad = new Map((reportsResult.data ?? []).flatMap((report) => report.competition_roster_squad_id ? [[report.competition_roster_squad_id, report] as const] : []));
  const missingIds = [...expectedIds].filter((id) => !reportsBySquad.has(id));
  if (missingIds.length > 0) {
    return {
      ok: false,
      message: "Todos los equipos deben reportar sus partidos o marcar Descansa antes de preparar la convocatoria.",
      rowErrors: Object.fromEntries(missingIds.map((id) => [id, "Reporte pendiente."])),
    };
  }

  const reportIds = [...reportsBySquad.values()].map((row) => row.id);
  const gamesResult = reportIds.length
    ? await admin
        .from("coach_weekly_schedule_games")
        .select("id, report_id, competition_roster_squad_id, match_date, arrival_time, venue, opponent, sort_order")
        .in("report_id", reportIds)
        .order("sort_order")
        .returns<ScheduleGameRow[]>()
    : { data: [] as ScheduleGameRow[], error: null };
  if (gamesResult.error) return { ok: false, message: "No se pudieron leer los partidos reportados." };
  const gamesByReport = new Map<string, ScheduleGameRow[]>();
  for (const game of gamesResult.data ?? []) {
    const current = gamesByReport.get(game.report_id) ?? [];
    current.push(game);
    gamesByReport.set(game.report_id, current);
  }
  for (const squad of expectedSquads) {
    const report = reportsBySquad.get(squad.id)!;
    const games = gamesByReport.get(report.id) ?? [];
    if (report.tournament_id !== squad.tournament_id || (!report.is_rest && games.length === 0)) {
      return { ok: false, message: "Un reporte esta incompleto o ya no coincide con su equipo. Pide al profesor que lo actualice." };
    }
  }

  const gameIds = (gamesResult.data ?? []).map((row) => row.id);
  const gamePlayers: ScheduleGamePlayerRow[] = [];
  for (let offset = 0; gameIds.length > 0; offset += 1000) {
    const page = await admin
      .from("coach_weekly_schedule_game_players")
      .select("game_id, enrollment_id, player_id, player_name_snapshot, roster_status")
      .in("game_id", gameIds)
      .range(offset, offset + 999)
      .returns<ScheduleGamePlayerRow[]>();
    if (page.error) return { ok: false, message: "No se pudieron leer los convocados reportados por los profesores." };
    gamePlayers.push(...(page.data ?? []));
    if ((page.data?.length ?? 0) < 1000) break;
  }
  const gamePlayersByGame = new Map<string, ScheduleGamePlayerRow[]>();
  for (const player of gamePlayers) {
    const current = gamePlayersByGame.get(player.game_id) ?? [];
    current.push(player);
    gamePlayersByGame.set(player.game_id, current);
  }
  const gameWithoutRoster = (gamesResult.data ?? []).find((game) => (gamePlayersByGame.get(game.id)?.length ?? 0) === 0);
  if (gameWithoutRoster) {
    return { ok: false, message: "Un partido no tiene su lista de convocados completa. Pide al profesor que vuelva a guardar el reporte." };
  }

  const liveMembers: LiveMemberRow[] = [];
  for (let offset = 0; expectedIds.size > 0; offset += 1000) {
    const page = await admin
      .from("competition_roster_squad_members")
      .select("squad_id, enrollment_id, source")
      .in("squad_id", [...expectedIds])
      .range(offset, offset + 999)
      .returns<LiveMemberRow[]>();
    if (page.error) return { ok: false, message: "No se pudo leer el plantel actual de los equipos." };
    liveMembers.push(...(page.data ?? []));
    if ((page.data?.length ?? 0) < 1000) break;
  }
  const enrollmentIds = [...new Set(liveMembers.map((row) => row.enrollment_id))];
  const [enrollmentsResult, assignmentsResult] = await Promise.all([
    enrollmentIds.length
      ? admin.from("enrollments").select("id, player_id").in("id", enrollmentIds).returns<EnrollmentRow[]>()
      : Promise.resolve({ data: [] as EnrollmentRow[], error: null }),
    enrollmentIds.length
      ? admin.from("training_group_assignments").select("enrollment_id, training_group_id, training_groups(name)").in("enrollment_id", enrollmentIds).is("end_date", null).returns<CurrentAssignmentRow[]>()
      : Promise.resolve({ data: [] as CurrentAssignmentRow[], error: null }),
  ]);
  if (enrollmentsResult.error || assignmentsResult.error) return { ok: false, message: "No se pudo completar el contexto actual de los jugadores." };
  const playerIds = [...new Set((enrollmentsResult.data ?? []).map((row) => row.player_id))];
  const playersResult = playerIds.length
    ? await admin.from("players").select("id, first_name, last_name, birth_date").in("id", playerIds).returns<PlayerIdentityRow[]>()
    : { data: [] as PlayerIdentityRow[], error: null };
  if (playersResult.error) return { ok: false, message: "No se pudieron leer los nombres de los jugadores." };

  const tournamentById = new Map((tournamentsResult.data ?? []).map((row) => [row.id, row]));
  const enrollmentById = new Map((enrollmentsResult.data ?? []).map((row) => [row.id, row]));
  const playerById = new Map((playersResult.data ?? []).map((row) => [row.id, row]));
  const assignmentByEnrollment = new Map((assignmentsResult.data ?? []).map((row) => [row.enrollment_id, row]));
  const membersBySquad = new Map<string, LiveMemberRow[]>();
  for (const member of liveMembers) {
    const current = membersBySquad.get(member.squad_id) ?? [];
    current.push(member);
    membersBySquad.set(member.squad_id, current);
  }

  const snapshotAt = new Date().toISOString();
  const primaryTournament = tournamentById.get(expectedSquads[0].tournament_id);
  if (!primaryTournament) return { ok: false, message: "El torneo principal ya no esta disponible." };
  let callupId: string | null = null;
  try {
    const headerResult = await admin.from("weekly_callups").insert({
      campus_id: campusId,
      tournament_id: primaryTournament.id,
      program: programValue,
      week_start: weekStart,
      status: "ready",
      roster_snapshot_at: snapshotAt,
      created_by: context.user.id,
      updated_by: context.user.id,
    }).select("id").single<{ id: string }>();
    if (headerResult.error || !headerResult.data) throw headerResult.error ?? new Error("composer_header_failed");
    callupId = headerResult.data.id;

    for (const [sortOrder, squad] of expectedSquads.entries()) {
      const report = reportsBySquad.get(squad.id)!;
      const sourceGroupIdsForSquad = sourceGroupIdsBySquad.get(squad.id) ?? [];
      const sourceGroups = sourceGroupIdsForSquad.map((id) => sourceGroupById.get(id)).filter((row): row is SourceGroupRow => Boolean(row));
      const anchorGroup = sourceGroups[0];
      const tournament = tournamentById.get(squad.tournament_id)!;
      const coachName = [report.coaches?.first_name, report.coaches?.last_name].filter(Boolean).join(" ") || "Sin profesor";
      const categoryResult = await admin.from("weekly_callup_categories").insert({
        weekly_callup_id: callupId,
        tournament_id: tournament.id,
        tournament_name_snapshot: tournament.name,
        training_group_id: anchorGroup?.id ?? null,
        competition_roster_squad_id: squad.id,
        category_label: squad.category_label || squad.name,
        birth_year_min: anchorGroup?.birth_year_min ?? null,
        birth_year_max: anchorGroup?.birth_year_max ?? null,
        training_group_name_snapshot: squad.name,
        coach_names_snapshot: coachName,
        sort_order: sortOrder,
        is_rest: report.is_rest,
      }).select("id").single<{ id: string }>();
      if (categoryResult.error || !categoryResult.data) throw categoryResult.error ?? new Error("composer_category_failed");

      const categoryPlayers = (membersBySquad.get(squad.id) ?? []).flatMap((member) => {
        const enrollment = enrollmentById.get(member.enrollment_id);
        const player = enrollment ? playerById.get(enrollment.player_id) : null;
        if (!enrollment || !player) return [];
        const assignment = assignmentByEnrollment.get(member.enrollment_id);
        return [{
          weekly_callup_category_id: categoryResult.data.id,
          enrollment_id: enrollment.id,
          player_id: player.id,
          player_name_snapshot: [player.first_name, player.last_name].filter(Boolean).join(" ").trim(),
          birth_year: player.birth_date ? Number(player.birth_date.slice(0, 4)) : null,
          training_group_id: assignment?.training_group_id ?? anchorGroup?.id ?? null,
          training_group_name_snapshot: assignment?.training_groups?.name ?? anchorGroup?.name ?? squad.name,
          eligibility_source: member.source === "manual" ? "manual_unpaid" : "direct",
          roster_status: "included",
          source_snapshot_at: snapshotAt,
        }];
      });
      if (categoryPlayers.length > 0) {
        const playerResult = await admin.from("weekly_callup_players").insert(categoryPlayers);
        if (playerResult.error) throw playerResult.error;
      }

      for (const game of gamesByReport.get(report.id) ?? []) {
        const gameResult = await admin.from("weekly_callup_games").insert({
          weekly_callup_category_id: categoryResult.data.id,
          source_coach_schedule_game_id: game.id,
          competition_roster_squad_id: squad.id,
          match_date: game.match_date,
          arrival_time: game.arrival_time,
          venue: game.venue,
          opponent: game.opponent,
          sort_order: game.sort_order,
        }).select("id").single<{ id: string }>();
        if (gameResult.error || !gameResult.data) throw gameResult.error ?? new Error("composer_game_failed");
        const copiedPlayers = (gamePlayersByGame.get(game.id) ?? []).map((player) => ({
          weekly_callup_game_id: gameResult.data.id,
          enrollment_id: player.enrollment_id,
          player_id: player.player_id,
          player_name_snapshot: player.player_name_snapshot,
          roster_status: player.roster_status,
        }));
        if (copiedPlayers.length > 0) {
          const copiedResult = await admin.from("weekly_callup_game_players").insert(copiedPlayers);
          if (copiedResult.error) throw copiedResult.error;
        }
      }
    }

    await writeAuditLog(admin, {
      actorUserId: context.user.id,
      actorEmail: context.user.email ?? null,
      action: "weekly_callups.squad_packet_created",
      tableName: "weekly_callups",
      recordId: callupId,
      afterData: { campus_id: campusId, program: programValue, week_start: weekStart, squads: expectedSquads.length },
    });
  } catch (error) {
    if (callupId) await admin.from("weekly_callups").delete().eq("id", callupId);
    console.error("squad weekly callup composer failed", error);
    return { ok: false, message: "No se pudo congelar la convocatoria. No se modificaron reportes, equipos ni inscripciones." };
  }

  revalidatePath("/convocatorias");
  redirect(`/convocatorias/${callupId}?ok=composer_created`);
}

export async function saveWeeklyCallupGameAction(formData: FormData) {
  const callupId = textValue(formData, "callupId");
  const categoryId = textValue(formData, "categoryId");
  const gameId = textValue(formData, "gameId");
  const matchDate = textValue(formData, "matchDate");
  const arrivalTime = textValue(formData, "arrivalTime");
  const venue = textValue(formData, "venue");
  const opponent = textValue(formData, "opponent");
  const editable = await loadEditableCategory(callupId, categoryId, `/convocatorias/${callupId}`);

  if (
    editable.category.is_rest ||
    !dateWithinWeek(matchDate, editable.callup.week_start) ||
    !/^\d{2}:\d{2}$/.test(arrivalTime) ||
    !venue ||
    !opponent
  ) {
    redirectEditor(callupId, editable.category.is_rest ? "category_is_resting" : "invalid_game");
  }

  const payload = {
    weekly_callup_category_id: categoryId,
    match_date: matchDate,
    arrival_time: arrivalTime,
    venue,
    opponent,
    updated_at: new Date().toISOString(),
  };
  if (gameId) {
    if (!isUuid(gameId)) redirectEditor(callupId, "invalid_game");
    const result = await editable.admin
      .from("weekly_callup_games")
      .update(payload)
      .eq("id", gameId)
      .eq("weekly_callup_category_id", categoryId);
    if (result.error) throw result.error;
  } else {
    const orderResult = await editable.admin
      .from("weekly_callup_games")
      .select("sort_order")
      .eq("weekly_callup_category_id", categoryId)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle<{ sort_order: number } | null>();
    if (orderResult.error) throw orderResult.error;
    const result = await editable.admin.from("weekly_callup_games").insert({
      ...payload,
      sort_order: (orderResult.data?.sort_order ?? -1) + 1,
    });
    if (result.error) throw result.error;
  }
  await keepCallupReady(editable.admin, callupId, editable.context.user.id);
  await writeAuditLog(editable.admin, {
    actorUserId: editable.context.user.id,
    actorEmail: editable.context.user.email ?? null,
    action: gameId ? "weekly_callups.game_updated" : "weekly_callups.game_created",
    tableName: "weekly_callup_games",
    recordId: gameId || categoryId,
    afterData: { callup_id: callupId, category_id: categoryId, match_date: matchDate, arrival_time: arrivalTime, venue, opponent },
  });
  revalidateCallup(callupId);
  redirectEditor(callupId, "ok=game_saved");
}

export async function deleteWeeklyCallupGameAction(formData: FormData) {
  const callupId = textValue(formData, "callupId");
  const categoryId = textValue(formData, "categoryId");
  const gameId = textValue(formData, "gameId");
  const editable = await loadEditableCategory(callupId, categoryId, `/convocatorias/${callupId}`);
  if (!isUuid(gameId)) redirectEditor(callupId, "invalid_game");
  const result = await editable.admin
    .from("weekly_callup_games")
    .delete()
    .eq("id", gameId)
    .eq("weekly_callup_category_id", categoryId);
  if (result.error) throw result.error;
  await keepCallupReady(editable.admin, callupId, editable.context.user.id);
  await writeAuditLog(editable.admin, {
    actorUserId: editable.context.user.id,
    actorEmail: editable.context.user.email ?? null,
    action: "weekly_callups.game_deleted",
    tableName: "weekly_callup_games",
    recordId: gameId,
    beforeData: { callup_id: callupId, category_id: categoryId },
  });
  revalidateCallup(callupId);
  redirectEditor(callupId, "ok=game_deleted");
}

export async function moveWeeklyCallupGameAction(formData: FormData) {
  const callupId = textValue(formData, "callupId");
  const categoryId = textValue(formData, "categoryId");
  const gameId = textValue(formData, "gameId");
  const direction = textValue(formData, "direction");
  if (!isUuid(gameId) || (direction !== "up" && direction !== "down")) {
    redirectEditor(callupId, "invalid_game_move");
  }
  const editable = await loadEditableCategory(callupId, categoryId, `/convocatorias/${callupId}`);
  const games = await editable.admin
    .from("weekly_callup_games")
    .select("id, sort_order")
    .eq("weekly_callup_category_id", categoryId)
    .order("sort_order")
    .order("match_date")
    .returns<Array<{ id: string; sort_order: number }>>();
  if (games.error) throw games.error;
  const index = (games.data ?? []).findIndex((game) => game.id === gameId);
  const swapIndex = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || swapIndex < 0 || swapIndex >= (games.data?.length ?? 0)) {
    redirectEditor(callupId, "invalid_game_move");
  }
  const current = games.data![index];
  const swap = games.data![swapIndex];
  const first = await editable.admin.from("weekly_callup_games").update({ sort_order: swap.sort_order }).eq("id", current.id);
  if (first.error) throw first.error;
  const second = await editable.admin.from("weekly_callup_games").update({ sort_order: current.sort_order }).eq("id", swap.id);
  if (second.error) throw second.error;
  await keepCallupReady(editable.admin, callupId, editable.context.user.id);
  await writeAuditLog(editable.admin, {
    actorUserId: editable.context.user.id,
    actorEmail: editable.context.user.email ?? null,
    action: "weekly_callups.game_reordered",
    tableName: "weekly_callup_games",
    recordId: gameId,
    afterData: { callup_id: callupId, category_id: categoryId, direction },
  });
  revalidateCallup(callupId);
  redirectEditor(callupId, "ok=game_moved");
}

export async function toggleWeeklyCallupRestAction(formData: FormData) {
  const callupId = textValue(formData, "callupId");
  const categoryId = textValue(formData, "categoryId");
  const isRest = textValue(formData, "isRest") === "true";
  const editable = await loadEditableCategory(callupId, categoryId, `/convocatorias/${callupId}`);
  if (isRest) {
    const games = await editable.admin
      .from("weekly_callup_games")
      .select("id", { count: "exact", head: true })
      .eq("weekly_callup_category_id", categoryId);
    if (games.error) throw games.error;
    if ((games.count ?? 0) > 0) redirectEditor(callupId, "remove_games_before_rest");
  }
  const result = await editable.admin
    .from("weekly_callup_categories")
    .update({ is_rest: isRest, updated_at: new Date().toISOString() })
    .eq("id", categoryId);
  if (result.error) throw result.error;
  await keepCallupReady(editable.admin, callupId, editable.context.user.id);
  await writeAuditLog(editable.admin, {
    actorUserId: editable.context.user.id,
    actorEmail: editable.context.user.email ?? null,
    action: isRest ? "weekly_callups.category_rest_set" : "weekly_callups.category_rest_cleared",
    tableName: "weekly_callup_categories",
    recordId: categoryId,
    afterData: { callup_id: callupId, is_rest: isRest },
  });
  revalidateCallup(callupId);
  redirectEditor(callupId, "ok=rest_updated");
}

export async function toggleWeeklyCallupPlayerAction(formData: FormData) {
  const callupId = textValue(formData, "callupId");
  const categoryId = textValue(formData, "categoryId");
  const playerRowId = textValue(formData, "playerRowId");
  const rosterStatus = textValue(formData, "rosterStatus");
  if (rosterStatus !== "included" && rosterStatus !== "excluded") redirectEditor(callupId, "invalid_roster_status");
  const editable = await loadEditableCategory(callupId, categoryId, `/convocatorias/${callupId}`);
  if (!isUuid(playerRowId)) redirectEditor(callupId, "invalid_player");
  const result = await editable.admin
    .from("weekly_callup_players")
    .update({
      roster_status: rosterStatus,
      adjusted_by: editable.context.user.id,
      adjusted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", playerRowId)
    .eq("weekly_callup_category_id", categoryId);
  if (result.error) throw result.error;
  await keepCallupReady(editable.admin, callupId, editable.context.user.id);
  await writeAuditLog(editable.admin, {
    actorUserId: editable.context.user.id,
    actorEmail: editable.context.user.email ?? null,
    action: rosterStatus === "included" ? "weekly_callups.player_restored" : "weekly_callups.player_excluded",
    tableName: "weekly_callup_players",
    recordId: playerRowId,
    afterData: { callup_id: callupId, category_id: categoryId, roster_status: rosterStatus },
  });
  revalidateCallup(callupId);
  redirectEditor(callupId, "ok=roster_updated");
}

export async function moveWeeklyCallupCategoryAction(formData: FormData) {
  const callupId = textValue(formData, "callupId");
  const categoryId = textValue(formData, "categoryId");
  const direction = textValue(formData, "direction");
  if (direction !== "up" && direction !== "down") redirectEditor(callupId, "invalid_category_move");
  const editable = await loadEditableCategory(callupId, categoryId, `/convocatorias/${callupId}`);
  const categories = await editable.admin
    .from("weekly_callup_categories")
    .select("id, sort_order")
    .eq("weekly_callup_id", callupId)
    .order("sort_order")
    .order("category_label")
    .returns<Array<{ id: string; sort_order: number }>>();
  if (categories.error) throw categories.error;
  const index = (categories.data ?? []).findIndex((category) => category.id === categoryId);
  const swapIndex = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || swapIndex < 0 || swapIndex >= (categories.data?.length ?? 0)) {
    redirectEditor(callupId, "invalid_category_move");
  }
  const current = categories.data![index];
  const swap = categories.data![swapIndex];
  const first = await editable.admin.from("weekly_callup_categories").update({ sort_order: swap.sort_order }).eq("id", current.id);
  if (first.error) throw first.error;
  const second = await editable.admin.from("weekly_callup_categories").update({ sort_order: current.sort_order }).eq("id", swap.id);
  if (second.error) throw second.error;
  await keepCallupReady(editable.admin, callupId, editable.context.user.id);
  await writeAuditLog(editable.admin, {
    actorUserId: editable.context.user.id,
    actorEmail: editable.context.user.email ?? null,
    action: "weekly_callups.category_reordered",
    tableName: "weekly_callup_categories",
    recordId: categoryId,
    afterData: { callup_id: callupId, direction },
  });
  revalidateCallup(callupId);
  redirectEditor(callupId, "ok=category_moved");
}

export async function deleteWeeklyCallupAction(formData: FormData) {
  const callupId = textValue(formData, "callupId");
  const editable = await loadEditableCallup(callupId, `/convocatorias/${callupId}`);
  if (!editable.context.isSportsDirector) redirect("/unauthorized");

  const result = await editable.admin.from("weekly_callups").delete().eq("id", callupId);
  if (result.error) throw result.error;
  await writeAuditLog(editable.admin, {
    actorUserId: editable.context.user.id,
    actorEmail: editable.context.user.email ?? null,
    action: "weekly_callups.deleted",
    tableName: "weekly_callups",
    recordId: callupId,
    beforeData: {
      campus_id: editable.callup.campus_id,
      program: editable.callup.program,
      week_start: editable.callup.week_start,
      roster_snapshot_at: editable.callup.roster_snapshot_at,
    },
  });
  revalidatePath("/convocatorias");
  redirectResult("ok=callup_deleted");
}

export async function addWeeklyCallupManualExceptionAction(formData: FormData) {
  const callupId = textValue(formData, "callupId");
  const enrollmentId = textValue(formData, "enrollmentId");
  const reason = textValue(formData, "reason");
  const editable = await loadEditableCallup(callupId, `/convocatorias/${callupId}`);
  if (!editable.context.isSportsDirector) redirect("/unauthorized");
  if (!isUuid(enrollmentId) || reason.length < 5 || reason.length > 500) {
    redirectEditor(callupId, "invalid_manual_exception");
  }
  if (!editable.callup.tournaments?.product_id) redirectEditor(callupId, "paid_roster_unavailable");

  const paidRoster = await getWeeklyCallupLivePaidRoster({
    campusId: editable.callup.campus_id,
    tournamentProductId: editable.callup.tournaments.product_id,
    program: editable.callup.program,
  });
  if (!paidRoster) redirectEditor(callupId, "paid_roster_unavailable");
  if (paidRoster.some((player) => player.enrollmentId === enrollmentId)) {
    redirectEditor(callupId, "player_now_paid_refresh_roster");
  }

  const enrollmentResult = await editable.admin
    .from("enrollments")
    .select("id, player_id, campus_id, status, players(id, first_name, last_name, birth_date, status)")
    .eq("id", enrollmentId)
    .maybeSingle<ManualEnrollmentRow | null>();
  if (enrollmentResult.error) throw enrollmentResult.error;
  const enrollment = enrollmentResult.data;
  if (
    !enrollment ||
    enrollment.campus_id !== editable.callup.campus_id ||
    enrollment.status !== "active" ||
    enrollment.players?.status !== "active"
  ) {
    redirectEditor(callupId, "invalid_manual_exception_player");
  }

  const assignmentResult = await editable.admin
    .from("training_group_assignments")
    .select("enrollment_id, player_id, training_group_id, training_groups(id, campus_id, name, program, birth_year_min, birth_year_max, status)")
    .eq("enrollment_id", enrollmentId)
    .is("end_date", null)
    .maybeSingle<AssignmentRow | null>();
  if (assignmentResult.error) throw assignmentResult.error;
  const assignment = assignmentResult.data;
  const group = assignment?.training_groups;
  if (
    !assignment ||
    !group ||
    group.campus_id !== editable.callup.campus_id ||
    group.program !== editable.callup.program ||
    group.status !== "active"
  ) {
    redirectEditor(callupId, "manual_exception_group_mismatch");
  }

  const categories = await editable.admin
    .from("weekly_callup_categories")
    .select("id, weekly_callup_id, training_group_id, sort_order, is_rest")
    .eq("weekly_callup_id", callupId)
    .returns<Array<EditableCategoryRow & { training_group_id: string | null }>>();
  if (categories.error) throw categories.error;
  const categoryIds = (categories.data ?? []).map((category) => category.id);
  const snapshotPlayers = await loadSnapshotPlayers(editable.admin, categoryIds);
  if (snapshotPlayers.some((player) => player.enrollment_id === enrollmentId)) {
    redirectEditor(callupId, "player_already_in_callup");
  }

  let category = (categories.data ?? []).find((candidate) => candidate.training_group_id === group.id) ?? null;
  if (!category) {
    const order = (categories.data ?? []).reduce((max, candidate) => Math.max(max, candidate.sort_order), -1) + 1;
    const coachSnapshots = await loadCoachSnapshots(editable.admin, [group.id]);
    const categoryInsert = await editable.admin
      .from("weekly_callup_categories")
      .insert({
        weekly_callup_id: callupId,
        training_group_id: group.id,
        category_label: weeklyCallupCategoryLabel(group),
        birth_year_min: group.birth_year_min,
        birth_year_max: group.birth_year_max,
        training_group_name_snapshot: group.name,
        coach_names_snapshot: coachSnapshots.get(group.id) ?? "Sin coach",
        sort_order: order,
      })
      .select("id, weekly_callup_id, training_group_id, sort_order, is_rest")
      .single<EditableCategoryRow & { training_group_id: string | null }>();
    if (categoryInsert.error || !categoryInsert.data) {
      throw categoryInsert.error ?? new Error("manual_exception_category_failed");
    }
    category = categoryInsert.data;
  }

  const now = new Date().toISOString();
  const playerInsert = await editable.admin
    .from("weekly_callup_players")
    .insert({
      weekly_callup_category_id: category.id,
      enrollment_id: enrollment.id,
      player_id: enrollment.player_id,
      player_name_snapshot: `${enrollment.players.first_name} ${enrollment.players.last_name}`.trim(),
      birth_year: getBirthYear(enrollment.players.birth_date),
      training_group_id: group.id,
      training_group_name_snapshot: group.name,
      eligibility_source: "manual_unpaid",
      roster_status: "included",
      manual_reason: reason,
      source_snapshot_at: now,
      adjusted_by: editable.context.user.id,
      adjusted_at: now,
    })
    .select("id")
    .single<{ id: string }>();
  if (playerInsert.error || !playerInsert.data) throw playerInsert.error ?? new Error("manual_exception_insert_failed");

  await keepCallupReady(editable.admin, callupId, editable.context.user.id);
  await writeAuditLog(editable.admin, {
    actorUserId: editable.context.user.id,
    actorEmail: editable.context.user.email ?? null,
    action: "weekly_callups.manual_unpaid_added",
    tableName: "weekly_callup_players",
    recordId: playerInsert.data.id,
    afterData: {
      callup_id: callupId,
      enrollment_id: enrollmentId,
      player_id: enrollment.player_id,
      category_id: category.id,
      reason,
    },
  });
  revalidateCallup(callupId);
  redirectEditor(callupId, "ok=manual_exception_added");
}

export async function refreshWeeklyCallupRosterAction(formData: FormData) {
  const callupId = textValue(formData, "callupId");
  const confirmed = textValue(formData, "confirmRefresh") === "yes";
  if (!confirmed) redirectEditor(callupId, "confirm_roster_refresh");
  const editable = await loadEditableCallup(callupId, `/convocatorias/${callupId}`);
  if (!editable.callup.tournaments?.product_id) redirectEditor(callupId, "paid_roster_unavailable");

  const liveRoster = await getWeeklyCallupLivePaidRoster({
    campusId: editable.callup.campus_id,
    tournamentProductId: editable.callup.tournaments.product_id,
    program: editable.callup.program,
  });
  if (!liveRoster) redirectEditor(callupId, "paid_roster_unavailable");

  const snapshotAt = new Date().toISOString();
  const refreshResult = await editable.admin.rpc("refresh_weekly_callup_paid_roster", {
    p_callup_id: callupId,
    p_snapshot_at: snapshotAt,
    p_players: liveRoster.map((player) => ({
      enrollment_id: player.enrollmentId,
      player_id: player.playerId,
      player_name: player.playerName,
      birth_year: player.birthYear,
      training_group_id: player.trainingGroupId,
      training_group_name: player.trainingGroupName,
      category_label: player.categoryLabel,
      birth_year_min: player.birthYearMin,
      birth_year_max: player.birthYearMax,
      eligibility_source: player.eligibilitySource,
    })),
    p_actor_id: editable.context.user.id,
  });
  if (refreshResult.error) throw refreshResult.error;
  await keepCallupReady(editable.admin, callupId, editable.context.user.id);
  const refreshSummary = (refreshResult.data ?? {}) as Record<string, number>;
  await writeAuditLog(editable.admin, {
    actorUserId: editable.context.user.id,
    actorEmail: editable.context.user.email ?? null,
    action: "weekly_callups.roster_refreshed",
    tableName: "weekly_callups",
    recordId: callupId,
    beforeData: { roster_snapshot_at: editable.callup.roster_snapshot_at },
    afterData: {
      roster_snapshot_at: snapshotAt,
      current_paid_players: refreshSummary.current_paid_players ?? liveRoster.length,
      added_players: refreshSummary.added_players ?? 0,
      removed_players: refreshSummary.removed_players ?? 0,
      moved_players: refreshSummary.moved_players ?? 0,
      manual_exceptions_preserved: refreshSummary.manual_exceptions_preserved ?? 0,
    },
  });
  revalidateCallup(callupId);
  redirectEditor(callupId, "ok=roster_refreshed");
}
