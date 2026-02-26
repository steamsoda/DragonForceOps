"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function AzureSignInButton() {
  const [isLoading, setIsLoading] = useState(false);

  async function signIn() {
    try {
      setIsLoading(true);
      const supabase = createClient();
      const redirectTo = `${window.location.origin}/auth/callback`;

      await supabase.auth.signInWithOAuth({
        provider: "azure",
        options: { redirectTo }
      });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={signIn}
      disabled={isLoading}
      className="inline-flex rounded-md bg-portoBlue px-4 py-2 text-sm font-medium text-white hover:bg-portoDark disabled:cursor-not-allowed disabled:opacity-70"
    >
      {isLoading ? "Redirecting..." : "Sign in with Microsoft 365"}
    </button>
  );
}
