import { PageShell } from "@/components/ui/page-shell";
import { listCampuses } from "@/lib/queries/players";
import { getDashboardData } from "@/lib/queries/dashboard";
import { DashboardFilters } from "@/components/dashboard/dashboard-filters";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { TrendCard } from "@/components/dashboard/trend-card";
import { PaymentStatusPie, PaymentsByMethodBar } from "@/components/dashboard/charts";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 2
  }).format(value);
}

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

  const upToDate = dashboard.activeEnrollments - dashboard.enrollmentsWithBalance;

  return (
    <PageShell title="Panel" subtitle="Resumen operativo de Fase 1">
      <div className="space-y-4">
        <DashboardFilters
          campuses={campuses.map((campus) => ({ id: campus.id, name: campus.name }))}
          selectedCampusId={selectedCampusId}
          selectedMonth={dashboard.selectedMonth}
        />

        {/* Row 1: Core KPIs */}
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            label="Inscripciones activas"
            value={dashboard.activeEnrollments.toLocaleString("es-MX")}
            description="Membresías activas actualmente"
          />
          <KpiCard
            label="Saldo pendiente"
            value={formatCurrency(dashboard.pendingBalance)}
            description="Adeudo total en inscripciones activas"
          />
          <KpiCard
            label="Pagos de hoy"
            value={formatCurrency(dashboard.paymentsToday)}
            description="Cobros registrados desde las 00:00 UTC"
          />
          <KpiCard
            label="Pagos del mes"
            value={formatCurrency(dashboard.paymentsThisMonth)}
            description="Total cobrado en el mes seleccionado"
          />
        </div>

        {/* Row 2: Movement KPIs */}
        <div className="grid gap-3 md:grid-cols-3">
          <KpiCard
            label="Alumnos con saldo"
            value={dashboard.enrollmentsWithBalance.toLocaleString("es-MX")}
            description="Inscripciones activas con adeudo pendiente"
          />
          <KpiCard
            label="Nuevas inscripciones"
            value={dashboard.newEnrollmentsThisMonth.toLocaleString("es-MX")}
            description="Inscripciones creadas en el mes seleccionado"
          />
          <KpiCard
            label="Bajas del mes"
            value={dashboard.bajasThisMonth.toLocaleString("es-MX")}
            description="Inscripciones dadas de baja en el mes seleccionado"
          />
        </div>

        {/* Row 3: Charts */}
        <div className="grid gap-3 md:grid-cols-2">
          <PaymentStatusPie upToDate={upToDate} withBalance={dashboard.enrollmentsWithBalance} />
          <PaymentsByMethodBar data={dashboard.paymentsByMethod} />
        </div>

        {/* Row 4: Trend cards */}
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

        <p className="text-sm text-slate-700 dark:text-slate-300">
          Los indicadores se calculan con datos reales y filtros por campus/mes.
        </p>
      </div>
    </PageShell>
  );
}
