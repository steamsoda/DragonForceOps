"use client";

import { useState } from "react";
import { DateInputWithPicker } from "@/components/ui/date-input-with-picker";

type PlayerCreateFormProps = {
  action: (formData: FormData) => Promise<void>;
  initialIsReturning?: boolean;
};

const inputClass = "w-full rounded-md border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm";

export function PlayerCreateForm({ action, initialIsReturning = false }: PlayerCreateFormProps) {
  const [isReturning, setIsReturning] = useState(initialIsReturning);

  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="isReturning" value={isReturning ? "1" : "0"} />

      <section className="space-y-3 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
        <div className="space-y-1">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Tipo de alta</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Marca <span className="font-medium text-slate-700 dark:text-slate-300">Reingreso</span> cuando el jugador
            vuelve a la academia y necesitara opciones especiales de inscripcion.
          </p>
        </div>
        <div className="grid gap-2 md:grid-cols-2">
          <button
            type="button"
            onClick={() => setIsReturning(false)}
            className={`rounded-md border px-3 py-3 text-left text-sm transition ${
              !isReturning
                ? "border-portoBlue bg-blue-50 text-slate-900"
                : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
            }`}
          >
            <p className="font-semibold">Nuevo ingreso</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Flujo normal con inscripcion estandar.
            </p>
          </button>
          <button
            type="button"
            onClick={() => setIsReturning(true)}
            className={`rounded-md border px-3 py-3 text-left text-sm transition ${
              isReturning
                ? "border-emerald-500 bg-emerald-50 text-slate-900"
                : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
            }`}
          >
            <p className="font-semibold">Reingreso</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Activa opciones especiales de inscripcion para reingreso.
            </p>
          </button>
        </div>
      </section>

      <section className="space-y-3 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Datos del jugador</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span className="font-medium text-slate-700 dark:text-slate-300">
              Nombre(s) <span className="text-rose-500">*</span>
            </span>
            <input type="text" name="firstName" required placeholder="Ej. Carlos" className={inputClass} />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium text-slate-700 dark:text-slate-300">
              Apellidos <span className="text-rose-500">*</span>
            </span>
            <input type="text" name="lastName" required placeholder="Ej. Garcia Lopez" className={inputClass} />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium text-slate-700 dark:text-slate-300">
              Fecha de nacimiento <span className="text-rose-500">*</span>
            </span>
            <DateInputWithPicker name="birthDate" required className={inputClass} />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium text-slate-700 dark:text-slate-300">Genero</span>
            <select name="gender" className={inputClass}>
              <option value="">Sin especificar</option>
              <option value="male">Masculino</option>
              <option value="female">Femenino</option>
            </select>
          </label>
        </div>
        <label className="space-y-1 text-sm">
          <span className="font-medium text-slate-700 dark:text-slate-300">Notas medicas (opcional)</span>
          <textarea
            name="medicalNotes"
            rows={2}
            placeholder="Alergias, condiciones, etc."
            className={inputClass}
          />
        </label>
      </section>

      <section className="space-y-3 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Tutor principal</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span className="font-medium text-slate-700 dark:text-slate-300">
              Nombre(s) <span className="text-rose-500">*</span>
            </span>
            <input type="text" name="guardianFirstName" required placeholder="Ej. Maria" className={inputClass} />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium text-slate-700 dark:text-slate-300">
              Apellidos <span className="text-rose-500">*</span>
            </span>
            <input
              type="text"
              name="guardianLastName"
              required
              placeholder="Ej. Lopez Ruiz"
              className={inputClass}
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium text-slate-700 dark:text-slate-300">
              Telefono principal <span className="text-rose-500">*</span>
            </span>
            <input
              type="tel"
              name="guardianPhone"
              required
              placeholder="Ej. 8112345678"
              className={inputClass}
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium text-slate-700 dark:text-slate-300">Telefono secundario</span>
            <input type="tel" name="guardianPhoneSecondary" placeholder="Opcional" className={inputClass} />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium text-slate-700 dark:text-slate-300">Email</span>
            <input type="email" name="guardianEmail" placeholder="Opcional" className={inputClass} />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium text-slate-700 dark:text-slate-300">Parentesco</span>
            <input
              type="text"
              name="guardianRelationship"
              placeholder="Ej. Padre, Madre, Tutor"
              className={inputClass}
            />
          </label>
        </div>
      </section>

      <button
        type="submit"
        className="rounded-md bg-portoBlue px-4 py-2 text-sm font-medium text-white hover:bg-portoDark"
      >
        {isReturning ? "Registrar jugador y continuar con reingreso" : "Registrar jugador"}
      </button>
    </form>
  );
}
