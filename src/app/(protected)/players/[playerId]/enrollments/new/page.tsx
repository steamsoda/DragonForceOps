import { PageShell } from "@/components/ui/page-shell";

export default async function EnrollmentCreatePage({
  params
}: {
  params: Promise<{ playerId: string }>;
}) {
  const { playerId } = await params;

  return (
    <PageShell title="Crear inscripcion" subtitle={`Jugador: ${playerId}`}>
      <p className="text-sm text-slate-700">
        Pendiente: crear formulario de inscripcion con campus, plan de precios, fecha de inicio y cargos iniciales opcionales.
      </p>
    </PageShell>
  );
}
