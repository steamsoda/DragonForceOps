import { PageShell } from "@/components/ui/page-shell";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { formatDateMonterrey } from "@/lib/time";
import { readManagementData, ManagementReadUnavailable } from "../dashboard/management-read";
import { ManagementCampusSelect, ManagementReadPagination, managementInputClass } from "../dashboard/management-read-controls";
import { uniformsReadSchema } from "./read-contract";

const statusLabels = { pending_order: "Pendiente por pedir", ordered: "Pedido al proveedor", delivered: "Entregado" };
export async function NonfinancialUniforms({ filters }: { filters: Record<string, string | undefined> }) {
  const safeFilters = { campus: filters.campus, type: filters.type, queue: filters.queue === "sold_week" ? "all" : filters.queue, q: filters.q, page: filters.page };
  const data = await readManagementData("director_readonly_uniforms_v1", safeFilters, uniformsReadSchema);
  if (!data) return <ManagementReadUnavailable title="Uniformes" />;
  return <PageShell title="Uniformes" subtitle="Seguimiento de pedidos y entregas | Solo lectura" wide>
    <form method="get" className="grid items-end gap-3 border-b pb-4 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_2fr_auto]">
      <ManagementCampusSelect campuses={data.campuses} selected={data.selectedCampusId} />
      <label className="grid gap-1 text-sm">Tipo<select name="type" defaultValue={data.selectedType} className={managementInputClass}><option value="">Todos</option><option value="training">Entrenamiento</option><option value="game">Juego</option></select></label>
      <label className="grid gap-1 text-sm">Cola<select name="queue" defaultValue={data.selectedQueue} className={managementInputClass}><option value="all">Todas</option><option value="pending_order">Pendientes por pedir</option><option value="ordered">Pedidos al proveedor</option><option value="pending_delivery">Pendientes por entregar</option><option value="delivered">Entregados</option></select></label>
      <label className="grid gap-1 text-sm">Buscar<input name="q" type="search" defaultValue={data.q} placeholder="Jugador" className={managementInputClass} /></label>
      <button type="submit" className={`${managementInputClass} font-medium text-portoBlue`}>Aplicar</button>
    </form>
    <div className="my-4 grid gap-3 sm:grid-cols-3">
      <KpiCard label="Pendientes por pedir" value={String(data.counts.pendingOrder)} description="Campus, tipo y busqueda seleccionados" />
      <KpiCard label="Pedidos al proveedor" value={String(data.counts.ordered)} description="Campus, tipo y busqueda seleccionados" />
      <KpiCard label="Entregados" value={String(data.counts.delivered)} description="Campus, tipo y busqueda seleccionados" />
    </div>
    <div className="overflow-x-auto"><table className="w-full min-w-[700px] text-left text-sm">
      <thead className="bg-slate-50 dark:bg-slate-900"><tr>{["Jugador", "Campus / categoria", "Uniforme", "Talla", "Estado", "Pedido", "Entrega"].map((label) => <th key={label} className="px-3 py-2">{label}</th>)}</tr></thead>
      <tbody>{data.rows.map((row) => <tr key={row.id} className="border-b">
        <td className="px-3 py-3 font-semibold text-portoBlue">{row.playerName}</td><td className="px-3 py-3">{row.campusName}<br />{row.birthYear ?? "-"}</td>
        <td className="px-3 py-3">{row.uniformType === "game" ? "Juego" : "Entrenamiento"}</td><td className="px-3 py-3">{row.size || "Sin talla"}</td>
        <td className="px-3 py-3">{statusLabels[row.status]}</td><td className="px-3 py-3">{row.orderedAt ? formatDateMonterrey(row.orderedAt) : "-"}</td><td className="px-3 py-3">{row.deliveredAt ? formatDateMonterrey(row.deliveredAt) : "-"}</td>
      </tr>)}</tbody>
    </table></div>
    {!data.rows.length && <p className="py-8 text-center text-sm text-slate-500">Sin uniformes para estos filtros.</p>}
    <ManagementReadPagination pathname="/uniforms" filters={safeFilters} {...data} />
  </PageShell>;
}
