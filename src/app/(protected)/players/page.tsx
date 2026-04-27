import Link from "next/link";
import { PageShell } from "@/components/ui/page-shell";
import { requireOperationalContext } from "@/lib/auth/permissions";
import { listBajas, listBirthYears, listCampuses, listPlayers } from "@/lib/queries/players";
import { getPlayerRosterGroupsData, type PlayerRosterGroupsData, type RosterTuitionCell } from "@/lib/queries/player-roster-groups";
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
type BajaRow = Awaited<ReturnType<typeof listBajas>>["rows"][number];

function formatIncidentTitle(row: PlayerRow) {
  if (!row.activeIncident) return undefined;
  if (row.activeIncident.startsOn && row.activeIncident.endsOn) {
    return `${row.activeIncident.label}: ${fmtDate(row.activeIncident.startsOn)} al ${fmtDate(row.activeIncident.endsOn)}`;
  }
  if (row.activeIncident.endsOn) {
    return `${row.activeIncident.label} hasta ${fmtDate(row.activeIncident.endsOn)}`;
  }
  return row.activeIncident.label;
}

function PlayerTags({ row, tags }: { row: PlayerRow; tags: TagSettings }) {
  const pills: React.ReactNode[] = [];

  if (row.activeIncident?.type === "injury") {
    pills.push(
      <span
        key="incident-injury"
        title={formatIncidentTitle(row)}
        className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-700 dark:bg-rose-900/40 dark:text-rose-300"
      >
        Lesión activa
      </span>
    );
  }

  if (row.activeIncident?.type === "absence") {
    pills.push(
      <span
        key="incident-absence"
        title={formatIncidentTitle(row)}
        className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-700 dark:bg-sky-900/40 dark:text-sky-300"
      >
        Ausencia activa
      </span>
    );
  }

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
        Uniforme pendiente
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

function ActivePlayerCards({ rows, tags }: { rows: PlayerRow[]; tags: TagSettings }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-md border border-slate-200 px-4 py-5 text-sm text-slate-600 dark:border-slate-700 dark:text-slate-400">
        No se encontraron jugadores con esos filtros.
      </div>
    );
  }

  return (
    <div className="space-y-3 md:hidden">
      {rows.map((row) => (
        <div key={row.id} className="space-y-3 rounded-md border border-slate-200 px-4 py-4 dark:border-slate-700">
          <div className="space-y-1">
            <Link href={`/players/${row.id}`} className="text-base font-semibold text-slate-900 hover:text-portoBlue hover:underline dark:text-slate-100">
              {row.fullName}
            </Link>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {row.publicPlayerId ?? "ID pendiente"} | Cat. {new Date(row.birthDate).getFullYear()} | {row.level ?? "Sin nivel"} | {row.campusName}
            </p>
            <p className="text-sm text-slate-500 dark:text-slate-400">Tutor: {row.primaryPhone ?? "-"}</p>
          </div>
          <PlayerTags row={row} tags={tags} />
        </div>
      ))}
    </div>
  );
}

function BajaCards({ rows }: { rows: BajaRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-md border border-slate-200 px-4 py-5 text-sm text-slate-600 dark:border-slate-700 dark:text-slate-400">
        No se encontraron jugadores dados de baja con esos filtros.
      </div>
    );
  }

  return (
    <div className="space-y-3 md:hidden">
      {rows.map((row) => (
        <div key={row.playerId} className="space-y-2 rounded-md border border-slate-200 px-4 py-4 dark:border-slate-700">
          <div className="space-y-1">
            <Link href={`/players/${row.playerId}`} className="text-base font-semibold text-slate-900 hover:text-portoBlue hover:underline dark:text-slate-100">
              {row.fullName}
            </Link>
            <div className="flex flex-wrap gap-1">
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                Baja
              </span>
              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                {row.campusName}
              </span>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                  row.pendingBalance > 0
                    ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                    : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                }`}
              >
                {row.pendingBalance > 0 ? "Saldo pendiente" : "Sin saldo"}
              </span>
            </div>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400">Inscripcion: {fmtDate(row.startDate)}</p>
          <p className="text-sm text-slate-500 dark:text-slate-400">Baja: {fmtDate(row.endDate)}</p>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Dias inscrito: {row.daysEnrolled != null ? `${row.daysEnrolled} dias` : "-"}
          </p>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Motivo: {row.dropoutReason ? DROPOUT_LABELS[row.dropoutReason] ?? row.dropoutReason : "-"}
          </p>
        </div>
      ))}
    </div>
  );
}

function PlayerViewTabs({ view }: { view: "active" | "bajas" | "groups" }) {
  const items = [
    { href: "/players", key: "groups", label: "Vista por grupos" },
    { href: "/players?view=active", key: "active", label: "Activos" },
    { href: "/players?view=bajas", key: "bajas", label: "Bajas" },
  ] as const;

  return (
    <div className="flex flex-wrap gap-2 border-b border-slate-200 dark:border-slate-700">
      {items.map((item) => (
        <Link
          key={item.key}
          href={item.href}
          className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
            view === item.key
              ? "border-portoBlue text-portoBlue"
              : "border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300"
          }`}
        >
          {item.label}
        </Link>
      ))}
    </div>
  );
}

