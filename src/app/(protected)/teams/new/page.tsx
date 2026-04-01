import { PageShell } from "@/components/ui/page-shell";
import { requireDirectorContext } from "@/lib/auth/permissions";
import { listCoaches } from "@/lib/queries/teams";
import { createTeamAction } from "@/server/actions/teams";
import { listCampuses } from "@/lib/queries/players";

const LEVELS = ["B2", "B1", "Selectivo"];
const CURRENT_YEAR = new Date().getFullYear();
const BIRTH_YEARS = Array.from({ length: 15 }, (_, i) => CURRENT_YEAR - 6 - i);

const inputClass = "w-full rounded-md border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm bg-white dark:bg-slate-900";

export default async function NewTeamPage({ searchParams }: { searchParams: Promise<{ err?: string }> }) {
  await requireDirectorContext("/unauthorized");

  const sp = await searchParams;
  const [campuses, coaches] = await Promise.all([listCampuses(), listCoaches()]);

  return (
    <PageShell
      title="Nuevo equipo"
      breadcrumbs={[{ label: "Equipos", href: "/teams" }, { label: "Nuevo" }]}
    >
      {sp.err && (
        <div className="mb-4 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {sp.err === "invalid_form" ? "Completa todos los campos requeridos." : "Error al crear el equipo. Intenta de nuevo."}
        </div>
      )}

      <form action={createTeamAction} className="max-w-lg space-y-4 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5">
        <p className="text-xs text-slate-500 dark:text-slate-400">El nombre del equipo se genera automáticamente a partir de los atributos.</p>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span className="font-medium text-slate-700 dark:text-slate-300">Campus <span className="text-rose-500">*</span></span>
            <select name="campusId" required className={inputClass}>
              <option value="">Seleccionar...</option>
              {campuses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>

          <label className="space-y-1 text-sm">
            <span className="font-medium text-slate-700 dark:text-slate-300">Tipo <span className="text-rose-500">*</span></span>
            <select name="type" required className={inputClass}>
              <option value="competition">Competición (Selectivo)</option>
              <option value="class">Clases</option>
            </select>
          </label>

          <label className="space-y-1 text-sm">
            <span className="font-medium text-slate-700 dark:text-slate-300">Año de nacimiento <span className="text-rose-500">*</span></span>
            <select name="birthYear" required className={inputClass}>
              <option value="">Seleccionar...</option>
              {BIRTH_YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </label>

          <label className="space-y-1 text-sm">
            <span className="font-medium text-slate-700 dark:text-slate-300">Género</span>
            <select name="gender" className={inputClass}>
              <option value="">Sin especificar</option>
              <option value="male">Varonil</option>
              <option value="female">Femenil</option>
            </select>
          </label>

          <label className="space-y-1 text-sm">
            <span className="font-medium text-slate-700 dark:text-slate-300">Nivel <span className="text-rose-500">*</span></span>
            <select name="level" required className={inputClass}>
              <option value="">Seleccionar...</option>
              {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </label>

          <label className="space-y-1 text-sm">
            <span className="font-medium text-slate-700 dark:text-slate-300">Coach</span>
            <select name="coachId" className={inputClass}>
              <option value="">Sin asignar</option>
              {coaches.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
        </div>

        <label className="block space-y-1 text-sm">
          <span className="font-medium text-slate-700 dark:text-slate-300">Etiqueta de temporada (opcional)</span>
          <input type="text" name="seasonLabel" placeholder="Ej. Apertura 2026" className={inputClass} />
        </label>

        <div className="flex gap-3 pt-1">
          <button type="submit" className="rounded-md bg-portoBlue px-4 py-2 text-sm font-medium text-white hover:bg-portoDark">
            Crear equipo
          </button>
          <a href="/teams" className="rounded-md border border-slate-300 dark:border-slate-600 px-4 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800">
            Cancelar
          </a>
        </div>
      </form>
    </PageShell>
  );
}
