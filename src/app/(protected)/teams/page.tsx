import Link from "next/link";
import { PageShell } from "@/components/ui/page-shell";
import { requireDirectorContext } from "@/lib/auth/permissions";
import { listTeams } from "@/lib/queries/teams";

const LEVEL_COLORS: Record<string, string> = {
  Selectivo: "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300",
  B1:        "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300",
  B2:        "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300",
};
const GENDER_LABELS: Record<string, string> = { male: "Varonil", female: "Femenil" };

export default async function TeamsPage() {
  await requireDirectorContext("/unauthorized");
  const teams = await listTeams();

  // Group: campus → birth_year (desc) → teams
  const byCampus = new Map<string, { campusName: string; byYear: Map<string, typeof teams> }>();
  for (const team of teams) {
    const cKey = team.campusId;
    if (!byCampus.has(cKey)) byCampus.set(cKey, { campusName: team.campusName, byYear: new Map() });
    const yearKey = team.birthYear ? String(team.birthYear) : "Sin categoría";
    const yMap = byCampus.get(cKey)!.byYear;
    if (!yMap.has(yearKey)) yMap.set(yearKey, []);
    yMap.get(yearKey)!.push(team);
  }

  const activeCount  = teams.filter((t) => t.isActive).length;
  const playerTotal  = teams.reduce((s, t) => s + t.playerCount, 0);
  const newTotal     = teams.reduce((s, t) => s + t.newArrivalCount, 0);

  return (
    <PageShell
      title="Equipos"
      subtitle="Gestión de equipos y asignaciones"
      breadcrumbs={[{ label: "Equipos" }]}
    >
      <div className="space-y-6">
        {/* Summary row */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "Equipos activos", value: activeCount },
            { label: "Jugadores asignados", value: playerTotal },
            { label: "Nuevos por confirmar", value: newTotal, alert: newTotal > 0 },
          ].map(({ label, value, alert }) => (
            <div key={label} className={`rounded-md border px-4 py-3 ${alert ? "border-amber-300 bg-amber-50 dark:bg-amber-950/20" : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"}`}>
              <p className="text-xs uppercase text-slate-500 dark:text-slate-400">{label}</p>
              <p className={`text-2xl font-bold ${alert ? "text-amber-700" : "text-slate-900 dark:text-slate-100"}`}>{value}</p>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="flex justify-end">
          <Link href="/teams/new" className="rounded-md bg-portoBlue px-4 py-2 text-sm font-medium text-white hover:bg-portoDark">
            + Nuevo equipo
          </Link>
        </div>

        {/* Teams grouped by campus + year */}
        {Array.from(byCampus.entries()).map(([campusId, { campusName, byYear }]) => (
          <section key={campusId} className="space-y-4">
            <h2 className="text-base font-semibold text-slate-800 dark:text-slate-200 border-b border-slate-200 dark:border-slate-700 pb-1">
              {campusName}
            </h2>
            {Array.from(byYear.entries()).map(([yearKey, yearTeams]) => (
              <div key={yearKey} className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 px-1">{yearKey}</p>
                <div className="overflow-x-auto rounded-md border border-slate-200 dark:border-slate-700">
                  <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700 text-sm">
                    <thead className="bg-slate-50 dark:bg-slate-800 text-left text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      <tr>
                        <th className="px-3 py-2">Equipo</th>
                        <th className="px-3 py-2">Género</th>
                        <th className="px-3 py-2">Nivel</th>
                        <th className="px-3 py-2">Coach</th>
                        <th className="px-3 py-2 text-center">Jugadores</th>
                        <th className="px-3 py-2 text-center">Nuevos</th>
                        <th className="px-3 py-2 text-center">Estado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {yearTeams.map((team) => (
                        <tr key={team.id} className={`hover:bg-slate-50 dark:hover:bg-slate-800/50 ${!team.isActive ? "opacity-50" : ""}`}>
                          <td className="px-3 py-2">
                            <Link href={`/teams/${team.id}`} className="font-medium text-slate-900 dark:text-slate-100 hover:text-portoBlue hover:underline">
                              {team.name}
                            </Link>
                          </td>
                          <td className="px-3 py-2 text-slate-600 dark:text-slate-400">
                            {team.gender ? (GENDER_LABELS[team.gender] ?? team.gender) : "-"}
                          </td>
                          <td className="px-3 py-2">
                            {team.level && (
                              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${LEVEL_COLORS[team.level] ?? "bg-slate-100 text-slate-600"}`}>
                                {team.level}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-slate-600 dark:text-slate-400">{team.coachName ?? "-"}</td>
                          <td className="px-3 py-2 text-center font-medium">{team.playerCount}</td>
                          <td className="px-3 py-2 text-center">
                            {team.newArrivalCount > 0 ? (
                              <span className="rounded-full bg-amber-100 dark:bg-amber-900/40 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300">
                                {team.newArrivalCount} nuevo{team.newArrivalCount !== 1 ? "s" : ""}
                              </span>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-center">
                            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${team.isActive ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                              {team.isActive ? "Activo" : "Inactivo"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </section>
        ))}

        {teams.length === 0 && (
          <p className="text-sm text-slate-500 dark:text-slate-400">No hay equipos creados aún.</p>
        )}
      </div>
    </PageShell>
  );
}
