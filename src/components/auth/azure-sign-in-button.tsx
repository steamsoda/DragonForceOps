"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function AzureSignInButton() {
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function signIn() {
    try {
      setIsLoading(true);
      setErrorMessage(null);
      const supabase = createClient();
      const redirectTo = `${window.location.origin}/auth/callback`;

      const { error } = await supabase.auth.signInWithOAuth({
        provider: "azure",
        options: { redirectTo }
      });

      if (error) {
        setErrorMessage(error.message);
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to start Microsoft sign-in.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={signIn}
        disabled={isLoading}
        className="inline-flex rounded-md bg-portoBlue px-4 py-2 text-sm font-medium text-white hover:bg-portoDark disabled:cursor-not-allowed disabled:opacity-70"
      >
        {isLoading ? "Redirecting..." : "Sign in with Microsoft 365"}
      </button>
      {errorMessage ? <p className="text-sm text-red-700">{errorMessage}</p> : null}
    </>
  );
}
