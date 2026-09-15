"use server";

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { getPermissionContext } from '@/lib/auth/permissions';
import { assertDebugWritesAllowed } from '@/lib/auth/debug-view';
import type { GroupChangeOptions, GroupSearchPlayer } from '@/lib/training-groups/quick-change';

async function access() {
  const c = await getPermissionContext();
  if (!c || c.isDirectorReadOnly || c.roleCodes.includes('porto_viewer') ||
    !(c.isDirector || c.isSportsDirector || c.isAttendanceAdmin || c.isOfficeAdmin || c.isFrontDesk)) throw Error('forbidden');
  return c;
}
export async function searchGroupChangePlayers(search: string): Promise<{ players: GroupSearchPlayer[]; error?: string }> {
  try {
    const c = await access();
    const term = z.string().trim().min(2).max(100).parse(search);
    const { data, error } = await c.supabase.rpc('search_group_change_players', { p_search: term });
    if (error) throw error;
    return { players: data ?? [] };
  } catch { return { players: [], error: 'No se pudo buscar. Revisa tu acceso o intenta de nuevo.' }; }
}
export async function getGroupChangeOptions(playerId: string): Promise<{ data?: GroupChangeOptions; error?: string }> {
  try {
    const c = await access();
    const { data, error } = await c.supabase.rpc('get_group_change_options', { p_player: z.string().uuid().parse(playerId) });
    if (error || !data) throw error;
    return { data };
  } catch { return { error: 'No se pudieron cargar los grupos. Revisa tu acceso o intenta de nuevo.' }; }
}
export async function quickChangeTrainingGroup(input: { enrollmentId: string; assignmentId: string | null; targetId: string }) {
  try {
    await assertDebugWritesAllowed('/players');
    const c = await access();
    const parsed = z.object({ enrollmentId: z.string().uuid(), assignmentId: z.string().uuid().nullable(), targetId: z.string().uuid() }).strict().parse(input);
    const { error } = await c.supabase.rpc('quick_change_training_group', {
      p_enrollment: parsed.enrollmentId, p_assignment: parsed.assignmentId, p_target: parsed.targetId,
    });
    if (error) return { ok: false, error: error.message.includes('assignment_changed')
      ? 'El grupo cambio mientras lo revisabas. Cierra y vuelve a abrir el panel.'
      : 'No se pudo cambiar el grupo. Revisa la inscripcion y el destino antes de reintentar.' };
    for (const path of ['/players','/caja','/attendance','/attendance/groups','/attendance/reports','/sports-signups','/convocatorias']) revalidatePath(path);
    return { ok: true };
  } catch { return { ok: false, error: 'No tienes permiso para guardar este cambio.' }; }
}
