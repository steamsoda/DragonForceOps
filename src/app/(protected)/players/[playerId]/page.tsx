import Link from "next/link";
import { notFound } from "next/navigation";
import { PageShell } from "@/components/ui/page-shell";
import { getPlayerDetail } from "@/lib/queries/players";

function formatMoney(amount: number, currency: string) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency }).format(amount);
}

function getStatusLabel(status: string) {
  switch (status) {
    case "active":
      return "Activo";
    case "inactive":
      return "Inactivo";
    case "archived":
      return "Archivado";
    case "paused":
      return "Pausado";
    case "ended":
      return "Finalizado";
    case "cancelled":
      return "Cancelado";
    default:
      return status;
  }
}

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

  return (
    <PageShell title={player.fullName} subtitle="Identidad del jugador, tutores, inscripciones y resumen de cuenta">
      <div className="space-y-6">
        <section className="grid gap-4 rounded-md border border-slate-200 p-4 md:grid-cols-4">
          <div>
            <p className="text-xs uppercase text-slate-500">Estatus</p>
            <p className="font-medium">{getStatusLabel(player.status)}</p>
          </div>
          <div>
            <p className="text-xs uppercase text-slate-500">Fecha de nacimiento</p>
            <p className="font-medium">{player.birthDate}</p>
          </div>
          <div>
            <p className="text-xs uppercase text-slate-500">Genero</p>
            <p className="font-medium">{player.gender ?? "-"}</p>
          </div>
          <div>
            <p className="text-xs uppercase text-slate-500">Notas medicas</p>
            <p className="font-medium">{player.medicalNotes ?? "-"}</p>
          </div>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-slate-900">Tutores</h2>
          <div className="overflow-x-auto rounded-md border border-slate-200">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-600">
                <tr>
                  <th className="px-3 py-2">Nombre</th>
                  <th className="px-3 py-2">Telefono principal</th>
                  <th className="px-3 py-2">Telefono secundario</th>
                  <th className="px-3 py-2">Email</th>
                  <th className="px-3 py-2">Parentesco</th>
                  <th className="px-3 py-2">Principal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {player.guardians.length === 0 ? (
                  <tr>
                    <td className="px-3 py-4 text-slate-600" colSpan={6}>
                      No hay tutores vinculados.
                    </td>
                  </tr>
                ) : (
                  player.guardians.map((guardian) => (
                    <tr key={guardian.id}>
                      <td className="px-3 py-2">
                        {guardian.first_name} {guardian.last_name}
                      </td>
                      <td className="px-3 py-2">{guardian.phone_primary}</td>
                      <td className="px-3 py-2">{guardian.phone_secondary ?? "-"}</td>
                      <td className="px-3 py-2">{guardian.email ?? "-"}</td>
                      <td className="px-3 py-2">{guardian.relationship_label ?? "-"}</td>
                      <td className="px-3 py-2">{guardian.isPrimary ? "Si" : "No"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">Inscripciones</h2>
            <Link
              href={`/players/${player.id}/enrollments/new`}
              className="rounded-md bg-portoBlue px-3 py-1.5 text-sm font-medium text-white hover:bg-portoDark"
            >
              Nueva inscripcion
            </Link>
          </div>
          <div className="overflow-x-auto rounded-md border border-slate-200">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-600">
                <tr>
                  <th className="px-3 py-2">Campus</th>
                  <th className="px-3 py-2">Estatus</th>
                  <th className="px-3 py-2">Fechas</th>
                  <th className="px-3 py-2">Plan de precios</th>
                  <th className="px-3 py-2">Cargos</th>
                  <th className="px-3 py-2">Pagos</th>
                  <th className="px-3 py-2">Saldo</th>
                  <th className="px-3 py-2">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {player.enrollments.length === 0 ? (
                  <tr>
                    <td className="px-3 py-4 text-slate-600" colSpan={8}>
                      No se encontraron inscripciones.
                    </td>
                  </tr>
                ) : (
                  player.enrollments.map((enrollment) => (
                    <tr key={enrollment.id}>
                      <td className="px-3 py-2">
                        {enrollment.campusName} ({enrollment.campusCode})
                      </td>
                      <td className="px-3 py-2">{getStatusLabel(enrollment.status)}</td>
                      <td className="px-3 py-2">
                        <p>Inicio: {enrollment.startDate}</p>
                        <p>Fin: {enrollment.endDate ?? "-"}</p>
                      </td>
                      <td className="px-3 py-2">{enrollment.pricingPlanName}</td>
                      <td className="px-3 py-2">{formatMoney(enrollment.totalCharges, enrollment.currency)}</td>
                      <td className="px-3 py-2">{formatMoney(enrollment.totalPayments, enrollment.currency)}</td>
                      <td className="px-3 py-2 font-medium">{formatMoney(enrollment.balance, enrollment.currency)}</td>
                      <td className="px-3 py-2">
                        <div className="flex gap-3">
                          <Link
                            href={`/players/${player.id}/enrollments/${enrollment.id}/edit`}
                            className="text-portoBlue hover:underline"
                          >
                            Editar
                          </Link>
                          <Link href={`/enrollments/${enrollment.id}/charges`} className="text-portoBlue hover:underline">
                            Cuenta
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </PageShell>
  );
}
