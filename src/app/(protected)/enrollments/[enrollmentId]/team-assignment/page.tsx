import { PageShell } from "@/components/ui/page-shell";

export default async function TeamAssignmentPage({
  params
}: {
  params: Promise<{ enrollmentId: string }>;
}) {
  const { enrollmentId } = await params;

  return (
    <PageShell title="Team Assignment" subtitle={`Enrollment: ${enrollmentId}`}>
      <p className="text-sm text-slate-700">TBD: assign enrollment to one active team in same campus.</p>
    </PageShell>
  );
}
