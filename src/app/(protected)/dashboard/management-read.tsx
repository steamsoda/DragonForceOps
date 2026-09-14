import "server-only";
import { z } from "zod";
import { getPermissionContext } from "@/lib/auth/permissions";
import { PageShell } from "@/components/ui/page-shell";
import { assembleManagementData } from "./management-adapters";

// Fixed TS modes, assembled from barrier views; these names are not DB RPC calls.
type ManagementReadMode = "director_readonly_caja_v1" | "director_readonly_intake_v1" | "director_readonly_contacts_v1" | "director_readonly_dashboard_v1" | "director_readonly_trials_v1" | "director_readonly_uniforms_v1";

export async function readManagementData<T extends z.ZodTypeAny>(
  mode: ManagementReadMode, filters: Record<string, string | undefined>, schema: T,
): Promise<z.infer<T> | null> {
  const context = await getPermissionContext();
  if (!context?.isDirectorReadOnly || context.canViewFinancials !== false) return null;
  // Never fall back to staff loaders, admin clients, or raw tables.
  try {
    const data = await assembleManagementData(mode, filters, context);
    const parsed = schema.safeParse(data);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function ManagementReadUnavailable({ title }: { title: string }) {
  return <PageShell title={title} subtitle="Solo lectura">
    <p role="status" className="py-6 text-sm text-slate-600 dark:text-slate-300">La consulta no financiera de esta seccion aun no esta disponible.</p>
  </PageShell>;
}
