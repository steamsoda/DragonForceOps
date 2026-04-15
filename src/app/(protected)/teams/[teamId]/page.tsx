import { notFound } from "next/navigation";
import Link from "next/link";
import { PageShell } from "@/components/ui/page-shell";
import { requireSportsDirectorContext } from "@/lib/auth/permissions";
import { getTeamDetail, listTeams } from "@/lib/queries/teams";
import { TeamRosterClient } from "@/components/teams/team-roster-client";
import { TEAM_GENDER_LABELS } from "@/lib/teams/shared";

const TYPE_LABELS: Record<string, string> = { competition: "Selectivo", class: "Clases" };
const OK_MESSAGES: Record<string, string> = {
  created: "Equipo creado correctamente.",
  updated: "Equipo actualizado.",
  transferred: "Transferencia realizada.",
  refuerzo_added: "Refuerzo agregado.",
};
const ERR_MESSAGES: Record<string, string> = {
  already_assigned: "El jugador ya tiene una asignación activa en ese equipo.",
  unauthorized: "Sin permisos.",
};

export default async function TeamDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ teamId: string }>;
  searchParams: Promise<{ ok?: string; err?: string }>;
}) {
  const { teamId } = await params;
  const sp = await searchParams;

  await requireSportsDirectorContext("/unauthorized");

  const [team, allTeams] = await Promise.all([
    getTeamDetail(teamId),
    listTeams(),
  ]);

  if (!team) notFound();

  const isDirector = true;

  return (
    <PageShell
      title={team.name}
      subtitle={[team.campusName, team.birthYear, team.gender ? TEAM_GENDER_LABELS[team.gender] : null, team.level].filter(Boolean).join(" · ")}
      breadcrumbs={[{ label: "Equipos", href: "/teams" }, { label: team.name }]}
    >
      <div className="space-y-6">
        {/* Feedback banners */}
        {sp.ok && OK_MESSAGES[sp.ok] && (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/20 px-4 py-3 text-sm text-emerald-800 dark:text-emerald-200">
            ✓ {OK_MESSAGES[sp.ok]}
          </div>
        )}
        {sp.err && ERR_MESSAGES[sp.err] && (
          <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {ERR_MESSAGES[sp.err]}
          </div>
        )}

        {/* Team meta */}
        <section className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="grid gap-3 sm:grid-cols-3 flex-1">
              <div>
                <p className="text-xs uppercase text-slate-500 dark:text-slate-400">Campus</p>
                <p className="font-medium text-slate-900 dark:text-slate-100">{team.campusName}</p>
              </div>
              <div>
                <p className="text-xs uppercase text-slate-500 dark:text-slate-400">Tipo</p>
                <p className="font-medium text-slate-900 dark:text-slate-100">{TYPE_LABELS[team.type] ?? team.type}</p>
              </div>
              <div>
                <p className="text-xs uppercase text-slate-500 dark:text-slate-400">Nivel</p>
                <p className="font-medium text-slate-900 dark:text-slate-100">{team.level ?? "-"}</p>
              </div>
              <div>
                <p className="text-xs uppercase text-slate-500 dark:text-slate-400">Categoría</p>
                <p className="font-medium text-slate-900 dark:text-slate-100">{team.birthYear ?? "-"}</p>
              </div>
              <div>
                <p className="text-xs uppercase text-slate-500 dark:text-slate-400">Género</p>
                <p className="font-medium text-slate-900 dark:text-slate-100">
                  {team.gender ? (TEAM_GENDER_LABELS[team.gender] ?? team.gender) : "-"}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase text-slate-500 dark:text-slate-400">Coach</p>
                <p className="font-medium text-slate-900 dark:text-slate-100">{team.coachName ?? "-"}</p>
              </div>
              {team.seasonLabel && (
                <div>
                  <p className="text-xs uppercase text-slate-500 dark:text-slate-400">Temporada</p>
                  <p className="font-medium text-slate-900 dark:text-slate-100">{team.seasonLabel}</p>
                </div>
              )}
              <div>
                <p className="text-xs uppercase text-slate-500 dark:text-slate-400">Estado</p>
                <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${team.isActive ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                  {team.isActive ? "Activo" : "Inactivo"}
                </span>
              </div>
            </div>
            {isDirector && (
              <Link
                href={`/teams/${team.id}/edit`}
                className="shrink-0 rounded-md border border-slate-300 dark:border-slate-600 px-3 py-1.5 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                Editar
              </Link>
            )}
          </div>
        </section>

        {/* Roster */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Plantilla actual
              <span className="ml-2 text-sm font-normal text-slate-500 dark:text-slate-400">({team.playerCount})</span>
            </h2>
          </div>
          <TeamRosterClient
            teamId={team.id}
            roster={team.roster}
            allTeams={allTeams}
            isDirector={isDirector}
          />
        </section>

        {/* History */}
        {team.history.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Historial de bajas</h2>
            <div className="overflow-x-auto rounded-md border border-slate-200 dark:border-slate-700">
              <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700 text-sm">
                <thead className="bg-slate-50 dark:bg-slate-800 text-left text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  <tr>
                    <th className="px-3 py-2">Jugador</th>
                    <th className="px-3 py-2">Rol</th>
                    <th className="px-3 py-2">Entrada</th>
                    <th className="px-3 py-2">Salida</th>
                    <th className="px-3 py-2">Días</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {team.history.map((h) => (
                    <tr key={h.assignmentId} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <td className="px-3 py-2">
                        <a href={`/players/${h.playerId}`} className="font-medium text-slate-900 dark:text-slate-100 hover:text-portoBlue hover:underline">
                          {h.playerName}
                        </a>
                      </td>
                      <td className="px-3 py-2 text-slate-600 dark:text-slate-400 capitalize">{h.role}</td>
                      <td className="px-3 py-2 text-slate-600 dark:text-slate-400">
                        {new Date(h.startDate).toLocaleDateString("es-MX")}
                      </td>
                      <td className="px-3 py-2 text-slate-600 dark:text-slate-400">
                        {new Date(h.endDate).toLocaleDateString("es-MX")}
                      </td>
                      <td className="px-3 py-2 text-slate-600 dark:text-slate-400">{h.daysOnTeam}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </PageShell>
  );
}
