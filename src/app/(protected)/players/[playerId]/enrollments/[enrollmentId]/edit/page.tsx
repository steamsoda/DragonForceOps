import { PageShell } from "@/components/ui/page-shell";

export default async function EnrollmentEditPage({
  params
}: {
  params: Promise<{ playerId: string; enrollmentId: string }>;
}) {
  const { playerId, enrollmentId } = await params;

  return (
    <PageShell title="Editar inscripcion" subtitle={`Jugador: ${playerId} | Inscripcion: ${enrollmentId}`}>
      <p className="text-sm text-slate-700">
        Pendiente: actualizar campus/estatus/fecha de fin y controles del flujo de cambio de campus.
      </p>
    </PageShell>
  );
}
