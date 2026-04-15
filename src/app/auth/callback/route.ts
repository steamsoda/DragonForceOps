import { createServerClient } from "@supabase/ssr";
import type { CookieOptions } from "@supabase/ssr";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSupabaseEnv } from "@/lib/supabase/env";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const proto = request.headers.get("x-forwarded-proto") ?? "https";
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? new URL(request.url).host;
  const origin = `${proto}://${host}`;
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/inicio";

  if (!code) {
    return NextResponse.redirect(`${origin}/?error=missing_code`);
  }

  const cookieStore = await cookies();
  const { url, publicKey } = getSupabaseEnv();

  // Build the redirect response first so we can write session cookies directly onto it.
  // The previous pattern used createClient() which writes cookies to cookieStore, then
  // returned a new NextResponse.redirect() — a separate object that never included those
  // cookies. The browser never received the session, causing the redirect loop.
  const redirectTo = NextResponse.redirect(`${origin}${next}`);

  const supabase = createServerClient(url, publicKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) {
        cookiesToSet.forEach(({ name, value, options }) => {
          redirectTo.cookies.set(name, value, options);
        });
      },
    },
  });

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(`${origin}/?error=oauth_exchange_failed`);
  }

  return redirectTo;
}
