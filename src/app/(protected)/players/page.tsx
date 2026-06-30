import Link from "next/link";
import { redirect } from "next/navigation";
import { PageShell } from "@/components/ui/page-shell";
import { requirePlayerRosterContext } from "@/lib/auth/permissions";
import { listBajas, listBirthYears, listCampuses, listPlayers } from "@/lib/queries/players";
import { getAttendanceExportData } from "@/lib/queries/player-exports";
import { getTagSettings, type TagSettings } from "@/lib/queries/settings";
import { getCategorizedDropoutReasonLabel } from "@/lib/enrollments/dropout-reasons";
import { GroupedRosterClient } from "@/components/players/grouped-roster-client";
import { PlayersDrilldown } from "@/components/players/players-drilldown";
import { BajaReasonSummaryCopy } from "@/components/players/baja-reason-summary-copy";
import { BajaPrintButton } from "@/components/players/baja-print-button";

function fmtDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "-";
  const [y, m, d] = dateStr.split("-");
  return d ? `${d}/${m}/${y}` : dateStr;
}

type PlayerRow = Awaited<ReturnType<typeof listPlayers>>["rows"][number];
type BajaRow = Awaited<ReturnType<typeof listBajas>>["rows"][number];
type BajaSummary = NonNullable<Awaited<ReturnType<typeof listBajas>>["summary"]>;

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
            <Link href={`/players/${row.id}`} prefetch={false} className="text-base font-semibold text-slate-900 hover:text-portoBlue hover:underline dark:text-slate-100">
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
            <Link href={`/players/${row.playerId}`} prefetch={false} className="text-base font-semibold text-slate-900 hover:text-portoBlue hover:underline dark:text-slate-100">
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
            Motivo: {getCategorizedDropoutReasonLabel(row.dropoutReason)}
          </p>
        </div>
      ))}
    </div>
  );
}

function formatPercent(value: number) {
  return `${value.toLocaleString("es-MX", { maximumFractionDigits: 1 })}%`;
}

