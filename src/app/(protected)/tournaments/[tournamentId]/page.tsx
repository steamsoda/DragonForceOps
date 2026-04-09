import { notFound } from "next/navigation";
import { PageShell } from "@/components/ui/page-shell";
import { requireSportsDirectorContext } from "@/lib/auth/permissions";
import { getTournamentDetailData } from "@/lib/queries/tournaments";
import {
  assignTournamentSquadPlayerAction,
  attachTournamentSourceTeamAction,
  createTournamentSquadAction,
  detachTournamentSourceTeamAction,
  removeTournamentSquadPlayerAction,
  updateTournamentAction,
} from "@/server/actions/tournaments";

const OK_MESSAGES: Record<string, string> = {
  updated: "Competencia actualizada.",
  source_attached: "Equipo base agregado.",
  source_detached: "Equipo base removido.",
  squad_created: "Escuadra creada.",
  player_assigned: "Jugador asignado a escuadra.",
  player_unassigned: "Jugador removido de la escuadra.",
};

const ERR_MESSAGES: Record<string, string> = {
  invalid_form: "Revisa la configuracion de la competencia.",
  invalid_product: "Selecciona un producto valido de torneo o copa.",
  invalid_source_team: "El equipo base no pertenece al campus de esta competencia.",
  invalid_birth_range: "La ventana de categoria no es valida.",
  attach_failed: "No se pudo agregar el equipo base.",
  source_has_squads: "Primero vacia las escuadras ligadas a este equipo base.",
  invalid_squad_form: "Completa la forma de escuadra.",
  source_not_attached: "El equipo base debe estar ligado antes de crear escuadras.",
  squad_team_failed: "No se pudo crear el equipo de competencia.",
  squad_failed: "No se pudo crear la escuadra.",
  assignment_not_allowed: "Ese jugador solo puede entrar como refuerzo o no cumple la categoria.",
  refuerzo_limit: "La escuadra ya alcanzo su limite de refuerzos.",
  assignment_not_found: "No se encontro la asignacion seleccionada.",
};

