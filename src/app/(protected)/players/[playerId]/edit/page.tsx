import { notFound } from "next/navigation";
import { PageShell } from "@/components/ui/page-shell";
import { getPlayerDetail } from "@/lib/queries/players";
import { updatePlayerAction } from "@/server/actions/players";

const SIZES = ["XCH JR", "CH JR", "M JR", "G JR", "XL JR", "CH", "M", "G", "XL"];

const inputClass = "w-full rounded-md border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm";

export default async function PlayerEditPage({ params }: { params: Promise<{ playerId: string }> }) {
  const { playerId } = await params;
  const player = await getPlayerDetail(playerId);
  if (!player) notFound();

  const action = updatePlayerAction.bind(null, playerId);

  return (
    <PageShell
      title="Editar jugador"
      breadcrumbs={[
        { label: "Jugadores", href: "/players" },
        { label: player.fullName, href: `/players/${playerId}` },
        { label: "Editar" }
      ]}
    >
      <form action={action} className="max-w-lg space-y-4 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
        <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span className="font-medium text-slate-700 dark:text-slate-300">Género</span>
            <select name="gender" defaultValue={player.gender ?? ""} className={inputClass}>
              <option value="">Sin especificar</option>
              <option value="male">Masculino</option>
              <option value="female">Femenino</option>
            </select>
          </label>

          <label className="flex items-center gap-2 text-sm cursor-pointer col-span-2">
            <input
              type="checkbox"
              name="isGoalkeeper"
              value="1"
              defaultChecked={player.isGoalkeeper ?? false}
              className="h-4 w-4 rounded border-slate-300 text-portoBlue focus:ring-portoBlue"
            />
            <span className="font-medium text-slate-700 dark:text-slate-300">Portero</span>
          </label>

          <label className="space-y-1 text-sm">
            <span className="font-medium text-slate-700 dark:text-slate-300">Talla de uniforme</span>
            <select name="uniformSize" defaultValue={player.uniformSize ?? ""} className={inputClass}>
              <option value="">Sin registrar</option>
              {SIZES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>
        </div>

        <label className="block space-y-1 text-sm">
          <span className="font-medium text-slate-700 dark:text-slate-300">Notas médicas (opcional)</span>
          <textarea
            name="medicalNotes"
            rows={2}
            defaultValue={player.medicalNotes ?? ""}
            placeholder="Alergias, condiciones, etc."
            className={inputClass}
          />
        </label>

        <div className="flex gap-3">
          <button
            type="submit"
            className="rounded-md bg-portoBlue px-4 py-2 text-sm font-medium text-white hover:bg-portoDark"
          >
            Guardar cambios
          </button>
          <a
            href={`/players/${playerId}`}
            className="rounded-md border border-slate-300 dark:border-slate-600 px-4 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            Cancelar
          </a>
        </div>
      </form>
    </PageShell>
  );
}
