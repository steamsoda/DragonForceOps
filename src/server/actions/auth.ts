"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";

export async function signInWithAzureAction() {
  const supabase = await createClient();
  const headersList = await headers();

  // Build origin from request headers
  const host = headersList.get("x-forwarded-host") ?? headersList.get("host") ?? "";
  const proto = headersList.get("x-forwarded-proto") ?? "https";
  const origin = host.startsWith("http") ? host : `${proto}://${host}`;

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "azure",
    options: {
      redirectTo: `${origin}/auth/callback`,
      // scopes needed for Azure to return profile + email
      scopes: "openid profile email",
    },
  });

  if (error || !data.url) {
    redirect("/?error=oauth_start_failed");
  }

  // Redirect browser to Microsoft OAuth. The PKCE code verifier is now stored
  // in the server response cookies (Set-Cookie header), not via document.cookie,
  // making it reliable across all browsers and strict cookie policies.
  redirect(data.url);
}
