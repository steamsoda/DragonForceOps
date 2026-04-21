import { createClient } from "@supabase/supabase-js";
import { assertSupabaseServiceRoleMatchesUrl } from "@/lib/supabase/env";

/**
 * Service-role Supabase client — bypasses RLS.
 * Only for use in trusted server contexts (cron jobs, admin scripts).
 * Never expose to client-side code.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY or Supabase URL env var.");
  }

  assertSupabaseServiceRoleMatchesUrl(url, serviceRoleKey);

  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

export function tryCreateAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    return null;
  }

  try {
    assertSupabaseServiceRoleMatchesUrl(url, serviceRoleKey);
  } catch (error) {
    console.error("[supabase-env] admin client disabled due to invalid Supabase env", error);
    return null;
  }

  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}
