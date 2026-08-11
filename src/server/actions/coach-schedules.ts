"use server";

import { revalidatePath } from "next/cache";
import { getDebugViewContext, isPreviewDebugEnabled } from "@/lib/auth/debug-view";
import { getPermissionContext } from "@/lib/auth/permissions";
import { writeAuditLog } from "@/lib/audit";
import { createAdminClient } from "@/lib/supabase/admin";

export type CoachScheduleActionState =
  | { ok: false; message: string }
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

export async function saveCoachScheduleAction(
  _previous: CoachScheduleActionState,
  formData: FormData,
): Promise<CoachScheduleActionState> {
  const debugContext = await getDebugViewContext();
  const context = await getPermissionContext();
  if (!context?.hasCoachScheduleAccess || !context.coachId) {
    return { ok: false, message: "Tu cuenta no esta vinculada a un coach activo." };
  }
  const isWritableCoachPreview = Boolean(
    isPreviewDebugEnabled()
      && debugContext?.isReadOnly
      && debugContext.actor.isSuperAdmin
      && debugContext.activeView?.userId === context.user.id
      && context.isCoach,
  );
  if (debugContext?.isReadOnly && !isWritableCoachPreview) {
    return { ok: false, message: "El modo Ver como es de solo lectura para esta accion." };
  }
  const trainingGroupId = clean(formData, "trainingGroupId");
  const squadId = clean(formData, "squadId");
  const weekStart = clean(formData, "weekStart");
  const tournamentId = clean(formData, "tournamentId");
  const isRest = clean(formData, "isRest") === "yes";
  const notes = clean(formData, "notes");
  if (!isUuid(trainingGroupId) || !isUuid(squadId) || !isUuid(tournamentId) || !isMonday(weekStart) || notes.length > 500) {
    return { ok: false, message: "Revisa la semana, el torneo y los datos capturados." };
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
    return { ok: false, message: "No se pudieron leer los partidos capturados." };
  }
  if (games.length > 3 || (isRest ? games.length !== 0 : games.length < 1)) {
    return { ok: false, message: isRest ? "Un grupo que descansa no debe tener partidos." : "Captura entre uno y tres partidos." };
  }
  if (games.some((game) => (game.id !== null && !isUuid(game.id)) || !isUuid(game.squad_id) || !game.match_date || !game.arrival_time || !game.venue || !game.opponent || !game.players.length || !game.players.some((player) => player.roster_status === "included"))) {
    return { ok: false, message: "Cada partido necesita equipo, al menos un convocado, fecha, hora de cita, sede y rival." };
  }

  const admin = createAdminClient();
  const actorUserId = isWritableCoachPreview ? debugContext!.actor.id : context.user.id;
  const result = await admin.rpc("save_coach_weekly_schedule_report_v3", {
    p_actor_user_id: actorUserId,
    p_effective_user_id: context.user.id,
    p_coach_id: context.coachId,
    p_week_start: weekStart,
    p_training_group_id: trainingGroupId,
    p_competition_roster_squad_id: squadId,
    p_tournament_id: tournamentId,
    p_is_rest: isRest,
    p_notes: notes || null,
    p_games: games,
  });
  if (result.error) {
    console.error("[coach-schedule] save failed", result.error);
    return { ok: false, message: "No se pudo guardar. Confirma que el grupo siga asignado a tu cuenta y que las fechas pertenezcan a esa semana." };
  }
  await writeAuditLog(admin, {
    actorUserId,
    actorEmail: isWritableCoachPreview ? debugContext!.actor.email : context.user.email,
    action: "coach_schedule.report_saved",
    tableName: "coach_weekly_schedule_reports",
    recordId: typeof result.data === "string" ? result.data : null,
    afterData: {
      training_group_id: trainingGroupId,
      competition_roster_squad_id: squadId,
      week_start: weekStart,
      tournament_id: tournamentId,
      coach_id: context.coachId,
      effective_user_id: context.user.id,
      debug_impersonation: isWritableCoachPreview,
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
