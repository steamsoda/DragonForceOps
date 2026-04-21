export function getSupabaseEnv() {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL ??
    process.env.SUPABASE_URL ??
    process.env.VITE_SUPABASE_URL;
  const publicKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.SUPABASE_PUBLISHABLE_KEY ??
    process.env.SUPABASE_ANON_KEY ??
    process.env.VITE_SUPABASE_ANON_KEY;

  if (!url || !publicKey) {
    throw new Error(
      "Missing Supabase URL/key env vars. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or anon key)."
    );
  }

  return { url, publicKey };
}

type SupabaseServiceRoleDiagnostics = {
  urlProjectRef: string | null;
  serviceRoleJwtRole: string | null;
  serviceRoleJwtRef: string | null;
  serviceRoleIssuer: string | null;
  hasUrl: boolean;
  hasServiceRoleKey: boolean;
};

function decodeBase64UrlJson(value: string) {
  try {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    return JSON.parse(Buffer.from(padded, "base64").toString("utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function getSupabaseProjectRefFromUrl(url: string | null | undefined) {
  if (!url) return null;

  try {
    const hostname = new URL(url).hostname;
    const [projectRef, ...rest] = hostname.split(".");
    if (rest.join(".").startsWith("supabase.")) return projectRef || null;
  } catch {
    return null;
  }

  return null;
}

export function getSupabaseServiceRoleDiagnostics(
  url: string | null | undefined,
  serviceRoleKey: string | null | undefined
): SupabaseServiceRoleDiagnostics {
  const payload = serviceRoleKey ? decodeBase64UrlJson(serviceRoleKey.split(".")[1] ?? "") : null;

  return {
    urlProjectRef: getSupabaseProjectRefFromUrl(url),
    serviceRoleJwtRole: typeof payload?.role === "string" ? payload.role : null,
    serviceRoleJwtRef: typeof payload?.ref === "string" ? payload.ref : null,
    serviceRoleIssuer: typeof payload?.iss === "string" ? payload.iss : null,
    hasUrl: Boolean(url),
    hasServiceRoleKey: Boolean(serviceRoleKey),
  };
}

export function assertSupabaseServiceRoleMatchesUrl(url: string, serviceRoleKey: string) {
  const diagnostics = getSupabaseServiceRoleDiagnostics(url, serviceRoleKey);

  if (
    diagnostics.urlProjectRef &&
    diagnostics.serviceRoleJwtRef &&
    diagnostics.urlProjectRef !== diagnostics.serviceRoleJwtRef
  ) {
    console.error("[supabase-env] service role key project mismatch", diagnostics);
    throw new Error(
      `Supabase env mismatch: URL project ${diagnostics.urlProjectRef} does not match service-role key project ${diagnostics.serviceRoleJwtRef}.`
    );
  }

  if (!diagnostics.serviceRoleJwtRef) {
    console.warn("[supabase-env] service role key project ref could not be verified", diagnostics);
  }
}
