import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type { CookieOptions } from "@supabase/ssr";
import { getSupabaseEnv } from "@/lib/supabase/env";

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

  // Auth routes manage their own session exchange — skip getUser() so the proxy
  // doesn't touch the PKCE code verifier cookie before the callback handler runs.
  if (pathname.startsWith("/auth")) {
    return supabaseResponse;
  }

  // Refresh session on every other request so cookies stay up to date.
  await supabase.auth.getUser();

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"
  ]
};
