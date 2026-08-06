"use client";

import { useFormStatus } from "react-dom";

export function WeeklyCallupSubmitButton({
  label,
  pendingLabel = "Guardando...",
  className = "min-h-9 rounded-md bg-portoBlue px-3 py-2 text-sm font-semibold text-white disabled:opacity-60",
}: {
  label: string;
  pendingLabel?: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={className}>
      {pending ? pendingLabel : label}
    </button>
  );
}
