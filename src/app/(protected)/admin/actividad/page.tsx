import { redirect } from "next/navigation";
import { PageShell } from "@/components/ui/page-shell";
import { createClient } from "@/lib/supabase/server";

type AuditLogRow = {
  id: string;
  event_at: string;
  actor_user_id: string | null;
  actor_email: string | null;
  action: string;
  table_name: string | null;
  record_id: string | null;
  before_data: Record<string, unknown> | null;
  after_data: Record<string, unknown> | null;
};

const ACTION_LABELS: Record<string, string> = {
  "payment.posted": "Cobro registrado",
  "charge.created": "Cargo creado",
  "charge.voided": "Cargo anulado",
  "enrollment.created": "Inscripción creada",
  "enrollment.ended": "Baja",
  "enrollment.reactivated": "Reactivación",
  "enrollment.updated": "Inscripción actualizada",
  "monthly_charges.generated": "Mensualidades generadas"
};

const ACTION_OPTIONS = Object.entries(ACTION_LABELS).map(([value, label]) => ({ value, label }));

function actionColor(action: string) {
  if (action.includes("payment")) return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400";
  if (action.includes("enrollment.ended")) return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";
  if (action.includes("enrollment")) return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400";
  if (action.includes("charge")) return "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400";
  return "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300";
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("es-MX", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    timeZone: "America/Monterrey"
  });
}

function describeDetail(action: string, after: Record<string, unknown> | null, before: Record<string, unknown> | null): string | null {
  if (!after && !before) return null;
  const data = after ?? before ?? {};
  if (action === "payment.posted") {
    const amount = data.amount as number | undefined;
    const method = data.method as string | undefined;
    return [amount !== undefined ? `$${amount.toLocaleString("es-MX")}` : null, method].filter(Boolean).join(" · ");
  }
  if (action === "charge.created" || action === "charge.voided") {
    const desc = data.description as string | undefined;
    const amount = data.amount as number | undefined;
    return [desc, amount !== undefined ? `$${amount.toLocaleString("es-MX")}` : null].filter(Boolean).join(" · ");
  }
  if (action.startsWith("enrollment")) {
    const status = data.status as string | undefined;
    const reason = data.dropout_reason as string | undefined;
    return [status, reason].filter(Boolean).join(" · ") || null;
  }
  if (action === "monthly_charges.generated") {
    const count = data.count as number | undefined;
    return count !== undefined ? `${count} cargos` : null;
  }
  return null;
}

// Try to extract an enrollment_id so we can link directly to the charges page.
function getEnrollmentId(log: AuditLogRow): string | null {
  if (log.action.startsWith("enrollment.")) return log.record_id;
  const eid = log.after_data?.enrollment_id ?? log.before_data?.enrollment_id;
  return typeof eid === "string" ? eid : null;
}

type SearchParams = Promise<{
  from?: string;
  to?: string;
  action?: string;
  actor?: string;
  record?: string;
}>;

