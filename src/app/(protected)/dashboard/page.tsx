import { PageShell } from "@/components/ui/page-shell";
import { getDashboardKpis } from "@/lib/queries/dashboard";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 2
  }).format(value);
}

const kpiCards = [
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
    description: "Posted payments for the current month"
  }
] as const;

export default async function DashboardPage() {
  const kpis = await getDashboardKpis();

  return (
    <PageShell title="Dashboard" subtitle="Phase 1 operations overview">
      <div className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {kpiCards.map((card) => {
            const value =
              card.key === "activeEnrollments"
                ? kpis.activeEnrollments.toLocaleString("en-US")
                : formatCurrency(kpis[card.key]);

            return (
              <article key={card.key} className="rounded-md border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{card.label}</p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">{value}</p>
                <p className="mt-1 text-xs text-slate-600">{card.description}</p>
              </article>
            );
          })}
        </div>
        <p className="text-sm text-slate-700">
          KPIs are live from current data. Next step: add campus/date filters and trend comparisons.
        </p>
      </div>
    </PageShell>
  );
}
