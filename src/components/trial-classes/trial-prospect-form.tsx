"use client";

import { startTransition, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import type { TrialTrainingGroup } from "@/lib/queries/trial-classes";
import { createTrialProspectAction, type TrialProspectCreateResult } from "@/server/actions/trial-classes";

type TrialProspectFormProps = {
  campusId: string | null;
  groups: TrialTrainingGroup[];
  maxBirthDate: string;
};

const ERROR_LABELS: Record<Exclude<TrialProspectCreateResult, { ok: true }>["error"], string> = {
  debug_read_only: "La vista de prueba es de solo lectura.",
  unauthorized: "No tienes permiso para guardar en este campus.",
  invalid_form: "Completa nombre, apellido, fecha de nacimiento, genero, telefono y grupo.",
  invalid_phone: "Captura un telefono valido de 10 digitos, sin espacios.",
  invalid_birth_date: "Captura una fecha de nacimiento valida que no sea futura.",
  invalid_group: "El grupo seleccionado ya no esta disponible.",
  possible_duplicate: "Encontramos un posible registro existente. Revisalo antes de crear otro.",
  create_failed: "No se pudo registrar al prospecto. Tus datos siguen en el formulario.",
};

function groupContext(group: TrialTrainingGroup) {
  const years = group.birthYearMin && group.birthYearMax
    ? group.birthYearMin === group.birthYearMax ? String(group.birthYearMin) : `${group.birthYearMin}/${group.birthYearMax}`
    : "Sin categoria";
  const gender = group.gender === "female" ? "Femenil" : group.gender === "male" ? "Varonil" : "Mixto";
  return `${years} | ${gender}`;
}

export function TrialProspectForm({ campusId, groups, maxBirthDate }: TrialProspectFormProps) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [result, setResult] = useState<TrialProspectCreateResult | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;

    setResult(null);
    const formData = new FormData(form);
    setIsSaving(true);
    void (async () => {
      try {
        const nextResult = await createTrialProspectAction(formData);
        setResult(nextResult);
        if (!nextResult.ok) return;

        formRef.current?.reset();
        startTransition(() => router.refresh());
      } catch {
        setResult({ ok: false, error: "create_failed" });
      } finally {
        setIsSaving(false);
      }
    })();
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      <input type="hidden" name="campusId" value={campusId ?? ""} />
      <label className="text-sm font-medium">Nombre<input required name="firstName" maxLength={100} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" /></label>
      <label className="text-sm font-medium">Apellido<input required name="lastName" maxLength={140} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" /></label>
      <label className="text-sm font-medium">Fecha de nacimiento<input required name="birthDate" type="date" max={maxBirthDate} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" /></label>
      <label className="text-sm font-medium">Genero<select required name="gender" defaultValue="" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"><option value="" disabled>Selecciona</option><option value="male">Masculino</option><option value="female">Femenino</option></select></label>
      <label className="text-sm font-medium">Nombre del tutor (opcional)<input name="guardianName" maxLength={180} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" /></label>
      <label className="text-sm font-medium">
        Telefono del tutor
        <input required name="guardianPhone" type="tel" inputMode="numeric" autoComplete="tel-national" pattern="[0-9]{10}" minLength={10} maxLength={10} title="Captura 10 digitos, sin espacios" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" />
        <span className="mt-1 block text-xs font-normal text-slate-500">10 digitos, sin espacios.</span>
      </label>
      <label className="text-sm font-medium md:col-span-2">Grupo de prueba<select required name="trainingGroupId" defaultValue="" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"><option value="" disabled>Selecciona grupo</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.name} | {groupContext(group)}</option>)}</select></label>
      <label className="text-sm font-medium md:col-span-2 xl:col-span-4">Nota inicial (opcional)<textarea name="note" rows={2} maxLength={2000} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" /></label>
      <div className="space-y-2 md:col-span-2 xl:col-span-4">
        <button disabled={!campusId || groups.length === 0 || isSaving} className="rounded-md bg-portoBlue px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">
          {isSaving ? "Guardando..." : "Guardar prospecto"}
        </button>
        <div aria-live="polite">
          {result?.ok ? <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">Prospecto registrado correctamente.</p> : null}
          {result && !result.ok ? (
            <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
              {ERROR_LABELS[result.error]}
              {result.error === "possible_duplicate" && result.duplicateId ? <a className="ml-1 font-semibold underline" href={`#prospect-${result.duplicateId}`}>Ver registro.</a> : null}
            </p>
          ) : null}
        </div>
      </div>
    </form>
  );
}
