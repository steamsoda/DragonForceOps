import Link from "next/link";
import { PageShell } from "@/components/ui/page-shell";
import { listBajas, listBirthYears, listCampuses, listPlayers } from "@/lib/queries/players";
import { getAttendanceExportData } from "@/lib/queries/player-exports";
import { getTagSettings, type TagSettings } from "@/lib/queries/settings";
import { PlayersDrilldown } from "@/components/players/players-drilldown";

function fmtDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "-";
  const [y, m, d] = dateStr.split("-");
  return d ? `${d}/${m}/${y}` : dateStr;
}

const DROPOUT_LABELS: Record<string, string> = {
  cost: "Costo",
  distance: "Distancia",
  injury: "Lesion",
  attitude: "Actitud",
  time: "Tiempo",
  level_change: "Cambio de nivel",
  other: "Otro",
};

type PlayerRow = Awaited<ReturnType<typeof listPlayers>>["rows"][number];

function PlayerTags({ row, tags }: { row: PlayerRow; tags: TagSettings }) {
  const pills: React.ReactNode[] = [];

  if (tags.teamType) {
    if (row.teamType === "competition") {
      pills.push(
        <span key="team" className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
          Selectivo
        </span>
      );
    } else if (row.teamType === "class") {
      pills.push(
        <span key="team" className="rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">
          Clases
        </span>
      );
    }
  }

  if (tags.payment) {
    if (row.balance <= 0) {
      pills.push(
        <span key="payment" className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
          Al corriente
        </span>
      );
    } else {
      pills.push(
        <span key="payment" className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
          Pendiente
        </span>
      );
    }
  }

  if (tags.goalkeeper && row.isGoalkeeper) {
    pills.push(
      <span key="gk" className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-700 dark:bg-violet-900/40 dark:text-violet-300">
        Portero
      </span>
    );
  }

  if (tags.uniform && row.uniformStatus === "pending") {
    pills.push(
      <span key="uni" className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
        Uniforme pedido
      </span>
    );
  }

  if (tags.uniform && row.uniformStatus === "delivered") {
    pills.push(
      <span key="uni" className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
        Uniforme OK
      </span>
    );
  }

  return <div className="flex flex-wrap gap-1">{pills}</div>;
}

type SearchParams = Promise<{
  q?: string;
  phone?: string;
  campus?: string;
  year?: string;
  gender?: string;
  missingGender?: string;
  missingLevel?: string;
  missingTeam?: string;
  pendingMonth?: string;
  page?: string;
  view?: string;
  ok?: string;
}>;

