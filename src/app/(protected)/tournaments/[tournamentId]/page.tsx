import Link from "next/link";
import { notFound } from "next/navigation";
import { PageShell } from "@/components/ui/page-shell";
import { requireSportsDirectorContext } from "@/lib/auth/permissions";
import { getTournamentDetailData, TEAM_GENDER_LABELS } from "@/lib/queries/tournaments";
import {
  approveTournamentSourceRosterAction,
  assignTournamentSquadPlayerAction,
  attachTournamentSourceTeamAction,
  createTournamentSquadAction,
  detachTournamentSourceTeamAction,
  removeTournamentSquadPlayerAction,
  setTournamentInterestAction,
  updateTournamentAction,
  updateTournamentSourceTeamSettingsAction,
} from "@/server/actions/tournaments";

const OK_MESSAGES: Record<string, string> = {
  updated: "Competencia actualizada.",
  source_attached: "Equipo base agregado.",
  source_detached: "Equipo base removido.",
  source_settings_updated: "Modo de participación actualizado.",
  interest_updated: "Estado de interés actualizado.",
  roster_approved: "Roster final aprobado desde los inscritos confirmados.",
  squad_created: "Escuadra creada.",
  player_assigned: "Jugador agregado al roster.",
  player_unassigned: "Jugador removido del roster.",
};

const ERR_MESSAGES: Record<string, string> = {
  invalid_form: "Revisa la configuración de la competencia.",
  invalid_product: "Selecciona un producto válido de torneo o copa.",
  invalid_source_team: "El equipo base no pertenece al campus de esta competencia.",
  invalid_birth_range: "La ventana de categoría no es válida.",
  attach_failed: "No se pudo agregar el equipo base.",
  source_has_squads: "Primero vacía las escuadras ligadas a este equipo base.",
  source_settings_failed: "No se pudo actualizar la configuración del equipo.",
  source_not_found: "El equipo base ya no está ligado a esta competencia.",
  interest_not_allowed: "Ese jugador ya no pertenece a este equipo base.",
  interest_failed: "No se pudo actualizar el interés.",
  roster_approval_failed: "No se pudo aprobar el roster final.",
  invalid_squad_form: "Completa la forma de escuadra.",
  source_not_attached: "El equipo base debe estar ligado antes de crear escuadras.",
  squad_team_failed: "No se pudo crear el equipo de competencia.",
  squad_failed: "No se pudo crear la escuadra.",
  assignment_not_allowed: "Solo los inscritos confirmados pueden entrar al roster.",
  refuerzo_limit: "La escuadra ya alcanzó su límite de refuerzos.",
  assignment_not_found: "No se encontró la asignación seleccionada.",
};

function formatDate(value: string | null) {
  if (!value) return "Sin fecha";
  return new Date(`${value}T00:00:00`).toLocaleDateString("es-MX");
}

