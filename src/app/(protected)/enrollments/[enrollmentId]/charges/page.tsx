import { PageShell } from "@/components/ui/page-shell";

export default async function ChargesPage({
  params
}: {
  params: Promise<{ enrollmentId: string }>;
}) {
  const { enrollmentId } = await params;

  return (
    <PageShell title="Charges and Ledger" subtitle={`Enrollment: ${enrollmentId}`}>
      <p className="text-sm text-slate-700">TBD: render charges table, balance, and payment posting modal.</p>
    </PageShell>
  );
}
