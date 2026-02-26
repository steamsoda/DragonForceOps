import { PageShell } from "@/components/ui/page-shell";
import { listCampuses } from "@/lib/queries/players";
import { getDashboardData } from "@/lib/queries/dashboard";
import { DashboardFilters } from "@/components/dashboard/dashboard-filters";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { TrendCard } from "@/components/dashboard/trend-card";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 2
  }).format(value);
}

const kpiCardMeta = [
  {
    key: "activeEnrollments",
    label: "Inscripciones activas",
    description: "Registros de membresia activos actualmente"
  },
  {
    key: "pendingBalance",
    label: "Saldo pendiente",
    description: "Saldo positivo total en las inscripciones"
  },
  {
    key: "paymentsToday",
    label: "Pagos de hoy",
    description: "Pagos registrados desde las 00:00 del servidor"
  },
  {
    key: "paymentsThisMonth",
    label: "Pagos del mes",
    description: "Pagos registrados en el mes seleccionado"
  }
] as const;

type SearchParams = Promise<{
  campus?: string;
  month?: string;
}>;

export default async function DashboardPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const selectedCampusId = params.campus ?? "";
  const requestedMonth = params.month;

  const [campuses, dashboard] = await Promise.all([
    listCampuses(),
    getDashboardData({
      campusId: selectedCampusId || undefined,
      month: requestedMonth
    })
  ]);

  return (
    <PageShell title="Panel" subtitle="Resumen operativo de Fase 1">
      <div className="space-y-4">
        <DashboardFilters
          campuses={campuses.map((campus) => ({ id: campus.id, name: campus.name }))}
          selectedCampusId={selectedCampusId}
          selectedMonth={dashboard.selectedMonth}
        />
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {kpiCardMeta.map((card) => {
            const value =
              card.key === "activeEnrollments"
                ? dashboard.activeEnrollments.toLocaleString("es-MX")
                : formatCurrency(dashboard[card.key]);

            return (
              <KpiCard key={card.key} label={card.label} value={value} description={card.description} />
            );
          })}
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <TrendCard
            label="Tendencia de pagos"
            currentValue={formatCurrency(dashboard.paymentsThisMonth)}
            previousValue={formatCurrency(dashboard.monthlyPaymentsPrevious)}
            currentRaw={dashboard.paymentsThisMonth}
            previousRaw={dashboard.monthlyPaymentsPrevious}
            description="Pagos registrados en el mes seleccionado contra el mes anterior."
          />
          <TrendCard
            label="Tendencia de cargos"
            currentValue={formatCurrency(dashboard.monthlyChargesThisMonth)}
            previousValue={formatCurrency(dashboard.monthlyChargesPrevious)}
            currentRaw={dashboard.monthlyChargesThisMonth}
            previousRaw={dashboard.monthlyChargesPrevious}
            description="Cargos no anulados creados en el mes seleccionado contra el mes anterior."
          />
        </div>
        <p className="text-sm text-slate-700">
          Los indicadores se calculan con datos reales y filtros por campus/mes.
        </p>
      </div>
    </PageShell>
  );
}