function tuitionCellClass(state: RosterTuitionCell["state"]) {
  if (state === "pending") return "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200";
  if (state === "platform") return "border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-800 dark:bg-sky-950/30 dark:text-sky-200";
  if (state === "paid") return "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200";
  return "border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400";
}

function groupedRosterHref({ campusId, gender, birthYear }: { campusId?: string; gender?: string; birthYear?: number | string | null }) {
  const params = new URLSearchParams({ view: "groups" });
  if (campusId) params.set("campus", campusId);
  if (gender) params.set("gender", gender);
  if (birthYear) params.set("year", String(birthYear));
  return `/players?${params.toString()}`;
}

function GroupedRosterView({ data }: { data: PlayerRosterGroupsData | null }) {
  if (!data) {
    return (
      <div className="rounded-md border border-slate-200 px-4 py-5 text-sm text-slate-600 dark:border-slate-700 dark:text-slate-400">
        No hay campus disponibles para esta vista.
      </div>
    );
  }

  const genderOptions = [
    { value: "", label: "Todos" },
    { value: "male", label: "Varonil" },
    { value: "female", label: "Femenil" },
  ];

  return (
    <div className="space-y-4">
      <div className="space-y-4 rounded-md border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Campus</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">Selecciona un campus para mantener la vista ligera y facil de escanear.</p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
              {data.totalPlayers} jugadores
            </span>
            {data.unassignedCount > 0 ? (
              <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                {data.unassignedCount} sin grupo
              </span>
            ) : null}
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {data.campuses.map((campus) => {
            const active = campus.id === data.selectedCampusId;
            return (
              <Link
                key={campus.id}
                href={groupedRosterHref({ campusId: campus.id, gender: data.selectedGender, birthYear: data.selectedBirthYear })}
                className={`rounded-lg border px-4 py-3 text-left transition ${
                  active
                    ? "border-portoBlue bg-blue-50 text-portoBlue shadow-sm dark:border-blue-400 dark:bg-blue-950/30 dark:text-blue-200"
                    : "border-slate-200 bg-white text-slate-700 hover:border-portoBlue hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:border-blue-400 dark:hover:bg-slate-800"
                }`}
              >
                <span className="block text-sm font-semibold">{campus.name}</span>
                <span className="mt-1 block text-xs opacity-75">{active ? "Campus seleccionado" : "Ver roster del campus"}</span>
              </Link>
            );
          })}
        </div>

        <div className="space-y-2 border-t border-slate-100 pt-3 dark:border-slate-800">
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Genero</p>
          <div className="flex flex-wrap gap-2">
            {genderOptions.map((option) => {
              const active = data.selectedGender === option.value;
              return (
                <Link
                  key={option.value || "all"}
                  href={groupedRosterHref({ campusId: data.selectedCampusId, gender: option.value, birthYear: data.selectedBirthYear })}
                  className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
                    active
                      ? "border-portoBlue bg-portoBlue text-white"
                      : "border-slate-200 bg-white text-slate-700 hover:border-portoBlue hover:text-portoBlue dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                  }`}
                >
                  {option.label}
                </Link>
              );
            })}
          </div>
        </div>

        <div className="space-y-2 border-t border-slate-100 pt-3 dark:border-slate-800">
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Categoria</p>
          <div className="flex flex-wrap gap-2">
            <Link
              href={groupedRosterHref({ campusId: data.selectedCampusId, gender: data.selectedGender })}
              className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
                data.selectedBirthYear == null
                  ? "border-portoBlue bg-portoBlue text-white"
                  : "border-slate-200 bg-white text-slate-700 hover:border-portoBlue hover:text-portoBlue dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
              }`}
            >
              Todas
            </Link>
            {data.birthYears.map((year) => (
              <Link
                key={year}
                href={groupedRosterHref({ campusId: data.selectedCampusId, gender: data.selectedGender, birthYear: year })}
                className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
                  data.selectedBirthYear === year
                    ? "border-portoBlue bg-portoBlue text-white"
                    : "border-slate-200 bg-white text-slate-700 hover:border-portoBlue hover:text-portoBlue dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                }`}
              >
                {year}
              </Link>
            ))}
          </div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-md border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900">
        <div className="flex min-w-max gap-2">
          {data.sections.map((section) => (
            <a
              key={section.id}
              href={`#grupo-${section.id}`}
              className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:border-portoBlue hover:text-portoBlue dark:border-slate-700 dark:text-slate-300"
            >
              {section.name} ({section.rows.length})
            </a>
          ))}
        </div>
      </div>

      <div className="space-y-5">
        {data.sections.map((section) => (
          <section key={section.id} id={`grupo-${section.id}`} className="space-y-2">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{section.name}</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">{section.subtitle}</p>
              </div>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                {section.rows.length} jugadores
              </span>
            </div>

            <div className="overflow-x-auto rounded-md border border-slate-200 dark:border-slate-700">
              <table className="min-w-full border-collapse text-xs">
                <thead className="bg-slate-50 text-left uppercase tracking-wide text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                  <tr>
                    <th className="w-12 border-b border-slate-200 px-2 py-2 text-center dark:border-slate-700">#</th>
                    <th className="border-b border-slate-200 px-2 py-2 dark:border-slate-700">ID</th>
                    <th className="min-w-64 border-b border-slate-200 px-2 py-2 dark:border-slate-700">Nombre</th>
                    <th className="border-b border-slate-200 px-2 py-2 text-center dark:border-slate-700">CAT</th>
                    <th className="border-b border-slate-200 px-2 py-2 dark:border-slate-700">Nivel/Grupo</th>
                    <th className="border-b border-slate-200 px-2 py-2 text-center dark:border-slate-700">INSC</th>
                    {data.months.map((month) => (
                      <th key={month.periodMonth} className="border-b border-slate-200 px-2 py-2 text-center dark:border-slate-700">
                        {month.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {section.rows.length === 0 ? (
                    <tr>
                      <td colSpan={6 + data.months.length} className="px-3 py-4 text-slate-500 dark:text-slate-400">
                        Sin jugadores activos en este grupo.
                      </td>
                    </tr>
                  ) : (
                    section.rows.map((row, index) => (
                      <tr key={row.enrollmentId} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                        <td className="px-2 py-2 text-center text-slate-500 dark:text-slate-400">{index + 1}</td>
                        <td className="px-2 py-2 font-mono text-slate-700 dark:text-slate-300">{row.publicPlayerId}</td>
                        <td className="px-2 py-2">
                          <Link href={`/players/${row.playerId}`} className="font-medium text-slate-900 hover:text-portoBlue hover:underline dark:text-slate-100">
                            {row.fullName}
                          </Link>
                        </td>
                        <td className="px-2 py-2 text-center text-slate-700 dark:text-slate-300">{row.birthYear ?? "-"}</td>
                        <td className="px-2 py-2 text-slate-700 dark:text-slate-300">{row.levelGroup}</td>
                        <td className="px-2 py-2 text-center text-slate-700 dark:text-slate-300">{row.inscriptionDate}</td>
                        {row.tuition.map((cell) => (
                          <td key={cell.periodMonth} className="px-2 py-2 text-center">
                            <span className={`inline-flex min-h-6 min-w-20 items-center justify-center rounded border px-2 py-1 font-medium leading-none ${tuitionCellClass(cell.state)}`}>
                              {cell.value}
                            </span>
                          </td>
                        ))}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
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
  await requireOperationalContext("/unauthorized");
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
  const view = params.view === "active" ? "active" : params.view === "bajas" ? "bajas" : "groups";

  if (view === "groups") {
    const selectedGroupGender = gender === "male" || gender === "female" ? gender : "";
    const rosterData = await getPlayerRosterGroupsData({ campusId: campusId || undefined, gender: selectedGroupGender || undefined, birthYear: birthYear || undefined });
    return (
      <PageShell
        title="Jugadores por grupos"
        subtitle="Vista tipo hoja de calculo por campus y grupo de entrenamiento."
        breadcrumbs={[{ label: "Jugadores" }]}
        wide
      >
        <div className="space-y-4">
          <PlayerViewTabs view={view} />
          <GroupedRosterView data={rosterData} />
        </div>
      </PageShell>
    );
  }

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

        <PlayerViewTabs view={view} />

        <div className="space-y-3">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <form className="flex-1 space-y-3">
              <input type="hidden" name="view" value={view} />
              <div className="grid gap-3 sm:grid-cols-2 xl:flex xl:flex-wrap">
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
                  <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:flex xl:flex-wrap">
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
              <div className="grid gap-2 sm:grid-cols-2 xl:flex xl:items-center">
                <a
                  href="/api/exports/players-attendance"
                  className="rounded-md border border-slate-300 bg-white px-4 py-2 text-center text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  Exportar Excel
                </a>
                <Link href="/players/new" className="rounded-md bg-portoBlue px-4 py-2 text-center text-sm font-medium text-white hover:bg-portoDark">
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
                .join(" | ")}
            </p>
          </div>
        ) : null}

        <p className="text-sm text-slate-600 dark:text-slate-400">Total de resultados: {result.total}</p>

        {view === "active" ? (
          <>
            <ActivePlayerCards rows={activeRows} tags={tags} />
            <div className="hidden overflow-x-auto rounded-md border border-slate-200 dark:border-slate-700 md:block">
              <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-700">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                  <tr>
                    <th className="px-3 py-2">Jugador</th>
                    <th className="px-3 py-2">ID</th>
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
                      <td className="px-3 py-4 text-slate-600 dark:text-slate-400" colSpan={7}>
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
                        <td className="px-3 py-2 font-mono text-slate-600 dark:text-slate-400">{row.publicPlayerId ?? "-"}</td>
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
          </>
        ) : (
          <>
            <BajaCards rows={bajaRows} />
            <div className="hidden overflow-x-auto rounded-md border border-slate-200 dark:border-slate-700 md:block">
              <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-700">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                  <tr>
                    <th className="px-3 py-2">Jugador</th>
                    <th className="px-3 py-2">Campus</th>
                    <th className="px-3 py-2">Fecha inscripcion</th>
                    <th className="px-3 py-2">Fecha baja</th>
                    <th className="px-3 py-2">Dias inscrito</th>
                    <th className="px-3 py-2">Motivo</th>
                    <th className="px-3 py-2">Saldo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {bajaRows.length === 0 ? (
                    <tr>
                      <td className="px-3 py-4 text-slate-600 dark:text-slate-400" colSpan={7}>
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
                        <td className="px-3 py-2">{row.campusName}</td>
                        <td className="px-3 py-2">{fmtDate(row.startDate)}</td>
                        <td className="px-3 py-2">{fmtDate(row.endDate)}</td>
                        <td className="px-3 py-2">{row.daysEnrolled != null ? `${row.daysEnrolled} dias` : "-"}</td>
                        <td className="px-3 py-2">{row.dropoutReason ? DROPOUT_LABELS[row.dropoutReason] ?? row.dropoutReason : "-"}</td>
                        <td className="px-3 py-2">
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                              row.pendingBalance > 0
                                ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                                : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                            }`}
                          >
                            {row.pendingBalance > 0 ? "Saldo pendiente" : "Sin saldo"}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        <div className="flex flex-col gap-3 text-sm sm:flex-row sm:items-center sm:justify-between">
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