export default async function PlayersPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const q = params.q ?? "";
  const phone = params.phone ?? "";
  const campusId = params.campus ?? "";
  const birthYear = params.year ?? "";
  const gender = params.gender ?? "";
  const missingGender = params.missingGender === "1";
  const missingLevel = params.missingLevel === "1";
  const missingTeam = params.missingTeam === "1";
  const pendingMonth = params.pendingMonth ?? "";
  const page = Math.max(1, Number(params.page ?? "1") || 1);
  const view = params.view === "bajas" ? "bajas" : "active";

  const [campuses, birthYears, tags, attendanceExport] = await Promise.all([
    listCampuses(),
    listBirthYears(),
    getTagSettings(),
    view === "active"
      ? getAttendanceExportData()
      : Promise.resolve({ rows: [], excludedMissingGenderCount: 0, excludedMissingGender: [] }),
  ]);

  let result: { rows: unknown[]; total: number; page: number; pageSize: number };
  let activeRows: Awaited<ReturnType<typeof listPlayers>>["rows"] = [];
  let bajaRows: Awaited<ReturnType<typeof listBajas>>["rows"] = [];

  if (view === "bajas") {
    const bajaResult = await listBajas({ q, campusId: campusId || undefined, page });
    result = bajaResult;
    bajaRows = bajaResult.rows;
  } else {
    const activeResult = await listPlayers({
      q,
      phone,
      campusId: campusId || undefined,
      birthYear: birthYear || undefined,
      gender: gender || undefined,
      missingGender,
      missingLevel,
      missingTeam,
      pendingMonth: pendingMonth || undefined,
      page,
      enabledTags: tags,
    });
    result = activeResult;
    activeRows = activeResult.rows;
  }

  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));
  const prevPage = page > 1 ? page - 1 : null;
  const nextPage = page < totalPages ? page + 1 : null;
  const qsBase =
    `view=${view}` +
    `&q=${encodeURIComponent(q)}` +
    `&phone=${encodeURIComponent(phone)}` +
    `&campus=${encodeURIComponent(campusId)}` +
    `&year=${encodeURIComponent(birthYear)}` +
    `&gender=${encodeURIComponent(gender)}` +
    `&missingGender=${missingGender ? "1" : "0"}` +
    `&missingLevel=${missingLevel ? "1" : "0"}` +
    `&missingTeam=${missingTeam ? "1" : "0"}` +
    `&pendingMonth=${encodeURIComponent(pendingMonth)}`;
  const showAdvancedFilters = Boolean(pendingMonth || missingGender || missingLevel || missingTeam);

  return (
    <PageShell
      title={view === "bajas" ? "Jugadores dados de baja" : "Jugadores inscritos"}
      subtitle={view === "bajas" ? "Jugadores sin inscripcion activa" : "Solo se muestran jugadores con inscripcion activa"}
      breadcrumbs={[{ label: "Jugadores" }]}
    >
      <div className="space-y-4">
        {params.ok === "nuked" ? (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/20 dark:text-emerald-300">
            Jugador eliminado permanentemente.
          </div>
        ) : null}

        <div className="flex gap-2 border-b border-slate-200 dark:border-slate-700">
          <Link
            href="/players?view=active"
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
              view === "active"
                ? "border-portoBlue text-portoBlue"
                : "border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300"
            }`}
          >
            Activos
          </Link>
          <Link
            href="/players?view=bajas"
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
              view === "bajas"
                ? "border-portoBlue text-portoBlue"
                : "border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300"
            }`}
          >
            Bajas
          </Link>
        </div>

        <div className="space-y-3">
          <div className="flex items-start justify-between gap-4">
            <form className="flex-1 space-y-3">
              <input type="hidden" name="view" value={view} />
              <div className="flex flex-wrap gap-3">
                <select name="year" defaultValue={birthYear} className="rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-600">
                  <option value="">Todas las categorias</option>
                  {birthYears.map((year) => (
                    <option key={year} value={String(year)}>
                      {year}
                    </option>
                  ))}
                </select>
                <select name="campus" defaultValue={campusId} className="rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-600">
                  <option value="">Todos los campus</option>
                  {campuses.map((campus) => (
                    <option key={campus.id} value={campus.id}>
                      {campus.name}
                    </option>
                  ))}
                </select>
                <select name="gender" defaultValue={gender} className="rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-600">
                  <option value="">Todos</option>
                  <option value="male">Varonil</option>
                  <option value="female">Femenil</option>
                </select>
                <input
                  type="text"
                  name="q"
                  defaultValue={q}
                  placeholder="Nombre o apellido"
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-600"
                />
                {view === "active" ? (
                  <input
                    type="text"
                    name="phone"
                    defaultValue={phone}
                    placeholder="Telefono de tutor"
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-600"
                  />
                ) : null}
                <button
                  type="submit"
                  className="rounded-md bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
                >
                  Filtrar
                </button>
              </div>

              {view === "active" ? (
                <details
                  className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-900"
                  open={showAdvancedFilters}
                >
                  <summary className="cursor-pointer list-none text-sm font-medium text-slate-700 dark:text-slate-300">
                    Filtros avanzados
                  </summary>
                  <div className="mt-3 flex flex-wrap gap-3">
                    <input
                      type="month"
                      name="pendingMonth"
                      defaultValue={pendingMonth}
                      className="rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-600"
                    />
                    <label className="flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-600">
                      <input type="checkbox" name="missingGender" value="1" defaultChecked={missingGender} />
                      Sin genero
                    </label>
                    <label className="flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-600">
                      <input type="checkbox" name="missingLevel" value="1" defaultChecked={missingLevel} />
                      Sin nivel
                    </label>
                    <label className="flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-600">
                      <input type="checkbox" name="missingTeam" value="1" defaultChecked={missingTeam} />
                      Sin equipo
                    </label>
                  </div>
                </details>
              ) : null}
            </form>

            {view === "active" ? (
              <div className="flex items-center gap-2">
                <a
                  href="/api/exports/players-attendance"
                  className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  Exportar Excel
                </a>
                <Link href="/players/new" className="rounded-md bg-portoBlue px-4 py-2 text-sm font-medium text-white hover:bg-portoDark">
                  + Nuevo jugador
                </Link>
              </div>
            ) : null}
          </div>

          {view === "active" ? <PlayersDrilldown /> : null}
        </div>

        {view === "active" && attendanceExport.excludedMissingGenderCount > 0 ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/20 dark:text-amber-300">
            <p className="font-medium">
              {attendanceExport.excludedMissingGenderCount} jugador{attendanceExport.excludedMissingGenderCount !== 1 ? "es" : ""} activo
              {attendanceExport.excludedMissingGenderCount !== 1 ? "s" : ""} no se exporta
              {attendanceExport.excludedMissingGenderCount !== 1 ? "n" : ""} por falta de genero.
            </p>
            <p className="mt-1 text-xs">
              {attendanceExport.excludedMissingGender
                .slice(0, 6)
                .map((row) => `${row.campusName} Cat ${row.birthYear}: ${row.count}`)
                .join(" · ")}
            </p>
          </div>
        ) : null}

        <p className="text-sm text-slate-600 dark:text-slate-400">Total de resultados: {result.total}</p>

        {view === "active" ? (
          <div className="overflow-x-auto rounded-md border border-slate-200 dark:border-slate-700">
            <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-700">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                <tr>
                  <th className="px-3 py-2">Jugador</th>
                  <th className="px-3 py-2">Categoria</th>
                  <th className="px-3 py-2">Nivel</th>
                  <th className="px-3 py-2">Campus</th>
                  <th className="px-3 py-2">Telefono</th>
                  <th className="px-3 py-2">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {activeRows.length === 0 ? (
                  <tr>
                    <td className="px-3 py-4 text-slate-600 dark:text-slate-400" colSpan={6}>
                      No se encontraron jugadores con esos filtros.
                    </td>
                  </tr>
                ) : (
                  activeRows.map((row) => (
                    <tr key={row.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <td className="px-3 py-2">
                        <Link href={`/players/${row.id}`} className="font-medium text-slate-900 hover:text-portoBlue hover:underline dark:text-slate-100">
                          {row.fullName}
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-slate-600 dark:text-slate-400">{new Date(row.birthDate).getFullYear()}</td>
                      <td className="px-3 py-2 text-slate-600 dark:text-slate-400">{row.level ?? "-"}</td>
                      <td className="px-3 py-2 text-slate-600 dark:text-slate-400">{row.campusName}</td>
                      <td className="px-3 py-2 text-slate-600 dark:text-slate-400">{row.primaryPhone ?? "-"}</td>
                      <td className="px-3 py-2">
                        <PlayerTags row={row} tags={tags} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-md border border-slate-200 dark:border-slate-700">
            <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-700">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                <tr>
                  <th className="px-3 py-2">Jugador</th>
                  <th className="px-3 py-2">Fecha inscripcion</th>
                  <th className="px-3 py-2">Fecha baja</th>
                  <th className="px-3 py-2">Dias inscrito</th>
                  <th className="px-3 py-2">Motivo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {bajaRows.length === 0 ? (
                  <tr>
                    <td className="px-3 py-4 text-slate-600 dark:text-slate-400" colSpan={5}>
                      No se encontraron jugadores dados de baja con esos filtros.
                    </td>
                  </tr>
                ) : (
                  bajaRows.map((row) => (
                    <tr key={row.playerId}>
                      <td className="px-3 py-2">
                        <Link href={`/players/${row.playerId}`} className="font-medium text-slate-900 hover:text-portoBlue hover:underline dark:text-slate-100">
                          {row.fullName}
                        </Link>
                      </td>
                      <td className="px-3 py-2">{fmtDate(row.startDate)}</td>
                      <td className="px-3 py-2">{fmtDate(row.endDate)}</td>
                      <td className="px-3 py-2">{row.daysEnrolled != null ? `${row.daysEnrolled} dias` : "-"}</td>
                      <td className="px-3 py-2">{row.dropoutReason ? DROPOUT_LABELS[row.dropoutReason] ?? row.dropoutReason : "-"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex items-center justify-between text-sm">
          <p>
            Pagina {page} de {totalPages}
          </p>
          <div className="flex gap-3">
            {prevPage ? (
              <Link href={`/players?${qsBase}&page=${prevPage}`} className="rounded border px-3 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800">
                Anterior
              </Link>
            ) : (
              <span className="rounded border px-3 py-1.5 text-slate-400">Anterior</span>
            )}
            {nextPage ? (
              <Link href={`/players?${qsBase}&page=${nextPage}`} className="rounded border px-3 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800">
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
