"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { assertDebugWritesAllowed } from "@/lib/auth/debug-view";
import { createClient } from "@/lib/supabase/server";
import { writeAuditLog } from "@/lib/audit";

type AuditLogLookup = {
  id: string;
  action: string;
  record_id: string | null;
  after_data: Record<string, unknown> | null;
  reversed_at: string | null;
};

async function assertSuperadmin(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string
): Promise<boolean> {
  const { data } = await supabase
    .from("user_roles")
    .select("app_roles(code)")
    .eq("user_id", userId)
    .returns<{ app_roles: { code: string } | null }[]>();
  return (data ?? []).some((r) => r.app_roles?.code === "superadmin");
}

function normalizeConfirmationName(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("es-MX");
}

// ── Reverse audit log entry ────────────────────────────────────────────────────

export async function reverseAuditLogEntryAction(formData: FormData): Promise<void> {
  const logId = formData.get("log_id")?.toString().trim() ?? "";
  if (!logId) redirect("/admin/actividad?err=invalid_form");
  await assertDebugWritesAllowed("/admin/actividad");

  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) redirect("/admin/actividad?err=unauthenticated");
  if (!(await assertSuperadmin(supabase, user.id))) redirect("/admin/actividad?err=unauthorized");

  const { data: log } = await supabase
    .from("audit_logs")
    .select("id, action, record_id, after_data, reversed_at")
    .eq("id", logId)
    .maybeSingle<AuditLogLookup>();

  if (!log)          redirect("/admin/actividad?err=log_not_found");
  if (log.reversed_at) redirect("/admin/actividad?err=already_reversed");
  if (!log.record_id)  redirect("/admin/actividad?err=no_record_id");

  const recordId = log.record_id;
  const enrollmentId =
    typeof log.after_data?.enrollment_id === "string" ? log.after_data.enrollment_id : null;

  if (log.action === "payment.posted") {
    await supabase.from("payment_allocations").delete().eq("payment_id", recordId);
    const { error } = await supabase.from("payments").update({ status: "void" }).eq("id", recordId);
    if (error) redirect("/admin/actividad?err=reverse_failed");
    await writeAuditLog(supabase, {
      actorUserId: user.id,
      actorEmail: user.email ?? null,
      action: "payment.voided",
      tableName: "payments",
      recordId,
      afterData: { enrollment_id: enrollmentId, reason: "Revertido desde Auditoría — superadmin" }
    });
  } else if (log.action === "charge.created") {
    const { error } = await supabase.from("charges").update({ status: "void" }).eq("id", recordId);
    if (error) redirect("/admin/actividad?err=reverse_failed");
    await writeAuditLog(supabase, {
      actorUserId: user.id,
      actorEmail: user.email ?? null,
      action: "charge.voided",
      tableName: "charges",
      recordId,
      afterData: { enrollment_id: enrollmentId, reason: "Revertido desde Auditoría — superadmin" }
    });
  } else {
    redirect("/admin/actividad?err=not_reversible");
  }

  // Stamp the original entry as reversed
  await supabase
    .from("audit_logs")
    .update({ reversed_at: new Date().toISOString(), reversed_by: user.id })
    .eq("id", logId);

  revalidatePath("/admin/actividad");
  redirect("/admin/actividad?ok=reversed");
}

// ── Nuke player ───────────────────────────────────────────────────────────────

export async function nukePlayerAction(formData: FormData): Promise<void> {
  const playerId    = formData.get("player_id")?.toString().trim()    ?? "";
  const confirmName = formData.get("confirm_name")?.toString().trim() ?? "";

  if (!playerId) redirect("/players?err=invalid");
  await assertDebugWritesAllowed(`/players/${playerId}/nuke`);

  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) redirect(`/players/${playerId}/nuke?err=unauthenticated`);
  if (!(await assertSuperadmin(supabase, user.id))) redirect(`/players/${playerId}/nuke?err=unauthorized`);

  const { data: player } = await supabase
    .from("players")
    .select("id, first_name, last_name")
    .eq("id", playerId)
    .maybeSingle<{ id: string; first_name: string; last_name: string }>();

  if (!player) redirect(`/players/${playerId}/nuke?err=player_not_found`);

  const actualName = `${player.first_name} ${player.last_name}`;
  if (!confirmName || normalizeConfirmationName(confirmName) !== normalizeConfirmationName(actualName)) {
    redirect(`/players/${playerId}/nuke?err=name_mismatch`);
  }

  // Write audit trail BEFORE deleting (so the record exists)
  await writeAuditLog(supabase, {
    actorUserId: user.id,
    actorEmail: user.email ?? null,
    action: "player.nuked",
    tableName: "players",
    recordId: playerId,
    afterData: {
      player_name: `${player.first_name} ${player.last_name}`,
      reason: "Superadmin nuke"
    }
  });

  const { error } = await supabase.rpc("nuke_player", { p_player_id: playerId });
  if (error) {
    redirect(`/players/${playerId}/nuke?err=nuke_failed`);
  }

  redirect("/players?ok=nuked");
}
