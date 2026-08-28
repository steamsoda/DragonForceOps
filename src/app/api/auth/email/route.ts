import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  isAllowedPortoEmail,
  isPortoEmailProofEnabled,
  normalizeAuthEmail,
} from "@/lib/auth/porto-email-proof";
import { getSupabaseEnv } from "@/lib/supabase/env";

const requestSchema = z.object({
  email: z.string().trim().email().max(254),
});

const GENERIC_MESSAGE =
  "Si el correo esta autorizado, recibiras un enlace de acceso en unos minutos.";

export async function POST(request: Request) {
  if (!isPortoEmailProofEnabled()) {
    return NextResponse.json({ message: GENERIC_MESSAGE });
  }

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: GENERIC_MESSAGE });
  }

  const email = normalizeAuthEmail(parsed.data.email);
  if (!isAllowedPortoEmail(email)) {
    return NextResponse.json({ message: GENERIC_MESSAGE });
  }

  const proto = request.headers.get("x-forwarded-proto") ?? "https";
  const host =
    request.headers.get("x-forwarded-host") ??
    request.headers.get("host") ??
    new URL(request.url).host;
  const origin = `${proto}://${host}`;
  const callbackUrl = new URL("/auth/callback", origin);
  callbackUrl.searchParams.set("next", "/auth/email-confirmed");

  const { url, publicKey } = getSupabaseEnv();
  const pendingCookies: { name: string; value: string; options?: CookieOptions }[] = [];
  const supabase = createServerClient(url, publicKey, {
    cookies: {
      getAll() {
        const cookieHeader = request.headers.get("cookie") ?? "";
        return cookieHeader
          .split(";")
          .filter(Boolean)
          .map((pair) => {
            const equalsIndex = pair.indexOf("=");
            return {
              name: pair.slice(0, equalsIndex).trim(),
              value: pair.slice(equalsIndex + 1).trim(),
            };
          });
      },
      setAll(cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) {
        pendingCookies.push(...cookiesToSet);
      },
    },
  });

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: callbackUrl.toString(),
    },
  });

  if (error) {
    console.error("Porto passwordless proof email failed", {
      code: error.code,
      status: error.status,
    });
  }

  const response = NextResponse.json({ message: GENERIC_MESSAGE });
  for (const { name, value, options } of pendingCookies) {
    response.cookies.set(name, value, options);
  }
  return response;
}
