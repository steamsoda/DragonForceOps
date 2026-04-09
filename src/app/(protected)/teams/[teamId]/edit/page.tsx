import { notFound, redirect } from "next/navigation";
import { PageShell } from "@/components/ui/page-shell";
import { requireSportsDirectorContext } from "@/lib/auth/permissions";
import { getTeamDetail, listCoaches } from "@/lib/queries/teams";
import { editTeamAction } from "@/server/actions/teams";

const inputClass = "w-full rounded-md border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm bg-white dark:bg-slate-900";

export default async function EditTeamPage({
  params,
  searchParams,
}: {
  params: Promise<{ teamId: string }>;
  searchParams: Promise<{ err?: string }>;
}) {
  const { teamId } = await params;
  const sp = await searchParams;

  await requireSportsDirectorContext("/unauthorized");

  const [team, coaches] = await Promise.all([
    getTeamDetail(teamId),
    listCoaches(),
  ]);

  if (!team) notFound();

  const action = editTeamAction.bind(null, teamId);

  return (
    <PageShell
      title={`Editar: ${team.name}`}
      breadcrumbs={[
        { label: "Equipos", href: "/teams" },
        { label: team.name, href: `/teams/${teamId}` },
        { label: "Editar" },
      ]}
    >
      {sp.err && (
        <div className="mb-4 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {sp.err === "update_failed" ? "Error al guardar. Intenta de nuevo." : "Error inesperado."}
        </div>
      )}

      <form action={action} className="max-w-lg space-y-4 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5">
        <p className="text-xs text-slate-500 dark:text-slate-400">
          El nombre y categoría del equipo no pueden editarse — son parte de su identidad. Si necesitas un cambio de estructura, crea un equipo nuevo.
        </p>

        <label className="block space-y-1 text-sm">
          <span className="font-medium text-slate-700 dark:text-slate-300">Coach</span>
          <select name="coachId" className={inputClass} defaultValue={team.coachId ?? ""}>
            <option value="">Sin asignar</option>
            {coaches.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </label>

        <label className="block space-y-1 text-sm">
          <span className="font-medium text-slate-700 dark:text-slate-300">Etiqueta de temporada</span>
          <input
            type="text"
            name="seasonLabel"
            defaultValue={team.seasonLabel ?? ""}
            placeholder="Ej. Apertura 2026"
            className={inputClass}
          />
        </label>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="isActive"
            value="1"
            defaultChecked={team.isActive}
            className="rounded border-slate-300"
          />
          <span className="font-medium text-slate-700 dark:text-slate-300">Equipo activo</span>
        </label>

        <div className="flex gap-3 pt-1">
          <button type="submit" className="rounded-md bg-portoBlue px-4 py-2 text-sm font-medium text-white hover:bg-portoDark">
            Guardar cambios
          </button>
          <a
            href={`/teams/${teamId}`}
            className="rounded-md border border-slate-300 dark:border-slate-600 px-4 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            Cancelar
          </a>
        </div>
      </form>
    </PageShell>
  );
}
