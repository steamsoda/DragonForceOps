"use client";

import { useState } from "react";

export function AzureSignInButton() {
  const [loading, setLoading] = useState(false);

  return (
    <a
      href="/api/auth/azure"
      onClick={() => setLoading(true)}
      className="inline-flex rounded-md bg-portoBlue px-4 py-2 text-sm font-medium text-white hover:bg-portoDark"
    >
      {loading ? "Redirigiendo..." : "Entrar con Microsoft 365"}
    </a>
  );
}
