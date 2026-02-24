import { PageShell } from "@/components/ui/page-shell";

export default async function ChargeCreatePage({
  params
}: {
  params: Promise<{ enrollmentId: string }>;
}) {
  const { enrollmentId } = await params;

  return (
    <PageShell title="Create Charge" subtitle={`Enrollment: ${enrollmentId}`}>
      <p className="text-sm text-slate-700">
        TBD: create charge form for inscription, uniform, tournaments, cups, trips, and events.
      </p>
    </PageShell>
  );
}
