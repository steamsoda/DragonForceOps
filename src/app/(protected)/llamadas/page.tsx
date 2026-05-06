import Link from "next/link";
import { requireOperationalContext } from "@/lib/auth/permissions";
import { getCallsDashboardData, type CallsDashboardData } from "@/lib/queries/calls";
import { PageShell } from "@/components/ui/page-shell";

type SearchParams = Promise<{
  campus?: string;
  month?: string;
  ok?: string;
}>;

function withParams(path: string, params: Record<string, string | undefined>) {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) qs.set(key, value);
  }
  const query = qs.toString();
  return query ? `${path}?${query}` : path;
}

function chip(label: string, tone: "slate" | "amber" | "rose" | "emerald" | "blue" = "slate") {
  const tones = {
    slate: "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200",
    amber: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200",
    rose: "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-200",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200",
    blue: "border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-200",
  };

  return (
    <span className={`inline-flex min-h-6 items-center justify-center rounded-full border px-2.5 py-0.5 text-center text-xs font-medium leading-none ${tones[tone]}`}>
      {label}
    </span>
  );
}

function bucketChip(label: string, count: number, tone: "slate" | "amber" | "rose" = "slate") {
  return chip(`${label}: ${count}`, tone);
}

function CampusCard({
  board,
  selected,
  month,
}: {
  board: CallsDashboardData["campusBoards"][number] | {
    campusId: string;
    campusName: string;
    totalPlayers: number;
    oneMonthCount: number;
    twoMonthCount: number;
    threePlusMonthCount: number;
  };
  selected: boolean;
  month: string;
}) {
  return (
    <Link
      href={withParams("/llamadas", { campus: board.campusId, month })}
      className={`rounded-xl border p-4 transition hover:-translate-y-0.5 hover:shadow-sm ${
        selected
          ? "border-portoBlue bg-blue-50/60 dark:border-blue-500 dark:bg-blue-950/20"
          : "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900"
      }`}
    >
      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{board.campusName}</p>
      <p className="mt-1 text-3xl font-semibold tracking-tight text-portoDark dark:text-slate-100">{board.totalPlayers}</p>
      <p className="text-xs text-slate-500 dark:text-slate-400">jugadores para llamar</p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {bucketChip("1 mes", board.oneMonthCount)}
        {bucketChip("2 meses", board.twoMonthCount, "amber")}
        {bucketChip("3+ meses", board.threePlusMonthCount, "rose")}
      </div>
    </Link>
  );
}

function KpiCard({
  href,
  label,
  count,
  tone = "slate",
}: {
  href: string;
  label: string;
  count: number;
  tone?: "slate" | "amber" | "rose" | "emerald" | "blue";
}) {
  const tones = {
    slate: "border-slate-200 bg-white text-slate-900 hover:border-portoBlue dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100",
    amber: "border-amber-200 bg-amber-50 text-amber-900 hover:border-amber-400 dark:border-amber-800 dark:bg-amber-950/20 dark:text-amber-100",
    rose: "border-rose-200 bg-rose-50 text-rose-900 hover:border-rose-400 dark:border-rose-800 dark:bg-rose-950/20 dark:text-rose-100",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-900 hover:border-emerald-400 dark:border-emerald-800 dark:bg-emerald-950/20 dark:text-emerald-100",
    blue: "border-blue-200 bg-blue-50 text-blue-900 hover:border-blue-400 dark:border-blue-800 dark:bg-blue-950/20 dark:text-blue-100",
  };
  return (
    <Link href={href} className={`rounded-xl border p-4 transition hover:-translate-y-0.5 hover:shadow-sm ${tones[tone]}`}>
      <p className="text-xs uppercase tracking-wide opacity-70">{label}</p>
      <p className="mt-1 text-3xl font-semibold">{count}</p>
    </Link>
  );
}

function buildAllCampusesBoard(data: CallsDashboardData) {
  const allPlayers = data.campusBoards.flatMap((board) => board.categories.flatMap((category) => category.players));
  const byCategory = new Map<string, typeof allPlayers>();
  for (const player of allPlayers) {
    const key = player.birthYear ? String(player.birthYear) : "sin-categoria";
    byCategory.set(key, [...(byCategory.get(key) ?? []), player]);
  }
  const categories = [...byCategory.entries()]
    .map(([key, players]) => {
      const birthYear = key === "sin-categoria" ? null : Number(key);
      return {
        key,
        label: birthYear ? `Cat. ${birthYear}` : "Sin categoria",
        birthYear,
        playerCount: players.length,
        oneMonthCount: players.filter((player) => player.pendingMonthCount === 1).length,
        twoMonthCount: players.filter((player) => player.pendingMonthCount === 2).length,
        threePlusMonthCount: players.filter((player) => player.pendingMonthCount >= 3).length,
        overdueCount: players.filter((player) => player.overdueMonthCount > 0).length,
        players,
      };
    })
    .sort((a, b) => (a.birthYear ?? 9999) - (b.birthYear ?? 9999));

  return {
    campusId: "",
    campusName: "Todos los campus",
    totalPlayers: allPlayers.length,
    oneMonthCount: allPlayers.filter((player) => player.pendingMonthCount === 1).length,
    twoMonthCount: allPlayers.filter((player) => player.pendingMonthCount === 2).length,
    threePlusMonthCount: allPlayers.filter((player) => player.pendingMonthCount >= 3).length,
    categories,
  };
}

