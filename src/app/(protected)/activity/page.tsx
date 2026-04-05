import Link from "next/link";
import { PageShell } from "@/components/ui/page-shell";
import { createClient } from "@/lib/supabase/server";
import { formatDateTimeMonterrey, getMonterreyDayBounds } from "@/lib/time";

type AuditLogRow = {
  id: string;
  event_at: string;
  actor_email: string | null;
  action: string;
  table_name: string | null;
  record_id: string | null;
  after_data: Record<string, unknown> | null;
};

const ACTION_LABELS: Record<string, string> = {
  "payment.posted": "Cobro registrado",
  "charge.created": "Cargo creado",
  "charge.voided": "Cargo anulado",
  "enrollment_incident.created": "Incidencia registrada",
  "enrollment_incident.cancelled": "Incidencia cancelada",
  "enrollment_incident.replaced": "Incidencia reemplazada",
  "enrollment.created": "Inscripcion creada",
  "enrollment.ended": "Inscripcion dada de baja",
  "enrollment.reactivated": "Inscripcion reactivada",
  "enrollment.updated": "Inscripcion actualizada",
  "monthly_charges.generated": "Mensualidades generadas",
};

const ACTION_OPTIONS = Object.entries(ACTION_LABELS).map(([value, label]) => ({ value, label }));

function fmtDateTime(iso: string) {
  return formatDateTimeMonterrey(iso);
}

function actionColor(action: string) {
  if (action.includes("payment")) return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400";
  if (action.includes("enrollment.ended")) return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";
  if (action.includes("enrollment")) return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400";
  if (action.includes("charge")) return "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400";
  return "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300";
}

function getFolio(data: Record<string, unknown> | null): string | null {
  const folio = data?.folio;
  return typeof folio === "string" && folio.length > 0 ? folio : null;
}

function getEnrollmentId(data: Record<string, unknown> | null): string | null {
  const enrollmentId = data?.enrollment_id;
  return typeof enrollmentId === "string" && enrollmentId.length > 0 ? enrollmentId : null;
}

function describeAfterData(action: string, data: Record<string, unknown> | null): string | null {
  if (!data) return null;
  if (action === "payment.posted") {
    const amount = data.amount as number | undefined;
    const method = data.method as string | undefined;
    const folio = getFolio(data);
    const source =
      data.external_source === "historical_catchup_contry" ? "Regularización histórica Contry" : null;
    return [amount !== undefined ? `$${amount.toLocaleString("es-MX")}` : null, method, folio, source].filter(Boolean).join(" | ");
  }
  if (action === "charge.created") {
    const amount = data.amount as number | undefined;
    const desc = data.description as string | undefined;
    if (desc) return `${desc}${amount !== undefined ? ` | $${amount.toLocaleString("es-MX")}` : ""}`;
  }
  if (action.startsWith("enrollment_incident")) {
    const type = data.incident_type as string | undefined;
    const omit = data.omit_period_month as string | undefined;
    const typeLabel =
      type === "absence" ? "Ausencia" : type === "injury" ? "Lesión" : type === "other" ? "Otro" : type;
    const omitLabel = omit ? `Omite ${omit.slice(0, 7)}` : "Solo registro";
    return [typeLabel, omitLabel].filter(Boolean).join(" | ");
  }
  if (action.startsWith("enrollment")) {
    const status = data.status as string | undefined;
    const reason = data.dropout_reason as string | undefined;
    const parts = [status, reason].filter(Boolean);
    return parts.length > 0 ? parts.join(" | ") : null;
  }
  return null;
}

type SearchParams = Promise<{
  from?: string;
  to?: string;
  action?: string;
  actor?: string;
}>;

