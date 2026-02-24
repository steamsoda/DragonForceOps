import { PageShell } from "@/components/ui/page-shell";

export default async function EnrollmentCreatePage({
  params
}: {
  params: Promise<{ playerId: string }>;
}) {
  const { playerId } = await params;

  return (
    <PageShell title="Create Enrollment" subtitle={`Player: ${playerId}`}>
      <p className="text-sm text-slate-700">
        TBD: create enrollment form with campus, pricing plan, start date, and optional initial charges.
      </p>
    </PageShell>
  );
}
