import "server-only";
import { redirect } from "next/navigation";
import { getPermissionContext, requireOperationalContext } from "./permissions";
import { directorReadOnlyEnabled } from "./director-readonly-policy";

// Page-read admission only. Never use this in mutation actions. Each loader must
// additionally check the requested player/enrollment scope before privileged reads.
export async function requireOperationalPageReader() {
  const context = await getPermissionContext();
  if (!context?.isDirectorReadOnly) return requireOperationalContext("/unauthorized");
  if (!directorReadOnlyEnabled()) redirect("/unauthorized");
  const { data, error } = await context.supabase.rpc("is_director_readonly");
  if (error || data !== true) redirect("/unauthorized");
  return context;
}

export async function requireDirectorPageReader() {
  const context = await requireOperationalPageReader();
  if (!context.isDirectorReadOnly && !context.isDirector) redirect("/unauthorized");
  return context;
}
