import { PageShell } from "@/components/ui/page-shell";
import Link from "next/link";
import { listCampuses, listPlayers } from "@/lib/queries/players";

type SearchParams = Promise<{
  q?: string;
  phone?: string;
  status?: "active" | "inactive" | "archived" | "all";
  campus?: string;
  page?: string;
}>;

export default async function PlayersPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const q = params.q ?? "";
  const phone = params.phone ?? "";
  const status = params.status ?? "all";
  const campusId = params.campus ?? "";
  const page = Math.max(1, Number(params.page ?? "1") || 1);

  const [campuses, result] = await Promise.all([
    listCampuses(),
    listPlayers({
      q,
      phone,
      status,
      campusId: campusId || undefined,
      page
    })
  ]);

  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));
  const prevPage = page > 1 ? page - 1 : null;
  const nextPage = page < totalPages ? page + 1 : null;
  const qsBase = `q=${encodeURIComponent(q)}&phone=${encodeURIComponent(phone)}&status=${encodeURIComponent(status)}&campus=${encodeURIComponent(campusId)}`;

  return (
    <PageShell title="Player Search/List" subtitle="Search by name, campus, and status">
      <div className="space-y-4">
        <form className="grid gap-3 rounded-md border border-slate-200 p-3 md:grid-cols-5">
          <input
            type="text"
            name="q"
            defaultValue={q}
            placeholder="Search by first or last name"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          <input
            type="text"
            name="phone"
            defaultValue={phone}
            placeholder="Guardian phone"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          <select name="status" defaultValue={status} className="rounded-md border border-slate-300 px-3 py-2 text-sm">
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="archived">Archived</option>
          </select>
          <select
            name="campus"
            defaultValue={campusId}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">All campuses</option>
            {campuses.map((campus) => (
              <option key={campus.id} value={campus.id}>
                {campus.name}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded-md bg-portoBlue px-3 py-2 text-sm font-medium text-white hover:bg-portoDark"
          >
            Apply filters
          </button>
        </form>

        <p className="text-sm text-slate-600">Total results: {result.total}</p>

        <div className="overflow-x-auto rounded-md border border-slate-200">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-600">
              <tr>
                <th className="px-3 py-2">Player</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Campus</th>
                <th className="px-3 py-2">Primary phone</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {result.rows.length === 0 ? (
                <tr>
                  <td className="px-3 py-4 text-slate-600" colSpan={5}>
                    No players found for this filter set.
                  </td>
                </tr>
              ) : (
                result.rows.map((row) => (
                  <tr key={row.id}>
                    <td className="px-3 py-2">
                      <p className="font-medium text-slate-900">{row.fullName}</p>
                      <p className="text-xs text-slate-500">DOB: {row.birthDate}</p>
                    </td>
                    <td className="px-3 py-2 capitalize">{row.status}</td>
                    <td className="px-3 py-2">{row.campusName}</td>
                    <td className="px-3 py-2">{row.primaryPhone ?? "-"}</td>
                    <td className="px-3 py-2">
                      <Link href={`/players/${row.id}`} className="text-portoBlue hover:underline">
                        Open
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between text-sm">
          <p>
            Page {page} of {totalPages}
          </p>
          <div className="flex gap-3">
            {prevPage ? (
              <Link href={`/players?${qsBase}&page=${prevPage}`} className="rounded border px-3 py-1.5 hover:bg-slate-50">
                Previous
              </Link>
            ) : (
              <span className="rounded border px-3 py-1.5 text-slate-400">Previous</span>
            )}
            {nextPage ? (
              <Link href={`/players?${qsBase}&page=${nextPage}`} className="rounded border px-3 py-1.5 hover:bg-slate-50">
                Next
              </Link>
            ) : (
              <span className="rounded border px-3 py-1.5 text-slate-400">Next</span>
            )}
          </div>
        </div>
      </div>
    </PageShell>
  );
}
