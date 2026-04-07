import { notFound, redirect } from "next/navigation";
import { PageShell } from "@/components/ui/page-shell";
import { DateInputWithPicker } from "@/components/ui/date-input-with-picker";
import { canAccessPlayerRecord } from "@/lib/auth/permissions";
import { getPlayerDetail } from "@/lib/queries/players";
import { updatePlayerAction } from "@/server/actions/players";

const SIZES = ["XCH JR", "CH JR", "M JR", "G JR", "XL JR", "CH", "M", "G", "XL"];

const inputClass = "w-full rounded-md border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm bg-white dark:bg-slate-800";

export default async function PlayerEditPage({
  params,
  searchParams
}: {
  params: Promise<{ playerId: string }>;
  searchParams: Promise<{ err?: string }>;
}) {
  const { playerId } = await params;
  const sp = await searchParams;

  if (!(await canAccessPlayerRecord(playerId))) {
    redirect(`/players/${playerId}?err=unauthorized`);
  }

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
      {sp.err === "missing_fields" && (
        <div className="mb-4 rounded-md border border-rose-200 bg-rose-50 dark:border-rose-800 dark:bg-rose-950/20 px-4 py-3 text-sm text-rose-700 dark:text-rose-300">
          Nombre y fecha de nacimiento son obligatorios.
        </div>
      )}
      {sp.err === "update_failed" && (
        <div className="mb-4 rounded-md border border-rose-200 bg-rose-50 dark:border-rose-800 dark:bg-rose-950/20 px-4 py-3 text-sm text-rose-700 dark:text-rose-300">
          Error al guardar. Intenta de nuevo.
        </div>
      )}

      <form action={action} className="max-w-lg space-y-4 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
        {/* Name */}
        <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span className="font-medium text-slate-700 dark:text-slate-300">Nombre(s) <span className="text-rose-500">*</span></span>
            <input
              type="text"
              name="firstName"
              required
              defaultValue={player.firstName}
              className={inputClass}
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium text-slate-700 dark:text-slate-300">Apellido(s) <span className="text-rose-500">*</span></span>
            <input
              type="text"
              name="lastName"
              required
              defaultValue={player.lastName}
              className={inputClass}
            />
          </label>
        </div>

        {/* Birth date */}
        <label className="block space-y-1 text-sm">
          <span className="font-medium text-slate-700 dark:text-slate-300">Fecha de nacimiento <span className="text-rose-500">*</span></span>
          <DateInputWithPicker
            name="birthDate"
            required
            defaultValue={player.birthDate}
            className={inputClass}
          />
        </label>

        {/* Gender + Goalkeeper */}
        <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span className="font-medium text-slate-700 dark:text-slate-300">Género</span>
            <select name="gender" defaultValue={player.gender ?? ""} className={inputClass}>
              <option value="">Sin especificar</option>
              <option value="male">Masculino</option>
              <option value="female">Femenino</option>
            </select>
          </label>

          <label className="flex items-center gap-2 text-sm cursor-pointer self-end pb-2">
            <input
              type="checkbox"
              name="isGoalkeeper"
              value="1"
              defaultChecked={player.isGoalkeeper ?? false}
              className="h-4 w-4 rounded border-slate-300 text-portoBlue focus:ring-portoBlue"
            />
            <span className="font-medium text-slate-700 dark:text-slate-300">Portero</span>
          </label>
        </div>

        {/* Level */}
        <label className="block space-y-1 text-sm">
          <span className="font-medium text-slate-700 dark:text-slate-300">Nivel</span>
          <select name="level" defaultValue={player.level ?? ""} className={inputClass}>
            <option value="">Sin nivel</option>
            <option value="Little Dragons">Little Dragons</option>
            <option value="B2">B2</option>
            <option value="B1">B1</option>
            <option value="B3">B3</option>
            <option value="Selectivo">Selectivo</option>
          </select>
        </label>

        {/* Jersey number */}
        <label className="block space-y-1 text-sm">
          <span className="font-medium text-slate-700 dark:text-slate-300">Número de camiseta (opcional)</span>
          <input
            type="number"
            name="jerseyNumber"
            min="0"
            max="999"
            defaultValue={player.jerseyNumber ?? ""}
            placeholder="Ej. 7"
            className={inputClass}
          />
        </label>

        {/* Uniform size */}
        <label className="block space-y-1 text-sm">
          <span className="font-medium text-slate-700 dark:text-slate-300">Talla de uniforme</span>
          <select name="uniformSize" defaultValue={player.uniformSize ?? ""} className={inputClass}>
            <option value="">Sin registrar</option>
            {SIZES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </label>

        {/* Medical notes */}
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
