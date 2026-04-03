import { redirect } from "next/navigation";
import { PageShell } from "@/components/ui/page-shell";
import { requireOperationalContext } from "@/lib/auth/permissions";
import { getUniformDashboardData } from "@/lib/queries/uniforms";
import { formatDateMonterrey } from "@/lib/time";
import { UniformsDashboard } from "@/components/uniforms/uniforms-dashboard";

type SearchParams = Promise<{
  campus?: string;
  type?: string;
  queue?: string;
}>;

const QUEUE_OPTIONS = [
  { value: "all", label: "Todas las colas" },
  { value: "sold_week", label: "Vendidos esta semana" },
  { value: "pending_order", label: "Pendientes por pedir" },
  { value: "ordered", label: "Pedidos al proveedor" },
  { value: "pending_delivery", label: "Pendientes por entregar" },
  { value: "delivered_week", label: "Entregados esta semana" },
] as const;

function buildUniformsQuery(params: { campus?: string; type?: string; queue?: string }) {
  const search = new URLSearchParams();
  if (params.campus) search.set("campus", params.campus);
  if (params.type) search.set("type", params.type);
  if (params.queue && params.queue !== "all") search.set("queue", params.queue);
  const query = search.toString();
  return query ? `/uniforms?${query}` : "/uniforms";
}

export default async function UniformsPage({ searchParams }: { searchParams: SearchParams }) {
  await requireOperationalContext();
  const params = await searchParams;
  const data = await getUniformDashboardData({
    campusId: params.campus ?? "",
    type: params.type === "training" || params.type === "game" ? params.type : "",
    queue:
      params.queue === "sold_week" ||
      params.queue === "pending_order" ||
      params.queue === "ordered" ||
      params.queue === "pending_delivery" ||
      params.queue === "delivered_week"
        ? params.queue
        : "all",
  });

  if (data.campuses.length === 0) redirect("/unauthorized");

  const weekStartLabel = data.week.start ? formatDateMonterrey(data.week.start) : "-";
  const weekEndLabel = data.week.end
    ? formatDateMonterrey(new Date(new Date(data.week.end).getTime() - 86_400_000))
    : "-";

  return (
    <PageShell
      title="Uniformes"
      subtitle={`Flujo operativo de uniformes vendidos y entregados. Semana actual: ${weekStartLabel} - ${weekEndLabel}`}
      breadcrumbs={[{ label: "Uniformes" }]}
      wide
    >
      <div className="space-y-5">
        <div className="space-y-3 rounded-md border border-slate-200 p-3 dark:border-slate-700">
          <div className="flex flex-wrap gap-2">
            <a
              href={buildUniformsQuery({ campus: "all", type: data.selectedType, queue: data.selectedQueue ?? "all" })}
              className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
                data.selectedCampusId === "all"
                  ? "bg-portoBlue text-white"
                  : "border border-slate-300 text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
              }`}
            >
              Todos
            </a>
            {data.campuses.map((campus) => (
              <a
                key={campus.id}
                href={buildUniformsQuery({
                  campus: campus.id,
                  type: data.selectedType,
                  queue: data.selectedQueue ?? "all",
                })}
                className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
                  data.selectedCampusId === campus.id
                    ? "bg-portoBlue text-white"
                    : "border border-slate-300 text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                }`}
              >
                {campus.name}
              </a>
            ))}
          </div>

          <form className="grid gap-3 xl:grid-cols-[220px_260px_auto]">
            <input type="hidden" name="campus" value={data.selectedCampusId} />
            <select
              name="type"
              defaultValue={data.selectedType}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-600"
            >
              <option value="">Todos los tipos</option>
              <option value="training">Entrenamiento</option>
              <option value="game">Juego</option>
            </select>
            <select
              name="queue"
              defaultValue={data.selectedQueue ?? "all"}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-600"
            >
              {QUEUE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                className="rounded-md bg-portoBlue px-4 py-2 text-sm font-medium text-white hover:bg-portoDark"
              >
                Filtrar
              </button>
              <a
                href="/uniforms"
                className="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Limpiar
              </a>
            </div>
          </form>
        </div>

        <UniformsDashboard
          counts={data.counts}
          pendingOrderSummary={data.pendingOrderSummary}
          sections={data.sections}
        />
      </div>
    </PageShell>
  );
}
