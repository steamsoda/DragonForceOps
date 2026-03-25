import Link from "next/link";
import { notFound } from "next/navigation";
import { PageShell } from "@/components/ui/page-shell";
import { getPlayerDetail } from "@/lib/queries/players";
import { getUniformOrdersAction } from "@/server/actions/uniforms";
import { UniformOrdersSection } from "@/components/players/uniform-orders-section";

function formatMoney(amount: number, currency: string) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency }).format(amount);
}

// Safe DD/MM/YYYY formatter for date-only strings (YYYY-MM-DD).
// Avoids new Date() to prevent UTC-midnight timezone shifts.
function fmtDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "-";
  const [y, m, d] = dateStr.split("-");
  return d ? `${d}/${m}/${y}` : dateStr;
}

const DROPOUT_LABELS: Record<string, string> = {
  coach_capability: "Falta de capacidad del entrenador",
  exercise_difficulty: "Dificultad para realizar los ejercicios",
  financial: "Financiero",
  training_quality: "Falta de calidad en el entrenamiento",
  school_disorganization: "Desorganización de la escuela",
  facility_safety: "Falta de seguridad en instalaciones",
  transport: "Incompatibilidad de transportes",
  family_health: "Salud de familiares",
  player_health: "Salud del alumno",
  schedule_conflict: "Incompatibilidad de horarios",
  coach_communication: "Comunicación del entrenador",
  wants_competition: "Quiere pasar a competición",
  lack_of_information: "Falta de información",
  pedagogy: "Falta de pedagogía",
  moved_to_competition_club: "Cambio a club de competición",
  player_coach_relationship: "Relación alumno–entrenador",
  unattractive_exercises: "Ejercicios poco atractivos",
  moved_residence: "Cambio de residencia",
  school_performance_punishment: "Castigo por rendimiento escolar",
  home_behavior_punishment: "Castigo por comportamiento en casa",
  personal: "Motivos personales",
  distance: "Distancia / logística",
  parent_work: "Trabajo del padre o madre",
  injury: "Lesión",
  dislikes_football: "No le gusta el fútbol",
  lost_contact: "Sin contacto con los padres",
  low_peer_attendance: "Poca asistencia de compañeros",
  changed_sport: "Cambio de deporte",
  did_not_return: "Ya no regresó",
  temporary_leave: "Baja temporal — piensa regresar",
  moved_to_another_academy: "Cambio a otra academia",
  school_schedule_conflict: "Complicaciones horario escolar",
  coach_change: "Cambio de profe",
  cold_weather: "Clima frío",
  other: "Otros"
};

