"use server";

import { revalidatePath } from "next/cache";
import { isDebugWriteBlocked } from "@/lib/auth/debug-view";
import { getPermissionContext } from "@/lib/auth/permissions";
import {
  canUsePlayerNotes,
  getPlayerNotesForPlayer,
  resolvePlayerNoteTarget,
  type PlayerNote,
} from "@/lib/queries/player-notes";
import { createAdminClient } from "@/lib/supabase/admin";

export type CreatePlayerNoteResult =
  | { ok: true; notes: PlayerNote[] }
  | { ok: false; error: "debug_read_only" | "unauthorized" | "invalid_form" | "insert_failed" };

export async function createPlayerNoteAction({
  playerId,
  enrollmentId,
  body,
  sourceSurface,
}: {
  playerId: string;
  enrollmentId?: string | null;
  body: string;
  sourceSurface: "player_profile" | "caja";
}): Promise<CreatePlayerNoteResult> {
  if (await isDebugWriteBlocked()) return { ok: false, error: "debug_read_only" };

  const noteBody = body.trim().replace(/\s+\n/g, "\n").slice(0, 2000);
  if (!playerId || !noteBody) return { ok: false, error: "invalid_form" };

  const context = await getPermissionContext();
  if (!canUsePlayerNotes(context)) return { ok: false, error: "unauthorized" };

  const target = await resolvePlayerNoteTarget({ playerId, enrollmentId, context });
  if (!target) return { ok: false, error: "unauthorized" };

  const admin = createAdminClient();
  const { error } = await admin.from("player_notes").insert({
    player_id: target.playerId,
    enrollment_id: target.enrollmentId,
    campus_id: target.campusId,
    source_surface: sourceSurface,
    body: noteBody,
    created_by: context!.user.id,
    created_by_email: context!.user.email,
  });

  if (error) {
    console.error("[player-notes] insert failed", error);
    return { ok: false, error: "insert_failed" };
  }

  revalidatePath(`/players/${target.playerId}`);
  revalidatePath(`/caja`);

  const notes = await getPlayerNotesForPlayer(target.playerId, {
    enrollmentId: target.enrollmentId,
    limit: sourceSurface === "caja" ? 5 : 20,
    context,
  });

  return { ok: true, notes };
}
