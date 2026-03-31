import { DateInputWithPicker } from "@/components/ui/date-input-with-picker";

type PlayerCreateFormProps = {
  action: (formData: FormData) => Promise<void>;
};

const inputClass = "w-full rounded-md border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm";

export function PlayerCreateForm({ action }: PlayerCreateFormProps) {
  return (
    <form action={action} className="space-y-6">
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
        Registrar jugador
      </button>
    </form>
  );
}
