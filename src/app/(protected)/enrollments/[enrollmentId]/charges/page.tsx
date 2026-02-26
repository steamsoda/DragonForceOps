import { PageShell } from "@/components/ui/page-shell";

export default async function ChargesPage({
  params
}: {
  params: Promise<{ enrollmentId: string }>;
}) {
  const { enrollmentId } = await params;

  return (
    <PageShell title="Cargos y cuenta" subtitle={`Inscripcion: ${enrollmentId}`}>
      <p className="text-sm text-slate-700">
        Pendiente: mostrar tabla de cargos, saldo y modal para registrar pagos.
      </p>
    </PageShell>
  );
}
