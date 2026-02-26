import { PageShell } from "@/components/ui/page-shell";

export default async function ChargeCreatePage({
  params
}: {
  params: Promise<{ enrollmentId: string }>;
}) {
  const { enrollmentId } = await params;

  return (
    <PageShell title="Crear cargo" subtitle={`Inscripcion: ${enrollmentId}`}>
      <p className="text-sm text-slate-700">
        Pendiente: crear formulario de cargo para inscripcion, uniforme, torneos, copas, viajes y eventos.
      </p>
    </PageShell>
  );
}
