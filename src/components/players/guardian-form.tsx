type GuardianFormProps = {
  action: (formData: FormData) => Promise<void>;
  defaultValues?: {
    firstName?: string;
    lastName?: string;
    phonePrimary?: string;
    phoneSecondary?: string | null;
    email?: string | null;
    relationshipLabel?: string | null;
  };
  errorMessage?: string | null;
};

export function GuardianForm({ action, defaultValues, errorMessage }: GuardianFormProps) {
  return (
    <form action={action} className="space-y-4">
      {errorMessage && (
        <div className="rounded-md border border-rose-200 bg-rose-50 dark:border-rose-800 dark:bg-rose-950/20 px-4 py-3 text-sm text-rose-700 dark:text-rose-300">
          {errorMessage}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span className="font-medium text-slate-700 dark:text-slate-300">Nombre *</span>
          <input
            type="text"
            name="firstName"
            required
            defaultValue={defaultValues?.firstName ?? ""}
            className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2"
          />
        </label>

        <label className="space-y-1 text-sm">
          <span className="font-medium text-slate-700 dark:text-slate-300">Apellido *</span>
          <input
            type="text"
            name="lastName"
            required
            defaultValue={defaultValues?.lastName ?? ""}
            className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2"
          />
        </label>

        <label className="space-y-1 text-sm">
          <span className="font-medium text-slate-700 dark:text-slate-300">Teléfono principal *</span>
          <input
            type="tel"
            name="phonePrimary"
            required
            defaultValue={defaultValues?.phonePrimary ?? ""}
            className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2"
          />
        </label>

        <label className="space-y-1 text-sm">
          <span className="font-medium text-slate-700 dark:text-slate-300">Teléfono secundario</span>
          <input
            type="tel"
            name="phoneSecondary"
            defaultValue={defaultValues?.phoneSecondary ?? ""}
            className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2"
          />
        </label>

        <label className="space-y-1 text-sm">
          <span className="font-medium text-slate-700 dark:text-slate-300">Email</span>
          <input
            type="email"
            name="email"
            defaultValue={defaultValues?.email ?? ""}
            className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2"
          />
        </label>

        <label className="space-y-1 text-sm">
          <span className="font-medium text-slate-700 dark:text-slate-300">Parentesco</span>
          <input
            type="text"
            name="relationshipLabel"
            placeholder="Mamá, Papá, Abuelo…"
            defaultValue={defaultValues?.relationshipLabel ?? ""}
            className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2"
          />
        </label>
      </div>

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          className="rounded-md bg-portoBlue px-4 py-2 text-sm font-medium text-white hover:bg-portoDark"
        >
          Guardar cambios
        </button>
      </div>
    </form>
  );
}
