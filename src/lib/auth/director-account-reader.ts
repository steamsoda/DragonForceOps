import "server-only";
import { z } from "zod";
import type { PermissionContext } from "./permissions";
import { canAccessCampus } from "./campuses";
import { directorReadOnlyEnabled } from "./director-readonly-policy";
import { createAdminClient } from "@/lib/supabase/admin";

const idSchema = z.string().uuid();
const ledgerTables = new Set([
  "enrollments", "charges", "payments", "enrollment_incidents", "campuses",
  "v_enrollment_balances", "v_enrollment_credit_balances", "payment_allocations",
  "enrollment_credit_applications", "charge_cash_refunds", "payment_refunds",
  "charge_cash_refund_sources", "enrollment_credits", "uniform_orders", "charge_types",
]);

// For the canonical server ledger only. Never accept table names or select expressions from a request.
export async function directorAccountReader(context: PermissionContext, enrollmentId: string) {
  if (!idSchema.safeParse(enrollmentId).success || !context.isDirectorReadOnly || !directorReadOnlyEnabled()) return null;
  // Recheck the actual session, not a presentation/debug role or a stale role cache.
  const { data: authorized, error: roleError } = await context.supabase.rpc("is_director_readonly");
  if (roleError || authorized !== true) return null;
  const { data: enrollment, error } = await context.supabase
    .from("v_director_readonly_enrollments")
    .select("id,campus_id")
    .eq("id", enrollmentId)
    .maybeSingle<{ id: string; campus_id: string }>();
  if (error || !enrollment || !canAccessCampus(context.campusAccess, enrollment.campus_id)) return null;

  const admin = createAdminClient();
  return {
    from(table: string) {
      if (!ledgerTables.has(table)) throw new Error("unsupported_account_relation");
      // Only SELECT is exposed. Ledger code scopes direct rows by this enrollment
      // and child rows by the resulting charge/payment IDs; no RPC or writes here.
      const relation = admin.from(table);
      return { select: relation.select.bind(relation) };
    },
  };
}
