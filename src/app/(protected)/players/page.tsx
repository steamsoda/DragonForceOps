import { PageShell } from "@/components/ui/page-shell";
import Link from "next/link";
import { listCampuses, listPlayers } from "@/lib/queries/players";

type SearchParams = Promise<{
  q?: string;
  phone?: string;
  campus?: string;
  page?: string;
}>;

export default async function PlayersPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const q = params.q ?? "";
  const phone = params.phone ?? "";
  const campusId = params.campus ?? "";
  const page = Math.max(1, Number(params.page ?? "1") || 1);

  const [campuses, result] = await Promise.all([
    listCampuses(),
    listPlayers({
      q,
      phone,
      campusId: campusId || undefined,
      page
    })
  ]);

  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));
  const prevPage = page > 1 ? page - 1 : null;
  const nextPage = page < totalPages ? page + 1 : null;
  const qsBase = `q=${encodeURIComponent(q)}&phone=${encodeURIComponent(phone)}&campus=${encodeURIComponent(campusId)}`;

  return (
    <PageShell
      title="Jugadores inscritos"
      subtitle="Solo se muestran jugadores con inscripcion activa"
      breadcrumbs={[{ label: "Jugadores" }]}
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <form className="flex flex-wrap gap-3">
            <input
              type="text"
              name="q"
              defaultValue={q}
              placeholder="Buscar por nombre o apellido"
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
            <input
              type="text"
              name="phone"
              defaultValue={phone}
              placeholder="Telefono de tutor"
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
            <select
              name="campus"
              defaultValue={campusId}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">Todos los campus</option>
              {campuses.map((campus) => (
                <option key={campus.id} value={campus.id}>
                  {campus.name}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="rounded-md bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200"
            >
              Aplicar filtros
            </button>
          </form>
          <Link
            href="/players/new"
            className="rounded-md bg-portoBlue px-4 py-2 text-sm font-medium text-white hover:bg-portoDark"
          >
            + Nuevo jugador
          </Link>
        </div>

        <p className="text-sm text-slate-600">Total de resultados: {result.total}</p>

        <div className="overflow-x-auto rounded-md border border-slate-200">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-600">
              <tr>
                <th className="px-3 py-2">Jugador</th>
                <th className="px-3 py-2">Campus</th>
                <th className="px-3 py-2">Telefono principal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {result.rows.length === 0 ? (
                <tr>
                  <td className="px-3 py-4 text-slate-600" colSpan={3}>
                    No se encontraron jugadores con esos filtros.
                  </td>
                </tr>
              ) : (
                result.rows.map((row) => (
                  <tr key={row.id}>
                    <td className="px-3 py-2">
                      <Link href={`/players/${row.id}`} className="font-medium text-slate-900 hover:text-portoBlue hover:underline">
                        {row.fullName}
                      </Link>
                      <p className="text-xs text-slate-500">F. nac.: {row.birthDate}</p>
                    </td>
                    <td className="px-3 py-2">{row.campusName}</td>
                    <td className="px-3 py-2">{row.primaryPhone ?? "-"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between text-sm">
          <p>
            Pagina {page} de {totalPages}
          </p>
          <div className="flex gap-3">
            {prevPage ? (
              <Link href={`/players?${qsBase}&page=${prevPage}`} className="rounded border px-3 py-1.5 hover:bg-slate-50">
                Anterior
              </Link>
            ) : (
              <span className="rounded border px-3 py-1.5 text-slate-400">Anterior</span>
            )}
            {nextPage ? (
              <Link href={`/players?${qsBase}&page=${nextPage}`} className="rounded border px-3 py-1.5 hover:bg-slate-50">
                Siguiente
              </Link>
            ) : (
              <span className="rounded border px-3 py-1.5 text-slate-400">Siguiente</span>
            )}
          </div>
        </div>
      </div>
    </PageShell>
  );
}
