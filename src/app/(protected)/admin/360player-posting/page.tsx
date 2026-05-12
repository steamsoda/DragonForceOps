import Link from "next/link";
import { PageShell } from "@/components/ui/page-shell";
import { requireOperationalContext } from "@/lib/auth/permissions";
import { formatPostingMonth, get360PlayerPostingData } from "@/lib/queries/360player-posting";
import { getMonterreyDateString } from "@/lib/time";
import { post360PlayerMonthlyBatchAction } from "@/server/actions/360player-posting";

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
  const eligibleRows = data.rows.filter((row) => row.status === "eligible");
  const defaultPaidAt = `${getMonterreyDateString()}T12:00`;

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

        <section className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900">
          <form className="grid gap-3 md:grid-cols-5">
            <label className="text-sm font-medium">
              Campus
              <select name="campus" defaultValue={data.selectedCampusId ?? ""} className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950">
                {data.campuses.map((campus) => (
                  <option key={campus.id} value={campus.id}>{campus.name}</option>
                ))}
              </select>
            </label>
            <label className="text-sm font-medium">
              Mes
              <input name="month" type="month" defaultValue={data.selectedMonth} className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950" />
            </label>
            <label className="text-sm font-medium">
              Tipo de pago
              <select name="mode" defaultValue={data.mode} className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950">
                <option value="early">Temprano</option>
                <option value="late">Tardio</option>
              </select>
            </label>
            <label className="text-sm font-medium">
              Categoria
              <select name="birthYear" defaultValue={data.birthYear ?? ""} className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950">
                <option value="">Todas</option>
                {data.birthYears.map((year) => <option key={year} value={year}>{year}</option>)}
              </select>
            </label>
            <label className="text-sm font-medium">
              Buscar
              <input name="q" defaultValue={data.search} placeholder="Jugador o ID" className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950" />
            </label>
            <div className="md:col-span-5 flex flex-wrap gap-2">
              <button className="rounded-md bg-portoBlue px-4 py-2 text-sm font-semibold text-white hover:bg-portoDark">Aplicar filtros</button>
              <Link href={buildHref({ campus: data.selectedCampusId, month: data.selectedMonth, mode: data.mode })} className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800">
                Limpiar categoria/busqueda
              </Link>
            </div>
          </form>
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

        <form action={post360PlayerMonthlyBatchAction} className="space-y-4">
          <input type="hidden" name="campus" value={data.selectedCampusId ?? ""} />
          <input type="hidden" name="month" value={data.selectedMonth} />
          <input type="hidden" name="mode" value={data.mode} />
          <section className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-100">
            <div className="grid gap-3 md:grid-cols-[1fr_220px_auto] md:items-end">
              <div>
                <p className="font-semibold">Confirmacion de publicacion 360Player</p>
                <p className="mt-1">
                  {selectedCampus?.name ?? "Campus"} | {formatPostingMonth(data.periodMonth)} | modo {data.mode === "early" ? "temprano" : "tardio"}.
                  Solo se procesan cargos elegibles seleccionados; cada fila se revalida en servidor antes de tocar finanzas.
                </p>
              </div>
              <label className="text-sm font-medium">
                Fecha real del pago
                <input name="paidAt" type="datetime-local" defaultValue={defaultPaidAt} className="mt-1 block w-full rounded-md border border-amber-300 bg-white px-3 py-2 text-sm text-slate-900" />
              </label>
              <button disabled={eligibleRows.length === 0} className="rounded-md bg-portoBlue px-4 py-2 text-sm font-semibold text-white hover:bg-portoDark disabled:cursor-not-allowed disabled:opacity-50">
                Publicar seleccionados
              </button>
            </div>
          </section>

          <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
            <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-700">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-900">
                <tr>
                  <th className="px-3 py-2">Sel</th>
                  <th className="px-3 py-2">Jugador</th>
                  <th className="px-3 py-2">Cargo actual</th>
                  <th className="px-3 py-2">Temprano</th>
                  <th className="px-3 py-2">Tardio</th>
                  <th className="px-3 py-2">Accion</th>
                  <th className="px-3 py-2">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {data.rows.map((row) => (
                  <tr key={row.chargeId} className={row.status === "eligible" ? "bg-white dark:bg-slate-950" : "bg-slate-50 text-slate-500 dark:bg-slate-900/60"}>
                    <td className="px-3 py-2 align-top">
                      <input
                        type="checkbox"
                        name="chargeId"
                        value={row.chargeId}
                        disabled={row.status !== "eligible"}
                        defaultChecked={row.status === "eligible"}
                        aria-label={`Seleccionar pago 360Player de ${row.playerName}`}
                      />
                    </td>
                    <td className="px-3 py-2 align-top">
                      <Link href={`/players/${row.playerId}`} className="font-semibold text-portoBlue hover:underline">{row.playerName}</Link>
                      <p className="text-xs text-slate-500">{row.publicPlayerId ?? "-"} | Cat. {row.birthYear ?? "-"} | {row.campusName}</p>
                    </td>
                    <td className="px-3 py-2 align-top">
                      <p className="font-semibold">{money(row.chargeAmount, row.currency)}</p>
                      <p className="text-xs text-slate-500">Pendiente {money(row.pendingAmount, row.currency)}</p>
                    </td>
                    <td className="px-3 py-2 align-top">{money(row.earlyAmount, row.currency)}</td>
                    <td className="px-3 py-2 align-top">{money(row.lateAmount, row.currency)}</td>
                    <td className="max-w-xs px-3 py-2 align-top text-xs">{row.actionLabel}</td>
                    <td className="px-3 py-2 align-top">
                      {row.status === "eligible" ? (
                        <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800">Lista</span>
                      ) : (
                        <span className="text-xs text-slate-500">{row.reason}</span>
                      )}
                    </td>
                  </tr>
                ))}
                {data.rows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-8 text-center text-slate-500">
                      No hay mensualidades pendientes con estos filtros.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </form>
      </div>
    </PageShell>
  );
}
