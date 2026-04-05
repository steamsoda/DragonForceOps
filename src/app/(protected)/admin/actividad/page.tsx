import { redirect } from "next/navigation";
import { PageShell } from "@/components/ui/page-shell";
import { requireSuperAdminContext } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { reverseAuditLogEntryAction } from "@/server/actions/admin";

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
  reversed_at: string | null;
};

const REVERSIBLE_ACTIONS = new Set(["payment.posted", "charge.created"]);

const ACTION_LABELS: Record<string, string> = {
  "payment.posted": "Cobro registrado",
  "payment.voided": "Cobro anulado",
  "charge.created": "Cargo creado",
  "charge.voided": "Cargo anulado",
  "enrollment_incident.created": "Incidencia registrada",
  "enrollment_incident.cancelled": "Incidencia cancelada",
  "enrollment_incident.replaced": "Incidencia reemplazada",
  "enrollment.created": "Inscripción creada",
  "enrollment.ended": "Baja",
  "enrollment.reactivated": "Reactivación",
  "enrollment.updated": "Inscripción actualizada",
  "monthly_charges.generated": "Mensualidades generadas",
  "player.nuked": "Jugador eliminado",
  "merge_players": "Jugadores fusionados"
};

const ACTION_OPTIONS = [
  "payment.posted", "payment.voided",
  "charge.created", "charge.voided",
  "enrollment_incident.created", "enrollment_incident.cancelled", "enrollment_incident.replaced",
  "enrollment.created", "enrollment.ended", "enrollment.reactivated", "enrollment.updated",
  "monthly_charges.generated", "player.nuked"
].map((v) => ({ value: v, label: ACTION_LABELS[v] ?? v }));

const ERROR_MESSAGES: Record<string, string> = {
  already_reversed: "Esta entrada ya fue revertida anteriormente.",
  no_record_id: "Esta entrada no tiene ID de registro asociado.",
  reverse_failed: "Error al revertir — el registro puede haber sido modificado ya.",
  log_not_found: "Entrada de auditoría no encontrada.",
  not_reversible: "Este tipo de acción no puede revertirse desde aquí."
};

