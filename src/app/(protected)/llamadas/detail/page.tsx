import Link from "next/link";
import { notFound } from "next/navigation";
import { PendingTable } from "@/components/pending/pending-table";
import { requireOperationalContext } from "@/lib/auth/permissions";
import { getCallsDetailData } from "@/lib/queries/calls";
import type { PendingFollowUpFilter } from "@/lib/queries/enrollments";
import { PageShell } from "@/components/ui/page-shell";

type SearchParams = Promise<{
  campus?: string;
  birthYear?: string;
  month?: string;
  bucket?: string;
  q?: string;
  followUp?: string;
  organizeBy?: string;
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

function normalizeFollowUp(value: string | undefined): PendingFollowUpFilter {
  if (
    value === "uncontacted" ||
    value === "no_answer" ||
    value === "contacted" ||
    value === "promise_to_pay" ||
    value === "will_not_return"
  ) {
    return value;
  }
  return "all";
}

function statusLabel(status: PendingFollowUpFilter) {
  if (status === "uncontacted") return "No contactado";
  if (status === "no_answer") return "No contesta";
  if (status === "contacted") return "Contactado";
  if (status === "promise_to_pay") return "Promesa de pago";
  if (status === "will_not_return") return "No regresara";
  return "Todos";
}

function statusTone(status: PendingFollowUpFilter) {
  if (status === "no_answer") return "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200";
  if (status === "contacted") return "border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-200";
  if (status === "promise_to_pay") return "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200";
  if (status === "will_not_return") return "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-200";
  return "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200";
}

export default async function CallsDetailPage({ searchParams }: { searchParams: SearchParams }) {
  await requireOperationalContext("/unauthorized");
  const params = await searchParams;
  const followUp = normalizeFollowUp(params.followUp);
  const data = await getCallsDetailData({
    campusId: params.campus,
    birthYear: params.birthYear,
    month: params.month,
    bucket: params.bucket,
    q: params.q,
    followUpStatus: followUp,
    organizeBy: params.organizeBy,
  });

  if (!data) notFound();

  const boardHref = withParams("/llamadas", { campus: data.campusId, month: data.selectedMonth });
  const organizeParam = data.organizeBy === "birthYear" ? undefined : data.organizeBy;

  return (
    <PageShell title={data.title} subtitle={data.subtitle} wide>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={boardHref}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-portoBlue hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800"
          >
            Volver a llamadas
          </Link>
          {data.selectedMonth ? (
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-200">
              Mes: {data.selectedMonth}
            </span>
          ) : null}
        </div>

        {params.ok === "baja" ? (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200">
            Baja registrada correctamente. Los cargos pendientes no fueron anulados.
          </div>
        ) : null}

        <form className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900 md:grid-cols-[minmax(220px,1fr)_220px_220px_auto] md:items-end">
          {data.campusId ? <input type="hidden" name="campus" value={data.campusId} /> : null}
          {data.birthYear ? <input type="hidden" name="birthYear" value={data.birthYear} /> : null}
          {data.bucket ? <input type="hidden" name="bucket" value={data.bucket} /> : null}
          {data.selectedMonth ? <input type="hidden" name="month" value={data.selectedMonth} /> : null}
          <label className="grid gap-1 text-sm">
            <span className="font-medium text-slate-700 dark:text-slate-200">Buscar</span>
            <input
              type="search"
              name="q"
              defaultValue={data.q}
              placeholder="Jugador, telefono o grupo"
              className="rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-medium text-slate-700 dark:text-slate-200">Seguimiento</span>
            <select
              name="followUp"
              defaultValue={data.followUpStatus}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
            >
              <option value="all">Todos</option>
              <option value="uncontacted">No contactado</option>
              <option value="no_answer">No contesta</option>
              <option value="contacted">Contactado</option>
              <option value="promise_to_pay">Promesa de pago</option>
              <option value="will_not_return">No regresara</option>
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-medium text-slate-700 dark:text-slate-200">Organizar por</span>
            <select
              name="organizeBy"
              defaultValue={data.organizeBy}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
            >
              <option value="birthYear">Categoria</option>
              <option value="pendingMonths">Meses pendientes</option>
              <option value="followUp">Seguimiento</option>
            </select>
          </label>
          <div className="flex gap-2">
            <button type="submit" className="rounded-md bg-portoBlue px-4 py-2 text-sm font-medium text-white hover:bg-portoDark">
              Aplicar
            </button>
            <Link
              href={withParams("/llamadas/detail", {
                campus: data.campusId,
                birthYear: data.birthYear,
                bucket: data.bucket,
                month: data.selectedMonth,
                organizeBy: organizeParam,
              })}
              className="rounded-md border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800"
            >
              Limpiar
            </Link>
          </div>
        </form>

        <div className="flex flex-wrap gap-2">
          {(["all", "uncontacted", "no_answer", "contacted", "promise_to_pay", "will_not_return"] as PendingFollowUpFilter[]).map((status) => (
            <Link
              key={status}
              href={withParams("/llamadas/detail", {
                campus: data.campusId,
                birthYear: data.birthYear,
                bucket: data.bucket,
                month: data.selectedMonth,
                q: data.q,
                followUp: status === "all" ? undefined : status,
                organizeBy: organizeParam,
              })}
              className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusTone(status)} ${
                data.followUpStatus === status ? "ring-2 ring-portoBlue/30" : ""
              }`}
            >
              {statusLabel(status)}: {data.followUpCounts[status]}
            </Link>
          ))}
        </div>

        {data.birthYearOptions.length > 0 ? (
          <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Categoria</p>
            <div className="flex flex-wrap gap-2">
              <Link
                href={withParams("/llamadas/detail", {
                  campus: data.campusId,
                  bucket: data.bucket,
                  month: data.selectedMonth,
                  q: data.q,
                  followUp: data.followUpStatus === "all" ? undefined : data.followUpStatus,
                  organizeBy: organizeParam,
                })}
                className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                  !data.birthYear
                    ? "border-portoBlue bg-blue-50 text-portoBlue dark:border-blue-500 dark:bg-blue-950/30 dark:text-blue-200"
                    : "border-slate-200 bg-slate-50 text-slate-700 hover:border-portoBlue dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                }`}
              >
                Todos
              </Link>
              {data.birthYearOptions.map((option) => (
                <Link
                  key={option.value}
                  href={withParams("/llamadas/detail", {
                    campus: data.campusId,
                    birthYear: option.value,
                    bucket: data.bucket,
                    month: data.selectedMonth,
                    q: data.q,
                    followUp: data.followUpStatus === "all" ? undefined : data.followUpStatus,
                    organizeBy: organizeParam,
                  })}
                  className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                    data.birthYear === option.value
                      ? "border-portoBlue bg-blue-50 text-portoBlue dark:border-blue-500 dark:bg-blue-950/30 dark:text-blue-200"
                      : "border-slate-200 bg-slate-50 text-slate-700 hover:border-portoBlue dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  }`}
                >
                  {option.label}: {option.count}
                </Link>
              ))}
            </div>
          </div>
        ) : null}

        <p className="text-sm text-slate-600 dark:text-slate-400">
          {data.rows.length} {data.rows.length === 1 ? "jugador" : "jugadores"} en esta cola.
        </p>
        {data.groups.length > 0 ? (
          <div className="space-y-4">
            {data.groups.map((group) => (
              <section key={group.key} className="space-y-2">
                {data.groups.length > 1 ? (
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2 dark:border-slate-700">
                    <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{group.label}</h2>
                    <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                      {group.rows.length} {group.rows.length === 1 ? "jugador" : "jugadores"}
                    </span>
                  </div>
                ) : null}
                <PendingTable rows={group.rows} />
              </section>
            ))}
          </div>
        ) : (
          <PendingTable rows={[]} />
        )}
      </div>
    </PageShell>
  );
}
