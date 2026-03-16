import { PageShell } from "@/components/ui/page-shell";
import { createClient } from "@/lib/supabase/server";

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
  "enrollment.created": "Inscripción creada",
  "enrollment.ended": "Inscripción dada de baja",
  "enrollment.reactivated": "Inscripción reactivada",
  "enrollment.updated": "Inscripción actualizada",
  "monthly_charges.generated": "Mensualidades generadas"
};

const ACTION_OPTIONS = Object.entries(ACTION_LABELS).map(([value, label]) => ({ value, label }));

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC"
  });
}

function actionColor(action: string) {
  if (action.includes("payment")) return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400";
  if (action.includes("enrollment.ended")) return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";
  if (action.includes("enrollment")) return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400";
  if (action.includes("charge")) return "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400";
  return "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300";
}

function describeAfterData(action: string, data: Record<string, unknown> | null): string | null {
  if (!data) return null;
  if (action === "payment.posted") {
    const amount = data.amount as number | undefined;
    const method = data.method as string | undefined;
    if (amount !== undefined) return `$${amount.toLocaleString("es-MX")} · ${method ?? ""}`;
  }
  if (action === "charge.created") {
    const amount = data.amount as number | undefined;
    const desc = data.description as string | undefined;
    if (desc) return `${desc}${amount !== undefined ? ` · $${amount.toLocaleString("es-MX")}` : ""}`;
  }
  if (action.startsWith("enrollment")) {
    const status = data.status as string | undefined;
    const reason = data.dropout_reason as string | undefined;
    const parts = [status, reason].filter(Boolean);
    return parts.length > 0 ? parts.join(" · ") : null;
  }
  return null;
}

// ── Page ──────────────────────────────────────────────────────────────────────

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

  if (filterFrom) query = query.gte("event_at", `${filterFrom}T00:00:00Z`);
  if (filterTo)   query = query.lte("event_at", `${filterTo}T23:59:59Z`);
  if (filterAction) query = query.eq("action", filterAction);
  if (filterActor)  query = query.ilike("actor_email", `%${filterActor}%`);

  const { data: logs } = await query.returns<AuditLogRow[]>();
  const entries = logs ?? [];

  const hasFilters = filterFrom || filterTo || filterAction || filterActor;

  return (
    <PageShell title="Actividad" subtitle="Últimas 200 acciones registradas en el sistema">
      <div className="space-y-4">
        {/* ── Filters ── */}
        <form className="flex flex-wrap items-end gap-3 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-500 dark:text-slate-400">Desde</label>
            <input
              type="date"
              name="from"
              defaultValue={filterFrom}
              className="rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-500 dark:text-slate-400">Hasta</label>
            <input
              type="date"
              name="to"
              defaultValue={filterTo}
              className="rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-500 dark:text-slate-400">Tipo de acción</label>
            <select
              name="action"
              defaultValue={filterAction}
              className="rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm"
            >
              <option value="">Todas</option>
              {ACTION_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
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
              className="rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm w-52"
            />
          </div>
          <button
            type="submit"
            className="rounded-md bg-portoBlue px-4 py-2 text-sm font-medium text-white hover:bg-portoDark"
          >
            Filtrar
          </button>
          {hasFilters && (
            <a
              href="/activity"
              className="rounded-md border border-slate-300 dark:border-slate-600 px-4 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              Limpiar
            </a>
          )}
        </form>

        {/* ── Results ── */}
        {entries.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-10">
            {hasFilters ? "Sin resultados para los filtros aplicados." : "Sin actividad registrada."}
          </p>
        ) : (
          <>
            {hasFilters && (
              <p className="text-xs text-slate-400">{entries.length} resultado{entries.length !== 1 ? "s" : ""}</p>
            )}
            <div className="space-y-1">
              {entries.map((log) => {
                const label = ACTION_LABELS[log.action] ?? log.action;
                const detail = describeAfterData(log.action, log.after_data);
                return (
                  <div
                    key={log.id}
                    className="flex items-start gap-3 rounded-md border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-3 text-sm"
                  >
                    <span
                      className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${actionColor(log.action)}`}
                    >
                      {label}
                    </span>
                    <div className="flex-1 min-w-0">
                      {detail && <p className="text-slate-700 dark:text-slate-300 truncate">{detail}</p>}
                      <p className="text-xs text-slate-400">
                        {log.actor_email ?? "sistema"} · {fmtDateTime(log.event_at)}
                      </p>
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
