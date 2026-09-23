"use server";

import { revalidatePath } from "next/cache";
import { getPermissionContext } from "@/lib/auth/permissions";
import { isDebugWriteBlocked } from "@/lib/auth/debug-view";
import { createAdminClient } from "@/lib/supabase/admin";
import type { CoachDirectory, CoachGroupCommand } from "@/lib/coaches/types";
import { formatTrainingGroupDisplayName } from "@/lib/training-groups/shared";

type Command =
  | { operation: "save"; id: string | null; expected: string | null; firstName: string; lastName: string; campusId: string }
  | { operation: "assign"; groups: CoachGroupCommand[]; reason: string }
  | { operation: "depart"; id: string; expected: string; groups: CoachGroupCommand[]; reason: string }
  | { operation: "retry"; id: string };
type Result = { ok: true; providerPending: boolean } | { ok: false; message: string };

export async function loadCoachDirectory(): Promise<CoachDirectory> {
  const context = await getPermissionContext();
  if (!context || (!context.isDirector && !context.isSportsDirector && !context.isDirectorReadOnly)) throw new Error("unauthorized");
  const { data, error } = await createAdminClient().rpc("profesor_directory", { p_actor: context.user.id });
  if (error || !data) throw new Error("No se pudo cargar Profesores.");
  const result = data as CoachDirectory;
  result.groups = result.groups.map(group => ({ ...group, name: formatTrainingGroupDisplayName({ name: group.name, program: group.program }) }));
  if (await isDebugWriteBlocked()) return { ...result, canManage: false, canLifecycle: false };
  return result;
}

export async function manageCoachAction(command: Command): Promise<Result> {
  const context = await getPermissionContext();
  if (!context || await isDebugWriteBlocked() || (!context.isDirector && !context.isSportsDirector)) return { ok: false, message: "No tienes permiso para modificar profesores." };
  if (!command || !["save", "assign", "depart", "retry"].includes(command.operation)) return { ok: false, message: "Operacion invalida." };
  if (command.operation !== "assign" && !context.isSuperAdmin) return { ok: false, message: "Esta operacion requiere Superadmin." };
  const admin = createAdminClient();
  let linked: string | null = null;
  let error: { message: string } | null = null;
  if (command.operation === "save") {
    ({ error } = await admin.rpc("save_coach", { p_actor: context.user.id, p_id: command.id, p_expected: command.expected, p_first: command.firstName, p_last: command.lastName, p_campus: command.campusId }));
  } else if (command.operation === "assign") {
    ({ error } = await admin.rpc("manage_coach_groups", { p_actor: context.user.id, p_commands: command.groups, p_reason: command.reason }));
  } else if (command.operation === "depart") {
    const result = await admin.rpc("depart_coach", { p_actor: context.user.id, p_id: command.id, p_expected: command.expected, p_commands: command.groups, p_reason: command.reason });
    error = result.error; linked = typeof result.data === "string" ? result.data : null;
  } else {
    const result = await admin.from("invicta_account_blocks").select("user_id").eq("coach_id", command.id).maybeSingle<{ user_id: string }>();
    if (result.error || !result.data || result.data.user_id === context.user.id) return { ok: false, message: "No hay una revocacion pendiente para este profesor." };
    linked = result.data.user_id;
  }
  if (error) {
    const messages: Record<string, string> = {
      stale_coach: "Los datos cambiaron. Cierra el panel y actualiza antes de continuar.",
      stale_coach_assignments: "Las asignaciones cambiaron. Actualiza y revisa nuevamente.",
      duplicate_coach_review: "Ya existe un profesor con ese nombre. Revisa el registro existente; no se crearon duplicados.",
      protected_coach_account: "Esta cuenta esta protegida o requiere revisar su vinculacion. No se hizo la baja.",
      resolve_all_training_groups: "Debes resolver todos los grupos antes de dar de baja.",
      stale_coach_tournaments: "Los equipos o sus profesores cambiaron. Actualiza y revisa el impacto en torneos antes de confirmar nuevamente.",
      cross_campus_tournament_review: "Hay un equipo vinculado a grupos de otro campus. Revisa esa vinculacion antes de continuar; no se guardo ningun cambio.",
    };
    return { ok: false, message: messages[error.message] ?? "No se guardaron los cambios. Revisa los permisos, grupos y profesor seleccionado." };
  }
  let providerPending = false;
  if (linked) {
    // Local denial was committed first. A provider outage must never restore access.
    try {
      const result = await admin.auth.admin.updateUserById(linked, { ban_duration: "876000h" });
      providerPending = Boolean(result.error);
    } catch { providerPending = true; }
    const recorded = await admin.from("invicta_account_blocks").update({ provider_error: providerPending, provider_revoked_at: providerPending ? null : new Date().toISOString() }).eq("user_id", linked);
    providerPending ||= Boolean(recorded.error);
  }
  for (const path of ["/profesores", "/attendance", "/attendance/settings", "/attendance/schedules", "/convocatorias", "/sports-signups", "/mis-horarios", "/admin/users"]) revalidatePath(path);
  return { ok: true, providerPending };
}