export default async function ActivityPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const filterFrom = params.from?.trim() || "";
  const filterTo = params.to?.trim() || "";
  const filterAction = params.action?.trim() || "";
  const filterActor = params.actor?.trim() || "";

  const supabase = await createClient();

  let query = supabase
    .from("audit_logs")
    .select("id, event_at, actor_email, action, table_name, record_id, after_data")
    .order("event_at", { ascending: false })
    .limit(200);

  if (filterFrom) query = query.gte("event_at", getMonterreyDayBounds(filterFrom).start);
  if (filterTo) query = query.lt("event_at", getMonterreyDayBounds(filterTo).end);
  if (filterAction) query = query.eq("action", filterAction);
  if (filterActor) query = query.ilike("actor_email", `%${filterActor}%`);

  const { data: logs } = await query.returns<AuditLogRow[]>();
  const entries = logs ?? [];

  const hasFilters = filterFrom || filterTo || filterAction || filterActor;

  return (
    <PageShell title="Actividad" subtitle="Ultimas 200 acciones registradas en el sistema">
      <div className="space-y-4">
        <form className="grid gap-3 rounded-md border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900 md:grid-cols-2 xl:grid-cols-[repeat(4,minmax(0,1fr))_auto_auto]">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-500 dark:text-slate-400">Desde</label>
            <input
              type="date"
              name="from"
              defaultValue={filterFrom}
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-500 dark:text-slate-400">Hasta</label>
            <input
              type="date"
              name="to"
              defaultValue={filterTo}
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-500 dark:text-slate-400">Tipo de accion</label>
            <select
              name="action"
              defaultValue={filterAction}
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
            >
              <option value="">Todas</option>
              {ACTION_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-500 dark:text-slate-400">Actor (email)</label>
            <input
              type="text"
              name="actor"
              defaultValue={filterActor}
              placeholder="usuario@correo.com"
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
            />
          </div>
          <button
            type="submit"
            className="rounded-md bg-portoBlue px-4 py-2 text-sm font-medium text-white hover:bg-portoDark xl:self-end"
          >
            Filtrar
          </button>
          {hasFilters ? (
            <a
              href="/activity"
              className="rounded-md border border-slate-300 px-4 py-2 text-center text-sm hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800 xl:self-end"
            >
              Limpiar
            </a>
          ) : null}
        </form>

        {entries.length === 0 ? (
          <p className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">
            {hasFilters ? "Sin resultados para los filtros aplicados." : "Sin actividad registrada."}
          </p>
        ) : (
          <>
            {hasFilters ? (
              <p className="text-xs text-slate-400">{entries.length} resultado{entries.length !== 1 ? "s" : ""}</p>
            ) : null}

            <div className="space-y-3 md:hidden">
              {entries.map((log) => {
                const label = ACTION_LABELS[log.action] ?? log.action;
                const detail = describeAfterData(log.action, log.after_data);
                const paymentFolio = getFolio(log.after_data);
                const enrollmentId = getEnrollmentId(log.after_data);

                return (
                  <div key={log.id} className="space-y-3 rounded-md border border-slate-200 bg-white px-4 py-4 dark:border-slate-700 dark:bg-slate-900">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${actionColor(log.action)}`}>{label}</span>
                      <span className="text-xs text-slate-400">{fmtDateTime(log.event_at)}</span>
                    </div>
                    {detail ? <p className="text-sm text-slate-700 dark:text-slate-300">{detail}</p> : null}
                    <p className="text-xs text-slate-500 dark:text-slate-400">{log.actor_email ?? "sistema"}</p>
                    <div className="flex flex-wrap gap-3 text-sm">
                      {log.action === "payment.posted" && log.record_id ? (
                        <Link href={`/receipts?payment=${log.record_id}`} className="text-portoBlue hover:underline">
                          {paymentFolio ? `Recibo ${paymentFolio}` : "Ver recibo"}
                        </Link>
                      ) : null}
                      {enrollmentId ? (
                        <Link href={`/enrollments/${enrollmentId}/charges`} className="text-portoBlue hover:underline">
                          Ver inscripcion
                        </Link>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="hidden space-y-1 md:block">
              {entries.map((log) => {
                const label = ACTION_LABELS[log.action] ?? log.action;
                const detail = describeAfterData(log.action, log.after_data);
                const paymentFolio = getFolio(log.after_data);
                const enrollmentId = getEnrollmentId(log.after_data);

                return (
                  <div
                    key={log.id}
                    className="flex items-start gap-3 rounded-md border border-slate-100 bg-white px-4 py-3 text-sm dark:border-slate-800 dark:bg-slate-900"
                  >
                    <span className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${actionColor(log.action)}`}>
                      {label}
                    </span>
                    <div className="min-w-0 flex-1">
                      {detail ? <p className="truncate text-slate-700 dark:text-slate-300">{detail}</p> : null}
                      <p className="text-xs text-slate-400">
                        {log.actor_email ?? "sistema"} | {fmtDateTime(log.event_at)}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap justify-end gap-3 text-xs">
                      {log.action === "payment.posted" && log.record_id ? (
                        <Link href={`/receipts?payment=${log.record_id}`} className="text-portoBlue hover:underline">
                          {paymentFolio ? `Recibo ${paymentFolio}` : "Ver recibo"}
                        </Link>
                      ) : null}
                      {enrollmentId ? (
                        <Link href={`/enrollments/${enrollmentId}/charges`} className="text-portoBlue hover:underline">
                          Ver inscripcion
                        </Link>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </PageShell>
  );
}