export default async function TournamentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ tournamentId: string }>;
  searchParams: Promise<{ ok?: string; err?: string }>;
}) {
  await requireSportsDirectorContext("/unauthorized");
  const { tournamentId } = await params;
  const [data, query] = await Promise.all([getTournamentDetailData(tournamentId), searchParams]);
  if (!data) notFound();

  return (
    <PageShell
      title={data.name}
      subtitle={`${data.campusName} · ${data.gender === "male" ? "Varonil" : data.gender === "female" ? "Femenil" : "Mixto"} · ${data.productName ?? "Sin producto ligado"}`}
      breadcrumbs={[
        { label: "Copas / Torneos", href: "/tournaments" },
        { label: data.name },
      ]}
      wide
    >
      <div className="space-y-6">
        {query.ok && OK_MESSAGES[query.ok] ? (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            {OK_MESSAGES[query.ok]}
          </div>
        ) : null}
        {query.err && ERR_MESSAGES[query.err] ? (
          <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {ERR_MESSAGES[query.err]}
          </div>
        ) : null}

        <section className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/40">
          <div className="mb-4">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Configuracion</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Esta vista solo muestra estados deportivos. El cobro sigue ocurriendo en Caja via el producto ligado.
            </p>
          </div>

          <form action={updateTournamentAction.bind(null, data.id)} className="grid gap-4 lg:grid-cols-3">
            <label className="space-y-1 text-sm">
              <span className="font-medium text-slate-700 dark:text-slate-200">Nombre</span>
              <input
                name="name"
                required
                defaultValue={data.name}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-950"
              />
            </label>

            <label className="space-y-1 text-sm">
              <span className="font-medium text-slate-700 dark:text-slate-200">Campus</span>
              <select
                name="campusId"
                defaultValue={data.campusId}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-950"
              >
                {data.campuses.map((campus) => (
                  <option key={campus.id} value={campus.id}>
                    {campus.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1 text-sm">
              <span className="font-medium text-slate-700 dark:text-slate-200">Producto ligado</span>
              <select
                name="productId"
                defaultValue={data.productId ?? ""}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-950"
              >
                <option value="">Selecciona...</option>
                {data.products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1 text-sm">
              <span className="font-medium text-slate-700 dark:text-slate-200">Genero</span>
              <select
                name="gender"
                defaultValue={data.gender ?? "mixed"}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-950"
              >
                <option value="male">Varonil</option>
                <option value="female">Femenil</option>
                <option value="mixed">Mixto</option>
              </select>
            </label>

            <label className="space-y-1 text-sm">
              <span className="font-medium text-slate-700 dark:text-slate-200">Inicio</span>
              <input name="startDate" type="date" defaultValue={data.startDate ?? ""} className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-950" />
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium text-slate-700 dark:text-slate-200">Fin</span>
              <input name="endDate" type="date" defaultValue={data.endDate ?? ""} className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-950" />
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium text-slate-700 dark:text-slate-200">Cierre</span>
              <input name="signupDeadline" type="date" defaultValue={data.signupDeadline ?? ""} className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-950" />
            </label>

            <label className="space-y-1 text-sm">
              <span className="font-medium text-slate-700 dark:text-slate-200">Categoria inicial</span>
              <input name="eligibleBirthYearMin" defaultValue={data.eligibleBirthYearMin ?? ""} className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-950" />
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium text-slate-700 dark:text-slate-200">Categoria final</span>
              <input name="eligibleBirthYearMax" defaultValue={data.eligibleBirthYearMax ?? ""} className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-950" />
            </label>

            <label className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950">
              <input type="checkbox" name="isActive" value="1" defaultChecked={data.isActive} />
              <span>Competencia activa</span>
            </label>

            <div className="lg:col-span-3">
              <button type="submit" className="rounded-md bg-portoBlue px-4 py-2 text-sm font-medium text-white hover:bg-portoDark">
                Guardar configuracion
              </button>
            </div>
          </form>
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-4 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Equipos base</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Estos equipos definen el denominador para progreso y la elegibilidad regular.
              </p>
            </div>

            <form action={attachTournamentSourceTeamAction.bind(null, data.id)} className="flex flex-wrap items-end gap-3 rounded-md border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/50">
              <label className="min-w-[14rem] flex-1 space-y-1 text-sm">
                <span className="font-medium text-slate-700 dark:text-slate-200">Agregar equipo base</span>
                <select name="sourceTeamId" className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-950">
                  <option value="">Selecciona...</option>
                  {data.availableSourceTeams.map((team) => (
                    <option key={team.id} value={team.id}>
                      {team.name} · {team.birthYear ?? "Sin categoria"} · {team.gender === "male" ? "Varonil" : team.gender === "female" ? "Femenil" : team.gender === "mixed" ? "Mixto" : "Sin genero"}
                    </option>
                  ))}
                </select>
              </label>
              <button type="submit" className="rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800">
                Agregar
              </button>
            </form>

            <div className="space-y-3">
              {data.attachedSourceTeams.map((team) => (
                <article key={team.linkId} className="rounded-md border border-slate-200 p-3 dark:border-slate-700">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold text-slate-900 dark:text-slate-100">{team.sourceTeamName}</h3>
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        {team.birthYear ?? "Sin categoria"} · {team.gender === "male" ? "Varonil" : team.gender === "female" ? "Femenil" : team.gender === "mixed" ? "Mixto" : "Sin genero"} · {team.level ?? "Sin nivel"} · {team.coachName ?? "Sin coach"}
                      </p>
                    </div>
                    <form action={detachTournamentSourceTeamAction.bind(null, data.id, team.linkId)}>
                      <button type="submit" className="rounded-md border border-rose-300 px-2 py-1 text-xs text-rose-700 hover:bg-rose-50 dark:border-rose-800 dark:text-rose-300 dark:hover:bg-rose-950/30">
                        Quitar
                      </button>
                    </form>
                  </div>
                  <div className="mt-3 grid grid-cols-4 gap-3 text-sm">
                    <div className="rounded-md bg-slate-50 p-3 dark:bg-slate-800/60">
                      <p className="text-xs uppercase text-slate-500 dark:text-slate-400">Elegibles</p>
                      <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">{team.eligibleCount}</p>
                    </div>
                    <div className="rounded-md bg-slate-50 p-3 dark:bg-slate-800/60">
                      <p className="text-xs uppercase text-slate-500 dark:text-slate-400">Inscritos</p>
                      <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">{team.signedCount}</p>
                    </div>
                    <div className="rounded-md bg-slate-50 p-3 dark:bg-slate-800/60">
                      <p className="text-xs uppercase text-slate-500 dark:text-slate-400">Pendientes</p>
                      <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">{team.unsignedCount}</p>
                    </div>
                    <div className="rounded-md bg-slate-50 p-3 dark:bg-slate-800/60">
                      <p className="text-xs uppercase text-slate-500 dark:text-slate-400">Progreso</p>
                      <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">{team.progressLabel}</p>
                    </div>
                  </div>
                </article>
              ))}

              {data.attachedSourceTeams.length === 0 ? (
                <p className="rounded-md border border-dashed border-slate-300 px-4 py-5 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                  Agrega al menos un equipo base para empezar a medir inscripcion y armado.
                </p>
              ) : null}
            </div>
          </div>

          <div className="space-y-4 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Nueva escuadra</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Cada escuadra genera un equipo real para asignaciones secundarias.
              </p>
            </div>

            <form action={createTournamentSquadAction.bind(null, data.id)} className="grid gap-3">
              <label className="space-y-1 text-sm">
                <span className="font-medium text-slate-700 dark:text-slate-200">Equipo base</span>
                <select name="sourceTeamId" className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-950">
                  <option value="">Selecciona...</option>
                  {data.attachedSourceTeams.map((team) => (
                    <option key={team.sourceTeamId} value={team.sourceTeamId}>
                      {team.sourceTeamName}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1 text-sm">
                <span className="font-medium text-slate-700 dark:text-slate-200">Etiqueta</span>
                <input name="label" className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-950" placeholder="Equipo A / Selectivo / Azul" />
              </label>

              <div className="grid gap-3 sm:grid-cols-3">
                <label className="space-y-1 text-sm">
                  <span className="font-medium text-slate-700 dark:text-slate-200">Minimo</span>
                  <input name="minTargetPlayers" defaultValue="7" className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-950" />
                </label>
                <label className="space-y-1 text-sm">
                  <span className="font-medium text-slate-700 dark:text-slate-200">Maximo</span>
                  <input name="maxTargetPlayers" defaultValue="14" className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-950" />
                </label>
                <label className="space-y-1 text-sm">
                  <span className="font-medium text-slate-700 dark:text-slate-200">Limite refuerzos</span>
                  <input name="refuerzoLimit" defaultValue="3" className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-950" />
                </label>
              </div>

              <button type="submit" className="rounded-md bg-portoBlue px-4 py-2 text-sm font-medium text-white hover:bg-portoDark">
                Crear escuadra
              </button>
            </form>
          </div>
        </section>

        <section className="space-y-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Jugadores por atender</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Inscritos sin escuadra y elegibles sin pago confirmado. No se muestran montos, solo estado deportivo.
            </p>
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <article className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
              <h3 className="mb-3 font-semibold text-slate-900 dark:text-slate-100">Inscritos pendientes de escuadra</h3>
              <div className="space-y-3">
                {data.awaitingAssignmentPlayers.map((player) => (
                  <div key={player.enrollmentId} className="rounded-md border border-slate-200 p-3 dark:border-slate-700">
                    <div className="mb-3">
                      <p className="font-medium text-slate-900 dark:text-slate-100">{player.playerName}</p>
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        {player.birthYear ?? "Sin categoria"} · {player.sourceTeamName ?? "Sin equipo base"} · {player.isEligibleRegular ? "Elegible regular" : "Solo refuerzo"}
                      </p>
                    </div>
                    <form action={assignTournamentSquadPlayerAction.bind(null, data.id)} className="flex flex-wrap items-end gap-2">
                      <input type="hidden" name="enrollmentId" value={player.enrollmentId} />
                      <input type="hidden" name="returnTo" value={`/tournaments/${data.id}`} />
                      <label className="min-w-[12rem] flex-1 space-y-1 text-sm">
                        <span className="font-medium text-slate-700 dark:text-slate-200">Escuadra</span>
                        <select name="squadId" className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-950">
                          <option value="">Selecciona...</option>
                          {data.squads.map((squad) => (
                            <option key={squad.id} value={squad.id}>
                              {squad.label} · {squad.sourceTeamName}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="space-y-1 text-sm">
                        <span className="font-medium text-slate-700 dark:text-slate-200">Modo</span>
                        <select name="mode" defaultValue={player.isEligibleRegular ? "regular" : "refuerzo"} className="rounded-md border border-slate-300 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-950">
                          <option value="regular">Regular</option>
                          <option value="refuerzo">Refuerzo</option>
                        </select>
                      </label>
                      <button type="submit" className="rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800">
                        Asignar
                      </button>
                    </form>
                  </div>
                ))}

                {data.awaitingAssignmentPlayers.length === 0 ? (
                  <p className="rounded-md border border-dashed border-slate-300 px-4 py-5 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                    Todos los inscritos ya tienen escuadra.
                  </p>
                ) : null}
              </div>
            </article>

            <article className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
              <h3 className="mb-3 font-semibold text-slate-900 dark:text-slate-100">Elegibles sin pago confirmado</h3>
              <div className="space-y-2">
                {data.unsignedPlayers.map((player) => (
                  <div key={player.enrollmentId} className="rounded-md border border-slate-200 px-3 py-2 text-sm dark:border-slate-700">
                    <p className="font-medium text-slate-900 dark:text-slate-100">{player.playerName}</p>
                    <p className="text-slate-500 dark:text-slate-400">
                      {player.birthYear ?? "Sin categoria"} · {player.sourceTeamName ?? "Sin equipo base"}
                    </p>
                  </div>
                ))}
                {data.unsignedPlayers.length === 0 ? (
                  <p className="rounded-md border border-dashed border-slate-300 px-4 py-5 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                    No hay jugadores elegibles pendientes de inscripcion.
                  </p>
                ) : null}
              </div>
            </article>
          </div>
        </section>

        <section className="space-y-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Escuadras</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              El jugador conserva su equipo normal. La escuadra de competencia usa una asignacion secundaria.
            </p>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            {data.squads.map((squad) => (
              <article key={squad.id} className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-slate-900 dark:text-slate-100">{squad.label}</h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      {squad.sourceTeamName} · {squad.teamName}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-right text-sm">
                    <div>
                      <p className="text-xs uppercase text-slate-500 dark:text-slate-400">Plantilla</p>
                      <p className="font-semibold text-slate-900 dark:text-slate-100">{squad.fillLabel}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase text-slate-500 dark:text-slate-400">Refuerzos</p>
                      <p className="font-semibold text-slate-900 dark:text-slate-100">{squad.refuerzoLabel}</p>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  {squad.members.map((member) => (
                    <div key={member.assignmentId} className="flex items-center justify-between gap-3 rounded-md border border-slate-200 px-3 py-2 text-sm dark:border-slate-700">
                      <div>
                        <p className="font-medium text-slate-900 dark:text-slate-100">{member.playerName}</p>
                        <p className="text-slate-500 dark:text-slate-400">
                          {member.birthYear ?? "Sin categoria"} · {member.role === "refuerzo" ? "Refuerzo" : "Regular"}
                        </p>
                      </div>
                      <form action={removeTournamentSquadPlayerAction.bind(null, data.id, member.assignmentId, `/tournaments/${data.id}`)}>
                        <button type="submit" className="rounded-md border border-rose-300 px-2 py-1 text-xs text-rose-700 hover:bg-rose-50 dark:border-rose-800 dark:text-rose-300 dark:hover:bg-rose-950/30">
                          Quitar
                        </button>
                      </form>
                    </div>
                  ))}
                  {squad.members.length === 0 ? (
                    <p className="rounded-md border border-dashed border-slate-300 px-4 py-5 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                      Todavia no hay jugadores asignados.
                    </p>
                  ) : null}
                </div>
              </article>
            ))}

            {data.squads.length === 0 ? (
              <p className="rounded-md border border-dashed border-slate-300 px-4 py-6 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                Crea la primera escuadra para empezar a distribuir jugadores inscritos.
              </p>
            ) : null}
          </div>
        </section>
      </div>
    </PageShell>
  );
}
