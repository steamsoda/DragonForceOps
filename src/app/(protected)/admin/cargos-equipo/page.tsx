import { PageShell } from "@/components/ui/page-shell";
import { requireDirectorContext } from "@/lib/auth/permissions";
import { listTeamsWithCampus, listBulkChargeTypes } from "@/lib/queries/teams";
import { bulkChargeTeamAction } from "@/server/actions/billing";

const ERROR_MESSAGES: Record<string, string> = {
  invalid_form: "Completa todos los campos requeridos.",
  invalid_amount: "El monto debe ser un numero distinto de cero.",
  unauthenticated: "No autenticado.",
  no_active_enrollments: "El equipo no tiene inscripciones activas con asignacion abierta.",
  insert_failed: "Error al crear los cargos. Intenta de nuevo."
};

type SearchParams = Promise<{ ok?: string; created?: string; err?: string }>;

export default async function CargosEquipoPage({ searchParams }: { searchParams: SearchParams }) {
  await requireDirectorContext("/unauthorized");
  const params = await searchParams;
  const ok = params.ok === "1";
  const created = parseInt(params.created ?? "0", 10);
  const err = params.err;

  const [teams, chargeTypes] = await Promise.all([listTeamsWithCampus(), listBulkChargeTypes()]);

  // Group teams by campus for the <optgroup> in the selector
  const teamsByCampus = teams.reduce<Record<string, { campusName: string; teams: typeof teams }>>((acc, t) => {
    if (!acc[t.campusId]) acc[t.campusId] = { campusName: t.campusName, teams: [] };
    acc[t.campusId].teams.push(t);
    return acc;
  }, {});

  function teamLabel(t: (typeof teams)[number]) {
    const parts: string[] = [];
    if (t.birthYear) parts.push(String(t.birthYear));
    if (t.gender) parts.push(t.gender === "male" ? "Varonil" : "Femenil");
    if (t.level) parts.push(t.level.toUpperCase());
    return parts.length > 0 ? `${t.name} (${parts.join(" · ")})` : t.name;
  }

  return (
    <PageShell
      title="Cargo por Equipo"
      subtitle="Genera un cargo para todas las inscripciones activas de un equipo."
      breadcrumbs={[{ label: "Admin" }, { label: "Cargo por Equipo" }]}
    >
      <div className="max-w-lg space-y-6">
        {ok && (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            <span className="font-semibold">{created} cargo{created !== 1 ? "s" : ""} creado{created !== 1 ? "s" : ""}.</span>
          </div>
        )}

        {err && (
          <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            {ERROR_MESSAGES[err] ?? `Error: ${err}`}
          </div>
        )}

        {teams.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">No hay equipos activos registrados en el sistema.</p>
        ) : (
          <form action={bulkChargeTeamAction} className="space-y-4 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6">
            {/* Team */}
            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Equipo</label>
              <select
                name="team_id"
                required
                className="block w-full rounded-md border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm"
              >
                <option value="">Selecciona un equipo…</option>
                {Object.values(teamsByCampus).map(({ campusName, teams: campusTeams }) => (
                  <optgroup key={campusName} label={campusName}>
                    {campusTeams.map((t) => (
                      <option key={t.id} value={t.id}>
                        {teamLabel(t)}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>

            {/* Charge type */}
            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Tipo de cargo</label>
              <select
                name="charge_type_id"
                required
                className="block w-full rounded-md border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm"
              >
                <option value="">Selecciona un tipo…</option>
                {chargeTypes.map((ct) => (
                  <option key={ct.id} value={ct.id}>
                    {ct.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Amount */}
            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Monto (MXN)</label>
              <input
                type="number"
                name="amount"
                step="0.01"
                required
                placeholder="350.00"
                className="block w-full rounded-md border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm"
              />
              <p className="text-xs text-slate-500 dark:text-slate-400">Usa valor negativo para descuentos o abonos.</p>
            </div>

            {/* Description */}
            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Descripcion</label>
              <input
                type="text"
                name="description"
                required
                maxLength={200}
                placeholder="Superliga Regia — Marzo 2026"
                className="block w-full rounded-md border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm"
              />
              <p className="text-xs text-slate-500 dark:text-slate-400">Aparece en el estado de cuenta de cada jugador.</p>
            </div>

            <button
              type="submit"
              className="rounded-md bg-portoBlue px-5 py-2 text-sm font-medium text-white hover:bg-portoDark"
            >
              Generar cargos
            </button>
          </form>
        )}

        <div className="rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-4 py-3 text-xs text-slate-600 dark:text-slate-400 space-y-1">
          <p className="font-medium text-slate-700 dark:text-slate-300">Notas</p>
          <ul className="list-disc list-inside space-y-0.5">
            <li>Solo se cargan inscripciones <strong>activas</strong> con asignacion de equipo abierta (sin fecha de fin).</li>
            <li>Esta operacion <strong>no es idempotente</strong> — verifica antes de repetir para evitar duplicados.</li>
            <li>Para anular un cargo generado por error, usa la opcion de anular en el estado de cuenta del jugador.</li>
          </ul>
        </div>
      </div>
    </PageShell>
  );
}
