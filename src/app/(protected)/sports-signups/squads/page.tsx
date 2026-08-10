import Link from "next/link";
import { redirect } from "next/navigation";
import { CompetitionRosterCombinedEditor } from "@/components/sports/competition-roster-combined-editor";
import { CompetitionRosterSubmitButton } from "@/components/sports/competition-roster-submit-button";
import { CompetitionRosterSplitEditor } from "@/components/sports/competition-roster-split-editor";
import { PageShell } from "@/components/ui/page-shell";
import { getCompetitionRosterOrganizerData } from "@/lib/queries/competition-rosters";
import { createOrSyncDefaultCompetitionSquadAction } from "@/server/actions/competition-rosters";

type SearchParams = Promise<{
  tournament?: string;
  campus?: string;
  program?: string;
  ok?: string;
  err?: string;
}>;

const OK_MESSAGES: Record<string, string> = {
  squad_synced: "Equipo actualizado con las inscripciones confirmadas.",
  split_synced: "Division Azul y Blanco guardada correctamente.",
  combined_synced: "Equipo combinado guardado correctamente.",
};

const ERROR_MESSAGES: Record<string, string> = {
  invalid_squad_settings: "Faltan datos para organizar este equipo.",
  invalid_squad_scope: "El torneo y el grupo seleccionado no pertenecen al mismo campus o programa.",
  advanced_squad_requires_editor: "Este grupo ya usa una estructura especial. Se administrara en el siguiente pase.",
  squad_permission_denied: "Tu usuario no tiene permiso para organizar equipos en este campus.",
  squad_database_conflict: "La configuracion del organizador necesita actualizarse. No se guardo ningun cambio.",
  invalid_split_settings: "La seleccion Azul y Blanco contiene datos invalidos.",
  split_needs_two_players: "Se necesitan por lo menos dos jugadores confirmados para dividir el grupo.",
  split_requires_both_teams: "Azul y Blanco necesitan por lo menos un jugador cada uno.",
  split_invalid_player: "La seleccion incluye un jugador que ya no esta confirmado en este grupo.",
  invalid_combined_settings: "Selecciona por lo menos dos grupos y escribe un nombre valido.",
  combined_needs_two_groups: "Selecciona por lo menos dos grupos para combinar.",
  combined_invalid_name: "El nombre del equipo debe tener entre 3 y 80 caracteres.",
  combined_invalid_group: "Uno de los grupos ya no esta activo o no pertenece al campus y programa seleccionados.",
  combined_target_not_found: "El equipo combinado que intentas editar ya no esta disponible.",
  combined_no_players: "Los grupos seleccionados no tienen jugadores confirmados para este torneo.",
  combined_name_conflict: "Ya existe otro equipo de este torneo con ese nombre.",
  combined_player_conflict: "Un jugador confirmado ya pertenece a otra estructura especial. No se guardaron cambios.",
  squad_sync_failed: "No se pudo guardar el equipo. No se modificaron inscripciones ni grupos de entrenamiento.",
};

function formatStatus(status: "planning" | "ready" | "archived") {
  if (status === "ready") return "Listo";
  if (status === "archived") return "Archivado";
  return "En preparacion";
}

export default async function CompetitionSquadOrganizerPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const data = await getCompetitionRosterOrganizerData({
    tournamentId: params.tournament ?? "",
    campusId: params.campus ?? "",
    program: params.program ?? "",
  });
  if (!data) redirect("/unauthorized");

  const returnHref = `/sports-signups?campus=${encodeURIComponent(data.campusId)}&competition=${encodeURIComponent(`product:${data.productId}`)}&program=${encodeURIComponent(data.program)}`;

  return (
    <PageShell
      title="Organizar equipos"
      subtitle="Convierte las inscripciones confirmadas en equipos de competencia sin modificar pagos ni grupos de entrenamiento."
      breadcrumbs={[
        { label: "Inscripciones Torneos", href: returnHref },
        { label: data.tournamentName },
        { label: "Equipos" },
      ]}
      wide
    >
      <div className="space-y-5">
        {params.ok && OK_MESSAGES[params.ok] ? (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            {OK_MESSAGES[params.ok]}
          </div>
        ) : null}
        {params.err && ERROR_MESSAGES[params.err] ? (
          <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {ERROR_MESSAGES[params.err]}
          </div>
        ) : null}

        <section className="flex flex-col gap-4 border-b border-slate-200 pb-5 md:flex-row md:items-end md:justify-between dark:border-slate-700">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
              {data.campusName} · {data.programLabel}
            </p>
            <h2 className="mt-1 text-2xl font-semibold text-slate-950 dark:text-slate-50">{data.tournamentName}</h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              El caso normal crea un equipo por grupo con todos sus jugadores confirmados.
            </p>
          </div>
          <Link
            href={returnHref}
            className="rounded-md border border-slate-300 px-4 py-2 text-center text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Volver a Inscripciones Torneos
          </Link>
        </section>

        <section className="grid overflow-hidden rounded-md border border-slate-200 bg-white sm:grid-cols-3 dark:border-slate-700 dark:bg-slate-900">
          <Metric label="Confirmados" value={data.totalConfirmed} detail="Inscripciones pagadas del programa" />
          <Metric label="En equipos" value={data.totalAssigned} detail="Jugadores ya organizados" />
          <Metric label="Pendientes" value={data.totalPending} detail="Aun sin equipo de competencia" tone={data.totalPending > 0 ? "warning" : "normal"} />
        </section>

        {!data.canManage ? (
          <div className="rounded-md border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-200">
            Vista de consulta. La seleccion deportiva corresponde a Super Admin, Director Admin o Director Deportivo del campus.
          </div>
        ) : null}

        {data.canManage && data.groups.filter((group) => group.canCombine).length >= 2 ? (
          <CompetitionRosterCombinedEditor
            tournamentId={data.tournamentId}
            campusId={data.campusId}
            program={data.program}
            groups={data.groups.map((group) => ({
              id: group.id,
              name: group.name,
              subtitle: group.subtitle,
              candidateCount: group.candidates.length,
              canCombine: group.canCombine,
              combinedSquadId: group.combinedSquadId,
            }))}
            combinedSquads={data.combinedSquads}
          />
        ) : null}

        <section className="space-y-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-950 dark:text-slate-50">Grupos con inscripciones confirmadas</h2>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Crear equipo no cambia el grupo de entrenamiento. Actualizar agrega nuevas inscripciones confirmadas y retira registros cuyo pago dejo de confirmar la inscripcion.
            </p>
          </div>

          {data.groups.length === 0 ? (
            <div className="rounded-md border border-dashed border-slate-300 px-4 py-8 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
              No hay jugadores confirmados en grupos de {data.programLabel}.
            </div>
          ) : (
            data.groups.map((group) => (
              <article key={group.id} className="overflow-hidden rounded-md border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
                <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 md:flex-row md:items-center md:justify-between dark:border-slate-700 dark:bg-slate-800/60">
                  <div>
                    <h3 className="font-semibold text-slate-950 dark:text-slate-50">{group.name}</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{group.subtitle}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-200">
                      {group.candidates.length} confirmados
                    </span>
                    {group.squad ? (
                      <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
                        {group.squad.name} · {formatStatus(group.squad.status)}
                      </span>
                    ) : (
                      <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                        {group.pendingCount} pendientes
                      </span>
                    )}
                    {group.hasSplitStructure ? (
                      <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-800 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-200">
                        Azul {group.squads.find((squad) => squad.kind === "azul")?.memberCount ?? 0} | Blanco {group.squads.find((squad) => squad.kind === "blanco")?.memberCount ?? 0}
                      </span>
                    ) : null}
                    {data.canManage && !group.usesAdvancedStructure ? (
                      <form action={createOrSyncDefaultCompetitionSquadAction}>
                        <input type="hidden" name="tournamentId" value={data.tournamentId} />
                        <input type="hidden" name="campusId" value={data.campusId} />
                        <input type="hidden" name="program" value={data.program} />
                        <input type="hidden" name="trainingGroupId" value={group.id} />
                        <CompetitionRosterSubmitButton exists={Boolean(group.squad)} />
                      </form>
                    ) : null}
                  </div>
                </div>

                {group.usesAdvancedStructure && !group.hasSplitStructure ? (
                  <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                    {group.hasCombinedStructure
                      ? "Este grupo forma parte de un equipo combinado. Editalo desde el panel Combinar varios grupos."
                      : "Este grupo usa una estructura personalizada o con excepciones. Se administrara en el siguiente pase."}
                  </div>
                ) : null}

                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-white text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                      <tr>
                        <th className="px-4 py-2">Jugador</th>
                        <th className="px-4 py-2">Categoria</th>
                        <th className="px-4 py-2">Equipo de competencia</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {group.candidates.map((player) => (
                        <tr key={player.enrollmentId}>
                          <td className="px-4 py-2 font-medium text-slate-950 dark:text-slate-50">{player.playerName}</td>
                          <td className="px-4 py-2 text-slate-600 dark:text-slate-300">{player.birthYear ?? "-"}</td>
                          <td className="px-4 py-2">
                            {player.assignedSquadNames.length > 0 ? (
                              <span className="text-emerald-700 dark:text-emerald-300">{player.assignedSquadNames.join(", ")}</span>
                            ) : (
                              <span className="text-amber-700 dark:text-amber-300">Pendiente por asignar</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {data.canManage && group.canEditSplit && group.candidates.length >= 2 ? (
                  <CompetitionRosterSplitEditor
                    tournamentId={data.tournamentId}
                    campusId={data.campusId}
                    trainingGroupId={group.id}
                    program={data.program}
                    players={group.candidates}
                    exists={group.hasSplitStructure}
                  />
                ) : null}
              </article>
            ))
          )}
        </section>

        {data.withoutGroup.length > 0 ? (
          <section className="rounded-md border border-amber-300 bg-amber-50 px-4 py-4 dark:border-amber-800 dark:bg-amber-950/30">
            <h2 className="font-semibold text-amber-950 dark:text-amber-100">Sin grupo de entrenamiento</h2>
            <p className="mt-1 text-sm text-amber-800 dark:text-amber-200">
              Estos jugadores estan confirmados, pero necesitan un grupo antes de crear su equipo normal. No se ocultaron.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {data.withoutGroup.map((player) => (
                <span key={player.enrollmentId} className="rounded-full border border-amber-300 bg-white px-3 py-1 text-sm text-amber-900 dark:border-amber-700 dark:bg-slate-950 dark:text-amber-100">
                  {player.playerName}
                </span>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </PageShell>
  );
}

function Metric({
  label,
  value,
  detail,
  tone = "normal",
}: {
  label: string;
  value: number;
  detail: string;
  tone?: "normal" | "warning";
}) {
  return (
    <div className="border-b border-slate-200 px-4 py-4 last:border-b-0 sm:border-r sm:border-b-0 sm:last:border-r-0 dark:border-slate-700">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</p>
      <p className={tone === "warning" ? "mt-1 text-2xl font-semibold text-amber-700" : "mt-1 text-2xl font-semibold text-slate-950 dark:text-slate-50"}>
        {value}
      </p>
      <p className="text-xs text-slate-500 dark:text-slate-400">{detail}</p>
    </div>
  );
}