export default async function CallsPage({ searchParams }: { searchParams: SearchParams }) {
  await requireOperationalContext("/unauthorized");

  const params = await searchParams;
  const data = await getCallsDashboardData({ campusId: params.campus, month: params.month });
  const allCampusesBoard = buildAllCampusesBoard(data);
  const selectedBoard = data.selectedCampusId
    ? data.campusBoards.find((board) => board.campusId === data.selectedCampusId) ?? null
    : null;
  const visibleBoard = selectedBoard ?? allCampusesBoard;

  return (
    <PageShell
      title="Llamadas"
      subtitle="Cola de llamadas para mensualidades pendientes con telefono, seguimiento y baja operativa."
      wide
    >
      <div className="space-y-6">
        <form className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900 sm:flex-row sm:items-end">
          {data.selectedCampusId ? <input type="hidden" name="campus" value={data.selectedCampusId} /> : null}
          <label className="grid gap-1 text-sm">
            <span className="font-medium text-slate-700 dark:text-slate-200">Mes de mensualidad</span>
            <input
              type="month"
              name="month"
              defaultValue={data.selectedMonth}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="submit" className="rounded-md bg-portoBlue px-4 py-2 text-sm font-medium text-white hover:bg-portoDark">
              Aplicar
            </button>
            <Link
              href={withParams("/llamadas", { campus: data.selectedCampusId })}
              className="rounded-md border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800"
            >
              Ver todos los meses
            </Link>
          </div>
        </form>

        {params.ok === "baja" ? (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200">
            Baja registrada correctamente. Los cargos pendientes no fueron anulados.
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            label="Todos para llamar"
            count={data.totals.players}
            href={withParams("/llamadas/detail", { campus: data.selectedCampusId, month: data.selectedMonth })}
          />
          <KpiCard
            label="1 mes pendiente"
            count={data.totals.oneMonth}
            href={withParams("/llamadas/detail", { campus: data.selectedCampusId, bucket: "1", month: data.selectedMonth })}
          />
          <KpiCard
            label="2 meses pendientes"
            count={data.totals.twoMonths}
            tone="amber"
            href={withParams("/llamadas/detail", { campus: data.selectedCampusId, bucket: "2", month: data.selectedMonth })}
          />
          <KpiCard
            label="3+ meses pendientes"
            count={data.totals.threePlusMonths}
            tone="rose"
            href={withParams("/llamadas/detail", { campus: data.selectedCampusId, bucket: "3plus", month: data.selectedMonth })}
          />
        </div>

        <section className="space-y-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Seguimiento</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">Retoma una cola segun el ultimo resultado de llamada.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <KpiCard
              label="No contactado"
              count={data.followUpCounts.uncontacted}
              href={withParams("/llamadas/detail", { campus: data.selectedCampusId, month: data.selectedMonth, followUp: "uncontacted" })}
            />
            <KpiCard
              label="No contesta"
              count={data.followUpCounts.no_answer}
              tone="amber"
              href={withParams("/llamadas/detail", { campus: data.selectedCampusId, month: data.selectedMonth, followUp: "no_answer" })}
            />
            <KpiCard
              label="Contactado"
              count={data.followUpCounts.contacted}
              tone="blue"
              href={withParams("/llamadas/detail", { campus: data.selectedCampusId, month: data.selectedMonth, followUp: "contacted" })}
            />
            <KpiCard
              label="Promesas"
              count={data.followUpCounts.promise_to_pay}
              tone="emerald"
              href={withParams("/llamadas/detail", { campus: data.selectedCampusId, month: data.selectedMonth, followUp: "promise_to_pay" })}
            />
            <KpiCard
              label="No regresara"
              count={data.followUpCounts.will_not_return}
              tone="rose"
              href={withParams("/llamadas/detail", { campus: data.selectedCampusId, month: data.selectedMonth, followUp: "will_not_return" })}
            />
          </div>
        </section>

        <section className="space-y-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Campus</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">Selecciona un campus para organizar las llamadas por categoria.</p>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <CampusCard board={allCampusesBoard} selected={!data.selectedCampusId} month={data.selectedMonth} />
            {data.campusBoards.map((board) => (
              <CampusCard key={board.campusId} board={board} selected={board.campusId === data.selectedCampusId} month={data.selectedMonth} />
            ))}
          </div>
        </section>

        <section className="space-y-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Categorias {selectedBoard ? `- ${selectedBoard.campusName}` : ""}
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">Cada tarjeta abre una cola enfocada para llamar.</p>
          </div>

          {visibleBoard.categories.length > 0 ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {visibleBoard.categories.map((category) => (
                <Link
                  key={`${category.key}-${category.label}`}
                  href={withParams("/llamadas/detail", {
                    campus: data.selectedCampusId,
                    birthYear: category.key,
                    month: data.selectedMonth,
                  })}
                  className="rounded-xl border border-slate-200 bg-white p-4 transition hover:-translate-y-0.5 hover:border-portoBlue hover:shadow-sm dark:border-slate-700 dark:bg-slate-900"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-900 dark:text-slate-100">{category.label}</p>
                      <p className="text-sm text-slate-500 dark:text-slate-400">{category.playerCount} jugadores</p>
                    </div>
                    {category.overdueCount > 0 ? chip("Vencidos", "rose") : null}
                  </div>
                  <div className="mt-4 flex flex-wrap gap-1.5">
                    {bucketChip("1 mes", category.oneMonthCount)}
                    {bucketChip("2 meses", category.twoMonthCount, "amber")}
                    {bucketChip("3+ meses", category.threePlusMonthCount, "rose")}
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-8 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
              No hay jugadores con mensualidad pendiente para estos filtros.
            </div>
          )}
        </section>
      </div>
    </PageShell>
  );
}
