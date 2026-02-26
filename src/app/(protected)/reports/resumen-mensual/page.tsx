import { PageShell } from "@/components/ui/page-shell";

export default function MonthlySummaryPage() {
  return (
    <PageShell title="Resumen Mensual" subtitle="Resumen financiero operativo mensual">
      <p className="text-sm text-slate-700">
        Pendiente: totales de cargos, pagos, saldos pendientes y distribucion por metodo de pago.
      </p>
    </PageShell>
  );
}
