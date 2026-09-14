export function directorReadOnlyEnabled(env: NodeJS.ProcessEnv = process.env) {
  // Pin production enablement to the reviewed deployment, not caller-supplied trust settings.
  if (env.VERCEL_ENV === "production") {
    return env.DIRECTOR_READONLY_ENABLED === "true" &&
      env.DIRECTOR_READONLY_PRODUCTION_ENABLED === "true" &&
      env.AUTH_SECURITY_CONFIG_VERIFIED === "true" &&
      env.NEXT_PUBLIC_SUPABASE_URL === "https://hjvytfaalnfcqfgbxsmj.supabase.co" &&
      env.AUTH_SITE_URL === "https://dragon-force-ops.vercel.app";
  }
  return env.DIRECTOR_READONLY_ENABLED === "true" &&
    (env.VERCEL_ENV === "preview" || (!env.VERCEL_ENV && env.NODE_ENV === "development"));
}

// Populate only after each normal page and its data loaders pass nonfinancial review.
export const DIRECTOR_READONLY_REVIEWED_ROUTES: readonly RegExp[] = [
  /^\/inicio\/?$/,
  /^\/(?:caja|dashboard|new-enrollments|datos-faltantes|trial-classes|uniforms)\/?$/,
  /^\/dashboard\/new-enrollments\/?$/,
  /^\/players(?:\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})?\/?$/i,
  /^\/api\/players\/grouped-roster\/?$/,
  /^\/attendance(?:\/(?:calendar|groups|schedules|reports))?\/?$/,
  /^\/attendance\/sessions\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/?$/i,
  /^\/reports\/(?:asistencia-coaches|frecuencia-semanal|carga-entrenamiento)\/?$/,
  /^\/sports-signups(?:\/(?:detail|squads))?\/?$/,
  /^\/(?:convocatorias|teams|tournaments)(?:\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})?\/?$/i,
  /^\/nutrition(?:\/measurements)?\/?$/,
  /^\/nutrition\/players\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?:\/report)?\/?$/i,
];
export const DIRECTOR_READONLY_PUBLIC_ASSETS = [
  "/invicta-wordmark-white.png", "/logo%20Invicta-02.png", "/logos-porto-recibo.png",
  "/watermark%20dragon%20force%20mty-15.png",
] as readonly string[];

export function directorReadOnlyRequestAllowed(method: string, pathname: string, enabled: boolean) {
  // These exact handlers manage only authentication, with their own origin/proof checks.
  if (["/api/auth/signout", "/api/auth/password"].includes(pathname) && method === "POST") return true;
  if (!["GET", "HEAD"].includes(method)) return false;
  if (DIRECTOR_READONLY_PUBLIC_ASSETS.includes(pathname)) return true;
  if (["/", "/login", "/unauthorized"].includes(pathname) || pathname.startsWith("/auth/")) return true;
  return enabled && DIRECTOR_READONLY_REVIEWED_ROUTES.some(pattern => pattern.test(pathname));
}
