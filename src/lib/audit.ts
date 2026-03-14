import type { SupabaseClient } from "@supabase/supabase-js";

type AuditEntry = {
  actorUserId: string;
  actorEmail?: string | null;
  action: string;
  tableName: string;
  recordId?: string | null;
  afterData?: Record<string, unknown> | null;
};

/**
 * Writes a single row to audit_logs.
 * Errors are silently swallowed — audit failures must never block the main operation.
 */
export async function writeAuditLog(supabase: SupabaseClient, entry: AuditEntry): Promise<void> {
  try {
    await supabase.from("audit_logs").insert({
      actor_user_id: entry.actorUserId,
      actor_email: entry.actorEmail ?? null,
      action: entry.action,
      table_name: entry.tableName,
      record_id: entry.recordId ?? null,
      after_data: entry.afterData ?? null,
      before_data: null
    });
  } catch {
    // intentionally swallowed
  }
}
