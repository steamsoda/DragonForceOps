import { PageShell } from "@/components/ui/page-shell";

export default async function TeamAssignmentPage({
  params
}: {
  params: Promise<{ enrollmentId: string }>;
}) {
  const { enrollmentId } = await params;

  return (
    <PageShell title="Asignacion de equipo" subtitle={`Inscripcion: ${enrollmentId}`}>
      <p className="text-sm text-slate-700">Pendiente: asignar la inscripcion a un equipo activo del mismo campus.</p>
    </PageShell>
  );
}
