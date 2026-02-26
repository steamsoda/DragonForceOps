import { PageShell } from "@/components/ui/page-shell";

export default function PendingPaymentsPage() {
  return (
    <PageShell title="Pagos pendientes" subtitle="Filtra por campus, equipo, rango de saldo y dias vencidos">
      <p className="text-sm text-slate-700">
        Pendiente: listar inscripciones activas con saldo positivo y enlaces `tel:` para tutores.
      </p>
    </PageShell>
  );
}
