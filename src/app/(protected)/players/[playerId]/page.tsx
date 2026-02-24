import { PageShell } from "@/components/ui/page-shell";

export default async function PlayerDetailPage({
  params
}: {
  params: Promise<{ playerId: string }>;
}) {
  const { playerId } = await params;

  return (
    <PageShell title={`Player Detail: ${playerId}`} subtitle="Player identity, guardians, enrollments, and ledger summary">
      <p className="text-sm text-slate-700">TBD: render player card and linked enrollment timeline.</p>
    </PageShell>
  );
}
