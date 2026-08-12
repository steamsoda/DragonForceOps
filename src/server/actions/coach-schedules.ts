"use server";

import { revalidatePath } from "next/cache";
import { getDebugViewContext, isPreviewDebugEnabled } from "@/lib/auth/debug-view";
import { getPermissionContext } from "@/lib/auth/permissions";
import { writeAuditLog } from "@/lib/audit";
import { createAdminClient } from "@/lib/supabase/admin";

export type CoachScheduleActionState =
  | {
      ok: false;
      code: string;
      message: string;
      refreshedRoster?: {
        squadId: string;
        players: Array<{
          enrollmentId: string;
          playerId: string;
          playerName: string;
        }>;
      };
    }
  | {
      ok: true;
      message: string;
      savedAt: string;
      report: {
        tournamentId: string;
        isRest: boolean;
        notes: string;
        games: Array<{
          id: string | null;
          matchDate: string;
          arrivalTime: string;
          venue: string;
          opponent: string;
          squadId: string;
          players: Array<{
            enrollmentId: string;
            playerId: string;
            playerName: string;
            rosterStatus: "included" | "excluded";
          }>;
        }>;
      };
    }
  | null;

type SubmittedGame = {
  id: string | null;
  match_date: string;
  arrival_time: string;
  venue: string;
  opponent: string;
  squad_id: string;
  players: Array<{ enrollment_id: string; player_id: string; player_name: string; roster_status: "included" | "excluded" }>;
};

type SquadMemberRow = {
  enrollment_id: string;
  enrollments: {
    player_id: string;
    players: { first_name: string; last_name: string } | null;
  } | null;
};

const DATABASE_ERROR_MESSAGES: Record<string, string> = {
  coach_link_invalid: "Tu usuario ya no esta vinculado a un profesor activo. Administracion debe revisar tu cuenta.",
  coach_squad_forbidden: "Este equipo ya no esta asignado a tu cuenta. Tus datos siguen en pantalla; pide a administracion revisar el profesor del equipo.",
  invalid_schedule_squad: "El equipo, torneo o grupo origen cambio. Tus datos siguen en pantalla; recarga la pagina para revisar la asignacion.",
  week_must_start_monday: "La semana seleccionada no empieza en lunes. Vuelve a abrir la semana correspondiente.",
  notes_too_long: "La nota supera el limite de 500 caracteres.",
  invalid_games: "No se pudieron leer los partidos capturados.",
  invalid_game_count: "Registra entre uno y tres partidos, o marca que el equipo descansa.",
  invalid_game: "Revisa la fecha, hora de cita, sede y rival. La fecha debe pertenecer a esta semana.",
  invalid_game_squad: "Uno de los partidos corresponde a otro equipo. Revisa el equipo seleccionado.",
  game_roster_changed: "El plantel cambio mientras capturabas el horario. Actualizamos la lista sin borrar fecha, hora, sede, rival ni notas; revisa los convocados y vuelve a guardar.",
  invalid_game_players: "La lista de convocados ya no coincide con este equipo. Revisa los jugadores marcados y vuelve a guardar.",
  invalid_game_id: "Uno de los partidos guardados ya no esta disponible. Recarga la semana antes de volver a intentar.",
  staff_schedule_forbidden: "No tienes permiso para editar el horario de este campus.",
};

