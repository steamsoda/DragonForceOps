"use client";

import { useFormStatus } from "react-dom";
import { signInWithAzureAction } from "@/server/actions/auth";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex rounded-md bg-portoBlue px-4 py-2 text-sm font-medium text-white hover:bg-portoDark disabled:cursor-not-allowed disabled:opacity-70"
    >
      {pending ? "Redirigiendo..." : "Entrar con Microsoft 365"}
    </button>
  );
}

export function AzureSignInButton() {
  return (
    <form action={signInWithAzureAction}>
      <SubmitButton />
    </form>
  );
}
