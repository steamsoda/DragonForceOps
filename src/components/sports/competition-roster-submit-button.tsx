"use client";

import { useFormStatus } from "react-dom";
import { ReadOnlyForm, WriteButton } from "@/components/auth/read-only-controls";

export function CompetitionRosterSubmitButton({ exists }: { exists: boolean }) {
  const { pending } = useFormStatus();
  return (
    <WriteButton
      type="submit"
      disabled={pending}
      className="min-h-9 rounded-md bg-portoBlue px-3 py-2 text-sm font-semibold text-white hover:bg-portoDark disabled:cursor-wait disabled:opacity-60"
    >
      {pending ? "Sincronizando..." : exists ? "Actualizar equipo" : "Crear equipo"}
    </WriteButton>
  );
}
