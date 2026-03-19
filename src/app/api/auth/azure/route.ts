import { createServerClient } from "@supabase/ssr";
import type { CookieOptions } from "@supabase/ssr";
import { NextResponse } from "next/server";
import { getSupabaseEnv } from "@/lib/supabase/env";

export async function GET(request: Request) {
  const { origin } = new URL(request.url);
  const { url, publicKey } = getSupabaseEnv();

  // Collect the PKCE code verifier cookie that signInWithOAuth wants to set
  const pendingCookies: { name: string; value: string; options?: CookieOptions }[] = [];

  const supabase = createServerClient(url, publicKey, {
    cookies: {
      getAll() {
        // Parse the Cookie request header manually (request is a plain Request, not NextRequest)
        const cookieHeader = request.headers.get("cookie") ?? "";
        return cookieHeader
          .split(";")
          .filter(Boolean)
          .map((pair) => {
            const eqIdx = pair.indexOf("=");
            return {
              name: pair.slice(0, eqIdx).trim(),
              value: pair.slice(eqIdx + 1).trim(),
            };
          });
      },
      setAll(cookiesToSet) {
        pendingCookies.push(...cookiesToSet);
      },
    },
  });

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "azure",
    options: {
      redirectTo: `${origin}/auth/callback`,
      scopes: "openid profile email",
    },
  });

  if (error || !data.url) {
    return NextResponse.redirect(`${origin}/?error=oauth_start_failed`);
  }

  // Attach the PKCE verifier cookie directly to the redirect response.
  // A plain HTTP 302 is more reliable than a Server Action redirect for
  // external URLs — the browser follows it without Next.js router interference.
  const response = NextResponse.redirect(data.url);
  for (const { name, value, options } of pendingCookies) {
    response.cookies.set(name, value, options);
  }
  return response;
}
