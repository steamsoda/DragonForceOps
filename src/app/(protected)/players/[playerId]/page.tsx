import Link from "next/link";
import { notFound } from "next/navigation";
import { PageShell } from "@/components/ui/page-shell";
import { getPlayerDetail } from "@/lib/queries/players";

function formatMoney(amount: number, currency: string) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency }).format(amount);
}

export default async function PlayerDetailPage({
  params
}: {
  params: Promise<{ playerId: string }>;
}) {
  const { playerId } = await params;
  const player = await getPlayerDetail(playerId);

  if (!player) {
    notFound();
  }

  return (
    <PageShell title={player.fullName} subtitle="Player identity, guardians, enrollments, and ledger summary">
      <div className="space-y-6">
        <section className="grid gap-4 rounded-md border border-slate-200 p-4 md:grid-cols-4">
          <div>
            <p className="text-xs uppercase text-slate-500">Status</p>
            <p className="font-medium capitalize">{player.status}</p>
          </div>
          <div>
            <p className="text-xs uppercase text-slate-500">Birth date</p>
            <p className="font-medium">{player.birthDate}</p>
          </div>
          <div>
            <p className="text-xs uppercase text-slate-500">Gender</p>
            <p className="font-medium">{player.gender ?? "-"}</p>
          </div>
          <div>
            <p className="text-xs uppercase text-slate-500">Medical notes</p>
            <p className="font-medium">{player.medicalNotes ?? "-"}</p>
          </div>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-slate-900">Guardians</h2>
          <div className="overflow-x-auto rounded-md border border-slate-200">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-600">
                <tr>
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">Primary phone</th>
                  <th className="px-3 py-2">Secondary phone</th>
                  <th className="px-3 py-2">Email</th>
                  <th className="px-3 py-2">Relationship</th>
                  <th className="px-3 py-2">Primary</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {player.guardians.length === 0 ? (
                  <tr>
                    <td className="px-3 py-4 text-slate-600" colSpan={6}>
                      No guardians linked.
                    </td>
                  </tr>
                ) : (
                  player.guardians.map((guardian) => (
                    <tr key={guardian.id}>
                      <td className="px-3 py-2">
                        {guardian.first_name} {guardian.last_name}
                      </td>
                      <td className="px-3 py-2">{guardian.phone_primary}</td>
                      <td className="px-3 py-2">{guardian.phone_secondary ?? "-"}</td>
                      <td className="px-3 py-2">{guardian.email ?? "-"}</td>
                      <td className="px-3 py-2">{guardian.relationship_label ?? "-"}</td>
                      <td className="px-3 py-2">{guardian.isPrimary ? "Yes" : "No"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">Enrollments</h2>
            <Link
              href={`/players/${player.id}/enrollments/new`}
              className="rounded-md bg-portoBlue px-3 py-1.5 text-sm font-medium text-white hover:bg-portoDark"
            >
              New enrollment
            </Link>
          </div>
          <div className="overflow-x-auto rounded-md border border-slate-200">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-600">
                <tr>
                  <th className="px-3 py-2">Campus</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Dates</th>
                  <th className="px-3 py-2">Pricing plan</th>
                  <th className="px-3 py-2">Charges</th>
                  <th className="px-3 py-2">Payments</th>
                  <th className="px-3 py-2">Balance</th>
                  <th className="px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {player.enrollments.length === 0 ? (
                  <tr>
                    <td className="px-3 py-4 text-slate-600" colSpan={8}>
                      No enrollments found.
                    </td>
                  </tr>
                ) : (
                  player.enrollments.map((enrollment) => (
                    <tr key={enrollment.id}>
                      <td className="px-3 py-2">
                        {enrollment.campusName} ({enrollment.campusCode})
                      </td>
                      <td className="px-3 py-2 capitalize">{enrollment.status}</td>
                      <td className="px-3 py-2">
                        <p>Start: {enrollment.startDate}</p>
                        <p>End: {enrollment.endDate ?? "-"}</p>
                      </td>
                      <td className="px-3 py-2">{enrollment.pricingPlanName}</td>
                      <td className="px-3 py-2">{formatMoney(enrollment.totalCharges, enrollment.currency)}</td>
                      <td className="px-3 py-2">{formatMoney(enrollment.totalPayments, enrollment.currency)}</td>
                      <td className="px-3 py-2 font-medium">{formatMoney(enrollment.balance, enrollment.currency)}</td>
                      <td className="px-3 py-2">
                        <div className="flex gap-3">
                          <Link
                            href={`/players/${player.id}/enrollments/${enrollment.id}/edit`}
                            className="text-portoBlue hover:underline"
                          >
                            Edit
                          </Link>
                          <Link href={`/enrollments/${enrollment.id}/charges`} className="text-portoBlue hover:underline">
                            Ledger
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </PageShell>
  );
}