function clean(formData: FormData, key: string) {
  return formData.get(key)?.toString().trim() ?? "";
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isMonday(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.getUTCDay() === 1;
}

function databaseErrorCode(error: { message?: string | null; details?: string | null; hint?: string | null }) {
  const haystack = [error.message, error.details, error.hint].filter(Boolean).join(" ").toLowerCase();
  return Object.keys(DATABASE_ERROR_MESSAGES).find((code) => haystack.includes(code)) ?? "save_failed";
}

async function loadFreshSquadRoster(admin: ReturnType<typeof createAdminClient>, squadId: string) {
  const result = await admin
    .from("competition_roster_squad_members")
    .select("enrollment_id, enrollments(player_id, players(first_name, last_name))")
    .eq("squad_id", squadId)
    .returns<SquadMemberRow[]>();
  if (result.error) {
    console.error("[coach-schedule] roster refresh failed", result.error);
    return undefined;
  }
  const players = (result.data ?? [])
    .flatMap((member) => member.enrollments?.players ? [{
      enrollmentId: member.enrollment_id,
      playerId: member.enrollments.player_id,
      playerName: `${member.enrollments.players.first_name} ${member.enrollments.players.last_name}`.trim(),
    }] : [])
    .sort((a, b) => a.playerName.localeCompare(b.playerName, "es-MX"));
  return { squadId, players };
}

export async function saveCoachScheduleAction(
  _previous: CoachScheduleActionState,
  formData: FormData,
): Promise<CoachScheduleActionState> {
  const debugContext = await getDebugViewContext();
  const context = await getPermissionContext();
  const writeMode = clean(formData, "writeMode") === "director" ? "director" : "coach";
  const directorWrite = writeMode === "director";
  if (!context || (directorWrite ? !context.isSportsDirector : !context.hasCoachScheduleAccess || !context.coachId)) {
    return { ok: false, code: "permission_denied", message: directorWrite ? "Necesitas permiso de direccion deportiva para guardar este horario." : "Tu cuenta no esta vinculada a un profesor activo." };
  }
  const isWritableCoachPreview = Boolean(
    isPreviewDebugEnabled()
      && debugContext?.isReadOnly
      && debugContext.actor.isSuperAdmin
      && debugContext.activeView?.userId === context.user.id
      && context.isCoach,
  );
  if (debugContext?.isReadOnly && (!isWritableCoachPreview || directorWrite)) {
    return { ok: false, code: "read_only", message: "El modo Ver como es de solo lectura para esta accion." };
  }
  const coachId = directorWrite ? clean(formData, "coachId") : context.coachId!;
  const trainingGroupId = clean(formData, "trainingGroupId");
  const squadId = clean(formData, "squadId");
  const weekStart = clean(formData, "weekStart");
  const tournamentId = clean(formData, "tournamentId");
  const isRest = clean(formData, "isRest") === "yes";
  const notes = clean(formData, "notes");
  if (!isUuid(coachId) || !isUuid(trainingGroupId) || !isUuid(squadId) || !isUuid(tournamentId) || !isMonday(weekStart) || notes.length > 500) {
    return { ok: false, code: "invalid_context", message: "Revisa la semana, el torneo y los datos capturados." };
  }

  let games: SubmittedGame[];
  try {
    const raw = JSON.parse(clean(formData, "games") || "[]") as unknown;
    if (!Array.isArray(raw)) throw new Error("invalid_games");
    games = raw.map((game) => {
      if (!game || typeof game !== "object") throw new Error("invalid_game");
      const value = game as Record<string, unknown>;
      if (!Array.isArray(value.players)) throw new Error("invalid_players");
      const players = value.players.map((player) => {
        if (!player || typeof player !== "object") throw new Error("invalid_player");
        const row = player as Record<string, unknown>;
        const enrollmentId = String(row.enrollmentId ?? "").trim();
        const playerId = String(row.playerId ?? "").trim();
        const playerName = String(row.playerName ?? "").trim();
        const rosterStatus = String(row.rosterStatus ?? "").trim();
        if (!isUuid(enrollmentId) || !isUuid(playerId) || !playerName || (rosterStatus !== "included" && rosterStatus !== "excluded")) throw new Error("invalid_player");
        return { enrollment_id: enrollmentId, player_id: playerId, player_name: playerName, roster_status: rosterStatus } as SubmittedGame["players"][number];
      });
      if (new Set(players.map((player) => player.enrollment_id)).size !== players.length) throw new Error("duplicate_player");
      return {
        id: value.id ? String(value.id).trim() : null,
        match_date: String(value.matchDate ?? "").trim(),
        arrival_time: String(value.arrivalTime ?? "").trim(),
        venue: String(value.venue ?? "").trim(),
        opponent: String(value.opponent ?? "").trim(),
        squad_id: String(value.squadId ?? "").trim(),
        players,
      };
    });
  } catch {
    return { ok: false, code: "invalid_games", message: "No se pudieron leer los partidos capturados." };
  }
  if (games.length > 3 || (isRest ? games.length !== 0 : games.length < 1)) {
    return { ok: false, code: "invalid_game_count", message: isRest ? "Un equipo que descansa no debe tener partidos." : "Captura entre uno y tres partidos." };
  }
  if (games.some((game) => (game.id !== null && !isUuid(game.id)) || !isUuid(game.squad_id) || !game.match_date || !game.arrival_time || !game.venue || !game.opponent || !game.players.length || !game.players.some((player) => player.roster_status === "included"))) {
    return { ok: false, code: "incomplete_game", message: "Cada partido necesita equipo, al menos un convocado, fecha, hora de cita, sede y rival." };
  }

  const admin = createAdminClient();
  const actorUserId = isWritableCoachPreview ? debugContext!.actor.id : context.user.id;
  const sharedArgs = {
    p_actor_user_id: actorUserId,
    p_coach_id: coachId,
    p_week_start: weekStart,
    p_training_group_id: trainingGroupId,
    p_competition_roster_squad_id: squadId,
    p_tournament_id: tournamentId,
    p_is_rest: isRest,
    p_notes: notes || null,
    p_games: games,
  };
  const result = directorWrite
    ? await admin.rpc("save_staff_weekly_schedule_report_v1", sharedArgs)
    : await admin.rpc("save_coach_weekly_schedule_report_v3", {
        ...sharedArgs,
        p_effective_user_id: context.user.id,
      });
  if (result.error) {
    console.error("[coach-schedule] save failed", result.error);
    const code = databaseErrorCode(result.error);
    const refreshedRoster = code === "game_roster_changed" || code === "invalid_game_players"
      ? await loadFreshSquadRoster(admin, squadId)
      : undefined;
    return {
      ok: false,
      code,
      message: DATABASE_ERROR_MESSAGES[code] ?? (directorWrite
        ? "No se pudo guardar el horario. Tus datos siguen en pantalla; revisa los campos marcados o la asignacion del profesor."
        : "No se pudo guardar el horario. Tus datos siguen en pantalla; revisa los campos marcados o pide a administracion verificar tu equipo."),
      refreshedRoster,
    };
  }
  await writeAuditLog(admin, {
    actorUserId,
    actorEmail: isWritableCoachPreview ? debugContext!.actor.email : context.user.email,
    action: directorWrite ? "coach_schedule.director_saved" : "coach_schedule.report_saved",
    tableName: "coach_weekly_schedule_reports",
    recordId: typeof result.data === "string" ? result.data : null,
    afterData: {
      training_group_id: trainingGroupId,
      competition_roster_squad_id: squadId,
      week_start: weekStart,
      tournament_id: tournamentId,
      coach_id: coachId,
      effective_user_id: context.user.id,
      debug_impersonation: isWritableCoachPreview,
      write_mode: writeMode,
      is_rest: isRest,
      game_count: games.length,
      included_player_count: games.reduce((sum, game) => sum + game.players.filter((player) => player.roster_status === "included").length, 0),
      excluded_player_count: games.reduce((sum, game) => sum + game.players.filter((player) => player.roster_status === "excluded").length, 0),
    },
  });
  revalidatePath("/convocatorias");
  return {
    ok: true,
    message: "Horario reportado. Administracion ya puede usarlo en la convocatoria.",
    savedAt: new Date().toISOString(),
    report: {
      tournamentId,
      isRest,
      notes,
      games: games.map((game) => ({
        id: game.id,
        matchDate: game.match_date,
        arrivalTime: game.arrival_time.slice(0, 5),
        venue: game.venue,
        opponent: game.opponent,
        squadId: game.squad_id,
        players: game.players.map((player) => ({
          enrollmentId: player.enrollment_id,
          playerId: player.player_id,
          playerName: player.player_name,
          rosterStatus: player.roster_status,
        })),
      })),
    },
  };
}
