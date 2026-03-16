import Link from "next/link";
import { notFound } from "next/navigation";
import { PageShell } from "@/components/ui/page-shell";
import { getPlayerDetail } from "@/lib/queries/players";

function formatMoney(amount: number, currency: string) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency }).format(amount);
}

const DROPOUT_LABELS: Record<string, string> = {
  cost: "Costo",
  distance: "Distancia",
  injury: "Lesion",
  attitude: "Actitud",
  time: "Tiempo",
  level_change: "Cambio de nivel",
  other: "Otro"
};

export default async function PlayerDetailPage({
  params
}: {
  params: Promise<{ playerId: string }>;
}) {
  const { playerId } = await params;
  const player = await getPlayerDetail(playerId);

  if (!player) {
    notFound();
  }

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
      <div className="space-y-6">
        {/* Player info */}
        <section className="grid gap-4 rounded-md border border-slate-200 dark:border-slate-700 p-4 md:grid-cols-4">
          <div>
            <p className="text-xs uppercase text-slate-500 dark:text-slate-400">Fecha de nacimiento</p>
            <p className="font-medium">{player.birthDate}</p>
          </div>
          <div>
            <p className="text-xs uppercase text-slate-500 dark:text-slate-400">Genero</p>
            <p className="font-medium">{player.gender === "male" ? "Masculino" : player.gender === "female" ? "Femenino" : "-"}</p>
          </div>
          <div>
            <p className="text-xs uppercase text-slate-500 dark:text-slate-400">Notas medicas</p>
            <p className="font-medium">{player.medicalNotes ?? "-"}</p>
          </div>
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
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {player.guardians.length === 0 ? (
                  <tr>
                    <td className="px-3 py-4 text-slate-600 dark:text-slate-400" colSpan={5}>
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
                  <p className="font-medium">{activeEnrollment.startDate}</p>
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
                  href={`/enrollments/${activeEnrollment.id}/charges`}
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
                  <p className="font-medium">{lastEnrollment.startDate}</p>
                </div>
                <div>
                  <p className="text-xs uppercase text-slate-500 dark:text-slate-400">Fecha de baja</p>
                  <p className="font-medium">{lastEnrollment.endDate ?? "-"}</p>
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
