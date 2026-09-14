import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type { CookieOptions } from "@supabase/ssr";
import { getSupabaseEnv } from "@/lib/supabase/env";
import { DIRECTOR_READONLY_PUBLIC_ASSETS, directorReadOnlyEnabled, directorReadOnlyRequestAllowed } from "@/lib/auth/director-readonly-policy";

export async function proxy(request: NextRequest) {
  const maintenanceMode = process.env.MAINTENANCE_MODE === "true";
  const isVercelPreview = process.env.VERCEL_ENV === "preview";
  const { pathname } = request.nextUrl;

  const bypassMaintenance =
    isVercelPreview ||
    pathname === "/maintenance" ||
    pathname === "/login" ||
    pathname.startsWith("/auth") ||
    pathname.startsWith("/api") ||
    pathname.startsWith("/_next");

  if (maintenanceMode && !bypassMaintenance) {
    const url = request.nextUrl.clone();
    url.pathname = "/maintenance";
    return NextResponse.redirect(url);
  }

  let supabaseResponse = NextResponse.next({ request });
  const publicAssetRead = pathname.startsWith("/_next/static/") || pathname === "/_next/image" ||
    pathname === "/favicon.ico" || DIRECTOR_READONLY_PUBLIC_ASSETS.includes(pathname);
  if (["GET", "HEAD"].includes(request.method) && publicAssetRead) return supabaseResponse;

  const { url, publicKey } = getSupabaseEnv();

  const supabase = createServerClient(url, publicKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
      }
    }
  });

  function withSessionCookies(response: NextResponse) {
    for (const cookie of supabaseResponse.cookies.getAll()) response.cookies.set(cookie);
    return response;
  }

  // Auth routes manage their own session exchange — skip getUser() so the proxy
  // doesn't touch the PKCE code verifier cookie before the callback handler runs.
  if (pathname.startsWith("/auth") && ["GET", "HEAD"].includes(request.method)) {
    return supabaseResponse;
  }

  // Refresh session on every other request so cookies stay up to date.
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    const { data: roles, error } = await supabase.from("user_roles")
      .select("app_roles(code)").eq("user_id", user.id)
      .returns<{ app_roles: { code: string } | null }[]>();
    if (error) return withSessionCookies(NextResponse.json({ message: "No se pudo verificar el acceso." }, { status: 503 }));
    const isReadOnly = roles?.some(row => row.app_roles?.code === "director_readonly");
    const verifiedReadOnly = isReadOnly ? await supabase.rpc("is_director_readonly") : null;
    const isSelfAuth = ["/api/auth/signout", "/api/auth/password"].includes(pathname) && request.method === "POST";
    if (isReadOnly && !isSelfAuth &&
      ((pathname !== "/unauthorized" && (verifiedReadOnly?.error || verifiedReadOnly?.data !== true)) ||
      !directorReadOnlyRequestAllowed(request.method, pathname, directorReadOnlyEnabled()))) {
      if (!["GET", "HEAD"].includes(request.method) || pathname.startsWith("/api/")) {
        return withSessionCookies(NextResponse.json({ message: "Acceso de solo lectura. Operacion no disponible." },
          { status: 403, headers: { "Cache-Control": "no-store" } }));
      }
      return withSessionCookies(NextResponse.redirect(new URL("/unauthorized", request.url)));
    }
  }

  return supabaseResponse;
}

export const config = {
  // Method-aware asset handling above keeps mutation requests inside the firewall.
  matcher: ["/:path*"]
};
