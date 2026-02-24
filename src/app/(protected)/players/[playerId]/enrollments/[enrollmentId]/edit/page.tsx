import { PageShell } from "@/components/ui/page-shell";

export default async function EnrollmentEditPage({
  params
}: {
  params: Promise<{ playerId: string; enrollmentId: string }>;
}) {
  const { playerId, enrollmentId } = await params;

  return (
    <PageShell title="Edit Enrollment" subtitle={`Player: ${playerId} | Enrollment: ${enrollmentId}`}>
      <p className="text-sm text-slate-700">TBD: update campus/status/end date and transfer flow controls.</p>
    </PageShell>
  );
}
