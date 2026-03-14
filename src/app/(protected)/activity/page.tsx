import { PageShell } from "@/components/ui/page-shell";
import { createClient } from "@/lib/supabase/server";

type AuditLogRow = {
  id: string;
  created_at: string;
  actor_email: string | null;
  action: string;
  table_name: string | null;
  record_id: string | null;
  after_data: Record<string, unknown> | null;
};

const ACTION_LABELS: Record<string, string> = {
  "payment.posted": "Cobro registrado",
  "charge.created": "Cargo creado",
  "enrollment.created": "Inscripción creada",
  "enrollment.ended": "Inscripción dada de baja",
  "enrollment.reactivated": "Inscripción reactivada",
  "enrollment.updated": "Inscripción actualizada",
  "monthly_charges.generated": "Mensualidades generadas"
};

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
  if (action.includes("payment")) return "bg-emerald-100 text-emerald-800";
  if (action.includes("enrollment.ended")) return "bg-red-100 text-red-800";
  if (action.includes("enrollment")) return "bg-blue-100 text-blue-800";
  if (action.includes("charge")) return "bg-amber-100 text-amber-800";
  return "bg-slate-100 text-slate-700";
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

export default async function ActivityPage() {
  const supabase = await createClient();

  const { data: logs } = await supabase
    .from("audit_logs")
    .select("id, created_at, actor_email, action, table_name, record_id, after_data")
    .order("created_at", { ascending: false })
    .limit(200)
    .returns<AuditLogRow[]>();

  const entries = logs ?? [];

  return (
    <PageShell title="Actividad" subtitle="Últimas 200 acciones registradas en el sistema">
      {entries.length === 0 ? (
        <p className="text-sm text-slate-500 text-center py-10">Sin actividad registrada.</p>
      ) : (
        <div className="space-y-1">
          {entries.map((log) => {
            const label = ACTION_LABELS[log.action] ?? log.action;
            const detail = describeAfterData(log.action, log.after_data);
            return (
              <div
                key={log.id}
                className="flex items-start gap-3 rounded-md border border-slate-100 bg-white px-4 py-3 text-sm"
              >
                <span
                  className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${actionColor(log.action)}`}
                >
                  {label}
                </span>
                <div className="flex-1 min-w-0">
                  {detail && <p className="text-slate-700 truncate">{detail}</p>}
                  <p className="text-xs text-slate-400">
                    {log.actor_email ?? "sistema"} · {fmtDateTime(log.created_at)}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </PageShell>
  );
}