export default async function SuperAdminActividadPage({ searchParams }: { searchParams: SearchParams }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Superadmin-only guard
  const { data: myRoles } = await supabase
    .from("user_roles")
    .select("app_roles(code)")
    .eq("user_id", user.id)
    .returns<{ app_roles: { code: string } | null }[]>();

  const myCodes = (myRoles ?? []).map((r) => r.app_roles?.code).filter(Boolean);
  if (!myCodes.includes("superadmin")) redirect("/unauthorized");

  const params = await searchParams;
  const filterFrom   = params.from?.trim()   || "";
  const filterTo     = params.to?.trim()     || "";
  const filterAction = params.action?.trim() || "";
  const filterActor  = params.actor?.trim()  || "";
  const filterRecord = params.record?.trim() || "";

  let query = supabase
    .from("audit_logs")
    .select("id, event_at, actor_user_id, actor_email, action, table_name, record_id, before_data, after_data")
    .order("event_at", { ascending: false })
    .limit(500);

  if (filterFrom)   query = query.gte("event_at", `${filterFrom}T00:00:00Z`);
  if (filterTo)     query = query.lte("event_at", `${filterTo}T23:59:59Z`);
  if (filterAction) query = query.eq("action", filterAction);
  if (filterActor)  query = query.ilike("actor_email", `%${filterActor}%`);
  if (filterRecord) query = query.eq("record_id", filterRecord);

  const { data: logs } = await query.returns<AuditLogRow[]>();
  const entries = logs ?? [];
  const hasFilters = filterFrom || filterTo || filterAction || filterActor || filterRecord;

  return (
    <PageShell title="Auditoría" subtitle="Vista completa del log de sistema — últimas 500 entradas">
      <div className="space-y-4">

        {/* ── Filters ── */}
        <form className="flex flex-wrap items-end gap-3 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-500 dark:text-slate-400">Desde</label>
            <input type="date" name="from" defaultValue={filterFrom}
              className="rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-500 dark:text-slate-400">Hasta</label>
            <input type="date" name="to" defaultValue={filterTo}
              className="rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-500 dark:text-slate-400">Tipo de acción</label>
            <select name="action" defaultValue={filterAction}
              className="rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm">
              <option value="">Todas</option>
              {ACTION_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-500 dark:text-slate-400">Actor (email)</label>
            <input type="text" name="actor" defaultValue={filterActor} placeholder="usuario@correo.com"
              className="rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm w-48" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-500 dark:text-slate-400">ID de registro (UUID)</label>
            <input type="text" name="record" defaultValue={filterRecord} placeholder="xxxxxxxx-xxxx-..."
              className="rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm w-56 font-mono text-xs" />
          </div>
          <button type="submit"
            className="rounded-md bg-portoBlue px-4 py-2 text-sm font-medium text-white hover:bg-portoDark">
            Filtrar
          </button>
          {hasFilters && (
            <a href="/admin/actividad"
              className="rounded-md border border-slate-300 dark:border-slate-600 px-4 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-800">
              Limpiar
            </a>
          )}
        </form>

        {/* ── Count ── */}
        {entries.length > 0 && (
          <p className="text-xs text-slate-400">
            {entries.length} entrada{entries.length !== 1 ? "s" : ""}
            {entries.length === 500 ? " (máximo — aplica filtros para acotar)" : ""}
          </p>
        )}

        {/* ── Log entries ── */}
        {entries.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-10">
            {hasFilters ? "Sin resultados para los filtros aplicados." : "Sin actividad registrada."}
          </p>
        ) : (
          <div className="overflow-x-auto rounded-md border border-slate-200 dark:border-slate-700">
            <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700 text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800 text-left text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400 sticky top-0">
                <tr>
                  <th className="px-4 py-2 whitespace-nowrap">Fecha (MTY)</th>
                  <th className="px-4 py-2">Acción</th>
                  <th className="px-4 py-2">Actor</th>
                  <th className="px-4 py-2">Detalle</th>
                  <th className="px-4 py-2">Tabla / ID</th>
                  <th className="px-4 py-2">Datos</th>
                  <th className="px-4 py-2">Ir</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {entries.map((log) => {
                  const label = ACTION_LABELS[log.action] ?? log.action;
                  const detail = describeDetail(log.action, log.after_data, log.before_data);
                  const enrollmentId = getEnrollmentId(log);
                  const hasData = log.before_data || log.after_data;

                  return (
                    <tr key={log.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 align-top">
                      {/* Timestamp */}
                      <td className="px-4 py-3 font-mono text-xs whitespace-nowrap text-slate-500 dark:text-slate-400">
                        {fmtDateTime(log.event_at)}
                      </td>

                      {/* Action badge */}
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${actionColor(log.action)}`}>
                          {label}
                        </span>
                      </td>

                      {/* Actor */}
                      <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-400 whitespace-nowrap">
                        {log.actor_email ?? <span className="italic text-slate-400">sistema</span>}
                      </td>

                      {/* Detail summary */}
                      <td className="px-4 py-3 text-xs text-slate-700 dark:text-slate-300 max-w-xs truncate">
                        {detail ?? <span className="text-slate-300 dark:text-slate-600">—</span>}
                      </td>

                      {/* Table + record_id */}
                      <td className="px-4 py-3">
                        <div className="text-xs text-slate-500 dark:text-slate-400">{log.table_name ?? "—"}</div>
                        {log.record_id && (
                          <div className="font-mono text-xs text-slate-400 dark:text-slate-500 truncate max-w-[10rem]" title={log.record_id}>
                            {log.record_id}
                          </div>
                        )}
                      </td>

                      {/* Before / After expandable */}
                      <td className="px-4 py-3 text-xs">
                        {hasData ? (
                          <details className="group">
                            <summary className="cursor-pointer select-none text-portoBlue hover:underline">
                              Ver datos
                            </summary>
                            <div className="mt-2 space-y-2 min-w-[16rem]">
                              {log.before_data && (
                                <div>
                                  <p className="font-semibold text-slate-500 dark:text-slate-400 mb-1">Antes</p>
                                  <pre className="bg-slate-100 dark:bg-slate-800 rounded p-2 text-xs overflow-x-auto whitespace-pre-wrap break-all">
                                    {JSON.stringify(log.before_data, null, 2)}
                                  </pre>
                                </div>
                              )}
                              {log.after_data && (
                                <div>
                                  <p className="font-semibold text-slate-500 dark:text-slate-400 mb-1">Después</p>
                                  <pre className="bg-slate-100 dark:bg-slate-800 rounded p-2 text-xs overflow-x-auto whitespace-pre-wrap break-all">
                                    {JSON.stringify(log.after_data, null, 2)}
                                  </pre>
                                </div>
                              )}
                            </div>
                          </details>
                        ) : (
                          <span className="text-slate-300 dark:text-slate-600">—</span>
                        )}
                      </td>

                      {/* Action buttons */}
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1">
                          {enrollmentId && (
                            <a
                              href={`/enrollments/${enrollmentId}/charges`}
                              className="inline-flex items-center gap-1 rounded bg-portoBlue/10 px-2 py-1 text-xs font-medium text-portoDark dark:text-portoBlue hover:bg-portoBlue/20 whitespace-nowrap"
                            >
                              Ver inscripción ↗
                            </a>
                          )}
                          {log.action === "payment.posted" && log.record_id && (
                            <a
                              href={`/receipts?payment=${log.record_id}`}
                              className="inline-flex items-center gap-1 rounded bg-emerald-50 dark:bg-emerald-900/20 px-2 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 whitespace-nowrap"
                            >
                              Ver recibo ↗
                            </a>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </PageShell>
  );
}