function actionColor(action: string) {
  if (action.includes("payment")) return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400";
  if (action.includes("enrollment.ended") || action.includes("nuked")) return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";
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
  const data = after ?? before ?? {};
  if (action === "payment.posted" || action === "payment.voided") {
    const amount = data.amount as number | undefined;
    const method = data.method as string | undefined;
    const source =
      data.external_source === "historical_catchup_contry" ? "Regularización histórica Contry" : null;
    return [amount !== undefined ? `$${amount.toLocaleString("es-MX")}` : null, method, source].filter(Boolean).join(" · ");
  }
if (action === "charge.created" || action === "charge.voided") {
    const desc = data.description as string | undefined;
    const amount = data.amount as number | undefined;
    return [desc, amount !== undefined ? `$${amount.toLocaleString("es-MX")}` : null].filter(Boolean).join(" · ");
  }
  if (action.startsWith("enrollment_incident")) {
    const type = data.incident_type as string | undefined;
    const omit = data.omit_period_month as string | undefined;
    const startsOn = data.starts_on as string | undefined;
    const endsOn = data.ends_on as string | undefined;
    const typeLabel =
      type === "absence" ? "Ausencia" : type === "injury" ? "Lesión" : type === "other" ? "Otro" : type;
    const rangeLabel = startsOn ? (endsOn ? `${startsOn} a ${endsOn}` : startsOn) : null;
    return [typeLabel, omit ? `Omite ${omit.slice(0, 7)}` : "Solo registro", rangeLabel].filter(Boolean).join(" · ");
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
  if (action === "player.nuked") {
    return (data.player_name as string | undefined) ?? null;
  }
  return null;
}

function getEnrollmentId(log: AuditLogRow): string | null {
  if (log.action.startsWith("enrollment.")) return log.record_id;
  const eid = log.after_data?.enrollment_id ?? log.before_data?.enrollment_id;
  return typeof eid === "string" ? eid : null;
}

type SearchParams = Promise<{
  from?: string; to?: string; action?: string; actor?: string; record?: string;
  ok?: string; err?: string;
}>;

export default async function SuperAdminActividadPage({ searchParams }: { searchParams: SearchParams }) {
  await requireSuperAdminContext("/unauthorized");
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const params = await searchParams;
  const filterFrom   = params.from?.trim()   || "";
  const filterTo     = params.to?.trim()     || "";
  const filterAction = params.action?.trim() || "";
  const filterActor  = params.actor?.trim()  || "";
  const filterRecord = params.record?.trim() || "";
  const successMsg   = params.ok === "reversed" ? "Entrada revertida correctamente." : null;
  const errorMsg     = params.err ? (ERROR_MESSAGES[params.err] ?? `Error: ${params.err}`) : null;

  let query = supabase
    .from("audit_logs")
    .select("id, event_at, actor_user_id, actor_email, action, table_name, record_id, before_data, after_data, reversed_at")
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

        {successMsg && (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950 px-3 py-2 text-sm text-emerald-800 dark:text-emerald-300">
            {successMsg}
          </div>
        )}
        {errorMsg && (
          <div className="rounded-md border border-rose-200 bg-rose-50 dark:border-rose-800 dark:bg-rose-950 px-3 py-2 text-sm text-rose-800 dark:text-rose-300">
            {errorMsg}
          </div>
        )}

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
            <label className="text-xs text-slate-500 dark:text-slate-400">ID de registro</label>
            <input type="text" name="record" defaultValue={filterRecord} placeholder="UUID..."
              className="rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm w-52 font-mono text-xs" />
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

        {entries.length > 0 && (
          <p className="text-xs text-slate-400">
            {entries.length} entrada{entries.length !== 1 ? "s" : ""}
            {entries.length === 500 ? " (máximo — aplica filtros para acotar)" : ""}
          </p>
        )}

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
                  <th className="px-4 py-2">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {entries.map((log) => {
                  const label = ACTION_LABELS[log.action] ?? log.action;
                  const detail = describeDetail(log.action, log.after_data, log.before_data);
                  const enrollmentId = getEnrollmentId(log);
                  const hasData = log.before_data || log.after_data;
                  const isReversed = !!log.reversed_at;
                  const canReverse = REVERSIBLE_ACTIONS.has(log.action) && !isReversed;

                  return (
                    <tr key={log.id}
                      className={`align-top ${isReversed ? "opacity-60 bg-slate-50 dark:bg-slate-900/50" : "hover:bg-slate-50 dark:hover:bg-slate-800/50"}`}
                    >
                      {/* Timestamp */}
                      <td className="px-4 py-3 font-mono text-xs whitespace-nowrap text-slate-500 dark:text-slate-400">
                        {fmtDateTime(log.event_at)}
                      </td>

                      {/* Action badge */}
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${isReversed ? "line-through opacity-70 bg-slate-200 dark:bg-slate-700 text-slate-500" : actionColor(log.action)}`}>
                          {label}
                        </span>
                        {isReversed && (
                          <span className="mt-1 flex items-center gap-1 text-xs text-slate-400">
                            ↩ revertido {fmtDateTime(log.reversed_at!)}
                          </span>
                        )}
                      </td>

                      {/* Actor */}
                      <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-400 whitespace-nowrap">
                        {log.actor_email ?? <span className="italic text-slate-400">sistema</span>}
                      </td>

                      {/* Detail */}
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

                      {/* Expandable before/after */}
                      <td className="px-4 py-3 text-xs">
                        {hasData ? (
                          <details>
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
                        <div className="flex flex-col gap-1.5">
                          {enrollmentId && (
                            <a href={`/enrollments/${enrollmentId}/charges`}
                              className="inline-flex items-center gap-1 rounded bg-portoBlue/10 px-2 py-1 text-xs font-medium text-portoDark dark:text-portoBlue hover:bg-portoBlue/20 whitespace-nowrap">
                              Ver inscripción ↗
                            </a>
                          )}
                          {log.action === "payment.posted" && log.record_id && (
                            <a href={`/receipts?payment=${log.record_id}`}
                              className="inline-flex items-center gap-1 rounded bg-emerald-50 dark:bg-emerald-900/20 px-2 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 whitespace-nowrap">
                              Ver recibo ↗
                            </a>
                          )}
                          {canReverse && (
                            <form action={reverseAuditLogEntryAction}>
                              <input type="hidden" name="log_id" value={log.id} />
                              <button type="submit"
                                className="inline-flex items-center gap-1 rounded bg-rose-50 dark:bg-rose-900/20 px-2 py-1 text-xs font-medium text-rose-700 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900/40 whitespace-nowrap"
                                title={`Revertir "${label}"`}
                              >
                                ↩ Revertir
                              </button>
                            </form>
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
