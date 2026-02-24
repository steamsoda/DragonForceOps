import { PageShell } from "@/components/ui/page-shell";

export default function PendingPaymentsPage() {
  return (
    <PageShell title="Pending Payments" subtitle="Filter by campus, team, balance bucket, and overdue days">
      <p className="text-sm text-slate-700">
        TBD: list active enrollments with positive balance and `tel:` links for guardians.
      </p>
    </PageShell>
  );
}