export default async function TournamentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ tournamentId: string }>;
  searchParams: Promise<{ ok?: string; err?: string; sourceTeamId?: string }>;
}) {
  await requireSportsDirectorContext("/unauthorized");
  const { tournamentId } = await params;
  const query = await searchParams;
  const data = await getTournamentDetailData(tournamentId, query.sourceTeamId);
  if (!data) notFound();
  const selectedSourceTeam = data.selectedSourceTeam;

  const returnTo = data.selectedSourceTeamId
    ? `/tournaments/${data.id}?sourceTeamId=${data.selectedSourceTeamId}`
    : `/tournaments/${data.id}`;

  return (
    <PageShell
      title={data.name}
      subtitle={`${data.campusName} · ${TEAM_GENDER_LABELS[data.gender ?? ""] ?? "Mixto"} · ${data.productName ?? "Sin producto ligado"}`}
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
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Configuración</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                El cobro sigue ocurriendo en Caja. Esta vista organiza equipos base, inscripciones y roster final.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
              <div className="rounded-md bg-white px-3 py-2 dark:bg-slate-950">
                <p className="text-xs uppercase text-slate-500 dark:text-slate-400">Equipos</p>
                <p className="font-semibold text-slate-900 dark:text-slate-100">{data.sourceTeams.length}</p>
              </div>
              <div className="rounded-md bg-white px-3 py-2 dark:bg-slate-950">
                <p className="text-xs uppercase text-slate-500 dark:text-slate-400">Inscritos</p>
                <p className="font-semibold text-slate-900 dark:text-slate-100">
                  {data.sourceTeams.reduce((sum, team) => sum + team.confirmedCount, 0)}
                </p>
              </div>
              <div className="rounded-md bg-white px-3 py-2 dark:bg-slate-950">
                <p className="text-xs uppercase text-slate-500 dark:text-slate-400">Interesados</p>
                <p className="font-semibold text-slate-900 dark:text-slate-100">
                  {data.sourceTeams.reduce((sum, team) => sum + team.interestedCount, 0)}
                </p>
              </div>
              <div className="rounded-md bg-white px-3 py-2 dark:bg-slate-950">
                <p className="text-xs uppercase text-slate-500 dark:text-slate-400">Cierre</p>
                <p className="font-semibold text-slate-900 dark:text-slate-100">{formatDate(data.signupDeadline)}</p>
              </div>
            </div>
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
              <span className="font-medium text-slate-700 dark:text-slate-200">Género</span>
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
              <span className="font-medium text-slate-700 dark:text-slate-200">Categoría inicial</span>
              <input name="eligibleBirthYearMin" defaultValue={data.eligibleBirthYearMin ?? ""} className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-950" />
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium text-slate-700 dark:text-slate-200">Categoría final</span>
              <input name="eligibleBirthYearMax" defaultValue={data.eligibleBirthYearMax ?? ""} className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-950" />
            </label>

            <label className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950">
              <input type="checkbox" name="isActive" value="1" defaultChecked={data.isActive} />
              <span>Competencia activa</span>
            </label>

            <div className="lg:col-span-3">
              <button type="submit" className="rounded-md bg-portoBlue px-4 py-2 text-sm font-medium text-white hover:bg-portoDark">
                Guardar configuración
              </button>
            </div>
          </form>
        </section>

        <section className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
          <div className="space-y-4 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Equipos base ligados</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                La operación diaria empieza aquí: equipo base y progreso de inscritos confirmados.
              </p>
            </div>

            <form action={attachTournamentSourceTeamAction.bind(null, data.id)} className="flex flex-wrap items-end gap-3 rounded-md border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/50">
              <label className="min-w-[14rem] flex-1 space-y-1 text-sm">
                <span className="font-medium text-slate-700 dark:text-slate-200">Agregar equipo base</span>
                <select name="sourceTeamId" className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-950">
                  <option value="">Selecciona...</option>
                  {data.availableSourceTeams.map((team) => (
                    <option key={team.id} value={team.id}>
                      {team.name} · {team.level ?? "Sin nivel"} · {TEAM_GENDER_LABELS[team.gender ?? ""] ?? "Mixto"}
                    </option>
                  ))}
                </select>
              </label>
              <button type="submit" className="rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800">
                Agregar
              </button>
            </form>

            <div className="space-y-3">
              {data.sourceTeams.map((team) => {
                const isSelected = data.selectedSourceTeamId === team.sourceTeamId;
                const href = `/tournaments/${data.id}?sourceTeamId=${team.sourceTeamId}`;
                return (
                  <article
                    key={team.linkId}
                    className={`rounded-md border p-3 ${
                      isSelected
                        ? "border-portoBlue bg-blue-50/60 dark:border-sky-500 dark:bg-sky-950/20"
                        : "border-slate-200 dark:border-slate-700"
                    }`}
                  >
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-semibold text-slate-900 dark:text-slate-100">{team.sourceTeamName}</h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                          {team.categoryLabel} · {team.level ?? "Sin nivel"} · {team.coachName ?? "Sin coach"}
                        </p>
                      </div>
                      <div className="text-right text-sm">
                        <p className="font-semibold text-slate-900 dark:text-slate-100">{team.progressLabel}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">Inscritos / base</p>
                      </div>
                    </div>

                    <div className="mb-3 grid grid-cols-3 gap-2 text-sm">
                      <div className="rounded-md bg-slate-50 px-3 py-2 dark:bg-slate-800/60">
                        <p className="text-xs uppercase text-slate-500 dark:text-slate-400">Interés</p>
                        <p className="font-semibold text-slate-900 dark:text-slate-100">{team.interestedCount}</p>
                      </div>
                      <div className="rounded-md bg-slate-50 px-3 py-2 dark:bg-slate-800/60">
                        <p className="text-xs uppercase text-slate-500 dark:text-slate-400">Final</p>
                        <p className="font-semibold text-slate-900 dark:text-slate-100">{team.finalRosterLabel}</p>
                      </div>
                      <div className="rounded-md bg-slate-50 px-3 py-2 dark:bg-slate-800/60">
                        <p className="text-xs uppercase text-slate-500 dark:text-slate-400">Estado</p>
                        <p className="font-semibold text-slate-900 dark:text-slate-100">
                          {team.rosterStatus === "approved" ? "Aprobado" : "Planeando"}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Link href={href} className="rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800">
                        Abrir
                      </Link>
                      <form action={updateTournamentSourceTeamSettingsAction.bind(null, data.id, team.linkId)} className="flex items-center gap-2">
                        <input type="hidden" name="returnTo" value={href} />
                        <select name="participationMode" defaultValue={team.participationMode} className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950">
                          <option value="competitive">Competitivo</option>
                          <option value="invited">Invitado</option>
                        </select>
                        <button type="submit" className="rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800">
                          Guardar
                        </button>
                      </form>
                      <form action={detachTournamentSourceTeamAction.bind(null, data.id, team.linkId)}>
                        <button type="submit" className="rounded-md border border-rose-300 px-3 py-2 text-sm text-rose-700 hover:bg-rose-50 dark:border-rose-800 dark:text-rose-300 dark:hover:bg-rose-950/30">
                          Quitar
                        </button>
                      </form>
                    </div>
                  </article>
                );
              })}

              {data.sourceTeams.length === 0 ? (
                <p className="rounded-md border border-dashed border-slate-300 px-4 py-5 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                  Agrega al menos un equipo base para empezar a medir inscripciones.
                </p>
              ) : null}
            </div>
          </div>

          <div className="space-y-4 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
            {selectedSourceTeam ? (
              <>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{selectedSourceTeam.sourceTeamName}</h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      {selectedSourceTeam.categoryLabel} · {selectedSourceTeam.participationMode === "invited" ? "Invitado" : "Competitivo"}
                    </p>
                  </div>
                  <form action={approveTournamentSourceRosterAction.bind(null, data.id, selectedSourceTeam.linkId)}>
                    <input type="hidden" name="returnTo" value={returnTo} />
                    <button type="submit" className="rounded-md bg-portoBlue px-4 py-2 text-sm font-medium text-white hover:bg-portoDark">
                      {selectedSourceTeam.rosterStatus === "approved" ? "Rehacer roster final" : "Aprobar roster final"}
                    </button>
                  </form>
                </div>

                <div className="grid gap-3 md:grid-cols-4">
                  <div className="rounded-md bg-slate-50 px-3 py-2 dark:bg-slate-800/60">
                    <p className="text-xs uppercase text-slate-500 dark:text-slate-400">Roster base</p>
                    <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">{selectedSourceTeam.rosterCount}</p>
                  </div>
                  <div className="rounded-md bg-slate-50 px-3 py-2 dark:bg-slate-800/60">
                    <p className="text-xs uppercase text-slate-500 dark:text-slate-400">Confirmados</p>
                    <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">{selectedSourceTeam.confirmedCount}</p>
                  </div>
                  <div className="rounded-md bg-slate-50 px-3 py-2 dark:bg-slate-800/60">
                    <p className="text-xs uppercase text-slate-500 dark:text-slate-400">Interesados</p>
                    <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">{selectedSourceTeam.interestedCount}</p>
                  </div>
                  <div className="rounded-md bg-slate-50 px-3 py-2 dark:bg-slate-800/60">
                    <p className="text-xs uppercase text-slate-500 dark:text-slate-400">Roster final</p>
                    <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">{selectedSourceTeam.finalRosterLabel}</p>
                  </div>
                </div>

                <div className="grid gap-6 xl:grid-cols-2">
                  <article className="space-y-3">
                    <div>
                      <h3 className="font-semibold text-slate-900 dark:text-slate-100">Inscritos confirmados</h3>
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        Caso normal: el roster final parte de aquí. Los ajustes deberían ser la excepción.
                      </p>
                    </div>
                    <div className="space-y-2">
                      {selectedSourceTeam.confirmedPlayers.map((player) => {
                        const alreadyInRoster = Boolean(
                          selectedSourceTeam.finalRosterPlayers.find((row) => row.enrollmentId === player.enrollmentId),
                        );
                        return (
                          <div key={player.enrollmentId} className="rounded-md border border-slate-200 px-3 py-2 text-sm dark:border-slate-700">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="font-medium text-slate-900 dark:text-slate-100">{player.playerName}</p>
                                <p className="text-slate-500 dark:text-slate-400">
                                  {player.birthYear ?? "Sin categoría"} · {alreadyInRoster ? "En roster final" : "Pendiente de roster"}
                                </p>
                              </div>
                              {selectedSourceTeam.defaultSquadId && !alreadyInRoster ? (
                                <form action={assignTournamentSquadPlayerAction.bind(null, data.id)} className="flex items-center gap-2">
                                  <input type="hidden" name="squadId" value={selectedSourceTeam.defaultSquadId} />
                                  <input type="hidden" name="enrollmentId" value={player.enrollmentId} />
                                  <input type="hidden" name="mode" value="regular" />
                                  <input type="hidden" name="returnTo" value={returnTo} />
                                  <button type="submit" className="rounded-md border border-slate-300 px-3 py-1.5 text-xs hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800">
                                    Agregar
                                  </button>
                                </form>
                              ) : null}
                            </div>
                          </div>
                        );
                      })}
                      {selectedSourceTeam.confirmedPlayers.length === 0 ? (
                        <p className="rounded-md border border-dashed border-slate-300 px-4 py-5 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                          Todavía no hay inscritos confirmados.
                        </p>
                      ) : null}
                    </div>
                  </article>

                  <article className="space-y-3">
                    <div>
                      <h3 className="font-semibold text-slate-900 dark:text-slate-100">Roster final aprobado</h3>
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        Cuando se aprueba, este roster deja de moverse solo. Los pagos tardíos quedan como candidatos.
                      </p>
                    </div>
                    <div className="space-y-2">
                      {selectedSourceTeam.finalRosterPlayers.map((player) => (
                        <div key={player.assignmentId ?? player.enrollmentId} className="rounded-md border border-slate-200 px-3 py-2 text-sm dark:border-slate-700">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-medium text-slate-900 dark:text-slate-100">{player.playerName}</p>
                              <p className="text-slate-500 dark:text-slate-400">
                                {player.birthYear ?? "Sin categoría"} · {player.role === "refuerzo" ? "Refuerzo" : "Regular"}
                              </p>
                            </div>
                            {player.assignmentId ? (
                              <form action={removeTournamentSquadPlayerAction.bind(null, data.id, player.assignmentId, returnTo)}>
                                <button type="submit" className="rounded-md border border-rose-300 px-3 py-1.5 text-xs text-rose-700 hover:bg-rose-50 dark:border-rose-800 dark:text-rose-300 dark:hover:bg-rose-950/30">
                                  Quitar
                                </button>
                              </form>
                            ) : null}
                          </div>
                        </div>
                      ))}
                      {selectedSourceTeam.finalRosterPlayers.length === 0 ? (
                        <p className="rounded-md border border-dashed border-slate-300 px-4 py-5 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                          Aún no hay roster final aprobado para este equipo.
                        </p>
                      ) : null}
                    </div>
                  </article>
                </div>

                <div className="grid gap-6 xl:grid-cols-2">
                  <article className="space-y-3">
                    <div>
                      <h3 className="font-semibold text-slate-900 dark:text-slate-100">Interesados</h3>
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        Estado suave para planeación. No cuenta como inscripción confirmada.
                      </p>
                    </div>
                    <div className="space-y-2">
                      {selectedSourceTeam.interestedPlayers.map((player) => (
                        <div key={player.enrollmentId} className="rounded-md border border-slate-200 px-3 py-2 text-sm dark:border-slate-700">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-medium text-slate-900 dark:text-slate-100">{player.playerName}</p>
                              <p className="text-slate-500 dark:text-slate-400">{player.birthYear ?? "Sin categoría"}</p>
                            </div>
                            <form action={setTournamentInterestAction.bind(null, data.id, selectedSourceTeam.sourceTeamId, player.enrollmentId, false)}>
                              <input type="hidden" name="returnTo" value={returnTo} />
                              <button type="submit" className="rounded-md border border-slate-300 px-3 py-1.5 text-xs hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800">
                                Quitar interés
                              </button>
                            </form>
                          </div>
                        </div>
                      ))}
                      {selectedSourceTeam.interestedPlayers.length === 0 ? (
                        <p className="rounded-md border border-dashed border-slate-300 px-4 py-5 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                          No hay jugadores marcados como interesados.
                        </p>
                      ) : null}
                    </div>
                  </article>

                  <article className="space-y-3">
                    <div>
                      <h3 className="font-semibold text-slate-900 dark:text-slate-100">Aún no inscritos</h3>
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        Puedes marcar interés manualmente para seguir a los jugadores antes del pago.
                      </p>
                    </div>
                    <div className="space-y-2">
                      {selectedSourceTeam.missingPlayers.map((player) => (
                        <div key={player.enrollmentId} className="rounded-md border border-slate-200 px-3 py-2 text-sm dark:border-slate-700">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-medium text-slate-900 dark:text-slate-100">{player.playerName}</p>
                              <p className="text-slate-500 dark:text-slate-400">{player.birthYear ?? "Sin categoría"}</p>
                            </div>
                            <form action={setTournamentInterestAction.bind(null, data.id, selectedSourceTeam.sourceTeamId, player.enrollmentId, true)}>
                              <input type="hidden" name="returnTo" value={returnTo} />
                              <button type="submit" className="rounded-md border border-slate-300 px-3 py-1.5 text-xs hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800">
                                Marcar interés
                              </button>
                            </form>
                          </div>
                        </div>
                      ))}
                      {selectedSourceTeam.missingPlayers.length === 0 ? (
                        <p className="rounded-md border border-dashed border-slate-300 px-4 py-5 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                          Todo el roster base ya tiene pago confirmado o interés marcado.
                        </p>
                      ) : null}
                    </div>
                  </article>
                </div>
              </>
            ) : (
              <p className="rounded-md border border-dashed border-slate-300 px-4 py-8 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                Selecciona un equipo base para revisar inscritos y roster final.
              </p>
            )}
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
          <div className="space-y-4 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Herramientas avanzadas</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Úsalas solo cuando el caso normal no alcance: divisiones, mezclas o ajustes excepcionales.
              </p>
            </div>

            <form action={createTournamentSquadAction.bind(null, data.id)} className="grid gap-3">
              <label className="space-y-1 text-sm">
                <span className="font-medium text-slate-700 dark:text-slate-200">Equipo base</span>
                <select name="sourceTeamId" defaultValue={data.selectedSourceTeamId ?? ""} className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-950">
                  <option value="">Selecciona...</option>
                  {data.sourceTeams.map((team) => (
                    <option key={team.sourceTeamId} value={team.sourceTeamId}>
                      {team.sourceTeamName}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1 text-sm">
                <span className="font-medium text-slate-700 dark:text-slate-200">Etiqueta</span>
                <input name="label" className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-950" placeholder="Equipo A / Equipo B / Refuerzos" />
              </label>

              <div className="grid gap-3 sm:grid-cols-3">
                <label className="space-y-1 text-sm">
                  <span className="font-medium text-slate-700 dark:text-slate-200">Mínimo</span>
                  <input name="minTargetPlayers" defaultValue="7" className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-950" />
                </label>
                <label className="space-y-1 text-sm">
                  <span className="font-medium text-slate-700 dark:text-slate-200">Máximo</span>
                  <input name="maxTargetPlayers" defaultValue="14" className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-950" />
                </label>
                <label className="space-y-1 text-sm">
                  <span className="font-medium text-slate-700 dark:text-slate-200">Límite refuerzos</span>
                  <input name="refuerzoLimit" defaultValue="3" className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-950" />
                </label>
              </div>

              <button type="submit" className="rounded-md border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800">
                Crear escuadra avanzada
              </button>
            </form>
          </div>

          <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Escuadras avanzadas</h2>
            {data.advancedSquads.map((squad) => (
              <article key={squad.id} className="rounded-md border border-slate-200 p-3 dark:border-slate-700">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-slate-900 dark:text-slate-100">{squad.label}</h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      {squad.sourceTeamName} · {squad.fillLabel} · {squad.refuerzoLabel}
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  {squad.members.map((member) => (
                    <div key={member.assignmentId ?? member.enrollmentId} className="rounded-md border border-slate-200 px-3 py-2 text-sm dark:border-slate-700">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-medium text-slate-900 dark:text-slate-100">{member.playerName}</p>
                          <p className="text-slate-500 dark:text-slate-400">
                            {member.birthYear ?? "Sin categoría"} · {member.role === "refuerzo" ? "Refuerzo" : "Regular"}
                          </p>
                        </div>
                        {member.assignmentId ? (
                          <form action={removeTournamentSquadPlayerAction.bind(null, data.id, member.assignmentId, returnTo)}>
                            <button type="submit" className="rounded-md border border-rose-300 px-3 py-1.5 text-xs text-rose-700 hover:bg-rose-50 dark:border-rose-800 dark:text-rose-300 dark:hover:bg-rose-950/30">
                              Quitar
                            </button>
                          </form>
                        ) : null}
                      </div>
                    </div>
                  ))}
                  {squad.members.length === 0 ? (
                    <p className="rounded-md border border-dashed border-slate-300 px-4 py-5 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                      Todavía no hay jugadores en esta escuadra.
                    </p>
                  ) : null}
                </div>
              </article>
            ))}
            {data.advancedSquads.length === 0 ? (
              <p className="rounded-md border border-dashed border-slate-300 px-4 py-5 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                No hay escuadras avanzadas creadas. Para la mayoría de los casos basta el roster final del equipo base.
              </p>
            ) : null}
          </div>
        </section>
      </div>
    </PageShell>
  );
}
