import Link from "next/link";
import { redirect } from "next/navigation";
import { PageShell } from "@/components/ui/page-shell";
import { getPermissionContext } from "@/lib/auth/permissions";
import { getCompetitionSignupCategoryDetailData } from "@/lib/queries/sports-signups";

type SearchParams = Promise<{
  campus?: string;
  competition?: string;
  birthYear?: string;
  trainingGroup?: string;
  program?: string;
  paidFrom?: string;
  paidTo?: string;
  perf?: string;
}>;

function formatPaidFilterLabel(from: string | null, to: string | null) {
  if (from && to) return `Pagos del ${from} al ${to}`;
  if (from) return `Pagos desde ${from}`;
  if (to) return `Pagos hasta ${to}`;
  return null;
}

export default async function SportsSignupsDetailPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const permissionContext = await getPermissionContext();
  const detail = await getCompetitionSignupCategoryDetailData({
    campusId: params.campus ?? "",
    competitionId: params.competition ?? "",
    birthYear: params.birthYear ?? "",
    trainingGroupId: params.trainingGroup ?? "",
    program: params.program ?? "",
    paidFrom: params.paidFrom ?? "",
    paidTo: params.paidTo ?? "",
    perf: permissionContext?.isSuperAdmin === true && params.perf === "1",
  });

  if (!detail || !permissionContext) redirect("/unauthorized");

  const paidDateQuery = `${detail.paidDateFilter.from ? `&paidFrom=${encodeURIComponent(detail.paidDateFilter.from)}` : ""}${detail.paidDateFilter.to ? `&paidTo=${encodeURIComponent(detail.paidDateFilter.to)}` : ""}`;
  const programQuery = params.program ? `&program=${encodeURIComponent(params.program)}` : "";
  const paidFilterLabel = formatPaidFilterLabel(detail.paidDateFilter.from, detail.paidDateFilter.to);

  return (
    <PageShell
      title={`${detail.competitionLabel} - ${detail.filterLabel}`}
      subtitle={`Jugadores pagados y no pagados con su grupo de entrenamiento actual en ${detail.campusName}.`}
      breadcrumbs={[
        { label: "Inscripciones Torneos", href: "/sports-signups" },
        { label: detail.competitionLabel },
        { label: detail.filterLabel },
      ]}
      wide
    >
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 dark:border-slate-700 dark:bg-slate-900/60">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
              {detail.campusName}
            </p>
            <p className="text-lg font-semibold text-slate-950 dark:text-slate-50">
              {detail.totalConfirmed} jugadores pagados confirmados
            </p>
            <p className="text-sm text-slate-600 dark:text-slate-300">{detail.totalUnpaid} jugadores no pagados</p>
            {paidFilterLabel ? <p className="text-sm font-medium text-portoBlue">{paidFilterLabel}</p> : null}
          </div>
          <Link
            href={`/sports-signups?campus=${encodeURIComponent(detail.campusId)}&competition=${encodeURIComponent(detail.competitionId)}${programQuery}${paidDateQuery}`}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Volver al tablero
          </Link>
        </div>

        {detail.perf ? (
          <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-4 text-sm text-amber-950 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-100">
            <p className="font-semibold">Debug perf activo</p>
            <p className="mt-1">Tiempo total servidor: <span className="font-semibold">{detail.perf.totalMs} ms</span></p>
            <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {detail.perf.steps.map((step) => (
                <div key={step.label} className="rounded-lg border border-amber-200 bg-white px-3 py-2 dark:border-amber-800 dark:bg-slate-900/50">
                  <p className="text-xs uppercase tracking-wide text-amber-800 dark:text-amber-200">{step.label}</p>
                  <p className="text-base font-semibold text-slate-900 dark:text-slate-100">{step.durationMs} ms</p>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <RosterSection
          title="Pagados"
          description={paidFilterLabel
            ? "Jugadores confirmados dentro del rango de pago seleccionado."
            : "Jugadores confirmados para esta competencia."}
          countLabel={`${detail.totalConfirmed} pagados`}
          emptyLabel="No hay jugadores pagados con este filtro."
          players={detail.paidPlayers}
          tone="paid"
        />

        <RosterSection
          title="No pagados"
          description="Jugadores activos que todavia no han pagado esta competencia en ningun periodo."
          countLabel={`${detail.totalUnpaid} no pagados`}
          emptyLabel="No hay jugadores pendientes de pago con este filtro."
          players={detail.unpaidPlayers}
          tone="unpaid"
        />
      </div>
    </PageShell>
  );
}

function RosterSection({
  title,
  description,
  countLabel,
  emptyLabel,
  players,
  tone,
}: {
  title: string;
  description: string;
  countLabel: string;
  emptyLabel: string;
  players: Array<{
    enrollmentId: string;
    playerName: string;
    trainingGroupLabel: string;
    trainingGroupSubtitle: string;
  }>;
  tone: "paid" | "unpaid";
}) {
  const cardClass = tone === "paid"
    ? "border-emerald-200 bg-emerald-50/60 dark:border-emerald-950"
    : "border-rose-200 bg-rose-50/60 dark:border-rose-950";

  return (
    <section className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-slate-950 dark:text-slate-50">{title}</h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">{description}</p>
        </div>
        <p className="text-sm font-medium text-slate-600 dark:text-slate-300">{countLabel}</p>
      </div>

      {players.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 px-4 py-8 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
          {emptyLabel}
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {players.map((player) => (
            <article key={player.enrollmentId} className={`rounded-xl border px-4 py-3 dark:bg-slate-950/70 ${cardClass}`}>
              <p className="font-medium text-slate-950 dark:text-slate-50">{player.playerName}</p>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{player.trainingGroupLabel}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">{player.trainingGroupSubtitle}</p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
