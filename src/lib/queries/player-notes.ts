import {
  canAccessAttendanceCampus,
  canAccessCampus,
} from "@/lib/auth/campuses";
import { getPermissionContext, type PermissionContext } from "@/lib/auth/permissions";
import { createAdminClient } from "@/lib/supabase/admin";

export type PlayerNote = {
  id: string;
  playerId: string;
  enrollmentId: string | null;
  campusId: string;
  sourceSurface: "player_profile" | "caja";
  body: string;
  createdBy: string;
  createdByEmail: string | null;
  createdAt: string;
};

type EnrollmentTargetRow = {
  id: string;
  player_id: string;
  campus_id: string;
  status: string;
  start_date: string;
  end_date: string | null;
};

type PlayerNoteRow = {
  id: string;
  player_id: string;
  enrollment_id: string | null;
  campus_id: string;
  source_surface: "player_profile" | "caja";
  body: string;
  created_by: string;
  created_by_email: string | null;
  created_at: string;
};

export type PlayerNoteTarget = {
  playerId: string;
  enrollmentId: string | null;
  campusId: string;
};

function mapNote(row: PlayerNoteRow): PlayerNote {
  return {
    id: row.id,
    playerId: row.player_id,
    enrollmentId: row.enrollment_id,
    campusId: row.campus_id,
    sourceSurface: row.source_surface,
    body: row.body,
    createdBy: row.created_by,
    createdByEmail: row.created_by_email,
    createdAt: row.created_at,
  };
}

export function canUsePlayerNotes(context: PermissionContext | null | undefined) {
  return Boolean(
    context &&
      (context.hasPlayerRosterAccess ||
        context.hasPlayerDataAccess ||
        context.hasOperationalAccess ||
        context.hasAttendanceReadAccess)
  );
}

export function canAccessPlayerNoteCampus(
  context: PermissionContext | null | undefined,
  campusId: string | null | undefined,
) {
  if (!context || !campusId) return false;
  return (
    canAccessCampus(context.campusAccess, campusId) ||
    canAccessAttendanceCampus(context.attendanceCampusAccess, campusId)
  );
}

export async function resolvePlayerNoteTarget({
  playerId,
  enrollmentId,
  context,
}: {
  playerId: string;
  enrollmentId?: string | null;
  context?: PermissionContext | null;
}): Promise<PlayerNoteTarget | null> {
  const resolvedContext = context ?? (await getPermissionContext());
  if (!canUsePlayerNotes(resolvedContext)) return null;

  const admin = createAdminClient();
  let query = admin
    .from("enrollments")
    .select("id, player_id, campus_id, status, start_date, end_date")
    .eq("player_id", playerId);

  if (enrollmentId) {
    query = query.eq("id", enrollmentId);
  }

  const { data, error } = await query.returns<EnrollmentTargetRow[]>();
  if (error) {
    console.error("[player-notes] target lookup failed", error);
    return null;
  }

  const rows = (data ?? []).filter((row) => canAccessPlayerNoteCampus(resolvedContext, row.campus_id));
  if (rows.length === 0) return null;

  const selected =
    rows.find((row) => row.status === "active") ??
    [...rows].sort((a, b) => {
      const left = a.end_date ?? a.start_date;
      const right = b.end_date ?? b.start_date;
      return right.localeCompare(left);
    })[0];

  return {
    playerId: selected.player_id,
    enrollmentId: selected.id,
    campusId: selected.campus_id,
  };
}

export async function getPlayerNotesForPlayer(
  playerId: string,
  options: { enrollmentId?: string | null; limit?: number; context?: PermissionContext | null } = {},
) {
  const resolvedContext = options.context ?? (await getPermissionContext());
  const target = await resolvePlayerNoteTarget({
    playerId,
    enrollmentId: options.enrollmentId,
    context: resolvedContext,
  });
  if (!target) return [];

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("player_notes")
    .select("id, player_id, enrollment_id, campus_id, source_surface, body, created_by, created_by_email, created_at")
    .eq("player_id", target.playerId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(options.limit ?? 20)
    .returns<PlayerNoteRow[]>();

  if (error) {
    console.error("[player-notes] note lookup failed", error);
    return [];
  }

  return (data ?? [])
    .filter((row) => canAccessPlayerNoteCampus(resolvedContext, row.campus_id))
    .map(mapNote);
}

export async function getPlayerNotesForCaja(
  playerId: string | null,
  enrollmentId: string,
  context?: PermissionContext | null,
) {
  if (!playerId) return [];
  return getPlayerNotesForPlayer(playerId, { enrollmentId, limit: 5, context });
}
