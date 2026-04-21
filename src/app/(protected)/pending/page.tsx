import Link from "next/link";
import { requireOperationalContext } from "@/lib/auth/permissions";
import {
  getPendingTuitionDashboardData,
  type PendingTuitionCampusBoard,
  type PendingTuitionPlayer,
} from "@/lib/queries/tuition-pending";
import { PageShell } from "@/components/ui/page-shell";

type SearchParams = Promise<{
  campus?: string;
  month?: string;
}>;

function withParams(path: string, params: Record<string, string | undefined>) {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) qs.set(key, value);
  }
  const query = qs.toString();
  return query ? `${path}?${query}` : path;
}

function bucketChip(label: string, count: number, tone: "slate" | "amber" | "rose" = "slate") {
  const tones = {
    slate: "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200",
    amber: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200",
    rose: "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-200",
  };

  return (
    <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>
      {label}: {count}
    </span>
  );
}

function countBuckets(players: PendingTuitionPlayer[]) {
  return {
    oneMonthCount: players.filter((player) => player.pendingMonthCount === 1).length,
    twoMonthCount: players.filter((player) => player.pendingMonthCount === 2).length,
    threePlusMonthCount: players.filter((player) => player.pendingMonthCount >= 3).length,
    overdueCount: players.filter((player) => player.overdueMonthCount > 0).length,
  };
}

function buildAllCampusesBoard(boards: PendingTuitionCampusBoard[]): PendingTuitionCampusBoard {
  const allPlayers = boards.flatMap((board) => board.categories.flatMap((category) => category.players));
  const byCategory = new Map<string, PendingTuitionPlayer[]>();

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
        players,
        ...countBuckets(players),
      };
    })
    .sort((a, b) => (a.birthYear ?? 9999) - (b.birthYear ?? 9999));

  return {
    campusId: "",
    campusName: "Todos los campus",
    totalPlayers: allPlayers.length,
    categories,
    ...countBuckets(allPlayers),
  };
}

function CampusCard({
  board,
  selected,
  month,
}: {
  board: PendingTuitionCampusBoard;
  selected: boolean;
  month: string;
}) {
  return (
    <Link
      href={withParams("/pending", { campus: board.campusId, month })}
      className={`rounded-xl border p-4 transition hover:-translate-y-0.5 hover:shadow-sm ${
        selected
          ? "border-portoBlue bg-blue-50/60 dark:border-blue-500 dark:bg-blue-950/20"
          : "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900"
      }`}
    >
      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{board.campusName}</p>
      <p className="mt-1 text-3xl font-semibold tracking-tight text-portoDark dark:text-slate-100">{board.totalPlayers}</p>
      <p className="text-xs text-slate-500 dark:text-slate-400">jugadores con mensualidad pendiente</p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {bucketChip("1 mes", board.oneMonthCount)}
        {bucketChip("2 meses", board.twoMonthCount, "amber")}
        {bucketChip("3+ meses", board.threePlusMonthCount, "rose")}
      </div>
    </Link>
  );
}

export default async function PendingTuitionPage({ searchParams }: { searchParams: SearchParams }) {
  await requireOperationalContext("/unauthorized");

  const params = await searchParams;
  const data = await getPendingTuitionDashboardData({ campusId: params.campus, month: params.month });
  const allCampusesBoard = buildAllCampusesBoard(data.campusBoards);
  const selectedBoard = data.selectedCampusId
    ? data.campusBoards.find((board) => board.campusId === data.selectedCampusId) ?? null
    : allCampusesBoard;

  return (
    <PageShell
      title="Pendientes"
      subtitle="Mensualidades no pagadas por campus y categoria. Esta vista no muestra montos ni datos de contacto."
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
              href={withParams("/pending", { campus: data.selectedCampusId })}
              className="rounded-md border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800"
            >
              Ver todos los meses
            </Link>
          </div>
        </form>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
            <p className="text-xs uppercase tracking-wide text-slate-400">Jugadores</p>
            <p className="mt-1 text-3xl font-semibold">{data.totals.players}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
            <p className="text-xs uppercase tracking-wide text-slate-400">1 mes pendiente</p>
            <p className="mt-1 text-3xl font-semibold">{data.totals.oneMonth}</p>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/20">
            <p className="text-xs uppercase tracking-wide text-amber-700 dark:text-amber-300">2 meses pendientes</p>
            <p className="mt-1 text-3xl font-semibold text-amber-900 dark:text-amber-100">{data.totals.twoMonths}</p>
          </div>
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 dark:border-rose-800 dark:bg-rose-950/20">
            <p className="text-xs uppercase tracking-wide text-rose-700 dark:text-rose-300">3+ meses o vencidos</p>
            <p className="mt-1 text-3xl font-semibold text-rose-900 dark:text-rose-100">{data.totals.threePlusMonths + data.totals.overdue}</p>
          </div>
        </div>

        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Campus</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">Selecciona un campus para ver sus categorias.</p>
            </div>
            {data.selectedMonth ? (
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                Filtro: {data.selectedMonth}
              </span>
            ) : null}
          </div>
          {data.campusBoards.length > 0 ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <CampusCard board={allCampusesBoard} selected={!data.selectedCampusId} month={data.selectedMonth} />
              {data.campusBoards.map((board) => (
                <CampusCard key={board.campusId} board={board} selected={board.campusId === data.selectedCampusId} month={data.selectedMonth} />
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-8 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
              No hay mensualidades pendientes con los filtros actuales.
            </div>
          )}
        </section>

        <section className="space-y-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Categorias {selectedBoard ? `- ${selectedBoard.campusName}` : ""}
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">Cada tarjeta abre el detalle de jugadores de esa categoria.</p>
          </div>

          {selectedBoard && selectedBoard.categories.length > 0 ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {selectedBoard.categories.map((category) => (
                <Link
                  key={category.key}
                  href={withParams("/pending/detail", {
                    campus: selectedBoard.campusId,
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
                    {category.overdueCount > 0 ? (
                      <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-700 dark:bg-rose-900/30 dark:text-rose-200">
                        Vencidos
                      </span>
                    ) : null}
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
              No hay categorias con mensualidad pendiente para este campus.
            </div>
          )}
        </section>
      </div>
    </PageShell>
  );
}