export default async function PlayerDetailPage({
  params,
  searchParams
}: {
  params: Promise<{ playerId: string }>;
  searchParams: Promise<{ ok?: string; err?: string; }>;
}) {
  const { playerId } = await params;
  const sp = await searchParams;
  const player = await getPlayerDetail(playerId);

  if (!player) {
    notFound();
  }

  const activeEnrollmentId = player.enrollments.find((e) => e.status === "active")?.id ?? null;
  const uniformOrders = activeEnrollmentId ? await getUniformOrdersAction(activeEnrollmentId) : [];

  const activeEnrollment = player.enrollments.find((e) => e.status === "active") ?? null;
  const lastEnrollment = !activeEnrollment && player.enrollments.length > 0 ? player.enrollments[0] : null;
  const daysSinceEnrollment = activeEnrollment
    ? Math.floor((Date.now() - new Date(activeEnrollment.startDate).getTime()) / (1000 * 60 * 60 * 24))
    : null;
  const daysEnrolledLast =
    lastEnrollment?.startDate && lastEnrollment?.endDate
      ? Math.floor(
          (new Date(lastEnrollment.endDate).getTime() - new Date(lastEnrollment.startDate).getTime()) /
            (1000 * 60 * 60 * 24)
        )
      : null;

  return (
    <PageShell
      title={player.fullName}
      breadcrumbs={[{ label: "Jugadores", href: "/players" }, { label: player.fullName }]}
    >
      <div className="flex justify-end mb-2">
        <Link href={`/players/${player.id}/edit`} className="rounded-md border border-slate-300 dark:border-slate-600 px-3 py-1.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-800">
          Editar jugador
        </Link>
      </div>
      {(sp.ok === "updated" || sp.ok === "guardian_updated") && (
        <div className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/20 px-4 py-3 text-sm text-emerald-800 dark:text-emerald-200">
          {sp.ok === "guardian_updated" ? "✓ Datos del tutor actualizados." : "✓ Datos del jugador actualizados."}
        </div>
      )}
      {sp.ok === "merged" && (
        <div className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/20 px-4 py-3 text-sm text-emerald-800 dark:text-emerald-200">
          ✓ Jugadores fusionados correctamente. Este es el registro master.
        </div>
      )}
      {activeEnrollment && !player.activeTeam && (
        <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/20 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
          Este jugador está activo pero no tiene equipo asignado.{" "}
          <a href="/teams" className="underline hover:text-amber-900">Ver equipos</a>
        </div>
      )}
      <div className="space-y-6">
        {/* Player info */}
        <section className="grid gap-4 rounded-md border border-slate-200 dark:border-slate-700 p-4 md:grid-cols-4">
          <div>
            <p className="text-xs uppercase text-slate-500 dark:text-slate-400">Fecha de nacimiento</p>
            <p className="font-medium">{fmtDate(player.birthDate)}</p>
          </div>
          <div>
            <p className="text-xs uppercase text-slate-500 dark:text-slate-400">Género</p>
            <p className="font-medium">{player.gender === "male" ? "Masculino" : player.gender === "female" ? "Femenino" : "-"}</p>
          </div>
          <div>
            <p className="text-xs uppercase text-slate-500 dark:text-slate-400">Talla de uniforme</p>
            <p className="font-medium">{player.uniformSize ?? <span className="text-slate-400">Sin registrar</span>}</p>
          </div>
          <div>
            <p className="text-xs uppercase text-slate-500 dark:text-slate-400">Notas médicas</p>
            <p className="font-medium">{player.medicalNotes ?? "-"}</p>
          </div>
          {player.isGoalkeeper && (
            <div>
              <p className="text-xs uppercase text-slate-500 dark:text-slate-400">Posición</p>
              <span className="inline-block rounded-full bg-violet-100 dark:bg-violet-900/40 px-2 py-0.5 text-xs font-medium text-violet-700 dark:text-violet-300">Portero</span>
            </div>
          )}
          {player.activeTeam && (
            <div>
              <p className="text-xs uppercase text-slate-500 dark:text-slate-400">Equipo</p>
              <a href={`/teams/${player.activeTeam.id}`} className="font-medium text-portoBlue hover:underline">
                {player.activeTeam.name}
              </a>
              {player.activeTeam.coachName && (
                <p className="text-xs text-slate-400">{player.activeTeam.coachName}</p>
              )}
            </div>
          )}
        </section>

        {/* Guardians */}
        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Tutores</h2>
          <div className="overflow-x-auto rounded-md border border-slate-200 dark:border-slate-700">
            <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700 text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800 text-left text-xs uppercase tracking-wide text-slate-600 dark:text-slate-400">
                <tr>
                  <th className="px-3 py-2">Nombre</th>
                  <th className="px-3 py-2">Telefono principal</th>
                  <th className="px-3 py-2">Telefono secundario</th>
                  <th className="px-3 py-2">Email</th>
                  <th className="px-3 py-2">Parentesco</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {player.guardians.length === 0 ? (
                  <tr>
                    <td className="px-3 py-4 text-slate-600 dark:text-slate-400" colSpan={6}>
                      No hay tutores vinculados.
                    </td>
                  </tr>
                ) : (
                  player.guardians.map((guardian) => (
                    <tr key={guardian.id}>
                      <td className="px-3 py-2">
                        {guardian.first_name} {guardian.last_name}
                        {guardian.isPrimary && (
                          <span className="ml-2 rounded-full bg-portoBlue/10 px-1.5 py-0.5 text-xs text-portoBlue">
                            Principal
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2">{guardian.phone_primary}</td>
                      <td className="px-3 py-2">{guardian.phone_secondary ?? "-"}</td>
                      <td className="px-3 py-2">{guardian.email ?? "-"}</td>
                      <td className="px-3 py-2">{guardian.relationship_label ?? "-"}</td>
                      <td className="px-3 py-2">
                        <Link
                          href={`/players/${player.id}/guardians/${guardian.id}/edit`}
                          className="text-xs text-portoBlue hover:underline"
                        >
                          Editar
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Team / Categoría / Coach */}
        {player.activeTeam && (
          <section className="grid gap-4 rounded-md border border-slate-200 dark:border-slate-700 p-4 md:grid-cols-4">
            <div>
              <p className="text-xs uppercase text-slate-500 dark:text-slate-400">Equipo</p>
              <p className="font-medium">{player.activeTeam.name}</p>
            </div>
            <div>
              <p className="text-xs uppercase text-slate-500 dark:text-slate-400">Categoría</p>
              <p className="font-medium">{player.activeTeam.birthYear ?? "-"}</p>
            </div>
            <div>
              <p className="text-xs uppercase text-slate-500 dark:text-slate-400">Nivel</p>
              <p className="font-medium">{player.activeTeam.level ?? "-"}</p>
            </div>
            <div>
              <p className="text-xs uppercase text-slate-500 dark:text-slate-400">Coach</p>
              <p className="font-medium">{player.activeTeam.coachName ?? "Sin asignar"}</p>
            </div>
          </section>
        )}

        {/* Uniform orders — only shown when player has active enrollment */}
        {activeEnrollmentId && (
          <UniformOrdersSection
            playerId={player.id}
            enrollmentId={activeEnrollmentId}
            initialOrders={uniformOrders}
          />
        )}

        {/* Current enrollment */}
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Inscripcion</h2>
            {!activeEnrollment && (
              <Link
                href={`/players/${player.id}/enrollments/new`}
                className="rounded-md bg-portoBlue px-3 py-1.5 text-sm font-medium text-white hover:bg-portoDark"
              >
                Nueva inscripcion
              </Link>
            )}
          </div>

          {activeEnrollment ? (
            <div className="rounded-md border border-slate-200 dark:border-slate-700 p-4">
              <div className="grid gap-4 md:grid-cols-4">
                <div>
                  <p className="text-xs uppercase text-slate-500 dark:text-slate-400">Campus</p>
                  <p className="font-medium">{activeEnrollment.campusName}</p>
                </div>
                <div>
                  <p className="text-xs uppercase text-slate-500 dark:text-slate-400">Plan</p>
                  <p className="font-medium">{activeEnrollment.pricingPlanName}</p>
                </div>
                <div>
                  <p className="text-xs uppercase text-slate-500 dark:text-slate-400">Fecha de inicio</p>
                  <p className="font-medium">{fmtDate(activeEnrollment.startDate)}</p>
                </div>
                <div>
                  <p className="text-xs uppercase text-slate-500 dark:text-slate-400">Dias inscrito</p>
                  <p className="font-medium">{daysSinceEnrollment} dias</p>
                </div>
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-3">
                <div>
                  <p className="text-xs uppercase text-slate-500 dark:text-slate-400">Total cargos</p>
                  <p className="font-medium">{formatMoney(activeEnrollment.totalCharges, activeEnrollment.currency)}</p>
                </div>
                <div>
                  <p className="text-xs uppercase text-slate-500 dark:text-slate-400">Total pagos</p>
                  <p className="font-medium">{formatMoney(activeEnrollment.totalPayments, activeEnrollment.currency)}</p>
                </div>
                <div>
                  <p className="text-xs uppercase text-slate-500 dark:text-slate-400">Saldo pendiente</p>
                  <p className={`font-semibold ${activeEnrollment.balance > 0 ? "text-rose-600" : "text-emerald-600"}`}>
                    {formatMoney(activeEnrollment.balance, activeEnrollment.currency)}
                  </p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <Link
                  href={`/caja?enrollmentId=${activeEnrollment.id}`}
                  className="rounded-md bg-portoBlue px-4 py-2 text-sm font-medium text-white hover:bg-portoDark"
                >
                  Registrar pago
                </Link>
                <Link
                  href={`/enrollments/${activeEnrollment.id}/charges`}
                  className="text-sm text-portoBlue hover:underline"
                >
                  Ver cuenta completa
                </Link>
                <Link
                  href={`/players/${player.id}/enrollments/${activeEnrollment.id}/edit`}
                  className="text-sm text-portoBlue hover:underline"
                >
                  Editar inscripcion
                </Link>
              </div>
            </div>
          ) : lastEnrollment ? (
            <div className="rounded-md border border-slate-200 dark:border-slate-700 p-4 space-y-3">
              <p className="text-xs text-amber-700 font-medium uppercase tracking-wide">Ultima inscripcion (baja)</p>
              <div className="grid gap-4 md:grid-cols-4">
                <div>
                  <p className="text-xs uppercase text-slate-500 dark:text-slate-400">Campus</p>
                  <p className="font-medium">{lastEnrollment.campusName}</p>
                </div>
                <div>
                  <p className="text-xs uppercase text-slate-500 dark:text-slate-400">Fecha de inicio</p>
                  <p className="font-medium">{fmtDate(lastEnrollment.startDate)}</p>
                </div>
                <div>
                  <p className="text-xs uppercase text-slate-500 dark:text-slate-400">Fecha de baja</p>
                  <p className="font-medium">{fmtDate(lastEnrollment.endDate)}</p>
                </div>
                <div>
                  <p className="text-xs uppercase text-slate-500 dark:text-slate-400">Dias inscrito</p>
                  <p className="font-medium">{daysEnrolledLast != null ? `${daysEnrolledLast} dias` : "-"}</p>
                </div>
              </div>
              {lastEnrollment.dropoutReason && (
                <div>
                  <p className="text-xs uppercase text-slate-500 dark:text-slate-400">Motivo de baja</p>
                  <p className="font-medium">
                    {DROPOUT_LABELS[lastEnrollment.dropoutReason] ?? lastEnrollment.dropoutReason}
                  </p>
                  {lastEnrollment.dropoutNotes && (
                    <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">{lastEnrollment.dropoutNotes}</p>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-800">
              Este jugador no tiene inscripcion activa. Usa el boton &quot;Nueva inscripcion&quot; para inscribirlo.
            </div>
          )}
        </section>
      </div>
    </PageShell>
  );
}