function formatMonthLabel(value: string) {
  const [year, month] = value.split("-").map(Number);
  if (!year || !month) return value;
  const label = new Date(Date.UTC(year, month - 1, 1, 12, 0, 0)).toLocaleDateString("es-MX", {
    month: "long",
    year: "numeric",
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function buildBajaFilterLabel({
  campusName,
  dropoutMonth,
  dropoutFrom,
  dropoutTo,
  q,
}: {
  campusName: string;
  dropoutMonth: string;
  dropoutFrom: string;
  dropoutTo: string;
  q: string;
}) {
  const parts = [campusName];
  if (dropoutMonth) parts.push(`Mes ${formatMonthLabel(dropoutMonth)}`);
  if (dropoutFrom || dropoutTo) parts.push(`Periodo ${dropoutFrom || "inicio"} a ${dropoutTo || "hoy"}`);
  if (q.trim()) parts.push(`Busqueda "${q.trim()}"`);
  return parts.join(" | ");
}

function buildBajaReasonCopyText(summary: BajaSummary, filterLabel: string) {
  const lines = [
    "Resumen de bajas",
    `Filtros: ${filterLabel}`,
    "",
    `Total bajas: ${summary.total}`,
    `Categoria principal: ${summary.topCategory ?? "-"}`,
    `Motivo principal: ${summary.topReason ?? "-"}`,
    `Sin motivo registrado: ${summary.missingReasonCount}`,
    "",
    "Categoria | Motivo | Cantidad | %",
  ];

  if (summary.rows.length === 0) {
    lines.push("Sin bajas en el periodo seleccionado.");
  } else {
    for (const row of summary.rows) {
      lines.push(`${row.category} | ${row.reason} | ${row.count} | ${formatPercent(row.percent)}`);
    }
  }

  return lines.join("\n");
}

function BajaReasonSummaryPanel({ summary, filterLabel }: { summary: BajaSummary; filterLabel: string }) {
  const copyText = buildBajaReasonCopyText(summary, filterLabel);

  return (
    <section className="space-y-4 rounded-md border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Resumen de motivos de baja</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400">{filterLabel}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-3 dark:border-slate-700 dark:bg-slate-950">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Total bajas</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900 dark:text-slate-100">{summary.total}</p>
        </div>
        <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-3 dark:border-slate-700 dark:bg-slate-950">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Categoria principal</p>
          <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">{summary.topCategory ?? "-"}</p>
        </div>
        <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-3 dark:border-slate-700 dark:bg-slate-950">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Motivo principal</p>
          <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">{summary.topReason ?? "-"}</p>
        </div>
        <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-3 dark:border-slate-700 dark:bg-slate-950">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Sin motivo</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900 dark:text-slate-100">{summary.missingReasonCount}</p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-md border border-slate-200 dark:border-slate-700">
        <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-700">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-600 dark:bg-slate-800 dark:text-slate-400">
            <tr>
              <th className="px-3 py-2">Categoria</th>
              <th className="px-3 py-2">Motivo</th>
              <th className="px-3 py-2 text-right">Cantidad</th>
              <th className="px-3 py-2 text-right">%</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {summary.rows.length === 0 ? (
              <tr>
                <td className="px-3 py-4 text-slate-600 dark:text-slate-400" colSpan={4}>
                  Sin bajas en el periodo seleccionado.
                </td>
              </tr>
            ) : (
              summary.rows.map((row) => (
                <tr key={`${row.category}-${row.reason}`}>
                  <td className="px-3 py-2 font-medium text-slate-900 dark:text-slate-100">{row.category}</td>
                  <td className="px-3 py-2 text-slate-600 dark:text-slate-400">{row.reason}</td>
                  <td className="px-3 py-2 text-right font-medium">{row.count}</td>
                  <td className="px-3 py-2 text-right text-slate-600 dark:text-slate-400">{formatPercent(row.percent)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <BajaReasonSummaryCopy text={copyText} />
    </section>
  );
}

function BajaPrintReport({ rows, filterLabel, total }: { rows: BajaRow[]; filterLabel: string; total: number }) {
  return (
    <section className="hidden print:block">
      <header className="mb-3 border-b border-slate-300 pb-2">
        <p className="text-[9px] uppercase tracking-wide text-slate-500">Dragon Force Monterrey</p>
        <h2 className="text-sm font-bold text-slate-900">Jugadores dados de baja</h2>
        <p className="text-[9px] text-slate-600">{filterLabel}</p>
        <p className="text-[9px] font-semibold text-slate-800">{total} jugadores</p>
      </header>

      <table className="w-full table-fixed border-collapse text-[8px]">
        <thead>
          <tr className="border-b border-slate-400 text-left uppercase text-slate-600">
            <th className="w-6 px-1 py-0.5">#</th>
            <th className="w-20 px-1 py-0.5">Campus</th>
            <th className="w-10 px-1 py-0.5">Cat.</th>
            <th className="w-16 px-1 py-0.5">ID</th>
            <th className="px-1 py-0.5">Jugador</th>
            <th className="w-16 px-1 py-0.5">Fecha baja</th>
            <th className="w-36 px-1 py-0.5">Motivo</th>
            <th className="w-28 px-1 py-0.5">Notas</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`${row.playerId}-${row.endDate ?? index}`} className="border-b border-slate-200">
              <td className="px-1 py-0.5 align-top">{index + 1}</td>
              <td className="px-1 py-0.5 align-top">{row.campusName}</td>
              <td className="px-1 py-0.5 align-top">{row.birthYear ?? "-"}</td>
              <td className="px-1 py-0.5 align-top">{row.publicPlayerId ?? "-"}</td>
              <td className="truncate px-1 py-0.5 align-top font-medium">{row.fullName}</td>
              <td className="px-1 py-0.5 align-top">{fmtDate(row.endDate)}</td>
              <td className="truncate px-1 py-0.5 align-top">{getCategorizedDropoutReasonLabel(row.dropoutReason)}</td>
              <td className="px-1 py-0.5 align-top" />
            </tr>
          ))}
          {rows.length === 0 ? (
            <tr>
              <td colSpan={8} className="px-1 py-3 text-center text-slate-500">
                Sin bajas en el periodo seleccionado.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </section>
  );
}

function PlayerViewTabs({ view, canViewLists }: { view: "active" | "bajas" | "groups"; canViewLists: boolean }) {
  const items = [
    { href: "/players", key: "groups", label: "Vista por grupos" },
    ...(canViewLists
      ? [
          { href: "/players?view=active", key: "active", label: "Activos" },
          { href: "/players?view=bajas", key: "bajas", label: "Bajas" },
        ]
      : []),
  ] as Array<{ href: string; key: "active" | "bajas" | "groups"; label: string }>;

  return (
    <div className="flex flex-wrap gap-2 border-b border-slate-200 dark:border-slate-700">
      {items.map((item) => (
        <Link
          key={item.key}
          href={item.href}
          prefetch={false}
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
  dropoutMonth?: string;
  dropoutFrom?: string;
  dropoutTo?: string;
  page?: string;
  view?: string;
  ok?: string;
}>;

export default async function PlayersPage({ searchParams }: { searchParams: SearchParams }) {
  const permissionContext = await requirePlayerRosterContext("/unauthorized");
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
  const dropoutMonth = params.dropoutMonth ?? "";
  const dropoutFrom = params.dropoutFrom ?? "";
  const dropoutTo = params.dropoutTo ?? "";
  const page = Math.max(1, Number(params.page ?? "1") || 1);
  const view = params.view === "active" ? "active" : params.view === "bajas" ? "bajas" : "groups";

  if (view !== "groups" && !permissionContext.hasPlayerDataAccess) {
    redirect("/players");
  }

  if (view === "groups") {
    const selectedGroupGender = gender === "male" || gender === "female" ? gender : "";
    return (
      <PageShell
        title="Jugadores por grupos"
        subtitle="Vista tipo hoja de calculo por campus y grupo de entrenamiento."
        breadcrumbs={[{ label: "Jugadores" }]}
        wide
      >
        <div className="space-y-4">
          <PlayerViewTabs view={view} canViewLists={permissionContext.hasPlayerDataAccess} />
          <GroupedRosterClient filters={{ campusId: campusId || undefined, gender: selectedGroupGender || undefined, birthYear: birthYear || undefined }} />
        </div>
      </PageShell>
    );
  }

  const [campuses, birthYears, tags, attendanceExport] = await Promise.all([
    listCampuses(),
    view === "active" ? listBirthYears() : Promise.resolve([]),
    getTagSettings(),
    view === "active"
      ? getAttendanceExportData()
      : Promise.resolve({ rows: [], excludedMissingGenderCount: 0, excludedMissingGender: [] }),
  ]);

  let result: { rows: unknown[]; total: number; page: number; pageSize: number };
  let activeRows: Awaited<ReturnType<typeof listPlayers>>["rows"] = [];
  let bajaRows: Awaited<ReturnType<typeof listBajas>>["rows"] = [];
  let bajaPrintRows: Awaited<ReturnType<typeof listBajas>>["rows"] = [];
  let bajaSummary: BajaSummary | null = null;

  if (view === "bajas") {
    const bajaResult = await listBajas({
      q,
      campusId: campusId || undefined,
      dropoutMonth: dropoutMonth || undefined,
      dropoutFrom: dropoutFrom || undefined,
      dropoutTo: dropoutTo || undefined,
      page,
    });
    result = bajaResult;
    bajaRows = bajaResult.rows;
    bajaPrintRows =
      bajaResult.total > bajaResult.rows.length
        ? (
            await listBajas({
              q,
              campusId: campusId || undefined,
              dropoutMonth: dropoutMonth || undefined,
              dropoutFrom: dropoutFrom || undefined,
              dropoutTo: dropoutTo || undefined,
              page: 1,
              includeAllRows: true,
            })
          ).rows
        : bajaResult.rows;
    bajaSummary = bajaResult.summary ?? null;
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
    `&pendingMonth=${encodeURIComponent(pendingMonth)}` +
    `&dropoutMonth=${encodeURIComponent(dropoutMonth)}` +
    `&dropoutFrom=${encodeURIComponent(dropoutFrom)}` +
    `&dropoutTo=${encodeURIComponent(dropoutTo)}`;
  const showAdvancedFilters = Boolean(pendingMonth || missingGender || missingLevel || missingTeam);
  const selectedCampusName = campuses.find((campus) => campus.id === campusId)?.name ?? "Todos los campus";
  const bajaFilterLabel = buildBajaFilterLabel({ campusName: selectedCampusName, dropoutMonth, dropoutFrom, dropoutTo, q });

  return (
    <PageShell
      title={view === "bajas" ? "Jugadores dados de baja" : "Jugadores inscritos"}
      subtitle={view === "bajas" ? "Jugadores sin inscripcion activa" : "Solo se muestran jugadores con inscripcion activa"}
      breadcrumbs={[{ label: "Jugadores" }]}
    >
      <>
        <div className="space-y-4 print:hidden">
          {params.ok === "nuked" ? (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/20 dark:text-emerald-300">
              Jugador eliminado permanentemente.
            </div>
          ) : null}

        <PlayerViewTabs view={view} canViewLists={permissionContext.hasPlayerDataAccess} />

        <div className="space-y-3">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <form className="flex-1 space-y-3">
              <input type="hidden" name="view" value={view} />
              <div className="grid gap-3 sm:grid-cols-2 xl:flex xl:flex-wrap">
                <select name="campus" defaultValue={campusId} className="rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-600">
                  <option value="">Todos los campus</option>
                  {campuses.map((campus) => (
                    <option key={campus.id} value={campus.id}>
                      {campus.name}
                    </option>
                  ))}
                </select>
                {view === "active" ? (
                  <>
                    <select name="year" defaultValue={birthYear} className="rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-600">
                      <option value="">Todas las categorias</option>
                      {birthYears.map((year) => (
                        <option key={year} value={String(year)}>
                          {year}
                        </option>
                      ))}
                    </select>
                    <select name="gender" defaultValue={gender} className="rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-600">
                      <option value="">Todos</option>
                      <option value="male">Varonil</option>
                      <option value="female">Femenil</option>
                    </select>
                  </>
                ) : null}
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
                {view === "bajas" ? (
                  <>
                    <label className="grid gap-1 text-xs font-medium text-slate-500 dark:text-slate-400">
                      Mes de baja
                      <input
                        type="month"
                        name="dropoutMonth"
                        defaultValue={dropoutMonth}
                        className="rounded-md border border-slate-300 px-3 py-2 text-sm font-normal text-slate-900 dark:border-slate-600 dark:text-slate-100"
                      />
                    </label>
                    <label className="grid gap-1 text-xs font-medium text-slate-500 dark:text-slate-400">
                      Desde
                      <input
                        type="date"
                        name="dropoutFrom"
                        defaultValue={dropoutFrom}
                        className="rounded-md border border-slate-300 px-3 py-2 text-sm font-normal text-slate-900 dark:border-slate-600 dark:text-slate-100"
                      />
                    </label>
                    <label className="grid gap-1 text-xs font-medium text-slate-500 dark:text-slate-400">
                      Hasta
                      <input
                        type="date"
                        name="dropoutTo"
                        defaultValue={dropoutTo}
                        className="rounded-md border border-slate-300 px-3 py-2 text-sm font-normal text-slate-900 dark:border-slate-600 dark:text-slate-100"
                      />
                    </label>
                  </>
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

            {view === "active" && permissionContext.hasOperationalAccess ? (
              <div className="grid gap-2 sm:grid-cols-2 xl:flex xl:items-center">
                <a
                  href="/api/exports/players-attendance"
                  className="rounded-md border border-slate-300 bg-white px-4 py-2 text-center text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  Exportar Excel
                </a>
                <Link href="/players/new" prefetch={false} className="rounded-md bg-portoBlue px-4 py-2 text-center text-sm font-medium text-white hover:bg-portoDark">
                  + Nuevo jugador
                </Link>
              </div>
            ) : null}
            {view === "bajas" ? (
              <div className="grid gap-2 sm:grid-cols-2 xl:flex xl:items-center">
                <BajaPrintButton />
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
                          <Link href={`/players/${row.id}`} prefetch={false} className="font-medium text-slate-900 hover:text-portoBlue hover:underline dark:text-slate-100">
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
            {bajaSummary ? <BajaReasonSummaryPanel summary={bajaSummary} filterLabel={bajaFilterLabel} /> : null}
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
                          <Link href={`/players/${row.playerId}`} prefetch={false} className="font-medium text-slate-900 hover:text-portoBlue hover:underline dark:text-slate-100">
                            {row.fullName}
                          </Link>
                        </td>
                        <td className="px-3 py-2">{row.campusName}</td>
                        <td className="px-3 py-2">{fmtDate(row.startDate)}</td>
                        <td className="px-3 py-2">{fmtDate(row.endDate)}</td>
                        <td className="px-3 py-2">{row.daysEnrolled != null ? `${row.daysEnrolled} dias` : "-"}</td>
                        <td className="px-3 py-2">{getCategorizedDropoutReasonLabel(row.dropoutReason)}</td>
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
              <Link href={`/players?${qsBase}&page=${prevPage}`} prefetch={false} className="rounded border px-3 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800">
                Anterior
              </Link>
            ) : (
              <span className="rounded border px-3 py-1.5 text-slate-400">Anterior</span>
            )}
            {nextPage ? (
              <Link href={`/players?${qsBase}&page=${nextPage}`} prefetch={false} className="rounded border px-3 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800">
                Siguiente
              </Link>
            ) : (
              <span className="rounded border px-3 py-1.5 text-slate-400">Siguiente</span>
            )}
          </div>
        </div>
        </div>
        {view === "bajas" ? <BajaPrintReport rows={bajaPrintRows} filterLabel={bajaFilterLabel} total={bajaPrintRows.length} /> : null}
      </>
    </PageShell>
  );
}
