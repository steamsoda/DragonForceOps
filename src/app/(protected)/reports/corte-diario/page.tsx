import { PageShell } from "@/components/ui/page-shell";

export default function DailyCortePage() {
  return (
    <PageShell title="Corte Diario" subtitle="Cierre diario de caja por campus">
      <p className="text-sm text-slate-700">
        Pendiente: mostrar totales por metodo, efectivo esperado, efectivo reportado y variacion.
      </p>
    </PageShell>
  );
}
