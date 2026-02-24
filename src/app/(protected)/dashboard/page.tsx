import { PageShell } from "@/components/ui/page-shell";

export default function DashboardPage() {
  return (
    <PageShell title="Dashboard" subtitle="Phase 1 operations overview">
      <p className="text-sm text-slate-700">
        Placeholder dashboard. Next step is wiring KPIs from enrollments, charges, payments, and pending balances.
      </p>
    </PageShell>
  );
}
