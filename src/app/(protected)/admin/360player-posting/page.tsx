import Link from "next/link";
import { PageShell } from "@/components/ui/page-shell";
import { requireOperationalContext } from "@/lib/auth/permissions";
import { formatPostingMonth, get360PlayerPostingData } from "@/lib/queries/360player-posting";
import { getMonterreyDateString } from "@/lib/time";
import { PostingSelectionTable } from "./posting-selection-table";

type SearchParams = Promise<{
  campus?: string;
  month?: string;
  mode?: string;
  birthYear?: string;
  q?: string;
  ok?: string;
  err?: string;
  posted?: string;
  skipped?: string;
  repriced?: string;
}>;

function money(amount: number | null, currency = "MXN") {
  if (amount === null) return "-";
  return amount.toLocaleString("es-MX", { style: "currency", currency });
}

function buildHref(params: Record<string, string | number | null | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === "") continue;
    search.set(key, String(value));
  }
  const query = search.toString();
  return `/admin/360player-posting${query ? `?${query}` : ""}`;
}

export default async function Posting360PlayerPage({ searchParams }: { searchParams: SearchParams }) {
  await requireOperationalContext("/unauthorized");
  const params = await searchParams;
  const selectedBirthYear = params.birthYear ? Number(params.birthYear) : undefined;
  const data = await get360PlayerPostingData({
    campusId: params.campus,
    month: params.month,
    mode: params.mode,
    search: params.q,
    birthYear: Number.isFinite(selectedBirthYear) ? selectedBirthYear : undefined,
  });
  const selectedCampus = data.campuses.find((campus) => campus.id === data.selectedCampusId) ?? null;
  const defaultPaidAt = `${getMonterreyDateString()}T12:00`;
  const baseParams = {
    campus: data.selectedCampusId,
    month: data.selectedMonth,
    mode: data.mode,
    birthYear: data.birthYear,
    q: data.search,
  };

  return (
    <PageShell
      title="360Player mensualidades"
      subtitle="Publicacion manual y protegida de pagos de mensualidad recibidos por 360Player."
      breadcrumbs={[{ label: "Admin", href: "/admin/configuracion" }, { label: "360Player" }]}
      wide
    >
      <div className="space-y-5">
        {params.ok === "posted" ? (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            Pagos publicados: {params.posted ?? "0"} | Saltados: {params.skipped ?? "0"} | Repreciados: {params.repriced ?? "0"}.
          </div>
        ) : null}
        {params.err ? (
          <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
            No se pudo completar la operacion: {params.err}
          </div>
        ) : null}

        <section className="space-y-4 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Campus</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {data.campuses.map((campus) => (
                <Link
                  key={campus.id}
                  href={buildHref({ ...baseParams, campus: campus.id })}
                  className={
                    campus.id === data.selectedCampusId
                      ? "rounded-full bg-portoBlue px-4 py-2 text-sm font-semibold text-white"
                      : "rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-200"
                  }
                >
                  {campus.name}
                </Link>
              ))}
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-[240px_1fr]">
            <form className="flex items-end gap-2">
              <input type="hidden" name="campus" value={data.selectedCampusId ?? ""} />
              <input type="hidden" name="mode" value={data.mode} />
              {data.birthYear ? <input type="hidden" name="birthYear" value={data.birthYear} /> : null}
              {data.search ? <input type="hidden" name="q" value={data.search} /> : null}
              <label className="flex-1 text-sm font-medium">
                Mes
                <input name="month" type="month" defaultValue={data.selectedMonth} className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950" />
              </label>
              <button className="rounded-md bg-portoBlue px-4 py-2 text-sm font-semibold text-white hover:bg-portoDark">
                Ver mes
              </button>
            </form>
            <form className="flex items-end gap-2">
              <input type="hidden" name="campus" value={data.selectedCampusId ?? ""} />
              <input type="hidden" name="month" value={data.selectedMonth} />
              <input type="hidden" name="mode" value={data.mode} />
              {data.birthYear ? <input type="hidden" name="birthYear" value={data.birthYear} /> : null}
              <label className="flex-1 text-sm font-medium">
                Buscar
                <input name="q" defaultValue={data.search} placeholder="Jugador o ID" className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950" />
              </label>
              <button className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-white dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800">
                Buscar
              </button>
            </form>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Categoria</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Link
                href={buildHref({ ...baseParams, birthYear: null })}
                className={
                  data.birthYear === null
                    ? "rounded-full bg-portoBlue px-4 py-2 text-sm font-semibold text-white"
                    : "rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-200"
                }
              >
                Todas
              </Link>
              {data.birthYears.map((year) => (
                <Link
                  key={year}
                  href={buildHref({ ...baseParams, birthYear: year })}
                  className={
                    data.birthYear === year
                      ? "rounded-full bg-portoBlue px-4 py-2 text-sm font-semibold text-white"
                      : "rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-200"
                  }
                >
                  {year}
                </Link>
              ))}
              <Link href={buildHref({ campus: data.selectedCampusId, month: data.selectedMonth, mode: data.mode })} className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-200">
                Limpiar
              </Link>
            </div>
          </div>
        </section>

        <section className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-900/50 dark:bg-blue-950/20">
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Tipo de pago a registrar</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Link
              href={buildHref({ ...baseParams, mode: "early" })}
              className={
                data.mode === "early"
                  ? "rounded-full bg-portoBlue px-4 py-2 text-sm font-semibold text-white"
                  : "rounded-full border border-blue-200 bg-white px-4 py-2 text-sm font-semibold text-blue-900 hover:bg-blue-100"
              }
            >
              Pago temprano
            </Link>
            <Link
              href={buildHref({ ...baseParams, mode: "late" })}
              className={
                data.mode === "late"
                  ? "rounded-full bg-portoBlue px-4 py-2 text-sm font-semibold text-white"
                  : "rounded-full border border-blue-200 bg-white px-4 py-2 text-sm font-semibold text-blue-900 hover:bg-blue-100"
              }
            >
              Pago tardio
            </Link>
          </div>
          <p className="mt-2 text-sm text-blue-900">
            {data.mode === "early"
              ? "Se registraran pagos usando el precio temprano de la mensualidad."
              : "Se registraran pagos usando el precio tardio de la mensualidad."}
          </p>
        </section>

        <div className="grid gap-3 md:grid-cols-4">
          <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900">
            <p className="text-xs uppercase tracking-wide text-slate-500">Filas</p>
            <p className="text-2xl font-bold">{data.totals.rows}</p>
          </div>
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 dark:border-emerald-900/50 dark:bg-emerald-950/20">
            <p className="text-xs uppercase tracking-wide text-emerald-700">Elegibles</p>
            <p className="text-2xl font-bold text-emerald-900">{data.totals.eligible}</p>
          </div>
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900/50 dark:bg-amber-950/20">
            <p className="text-xs uppercase tracking-wide text-amber-700">Reprecios</p>
            <p className="text-2xl font-bold text-amber-900">{data.totals.repriceCount}</p>
          </div>
          <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 dark:border-blue-900/50 dark:bg-blue-950/20">
            <p className="text-xs uppercase tracking-wide text-blue-700">Total elegible</p>
            <p className="text-2xl font-bold text-blue-900">{money(data.totals.selectedTotal)}</p>
          </div>
        </div>

        <PostingSelectionTable
          rows={data.rows}
          campusId={data.selectedCampusId}
          campusName={selectedCampus?.name ?? "Campus"}
          month={data.selectedMonth}
          periodLabel={formatPostingMonth(data.periodMonth)}
          mode={data.mode}
          defaultPaidAt={defaultPaidAt}
        />
      </div>
    </PageShell>
  );
}
