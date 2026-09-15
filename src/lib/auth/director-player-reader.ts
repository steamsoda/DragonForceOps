import "server-only";
import { z } from "zod";
import type { PermissionContext } from "./permissions";
import { canAccessCampus } from "./campuses";
import { directorReadOnlyEnabled } from "./director-readonly-policy";
import { createAdminClient } from "@/lib/supabase/admin";

// Only the canonical profile loader consumes this facade. Filters are applied here,
// before callers can add more filters; no RPC or mutation methods are exposed.
export async function directorPlayerReader(context: PermissionContext, playerId: string) {
  if (!z.string().uuid().safeParse(playerId).success || !context.isDirectorReadOnly || !directorReadOnlyEnabled()) return null;
  const role = await context.supabase.rpc("is_director_readonly");
  if (role.error || role.data !== true) return null;
  const result = await context.supabase.from("v_director_readonly_enrollments")
    .select("id,campus_id").eq("player_id", playerId).limit(1000);
  if (result.error || !result.data || result.data.length >= 1000) return null;
  const ids = result.data.filter(row => canAccessCampus(context.campusAccess, row.campus_id)).map(row => row.id);
  if (!ids.length) return null;
  const admin = createAdminClient();
  const playerTables = new Set(["players", "player_guardians", "player_notes"]);
  const enrollmentTables = new Set(["team_assignments", "training_group_assignments", "enrollment_incidents", "v_enrollment_balances"]);
  return {
    from(table: string) {
      if (!playerTables.has(table) && !enrollmentTables.has(table) && table !== "enrollments") throw new Error("unsupported_profile_relation");
      const relation = admin.from(table);
      const select = ((columns: string) => {
          const query = admin.from(table).select(columns).throwOnError();
          if (table === "players") return query.eq("id", playerId);
          if (table === "enrollments") return query.eq("player_id", playerId).in("id", ids);
          if (playerTables.has(table)) return query.eq("player_id", playerId);
          return query.in("enrollment_id", ids);
        }) as typeof relation.select;
      return { select };
    },
  };
}
