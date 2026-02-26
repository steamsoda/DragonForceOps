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
    label: "Active Enrollments",
    description: "Current active membership records"
  },
  {
    key: "pendingBalance",
    label: "Pending Balance",
    description: "Total positive balance across enrollments"
  },
  {
    key: "paymentsToday",
    label: "Payments Today",
    description: "Posted payments since 00:00 local server time"
  },
  {
    key: "paymentsThisMonth",
    label: "Payments This Month",
    description: "Posted payments in selected month"
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
    <PageShell title="Dashboard" subtitle="Phase 1 operations overview">
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
                ? dashboard.activeEnrollments.toLocaleString("en-US")
                : formatCurrency(dashboard[card.key]);

            return (
              <KpiCard key={card.key} label={card.label} value={value} description={card.description} />
            );
          })}
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <TrendCard
            label="Payments Trend"
            currentValue={formatCurrency(dashboard.paymentsThisMonth)}
            previousValue={formatCurrency(dashboard.monthlyPaymentsPrevious)}
            currentRaw={dashboard.paymentsThisMonth}
            previousRaw={dashboard.monthlyPaymentsPrevious}
            description="Posted payments in selected month vs previous month."
          />
          <TrendCard
            label="Charges Trend"
            currentValue={formatCurrency(dashboard.monthlyChargesThisMonth)}
            previousValue={formatCurrency(dashboard.monthlyChargesPrevious)}
            currentRaw={dashboard.monthlyChargesThisMonth}
            previousRaw={dashboard.monthlyChargesPrevious}
            description="Non-void charges created in selected month vs previous month."
          />
        </div>
        <p className="text-sm text-slate-700">
          KPIs are live from current data with campus/month filters.
        </p>
      </div>
    </PageShell>
  );
}
